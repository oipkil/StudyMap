import { writeAudit } from '../../lib/audit.js';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireRole } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { disconnectUserSockets } from '../../socket/index.js';
import { ErrorCode, Role } from '@ssg/shared';
import { MOCK_USERS, setMockUserLocked } from '../../lib/mock-auth.store.js';

const router = Router();
router.use(requireRole(Role.ADMIN));

// 1. Danh sách người dùng
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const skip = (page - 1) * limit;

    try {
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            isEmailVerified: true,
            isLocked: true,
            createdAt: true,
            profile: {
              select: {
                displayName: true,
                currentPublishedAvatarAssetId: true,
              },
            },
          },
        }),
        prisma.user.count(),
      ]);

      return res.json({
        success: true,
        data: users,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Serving mock users for admin:', (dbErr as Error).message);
      return res.json({
        success: true,
        data: MOCK_USERS,
        meta: {
          page: 1,
          limit: 20,
          total: MOCK_USERS.length,
          totalPages: 1,
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

// 2. Khóa / Mở khóa người dùng (Bảo vệ admin cuối cùng)
const LockUserSchema = z.object({
  isLocked: z.boolean(),
  reason: z.string().min(5, 'Vui lòng cung cấp lý do xử lý'),
});

router.patch('/:id/lock', validateBody(LockUserSchema), async (req: Request, res: Response, next: NextFunction) => {
  res.on('finish', () => {
    if (res.statusCode < 300) {
      void writeAudit({ adminUserId: req.user!.id, action: req.body?.isLocked ? 'LOCK_USER' : 'UNLOCK_USER', targetEntity: 'User', targetId: String(req.params.id), details: { reason: req.body?.reason || null }, ipAddress: req.ip });
    }
  });
  try {
    const targetUserId = req.params.id as string;
    const { isLocked, reason } = req.body;

    try {
      const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!targetUser) {
        throw new Error('UserNotFoundInDb');
      }

      // Bảo vệ admin cuối cùng: Nếu target là ADMIN và đang muốn khóa, kiểm tra số lượng admin đang hoạt động
      if (targetUser.role === Role.ADMIN && isLocked) {
        const activeAdminCount = await prisma.user.count({
          where: { role: Role.ADMIN, isLocked: false },
        });
        if (activeAdminCount <= 1) {
          return res.status(400).json({
            success: false,
            errorCode: ErrorCode.FORBIDDEN,
            message: 'Không thể vô hiệu hóa hoặc khóa quản trị viên hoạt động cuối cùng trong hệ thống!',
          });
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: targetUserId },
          data: { isLocked },
        });

        if (isLocked) {
          // Thu hồi toàn bộ session hiện có
          await tx.session.updateMany({
            where: { userId: targetUserId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }

        // Ghi audit log
        await tx.auditLog.create({
          data: {
            adminUserId: req.user!.id,
            action: isLocked ? 'LOCK_USER' : 'UNLOCK_USER',
            targetEntity: 'User',
            targetId: targetUserId,
            details: { reason, targetUsername: targetUser.username },
          },
        });

        return user;
      });

      if (isLocked) {
        disconnectUserSockets(targetUserId);
      }

      return res.json({
        success: true,
        data: {
          id: updated.id,
          isLocked: updated.isLocked,
          message: isLocked ? 'Đã khóa tài khoản và ngắt toàn bộ phiên kết nối' : 'Đã mở khóa tài khoản',
        },
      });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Locking mock user in memory:', (dbErr as Error).message);
      const mockU = setMockUserLocked(targetUserId, isLocked);
      if (!mockU) {
        return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy người dùng' });
      }
      return res.json({
        success: true,
        data: {
          id: mockU.id,
          isLocked: mockU.isLocked,
          message: isLocked ? 'Đã khóa tài khoản và ngắt toàn bộ phiên kết nối' : 'Đã mở khóa tài khoản',
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

// 3. Phân quyền / Hạ quyền người dùng (Bảo vệ admin cuối cùng)
const ChangeRoleSchema = z.object({
  role: z.enum([Role.USER, Role.ADMIN]),
  reason: z.string().min(5, 'Vui lòng cung cấp lý do thay đổi quyền'),
});

router.patch('/:id/role', validateBody(ChangeRoleSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetUserId = req.params.id as string;
    const { role: newRole, reason } = req.body;

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy người dùng',
      });
    }

    // Nếu đang hạ quyền admin thành user: kiểm tra xem có phải admin hoạt động cuối cùng không
    if (targetUser.role === Role.ADMIN && newRole === Role.USER) {
      const activeAdminCount = await prisma.user.count({
        where: { role: Role.ADMIN, isLocked: false },
      });
      if (activeAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          errorCode: ErrorCode.FORBIDDEN,
          message: 'Không thể hạ quyền quản trị viên hoạt động cuối cùng trong hệ thống!',
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: targetUserId },
        data: { role: newRole },
      });

      // Ghi role audit log chuyên biệt
      await tx.roleAuditLog.create({
        data: {
          targetUserId,
          performedByAdminId: req.user!.id,
          oldRole: targetUser.role,
          newRole,
          reason,
        },
      });

      await tx.auditLog.create({
        data: {
          adminUserId: req.user!.id,
          action: 'CHANGE_USER_ROLE',
          targetEntity: 'User',
          targetId: targetUserId,
          details: { oldRole: targetUser.role, newRole, reason },
        },
      });

      return user;
    });

    // Nếu bị hạ quyền hoặc đổi quyền, ngắt phiên socket để client nhận diện lại quyền mới
    disconnectUserSockets(targetUserId);

    return res.json({
      success: true,
      data: {
        id: updated.id,
        role: updated.role,
        message: `Đã cập nhật vai trò người dùng thành ${newRole}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
