import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { ErrorCode, SocketEvents } from '@ssg/shared';
import { sendNotification } from '../notifications/notification.service.js';
import { emitToUser } from '../../socket/index.js';
import { abortConversationAttempts } from '../ai/chat.streamer.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

const UpdateSupportCaseSchema = z.object({
  status: z.enum(['WAITING', 'HUMAN_ACTIVE', 'RESOLVED']),
  adminNotes: z.string().max(1000).optional(),
  replyMessage: z.string().max(2000).optional(),
});

// GET /api/v1/admin/support or /api/v1/admin/support/cases
router.get(['/', '/cases'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as any;
    const where: any = {};
    if (status) where.status = status;

    const cases = await prisma.supportCase.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, email: true } },
        conversation: { include: { messages: { orderBy: { sequenceNumber: 'asc' } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: cases });
  } catch (err) {
    next(err);
  }
});

// ---- Hợp đồng "ticket" mà AdminSupportPage dùng (/tickets, /tickets/:id, /tickets/:id/messages, /tickets/:id/status) ----
// SupportCase luôn gắn một AIConversation; "ticket" chỉ là cách trình bày lại case + tin nhắn của hội thoại.

const ticketInclude = {
  user: { select: { id: true, username: true, email: true, profile: { select: { displayName: true } } } },
  conversation: { include: { messages: { orderBy: { sequenceNumber: 'asc' as const } } } },
};

function toTicket(sc: any) {
  return {
    id: sc.id,
    subject: sc.conversation?.title || 'Yêu cầu hỗ trợ',
    status: sc.status,
    priority: 'NORMAL',
    createdAt: sc.createdAt,
    resolvedAt: sc.resolvedAt,
    adminNotes: sc.adminNotes,
    conversationId: sc.conversationId,
    user: sc.user ? { id: sc.user.id, username: sc.user.username, email: sc.user.email, displayName: sc.user.profile?.displayName ?? sc.user.username } : null,
    messages: (sc.conversation?.messages ?? []).map((m: any) => ({
      id: m.id,
      senderType: m.role === 'ASSISTANT' ? 'AI' : m.role, // USER | ADMIN | AI | SYSTEM
      message: m.content,
      createdAt: m.createdAt,
    })),
  };
}

router.get('/tickets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const where: any = {};
    if (status && status !== 'ALL') where.status = status;
    const cases = await prisma.supportCase.findMany({ where, include: ticketInclude, orderBy: { createdAt: 'desc' } });
    return res.json({ success: true, data: { tickets: cases.map(toTicket) } });
  } catch (err) {
    next(err);
  }
});

router.get('/tickets/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sc = await prisma.supportCase.findUnique({ where: { id: req.params.id as string }, include: ticketInclude });
    if (!sc) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy yêu cầu hỗ trợ' });
    }
    return res.json({ success: true, data: { ticket: toTicket(sc) } });
  } catch (err) {
    next(err);
  }
});

const TicketMessageSchema = z.object({ message: z.string().trim().min(1).max(2000) });

// Admin trả lời trong ticket: lưu tin ADMIN vào hội thoại, chuyển sang HUMAN_ACTIVE (AI tạm dừng), báo cho user.
router.post('/tickets/:id/messages', validateBody(TicketMessageSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { message } = req.body as z.infer<typeof TicketMessageSchema>;
    const sc = await prisma.supportCase.findUnique({ where: { id }, include: { conversation: true } });
    if (!sc) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy yêu cầu hỗ trợ' });
    }

    await abortConversationAttempts(sc.conversationId); // AI đang trả lời thì dừng để không chồng chéo

    const adminMessage = await prisma.$transaction(async (tx) => {
      const count = await tx.aIMessage.count({ where: { conversationId: sc.conversationId } });
      const created = await tx.aIMessage.create({
        data: { conversationId: sc.conversationId, role: 'ADMIN', content: message, sequenceNumber: count + 1, status: 'COMPLETED' },
      });
      await tx.aIConversation.update({ where: { id: sc.conversationId }, data: { status: 'HUMAN_ACTIVE' } });
      await tx.supportCase.update({
        where: { id },
        data: { status: sc.status === 'RESOLVED' ? sc.status : 'HUMAN_ACTIVE', assignedAdminId: req.user!.id },
      });
      return created;
    });

    emitToUser(sc.userId, 'chat.message.human', {
      conversationId: sc.conversationId,
      message: adminMessage,
      adminName: req.user!.username,
    });
    await sendNotification({
      userId: sc.userId,
      type: 'SUPPORT_STATUS_CHANGED',
      title: 'Quản trị viên đã phản hồi yêu cầu hỗ trợ',
      body: message.length > 120 ? `${message.slice(0, 120)}…` : message,
      deepLinkUrl: `/support/cases/${id}`,
    });

    return res.status(201).json({ success: true, data: adminMessage, message: 'Đã gửi phản hồi đến sinh viên' });
  } catch (err) {
    next(err);
  }
});

// PATCH /tickets/:id/status dùng chung handler với PATCH /:id bên dưới
router.patch('/tickets/:id/status', validateBody(UpdateSupportCaseSchema), (req: Request, res: Response, next: NextFunction) =>
  updateSupportCaseHandler(req, res, next),
);

// PATCH /api/v1/admin/support/:id or /api/v1/admin/support/cases/:id
router.patch(['/:id', '/cases/:id'], validateBody(UpdateSupportCaseSchema), updateSupportCaseHandler);

async function updateSupportCaseHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const { status, adminNotes, replyMessage } = req.body;

    const existing = await prisma.supportCase.findUnique({
      where: { id },
      include: { conversation: true },
    });

    if (!existing) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy yêu cầu hỗ trợ' });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (replyMessage) {
        const msgCount = await tx.aIMessage.count({ where: { conversationId: existing.conversationId } });
        await tx.aIMessage.create({
          data: {
            conversationId: existing.conversationId,
            role: 'ADMIN',
            content: replyMessage,
            sequenceNumber: msgCount + 1,
            status: 'COMPLETED',
          },
        });
      }

      const sc = await tx.supportCase.update({
        where: { id },
        data: {
          status,
          adminNotes: adminNotes ?? existing.adminNotes,
          assignedAdminId: req.user!.id,
          resolvedAt: status === 'RESOLVED' ? new Date() : null,
        },
        include: { user: true },
      });

      // Đồng bộ trạng thái hội thoại: đang có người thật thì AI tạm dừng, giải quyết xong/chờ thì trả lại AI
      await tx.aIConversation.update({
        where: { id: existing.conversationId },
        data: { status: status === 'HUMAN_ACTIVE' ? 'HUMAN_ACTIVE' : 'AI_ACTIVE' },
      });

      // Ghi AuditLog
      await tx.auditLog.create({
        data: {
          adminUserId: req.user!.id,
          action: 'UPDATE_SUPPORT_STATUS',
          targetEntity: 'SupportCase',
          targetId: id,
          details: { oldStatus: existing.status, newStatus: status },
        },
      });

      return sc;
    });

    // Phát sự kiện support.status.changed cho user
    const payload = {
      caseId: updated.id,
      userId: updated.userId,
      status: updated.status,
      updatedByAdminId: req.user!.id,
    };
    emitToUser(updated.userId, SocketEvents.SUPPORT_STATUS_CHANGED, payload);

    // Gửi thông báo bền vững vào DB
    await sendNotification({
      userId: updated.userId,
      type: 'SUPPORT_STATUS_CHANGED',
      title: 'Cập nhật yêu cầu hỗ trợ',
      body: `Yêu cầu hỗ trợ của bạn đã chuyển sang trạng thái: ${status}`,
      deepLinkUrl: `/support/cases/${updated.id}`,
    });

    return res.json({ success: true, data: updated, message: 'Đã cập nhật trạng thái yêu cầu hỗ trợ' });
  } catch (err) {
    next(err);
  }
}

export default router;
