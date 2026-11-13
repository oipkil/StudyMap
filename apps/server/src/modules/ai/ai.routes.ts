import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { ErrorCode } from '@ssg/shared';
import { handleStreamChat, handleRetryChat, abortAiAttempt } from './chat.streamer.js';
import { getSocketServer } from '../../socket/index.js';
import { circuitBreaker } from './circuit-breaker.js';
import { ConversationStatus, SupportStatus, MessageRole, AIMessageStatus } from '@prisma/client';

const router = Router();

// =========================================================================
// 1. STATUS & READINESS
// =========================================================================
router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const activeProviders = await prisma.aIProviderConfig.findMany({
      where: { isEnabled: true },
      include: { models: true },
    });

    if (activeProviders.length === 0) {
      return res.json({
        success: true,
        data: {
          ready: false,
          reason: 'Chưa có nhà cung cấp AI nào được kích hoạt trong hệ thống.',
        },
      });
    }

    // Kiểm tra xem có ít nhất 1 provider có circuit breaker CLOSED hoặc HALF_OPEN
    const availableProviders = activeProviders.filter((p) => circuitBreaker.isAvailable(p.id));

    if (availableProviders.length === 0) {
      return res.json({
        success: true,
        data: {
          ready: false,
          reason: 'Toàn bộ các nhà cung cấp AI đang tạm mở ngắt mạch (Circuit Breaker Open) do sự cố kết nối. Bạn vẫn có thể tìm quán bằng bộ lọc.',
        },
      });
    }

    return res.json({
      success: true,
      data: {
        ready: true,
        providerCount: availableProviders.length,
        modelsAvailable: availableProviders.flatMap((p) => p.models).length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 2. PRIVACY CONSENT
// =========================================================================
router.post('/consent', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: { aiPrivacyConsentAccepted: true },
      select: { id: true, aiPrivacyConsentAccepted: true },
    });

    return res.json({
      success: true,
      data: updated,
      message: 'Đã xác nhận đồng ý điều khoản quyền riêng tư Trợ lý AI',
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 3. CONVERSATIONS MANAGEMENT
// =========================================================================
router.get('/conversations', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversations = await prisma.aIConversation.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { sequenceNumber: 'desc' },
          take: 1,
        },
        supportCase: {
          select: { id: true, status: true },
        },
      },
    });

    return res.json({
      success: true,
      data: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        updatedAt: c.updatedAt,
        lastMessage: c.messages[0]?.content || null,
        supportCase: c.supportCase,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const CreateConversationSchema = z.object({
  title: z.string().max(100).optional(),
});

router.post('/conversations', requireAuth, validateBody(CreateConversationSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title } = req.body;
    const conv = await prisma.aIConversation.create({
      data: {
        userId: req.user!.id,
        title: title || 'Hội thoại mới',
      },
    });

    return res.status(201).json({
      success: true,
      data: conv,
      message: 'Đã tạo hội thoại mới',
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/conversations/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { title } = req.body;

    const conv = await prisma.aIConversation.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!conv) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy hội thoại' });
    }

    const updated = await prisma.aIConversation.update({
      where: { id },
      data: { title: title || conv.title },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/conversations/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const conv = await prisma.aIConversation.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!conv) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy hội thoại' });
    }

    await prisma.aIConversation.delete({ where: { id } });
    return res.json({ success: true, message: 'Đã xóa hội thoại' });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 4. MESSAGES & SNAPSHOT RECONNECT
// =========================================================================
router.get('/conversations/:id/messages', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const afterSequence = req.query.afterSequence ? parseInt(req.query.afterSequence as string, 10) : undefined;

    const conv = await prisma.aIConversation.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!conv) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy hội thoại' });
    }

    const where: any = { conversationId: id };
    if (afterSequence !== undefined && !isNaN(afterSequence)) {
      where.sequenceNumber = { gt: afterSequence };
    }

    const messages = await prisma.aIMessage.findMany({
      where,
      orderBy: { sequenceNumber: 'asc' },
      include: {
        attempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          include: { model: { select: { displayName: true } } },
        },
      },
    });

    return res.json({
      success: true,
      data: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sequenceNumber: m.sequenceNumber,
        status: m.status,
        sources: m.sourcesJson,
        feedback: m.feedback,
        createdAt: m.createdAt,
        modelName: m.attempts[0]?.model?.displayName,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const SendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
  idempotencyKey: z.string().min(8).max(100),
  currentPlaceId: z.string().optional(),
});

router.post('/conversations/:id/messages', requireAuth, validateBody(SendMessageSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conversationId = req.params.id as string;
    const { content, idempotencyKey, currentPlaceId } = req.body;
    const io = getSocketServer();

    if (!io) {
      return res.status(500).json({ success: false, message: 'Socket Server chưa khởi tạo' });
    }

    const conversation = await prisma.aIConversation.findFirst({
      where: { id: conversationId, userId: req.user!.id },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy hội thoại' });
    }

    // A5: Khi ở chế độ HUMAN_ACTIVE, không kích hoạt AI stream, chỉ lưu tin nhắn user và thông báo cho admin
    if (conversation.status === ConversationStatus.HUMAN_ACTIVE) {
      const messageCount = await prisma.aIMessage.count({ where: { conversationId } });
      const userMessage = await prisma.aIMessage.create({
        data: {
          conversationId,
          role: MessageRole.USER,
          content,
          sequenceNumber: messageCount + 1,
          status: AIMessageStatus.COMPLETED,
        },
      });

      await prisma.aIConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      io.to('admin').emit('chat.message.human_user', {
        conversationId,
        message: userMessage,
        user: { id: req.user!.id, username: req.user!.username },
      });

      return res.status(201).json({
        success: true,
        data: { userMessage },
        message: 'Đã gửi tin nhắn tới hỗ trợ viên',
      });
    }

    const result = await handleStreamChat({
      io,
      conversationId,
      userId: req.user!.id,
      userRole: req.user!.role,
      content,
      idempotencyKey,
      currentPlaceId,
    });

    return res.status(200).json({
      success: true,
      data: result,
      message: result.isExisting ? 'Phản hồi từ yêu cầu trước' : 'Đang xử lý tạo câu trả lời',
    });
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        errorCode: err.errorCode,
        message: err.message,
      });
    }
    next(err);
  }
});

// =========================================================================
// 5. STOP ATTEMPT & FEEDBACK
// =========================================================================
router.post('/attempts/:id/stop', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const attemptId = req.params.id as string;
    const stopped = abortAiAttempt(attemptId);
    return res.json({
      success: true,
      stopped,
      message: stopped ? 'Đã dừng tạo phản hồi' : 'Attempt không đang xử lý hoặc đã kết thúc',
    });
  } catch (err) {
    next(err);
  }
});

const FeedbackSchema = z.object({
  feedback: z.enum(['HELPFUL', 'UNHELPFUL']),
});

const RetryMessageSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
});

router.post('/messages/:messageId/retry', requireAuth, validateBody(RetryMessageSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const messageId = req.params.messageId as string;
    const { idempotencyKey } = req.body;
    const io = getSocketServer();

    if (!io) {
      return res.status(500).json({ success: false, message: 'Socket Server chưa khởi tạo' });
    }

    const result = await handleRetryChat({
      io,
      messageId,
      userId: req.user!.id,
      userRole: req.user!.role,
      idempotencyKey,
    });

    return res.status(200).json({
      success: true,
      data: result,
      message: result.isExisting ? 'Phản hồi từ yêu cầu thử lại trước' : 'Đang thử lại tạo câu trả lời',
    });
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        errorCode: err.errorCode,
        message: err.message,
      });
    }
    next(err);
  }
});

router.post('/messages/:messageId/feedback', requireAuth, validateBody(FeedbackSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const messageId = req.params.messageId as string;
    const { feedback } = req.body;

    const message = await prisma.aIMessage.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });

    if (!message || message.conversation.userId !== req.user!.id) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy tin nhắn' });
    }

    const updated = await prisma.aIMessage.update({
      where: { id: messageId },
      data: { feedback },
    });

    return res.json({
      success: true,
      data: updated,
      message: 'Cảm ơn phản hồi của bạn!',
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 6. HUMAN HANDOFF REQUEST
// =========================================================================
router.post('/conversations/:id/request-human', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const conv = await prisma.aIConversation.findFirst({
      where: { id, userId: req.user!.id },
      include: { supportCase: true },
    });

    if (!conv) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy hội thoại' });
    }

    let supportCase = conv.supportCase;
    if (!supportCase) {
      supportCase = await prisma.supportCase.create({
        data: {
          conversationId: id,
          userId: req.user!.id,
          status: SupportStatus.WAITING,
        },
      });
    } else {
      supportCase = await prisma.supportCase.update({
        where: { id: supportCase.id },
        data: { status: SupportStatus.WAITING },
      });
    }

    await prisma.aIConversation.update({
      where: { id },
      data: { status: ConversationStatus.HUMAN_WAITING },
    });

    // Thông báo cho admin room
    const io = getSocketServer();
    if (io) {
      io.to('admin').emit('support.status.changed', {
        caseId: supportCase.id,
        conversationId: id,
        status: SupportStatus.WAITING,
      });
    }

    return res.json({
      success: true,
      data: supportCase,
      message: 'Đã gửi yêu cầu kết nối với quản trị viên',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
