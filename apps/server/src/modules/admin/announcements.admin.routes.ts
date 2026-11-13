import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { ErrorCode, sanitizeHtml, SocketEvents } from '@ssg/shared';
import { recordOutboxEvent } from '../outbox/outbox.service.js';
import { emitEnvelope } from '../../socket/index.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

const CreateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
  level: z.enum(['INFO', 'WARNING', 'SUCCESS', 'ERROR']).default('INFO'),
  linkUrl: z.string().url().optional().nullable(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  targetAudience: z.enum(['ALL', 'USERS', 'ADMINS']).default('ALL'),
  targetPageScope: z.string().default('ALL'),
  isDismissible: z.boolean().default(true),
  priority: z.number().int().default(0),
  isPublished: z.boolean().default(true),
});

const UpdateAnnouncementSchema = CreateAnnouncementSchema.partial();

// GET /api/v1/admin/announcements
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.announcement.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/admin/announcements
router.post('/', validateBody(CreateAnnouncementSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body;
    const cleanContent = sanitizeHtml(data.content);
    const cleanTitle = sanitizeHtml(data.title);

    const announcement = await prisma.$transaction(async (tx) => {
      const created = await tx.announcement.create({
        data: {
          title: cleanTitle,
          content: cleanContent,
          level: data.level,
          linkUrl: data.linkUrl || null,
          startAt: new Date(data.startAt),
          endAt: new Date(data.endAt),
          targetAudience: data.targetAudience,
          targetPageScope: data.targetPageScope,
          isDismissible: data.isDismissible,
          priority: data.priority,
          isPublished: data.isPublished,
          version: 1,
        },
      });

      // Ghi AuditLog
      await tx.auditLog.create({
        data: {
          adminUserId: req.user!.id,
          action: 'CREATE_ANNOUNCEMENT',
          targetEntity: 'Announcement',
          targetId: created.id,
          details: { title: created.title, version: 1 },
        },
      });

      // Ghi OutboxEvent
      await recordOutboxEvent(
        tx,
        'ANNOUNCEMENT',
        created.id,
        SocketEvents.ANNOUNCEMENT_UPDATED,
        {
          id: created.id,
          version: 1,
          title: created.title,
          level: created.level,
          action: 'PUBLISHED',
        }
      );

      return created;
    });

    try {
      emitEnvelope('ALL', SocketEvents.ANNOUNCEMENT_UPDATED, {
        id: announcement.id,
        version: announcement.version,
        title: announcement.title,
        level: announcement.level,
        action: 'PUBLISHED',
      });
    } catch {}

    return res.status(201).json({ success: true, data: announcement });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/admin/announcements/:id
router.patch('/:id', validateBody(UpdateAnnouncementSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy thông báo' });
    }

    const data = req.body;
    const cleanContent = data.content !== undefined ? sanitizeHtml(data.content) : existing.content;
    const cleanTitle = data.title !== undefined ? sanitizeHtml(data.title) : existing.title;

    // Tăng version nếu sửa title, content, level hoặc link
    const shouldIncrementVersion =
      (data.title && cleanTitle !== existing.title) ||
      (data.content && cleanContent !== existing.content) ||
      (data.level && data.level !== existing.level);

    const nextVersion = shouldIncrementVersion ? existing.version + 1 : existing.version;

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.announcement.update({
        where: { id },
        data: {
          title: cleanTitle,
          content: cleanContent,
          level: data.level ?? existing.level,
          linkUrl: data.linkUrl !== undefined ? data.linkUrl : existing.linkUrl,
          startAt: data.startAt ? new Date(data.startAt) : existing.startAt,
          endAt: data.endAt ? new Date(data.endAt) : existing.endAt,
          targetAudience: data.targetAudience ?? existing.targetAudience,
          targetPageScope: data.targetPageScope ?? existing.targetPageScope,
          isDismissible: data.isDismissible ?? existing.isDismissible,
          priority: data.priority ?? existing.priority,
          isPublished: data.isPublished ?? existing.isPublished,
          version: nextVersion,
        },
      });

      // Ghi AuditLog
      await tx.auditLog.create({
        data: {
          adminUserId: req.user!.id,
          action: 'UPDATE_ANNOUNCEMENT',
          targetEntity: 'Announcement',
          targetId: u.id,
          details: { oldVersion: existing.version, newVersion: nextVersion, title: u.title },
        },
      });

      // Ghi Outbox
      await recordOutboxEvent(
        tx,
        'ANNOUNCEMENT',
        u.id,
        SocketEvents.ANNOUNCEMENT_UPDATED,
        {
          id: u.id,
          version: nextVersion,
          title: u.title,
          level: u.level,
          action: 'UPDATED',
        }
      );

      return u;
    });

    try {
      emitEnvelope('ALL', SocketEvents.ANNOUNCEMENT_UPDATED, {
        id: updated.id,
        version: updated.version,
        title: updated.title,
        level: updated.level,
        action: 'UPDATED',
      });
    } catch {}

    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/admin/announcements/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.announcement.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy thông báo' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.announcementDismissal.deleteMany({ where: { announcementId: id } });
      await tx.announcement.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminUserId: req.user!.id,
          action: 'DELETE_ANNOUNCEMENT',
          targetEntity: 'Announcement',
          targetId: id,
          details: { title: existing.title },
        },
      });
    });

    return res.json({ success: true, message: 'Đã xóa thông báo' });
  } catch (err) {
    next(err);
  }
});

export default router;
