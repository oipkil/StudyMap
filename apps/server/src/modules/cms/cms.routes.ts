import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { sanitizeHtml } from '@ssg/shared';

const router = Router();

// In-memory CMS config store with sensible defaults
let cmsConfig = {
  platformName: 'SSG - Khám Phá Địa Điểm Học Tập Sinh Viên',
  logoUrl: '/logo.svg',
  supportEmail: 'support@ssg.edu.vn',
  hotline: '1900 1234',
  contributionGuidelines: 'Vui lòng cung cấp thông tin quán chính xác, hình ảnh rõ nét và không vi phạm bản quyền.',
  reviewGuidelines: 'Đánh giá chân thực, lịch sự, dựa trên trải nghiệm thực tế về không gian và tiện ích học tập.',
  updatedAt: new Date().toISOString(),
};

// GET /api/v1/cms/config (Public)
router.get('/config', (_req: Request, res: Response) => {
  return res.json({ success: true, data: cmsConfig });
});

const UpdateCMSConfigSchema = z.object({
  platformName: z.string().min(2).max(100).optional(),
  logoUrl: z.string().optional(),
  supportEmail: z.string().email().optional(),
  hotline: z.string().optional(),
  contributionGuidelines: z.string().max(2000).optional(),
  reviewGuidelines: z.string().max(2000).optional(),
});

// PATCH /api/v1/cms/admin/config (Admin Only)
router.patch('/admin/config', requireAuth, requireRole('ADMIN'), validateBody(UpdateCMSConfigSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body;
    const oldConfig = { ...cmsConfig };

    cmsConfig = {
      ...cmsConfig,
      ...(data.platformName ? { platformName: sanitizeHtml(data.platformName) } : {}),
      ...(data.logoUrl ? { logoUrl: data.logoUrl } : {}),
      ...(data.supportEmail ? { supportEmail: data.supportEmail } : {}),
      ...(data.hotline ? { hotline: data.hotline } : {}),
      ...(data.contributionGuidelines ? { contributionGuidelines: sanitizeHtml(data.contributionGuidelines) } : {}),
      ...(data.reviewGuidelines ? { reviewGuidelines: sanitizeHtml(data.reviewGuidelines) } : {}),
      updatedAt: new Date().toISOString(),
    };

    await prisma.auditLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'UPDATE_CMS_CONFIG',
        targetEntity: 'SystemConfig',
        targetId: 'cms-global',
        details: { oldConfig, newConfig: cmsConfig },
      },
    });

    return res.json({ success: true, data: cmsConfig, message: 'Đã cập nhật cấu hình hệ thống thành công' });
  } catch (err) {
    next(err);
  }
});

export default router;
