import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { ErrorCode } from '@ssg/shared';

const router = Router();

/**
 * GET /api/v1/announcements/active
 * Lấy danh sách announcement đang có hiệu lực theo lịch, audience và pageScope
 */
router.get(['/', '/active'], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pageScope = (req.query.pageScope as string) || 'ALL';
    const now = new Date();
    const user = req.user;

    // Audience filter
    let allowedAudiences = ['ALL'];
    if (user) {
      if (user.role === 'ADMIN') {
        allowedAudiences = ['ALL', 'USERS', 'ADMINS'];
      } else {
        allowedAudiences = ['ALL', 'USERS'];
      }
    }

    const announcements = await prisma.announcement.findMany({
      where: {
        isPublished: true,
        startAt: { lte: now },
        endAt: { gte: now },
        targetAudience: { in: allowedAudiences as any },
        ...(pageScope !== 'ALL' ? { targetPageScope: { in: ['ALL', pageScope] } } : {}),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    if (!user) {
      return res.json({ success: true, data: announcements });
    }

    // Kiểm tra các thông báo người dùng đã đóng (dựa trên announcement ID + version)
    const dismissals = await prisma.announcementDismissal.findMany({
      where: {
        userId: user.id,
        announcementId: { in: announcements.map((a) => a.id) },
      },
    });

    const dismissalMap = new Map(dismissals.map((d) => [d.announcementId, d.dismissedVersion]));

    const filtered = announcements.filter((a) => {
      const dismissedVer = dismissalMap.get(a.id);
      if (dismissedVer === undefined) return true;
      // Nếu version mới hơn version đã đóng -> vẫn hiển thị lại
      return a.version > dismissedVer;
    });

    return res.json({ success: true, data: filtered });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/announcements/:id/dismiss
 * Người dùng đóng thông báo gắn với version hiện tại
 */
router.post('/:id/dismiss', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const announcementId = req.params.id as string;
    const userId = req.user!.id;

    const announcement = await prisma.announcement.findUnique({
      where: { id: announcementId },
    });

    if (!announcement) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy thông báo',
      });
    }

    await prisma.announcementDismissal.upsert({
      where: {
        userId_announcementId: { userId, announcementId },
      },
      update: {
        dismissedVersion: announcement.version,
        dismissedAt: new Date(),
      },
      create: {
        userId,
        announcementId,
        dismissedVersion: announcement.version,
      },
    });

    return res.json({ success: true, message: 'Đã đóng thông báo' });
  } catch (err) {
    next(err);
  }
});

export default router;
