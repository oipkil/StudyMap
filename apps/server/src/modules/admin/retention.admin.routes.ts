import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireRole } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { Role } from '@ssg/shared';
import { runRetentionCleanup } from './retention.service.js';

const router = Router();
router.use(requireRole(Role.ADMIN));

const RetentionCleanupSchema = z.object({
  chatRetentionDays: z.number().int().min(1).max(365).optional(),
  rejectedMediaDays: z.number().int().min(1).max(365).optional(),
  abandonedUploadsDays: z.number().int().min(1).max(365).optional(),
  dryRun: z.boolean().default(true),
  confirm: z.boolean().optional(),
});

/**
 * POST /api/v1/admin/retention/cleanup
 * Kích hoạt job dọn dẹp theo chính sách retention (mặc định chạy ở chế độ dryRun)
 */
router.post('/cleanup', validateBody(RetentionCleanupSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { chatRetentionDays, rejectedMediaDays, abandonedUploadsDays, dryRun, confirm } = req.body;

    if (!dryRun && !confirm) {
      return res.status(400).json({
        success: false,
        message: 'Để thực thi xóa dữ liệu thực tế, bạn bắt buộc phải gửi cờ confirm: true.',
      });
    }

    const result = await runRetentionCleanup({
      chatRetentionDays,
      rejectedMediaDays,
      abandonedUploadsDays,
      dryRun,
    });

    return res.json({
      success: true,
      data: result,
      message: dryRun
        ? 'Đã thực hiện quét thử nghiệm chính sách lưu trữ (Dry Run)'
        : 'Đã hoàn tất dọn dẹp dữ liệu quá hạn lưu trữ thành công',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
