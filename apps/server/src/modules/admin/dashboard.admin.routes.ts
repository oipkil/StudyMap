import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/authGuard.js';
import { errorCounters } from '../../middleware/errorHandler.js';
import { Role } from '@ssg/shared';

const router = Router();
router.use(requireAuth, requireRole(Role.ADMIN));

// GET /api/v1/admin/dashboard/stats
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [
      pendingPlaces,
      pendingPlaceRevisions,
      pendingReviews,
      pendingComments,
      pendingPosts,
      pendingAssets,
      pendingStickers,
      pendingCollections,
      openReports,
      waitingSupport,
      systemBudgets,
      totalPlaces,
      totalUsers,
    ] = await Promise.all([
      prisma.placeSuggestion.count({ where: { status: 'PENDING' } }),
      prisma.placeRevision.count({ where: { moderationStatus: 'PENDING' } }),
      prisma.reviewRevision.count({ where: { moderationStatus: 'PENDING' } }),
      prisma.commentRevision.count({ where: { moderationStatus: 'PENDING' } }),
      prisma.postRevision.count({ where: { moderationStatus: 'PENDING' } }),
      // Ảnh chờ duyệt: bỏ ảnh thuộc bộ nhãn dán (duyệt ở trang "Bộ nhãn dán")
      prisma.asset.count({ where: { moderationStatus: 'PENDING', stickerItems: { none: {} } } }),
      prisma.stickerPack.count({ where: { moderationStatus: 'PENDING' } }),
      prisma.collectionRevision.count({ where: { moderationStatus: 'PENDING' } }),
      prisma.report.count({ where: { status: 'OPEN' } }),
      prisma.supportCase.count({ where: { status: 'WAITING' } }),
      prisma.aIUsageBudget.findMany({ where: { currentDate: today } }),
      prisma.place.count({ where: { publicationStatus: 'PUBLISHED' } }),
      prisma.user.count({ where: { isLocked: false } }),
    ]);

    const totalPending =
      pendingPlaces +
      pendingPlaceRevisions +
      pendingReviews +
      pendingComments +
      pendingPosts +
      pendingAssets +
      pendingStickers +
      pendingCollections +
      openReports +
      waitingSupport;

    // Tính toán cảnh báo Quota AI hôm nay
    const totalTokensUsed = systemBudgets.reduce((sum, b) => sum + b.currentTokens, 0);
    const systemBudgetThreshold = 500000; // Ngưỡng trần ngày
    const aiQuotaUsagePercent = Math.min(100, Math.round((totalTokensUsed / systemBudgetThreshold) * 100));
    const aiQuotaWarning = aiQuotaUsagePercent >= 80;

    return res.json({
      success: true,
      data: {
        totalPending,
        // Tên trường mà AdminDashboardPage / AdminLayout (badge) đang đọc
        stats: {
          totalPlaces,
          totalUsers,
          // Badge "Duyệt Đề Xuất Quán" chỉ đếm đề xuất từ sinh viên; phiên bản quán chờ duyệt đếm riêng cho "Quản Lý Địa Điểm"
          pendingContributions: pendingPlaces,
          pendingPlaceRevisions,
          pendingReviews: pendingReviews + pendingComments + pendingPosts + pendingCollections,
          pendingReports: openReports,
          pendingSupport: waitingSupport,
          pendingMedia: pendingAssets,
          pendingStickers,
        },
        pendingPlaces,
        pendingPlaceRevisions,
        pendingReviews,
        pendingComments,
        pendingPosts,
        pendingAssets,
        pendingStickers,
        pendingCollections,
        openReports,
        waitingSupport,
        errorStats: errorCounters,
        aiQuota: {
          today,
          totalTokensUsed,
          usagePercent: aiQuotaUsagePercent,
          isNearLimit: aiQuotaWarning,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
