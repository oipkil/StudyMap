import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/authGuard.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

// GET /api/v1/admin/audit-logs
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const action = req.query.action as string | undefined;
    const targetEntity = req.query.targetEntity as string | undefined;
    const adminUserId = req.query.adminUserId as string | undefined;
    const search = ((req.query.search as string) || '').trim();
    const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (action) where.action = action;
    if (targetEntity) where.targetEntity = targetEntity;
    if (adminUserId) where.adminUserId = adminUserId;
    if (search) {
      // Tìm theo tên hành động / loại đối tượng / id đối tượng / tên admin
      where.OR = [
        { action: { contains: search.toUpperCase() } },
        { targetEntity: { contains: search, mode: 'insensitive' } },
        { targetId: { contains: search } },
        { adminUser: { username: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          adminUser: { select: { id: true, username: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return res.json({
      success: true,
      data: {
        items,
        // Alias cho giao diện Nhật ký hệ thống (logs/entityType/actor/metadata)
        logs: items.map((it) => ({
          id: it.id,
          action: it.action,
          entityType: it.targetEntity,
          entityId: it.targetId,
          actorType: 'ADMIN',
          actorId: it.adminUserId,
          actor: it.adminUser ? { username: it.adminUser.username, role: 'ADMIN' } : undefined,
          ipAddress: it.ipAddress ?? undefined,
          metadata: (it.details as Record<string, unknown>) ?? {},
          createdAt: it.createdAt,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
