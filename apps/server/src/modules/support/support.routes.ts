import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notifyZaloAsync } from '../integrations/zalo.service.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { ErrorCode, SocketEvents } from '@ssg/shared';
import { emitToAdminQueue } from '../../socket/index.js';

const router = Router();
router.use(requireAuth);

const CreateSupportCaseSchema = z.object({
  title: z.string().min(2).max(200),
  message: z.string().min(5).max(2000),
});

// POST /api/v1/support/cases
router.post('/cases', validateBody(CreateSupportCaseSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, message } = req.body;
    const userId = req.user!.id;

    const supportCase = await prisma.$transaction(async (tx) => {
      const conv = await tx.aIConversation.create({
        data: {
          userId,
          title,
          status: 'HUMAN_WAITING',
        },
      });

      await tx.aIMessage.create({
        data: {
          conversationId: conv.id,
          role: 'USER',
          content: message,
          sequenceNumber: 1,
          status: 'COMPLETED',
        },
      });

      const sc = await tx.supportCase.create({
        data: {
          conversationId: conv.id,
          userId,
          status: 'WAITING',
        },
        include: { conversation: { include: { messages: true } } },
      });

      return sc;
    });

    try {
      emitToAdminQueue(SocketEvents.MODERATION_UPDATED, {
        targetType: 'SUPPORT_CASE',
        targetId: supportCase.id,
        status: 'WAITING',
      });
    } catch {}

    notifyZaloAsync('SUPPORT_CASE', { title: 'Yêu cầu hỗ trợ sinh viên mới', body: 'Có sinh viên cần người thật hỗ trợ trong khung chat AI.', url: '/admin/support' });

    return res.status(201).json({ success: true, data: supportCase });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/support/cases/my
router.get('/cases/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const cases = await prisma.supportCase.findMany({
      where: { userId },
      include: { conversation: { include: { messages: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: cases });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/support/cases/:id
router.get('/cases/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const sc = await prisma.supportCase.findUnique({
      where: { id },
      include: {
        conversation: { include: { messages: { orderBy: { sequenceNumber: 'asc' } } } },
        user: { select: { id: true, username: true, email: true } },
      },
    });

    if (!sc) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy yêu cầu hỗ trợ' });
    }

    // CHỐNG IDOR: Chỉ tác giả hoặc ADMIN mới được xem
    if (sc.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Bạn không có quyền truy cập yêu cầu hỗ trợ này',
      });
    }

    return res.json({ success: true, data: sc });
  } catch (err) {
    next(err);
  }
});

export default router;
