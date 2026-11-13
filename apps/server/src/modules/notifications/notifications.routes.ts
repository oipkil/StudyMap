import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { ErrorCode } from '@ssg/shared';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/v1/me/notifications
 * Phân trang theo Cursor
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 50);
    const userId = req.user!.id;

    const items = await prisma.notification.findMany({
      where: { userId },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    let nextCursor: string | null = null;
    let hasMore = false;
    if (items.length > limit) {
      hasMore = true;
      const nextItem = items.pop();
      nextCursor = nextItem?.id || null;
    }

    return res.json({
      success: true,
      data: {
        items,
        nextCursor,
        hasMore,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/me/notifications/unread-count
 */
router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });
    return res.json({ success: true, data: { unreadCount: count } });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/me/notifications/:id/read
 */
router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const notif = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notif) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy thông báo',
      });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/me/notifications/read-all
 */
router.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return res.json({ success: true, message: 'Đã đánh dấu đọc toàn bộ thông báo' });
  } catch (err) {
    next(err);
  }
});

export default router;
