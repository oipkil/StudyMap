import { writeAudit } from '../../lib/audit.js';
import { publishAssetsForEntity, unpublishAssetsForEntity } from '../../lib/asset-usage.js';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import {
  ErrorCode,
  ModerationStatus,
  PublicationStatus,
  OperationalStatus,
  ContentState,
  ReportStatus,
  TargetType,
} from '@ssg/shared';
import { recomputePlaceRating } from '../places/places.routes.js';
import { buildSnapshotFromSuggestion } from '../places/suggestion-snapshot.js';
import { syncPublishedProjection, syncPlaceAssetUsages } from './places.admin.routes.js';
import { sendNotification } from '../notifications/notification.service.js';
import { MOCK_PLACES } from '../places/mock-places.data.js';
import { MOCK_COMMENTS, MOCK_POSTS } from '../community/mock-community.data.js';


const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

const ModerateActionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'CHANGES_REQUESTED']),
  reviewerNote: z.string().max(1000).optional(),
  categoryId: z.string().uuid().optional(),
  nearestCampusId: z.string().uuid().nullable().optional(),
});

// =========================================================================
// 1. DUYỆT ĐỀ XUẤT QUÁN MỚI (PLACE SUGGESTIONS MODERATION)
// =========================================================================
router.get('/suggestions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as ModerationStatus | undefined;
    const where: any = {};
    if (status) where.status = status;

    const suggestions = await prisma.placeSuggestion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, email: true } },
      },
    });
    // Kèm tên cơ sở trường (PlaceSuggestion không có relation campus)
    const campusIds = Array.from(new Set(suggestions.map((s) => s.campusId).filter((x): x is string => Boolean(x))));
    const campuses = campusIds.length ? await prisma.campus.findMany({ where: { id: { in: campusIds } }, select: { id: true, name: true } }) : [];
    const campusById = new Map(campuses.map((c) => [c.id, c]));
    for (const sg of suggestions as any[]) sg.campus = sg.campusId ? campusById.get(sg.campusId) ?? null : null;

    return res.json({ success: true, data: suggestions });
  } catch (err) {
    next(err);
  }
});

// Xem trước hồ sơ quán sẽ được tạo từ đề xuất (kèm danh sách thiếu sót) — admin nhìn trước khi phê duyệt
router.get('/suggestions/:id/preview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const suggestion = await prisma.placeSuggestion.findUnique({ where: { id }, include: { user: { select: { email: true, username: true } } } });
    if (!suggestion) return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy đề xuất quán' });
    const built = await buildSnapshotFromSuggestion(suggestion, { slug: 'preview' });
    return res.json({ success: true, data: { snapshot: built.snapshot, issues: built.issues, warnings: built.warnings, valid: built.valid } });
  } catch (err) {
    next(err);
  }
});

router.post('/suggestions/:id/moderate', validateBody(ModerateActionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { action, reviewerNote } = req.body;

    const suggestion = await prisma.placeSuggestion.findUnique({ where: { id }, include: { user: { select: { email: true, username: true } } } });
    if (!suggestion) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy đề xuất quán' });
    }
    if (suggestion.status === ModerationStatus.APPROVED && suggestion.convertedPlaceId) {
      return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: 'Đề xuất này đã được phê duyệt thành quán trước đó' });
    }

    if (action === 'APPROVE') {
      // Admin có thể chọn lại danh mục / cơ sở trường (khi sinh viên ghi "khác" hoặc chọn sai)
      const { categoryId: overrideCategoryId, nearestCampusId: overrideCampusId } = req.body as { categoryId?: string; nearestCampusId?: string | null };
      if (overrideCategoryId && !(await prisma.category.findUnique({ where: { id: overrideCategoryId }, select: { id: true } }))) {
        return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Danh mục không tồn tại' });
      }
      if (overrideCampusId && !(await prisma.campus.findUnique({ where: { id: overrideCampusId }, select: { id: true } }))) {
        return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Cơ sở trường không tồn tại' });
      }
      // Dựng hồ sơ quán từ đúng những gì sinh viên điền (không gán mặc định giả); thiếu vị trí thì không thể xuất bản lên bản đồ
      const built = await buildSnapshotFromSuggestion(suggestion, { categoryId: overrideCategoryId, nearestCampusId: overrideCampusId });
      if (!built.valid) {
        return res.status(422).json({
          success: false,
          errorCode: ErrorCode.VALIDATION_ERROR,
          message: 'Đề xuất chưa đủ dữ liệu để tạo quán: ' + built.issues.join('; ') + '. Hãy "Yêu cầu bổ sung" để sinh viên sửa, hoặc tạo quán thủ công ở Quản lý địa điểm.',
          data: { issues: built.issues },
        });
      }
      const snapshotData: any = built.snapshot;

      const newPlace = await prisma.$transaction(async (tx) => {
        const place = await tx.place.create({
          data: {
            slug: snapshotData.slug,
            defaultName: suggestion.proposedName,
            categoryId: snapshotData.categoryId,
            operationalStatus: OperationalStatus.OPERATING,
            publicationStatus: PublicationStatus.PUBLISHED,
            createdByUserId: suggestion.userId,
          },
        });

        const rev = await tx.placeRevision.create({
          data: {
            placeId: place.id,
            revisionNumber: 1,
            snapshotData,
            authorUserId: suggestion.userId,
            moderationStatus: ModerationStatus.APPROVED,
            reviewerNote: reviewerNote || 'Đã phê duyệt đề xuất từ sinh viên',
            reviewerAdminId: req.user!.id,
            approvedAt: new Date(),
          },
        });

        await tx.place.update({ where: { id: place.id }, data: { currentPublishedRevisionId: rev.id } });
        // Bản chiếu tìm kiếm/bản đồ + quyền công khai cho ảnh sinh viên đã tải (cùng helper với luồng admin tạo quán)
        await syncPublishedProjection(tx, place.id, rev.id, snapshotData, place.categoryId, place.slug);
        await syncPlaceAssetUsages(tx, place.id, snapshotData, req.user!.id);

        await tx.placeSuggestion.update({
          where: { id: suggestion.id },
          data: { status: ModerationStatus.APPROVED, reviewerNote, convertedPlaceId: place.id },
        });
        return place;
      });

      await sendNotification({
        userId: suggestion.userId,
        type: 'SUGGESTION_APPROVED',
        title: 'Đề xuất quán đã được duyệt',
        body: `"${suggestion.proposedName}" đã lên bản đồ. Cảm ơn bạn đã đóng góp!`,
        deepLinkUrl: `/places/${newPlace.slug}`,
      }).catch(() => {});

      await writeAudit({ adminUserId: req.user!.id, action: 'APPROVE_PLACE_SUGGESTION', targetEntity: 'PlaceSuggestion', targetId: id, details: { placeId: newPlace.id, slug: newPlace.slug, reviewerNote: reviewerNote || null }, ipAddress: req.ip });
      return res.json({
        success: true,
        data: { suggestionId: id, placeId: newPlace.id, slug: newPlace.slug, status: ModerationStatus.APPROVED },
        message: 'Đã phê duyệt đề xuất quán thành công và xuất bản lên bản đồ tìm kiếm',
      });
    }

    const targetStatus = action === 'REJECT' ? ModerationStatus.REJECTED : ModerationStatus.CHANGES_REQUESTED;
    await prisma.placeSuggestion.update({
      where: { id },
      data: { status: targetStatus, reviewerNote },
    });

    await sendNotification({
      userId: suggestion.userId,
      type: action === 'REJECT' ? 'SUGGESTION_REJECTED' : 'SUGGESTION_CHANGES_REQUESTED',
      title: action === 'REJECT' ? 'Đề xuất quán bị từ chối' : 'Đề xuất quán cần bổ sung',
      body: `"${suggestion.proposedName}": ${reviewerNote || 'xem ghi chú của ban duyệt trong mục Đóng góp'}`,
      deepLinkUrl: '/me/contributions',
    }).catch(() => {});

    await writeAudit({ adminUserId: req.user!.id, action: action === 'REJECT' ? 'REJECT_PLACE_SUGGESTION' : 'REQUEST_CHANGES_PLACE_SUGGESTION', targetEntity: 'PlaceSuggestion', targetId: id, details: { reviewerNote: reviewerNote || null }, ipAddress: req.ip });
    return res.json({
      success: true,
      data: { suggestionId: id, status: targetStatus, reviewerNote },
      message: action === 'REJECT' ? 'Đã từ chối đề xuất quán' : 'Đã yêu cầu sinh viên bổ sung thông tin',
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 2. DUYỆT ĐÁNH GIÁ (REVIEWS MODERATION & RATING RECALCULATION)
// =========================================================================
router.get('/reviews', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as ModerationStatus | undefined;
    const where: any = {};
    if (status) where.moderationStatus = status;

    try {
      const revisions = await prisma.reviewRevision.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          review: {
            include: {
              place: { select: { id: true, defaultName: true, slug: true } },
              user: { select: { id: true, username: true, email: true, isLocked: true } },
            },
          },
        },
      });

      return res.json({ success: true, data: revisions });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Serving mock reviews for admin:', (dbErr as Error).message);
      const mockRevs: any[] = [];
      for (const p of MOCK_PLACES) {
        for (const r of (p.reviews || [])) {
          mockRevs.push({
            id: 'rev-rev-' + r.id,
            revisionNumber: 1,
            ratingOverall: r.ratingOverall,
            content: r.content,
            criteriaScores: r.criteriaScores || {},
            attachedAssetIds: r.attachedAssetIds || [],
            moderationStatus: 'APPROVED',
            approvedAt: r.createdAt || new Date(),
            createdAt: r.createdAt || new Date(),
            review: {
              id: r.id,
              placeId: p.id,
              userId: r.author?.id || 'u-std-1',
              ratingOverall: r.ratingOverall,
              state: 'PUBLISHED',
              place: {
                id: p.id,
                defaultName: p.defaultName || p.name,
                slug: p.slug,
              },
              user: {
                id: r.author?.id || 'u-std-1',
                username: r.author?.username || 'sinhvien',
                email: (r.author?.username || 'sinhvien') + '@ssg.vn',
                isLocked: r.author?.isLocked || false,
              },
            },
          });
        }
      }
      return res.json({ success: true, data: mockRevs });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/reviews/:revisionId/moderate', validateBody(ModerateActionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const revisionId = req.params.revisionId as string;
    const { action, reviewerNote } = req.body;

    const revision = await prisma.reviewRevision.findUnique({
      where: { id: revisionId },
      include: { review: true },
    });

    if (!revision) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy phiên bản đánh giá' });
    }

    if (action === 'APPROVE') {
      await prisma.$transaction([
        prisma.reviewRevision.update({
          where: { id: revisionId },
          data: {
            moderationStatus: ModerationStatus.APPROVED,
            reviewerNote,
            reviewerAdminId: req.user!.id,
            approvedAt: new Date(),
          },
        }),
        prisma.review.update({
          where: { id: revision.reviewId },
          data: {
            currentPublishedRevisionId: revision.id,
            ratingOverall: revision.ratingOverall,
            state: ContentState.PUBLISHED,
          },
        }),
      ]);
      // Ảnh đính kèm đánh giá được phép hiển thị công khai
      await publishAssetsForEntity(prisma, 'REVIEW', revision.reviewId, revision.attachedAssetIds || []);

      // TÍNH TOÁN LẠI ĐIỂM TỔNG HỢP CỦA QUÁN
      const stats = await recomputePlaceRating(revision.review.placeId);
      await writeAudit({ adminUserId: req.user!.id, action: 'APPROVE_REVIEW', targetEntity: 'Review', targetId: revision.reviewId, details: { revisionId, placeId: revision.review.placeId, reviewerNote: reviewerNote || null }, ipAddress: req.ip });

      return res.json({
        success: true,
        data: { revisionId, status: ModerationStatus.APPROVED, stats },
        message: 'Đã phê duyệt đánh giá và cập nhật lại điểm tổng hợp của quán',
      });
    }

    const targetStatus = action === 'REJECT' ? ModerationStatus.REJECTED : ModerationStatus.CHANGES_REQUESTED;
    await prisma.reviewRevision.update({
      where: { id: revisionId },
      data: { moderationStatus: targetStatus, reviewerNote },
    });

    // Nếu revision bị từ chối và review trước đó đang trỏ vào revision này -> tính lại rating
    if (revision.review.currentPublishedRevisionId === revision.id) {
      await prisma.review.update({
        where: { id: revision.reviewId },
        data: { currentPublishedRevisionId: null },
      });
      await recomputePlaceRating(revision.review.placeId);
    }

    return res.json({
      success: true,
      data: { revisionId, status: targetStatus, reviewerNote },
      message: action === 'REJECT' ? 'Đã từ chối đánh giá' : 'Đã yêu cầu sinh viên chỉnh sửa đánh giá',
    });
  } catch (err) {
    next(err);
  }
});

// Cập nhật trạng thái hiển thị của Review (Ẩn / Thu hồi)
router.post('/reviews/:reviewId/state', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviewId = req.params.reviewId as string;
    const { state } = req.body; // PUBLISHED | HIDDEN | REVOKED

    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy review' });
    }

    await prisma.review.update({
      where: { id: reviewId },
      data: { state: state as ContentState },
    });

    // Điểm quán lập tức được tính lại trừ review này ra nếu state !== PUBLISHED
    const stats = await recomputePlaceRating(review.placeId);

    return res.json({
      success: true,
      data: { reviewId, state, stats },
      message: `Đã cập nhật trạng thái hiển thị của đánh giá thành: ${state}`,
    });
  } catch (err) {
    next(err);
  }
});

// Admin xoá vĩnh viễn đánh giá (điểm quán tính lại tức thì)
router.delete('/reviews/:reviewId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviewId = req.params.reviewId as string;
    try {
      const review = await prisma.review.findUnique({ where: { id: reviewId } });
      if (!review) {
        throw new Error('ReviewNotFoundInDb');
      }

      await prisma.$transaction(async (tx) => {
        await unpublishAssetsForEntity(tx, 'REVIEW', reviewId);
        await tx.review.update({ where: { id: reviewId }, data: { currentPublishedRevisionId: null } });
        await tx.review.delete({ where: { id: reviewId } });
      });

      const stats = await recomputePlaceRating(review.placeId);
      await writeAudit({ adminUserId: req.user!.id, action: 'DELETE_REVIEW', targetEntity: 'Review', targetId: reviewId, details: { placeId: review.placeId }, ipAddress: req.ip });

      return res.json({ success: true, data: { stats }, message: 'Đã xóa đánh giá thành công' });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Deleting review in admin mock mode:', (dbErr as Error).message);
      for (const p of MOCK_PLACES) {
        if (p.reviews && p.reviews.some((r: any) => r.id === reviewId)) {
          p.reviews = p.reviews.filter((r: any) => r.id !== reviewId);
          p.reviewCount = p.reviews.length;
          const sum = p.reviews.reduce((acc: number, r: any) => acc + (r.ratingOverall || 5), 0);
          p.ratingOverall = p.reviews.length > 0 ? Math.round((sum / p.reviews.length) * 10) / 10 : 0;
          return res.json({ success: true, data: { stats: { ratingOverall: p.ratingOverall, reviewCount: p.reviewCount } }, message: 'Đã xóa đánh giá thành công' });
        }
      }
      return res.json({ success: true, message: 'Đã xóa đánh giá thành công' });
    }
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 3. DUYỆT BỘ STICKER (STICKER PACKS MODERATION)
// =========================================================================
router.get('/stickers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const packs = await prisma.stickerPack.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        author: { select: { id: true, username: true } },
      },
    });
    // Admin xem trước ảnh nhãn dán (preview=true vì ảnh chưa công khai trước khi duyệt)
    const data = packs.map((p) => ({
      ...p,
      items: p.items.map((it) => ({
        ...it,
        name: it.altText,
        imageUrl: `/api/v1/media/${it.assetId}?variant=thumb&preview=true`,
      })),
    }));
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/stickers/:id/moderate', validateBody(ModerateActionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { action } = req.body;

    const targetStatus = action === 'APPROVE' ? ModerationStatus.APPROVED : ModerationStatus.REJECTED;
    const pack = await prisma.stickerPack.update({
      where: { id },
      data: { moderationStatus: targetStatus },
      include: { items: true },
    });
    const stickerAssetIds = pack.items.map((it) => it.assetId);
    if (action === 'APPROVE') {
      // Ảnh nhãn dán phải được phép phục vụ công khai cho mọi người xem bình luận
      await publishAssetsForEntity(prisma, 'STICKER_PACK', pack.id, stickerAssetIds);
      // Duyệt luôn ở mức Asset: duyệt bộ nhãn dán là đủ, không bắt admin duyệt lại từng ảnh ở "Thư viện ảnh"
      await prisma.asset.updateMany({ where: { id: { in: stickerAssetIds } }, data: { moderationStatus: ModerationStatus.APPROVED } });
    } else {
      await unpublishAssetsForEntity(prisma, 'STICKER_PACK', pack.id);
      await prisma.asset.updateMany({ where: { id: { in: stickerAssetIds } }, data: { moderationStatus: ModerationStatus.REJECTED } });
      await prisma.assetRevision.updateMany({ where: { assetId: { in: stickerAssetIds } }, data: { moderationStatus: ModerationStatus.REJECTED } });
    }
    await prisma.auditLog.create({
      data: {
        adminUserId: req.user!.id,
        action: action === 'APPROVE' ? 'APPROVE_STICKER_PACK' : 'REJECT_STICKER_PACK',
        targetEntity: 'StickerPack',
        targetId: pack.id,
        details: { name: pack.name, items: pack.items.length },
      },
    });

    return res.json({
      success: true,
      data: pack,
      message: action === 'APPROVE' ? 'Đã phê duyệt bộ sticker đưa vào kho sticker công khai' : 'Đã từ chối bộ sticker',
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 4. HÀNG ĐỢI XỬ LÝ BÁO CÁO VI PHẠM (REPORTS QUEUE)
// =========================================================================
router.get('/reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as ReportStatus | undefined;
    const where: any = {};
    if (status) where.status = status;

    const reports = await prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, username: true, email: true } },
      },
    });

    const REASON_LABEL: Record<string, string> = {
      SPAM: 'Quảng cáo rác / Spam',
      MISINFORMATION: 'Thông tin sai sự thật',
      INAPPROPRIATE: 'Ngôn từ phản cảm',
      HARASSMENT: 'Quấy rối / Công kích cá nhân',
      OTHER: 'Lý do khác',
    };
    // Alias cho giao diện admin (reason/details) + nhãn tiếng Việt của mã lý do
    const data = reports.map((r) => ({ ...r, reason: REASON_LABEL[r.reasonCode] ?? r.reasonCode, details: r.description ?? null }));
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

const ResolveReportSchema = z.object({
  status: z.enum([ReportStatus.INVESTIGATING, ReportStatus.RESOLVED, ReportStatus.DISMISSED]),
  actionTaken: z.string().max(500).optional(),
  resolutionNote: z.string().max(1000).optional(),
});

router.patch('/reports/:id', validateBody(ResolveReportSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { status, actionTaken, resolutionNote } = req.body;

    const updated = await prisma.report.update({
      where: { id },
      data: {
        status,
        actionTaken,
        resolutionNote,
        assignedAdminId: req.user!.id,
        resolvedAt: status === ReportStatus.RESOLVED || status === ReportStatus.DISMISSED ? new Date() : null,
      },
    });

    // Ghi AuditLog
    await prisma.auditLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'RESOLVE_REPORT',
        targetEntity: 'Report',
        targetId: id,
        details: { status, actionTaken, resolutionNote },
      },
    });

    // Thông báo cho người báo cáo
    await sendNotification({
      userId: updated.reporterUserId,
      type: 'REPORT_RESOLVED',
      title: 'Báo cáo vi phạm đã được xử lý',
      body: `Báo cáo của bạn đã được quản trị viên xử lý: ${status}`,
    });

    return res.json({
      success: true,
      data: updated,
      message: `Đã cập nhật báo cáo vi phạm sang trạng thái: ${status}`,
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 5. DUYỆT BÀI TRẢI NGHIỆM (POSTS MODERATION)
// =========================================================================
router.get('/posts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as ModerationStatus | undefined;
    const where: any = {};
    if (status) where.moderationStatus = status;

    try {
      const revisions = await prisma.postRevision.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          post: {
            include: {
              author: { select: { id: true, username: true, email: true, isLocked: true } },
            },
          },
        },
      });

      return res.json({ success: true, data: revisions });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Serving mock posts for admin:', (dbErr as Error).message);
      const list = MOCK_POSTS.map((p) => ({
        id: 'rev-post-' + p.id,
        revisionNumber: 1,
        title: p.title,
        summary: p.summary,
        moderationStatus: 'APPROVED',
        createdAt: p.createdAt,
        post: {
          id: p.id,
          slug: p.slug,
          state: 'PUBLISHED',
          author: {
            id: p.author.id,
            username: p.author.username,
            email: p.author.username + '@ssg.vn',
            isLocked: p.author.isLocked || false,
          },
        },
      }));
      return res.json({ success: true, data: list });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/posts/:revisionId/moderate', validateBody(ModerateActionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const revisionId = req.params.revisionId as string;
    const { action, reviewerNote } = req.body;

    const revision = await prisma.postRevision.findUnique({
      where: { id: revisionId },
      include: { post: true },
    });

    if (!revision) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy phiên bản bài viết' });
    }

    if (action === 'APPROVE') {
      await prisma.$transaction([
        prisma.postRevision.update({
          where: { id: revisionId },
          data: {
            moderationStatus: ModerationStatus.APPROVED,
            reviewerNote,
            approvedAt: new Date(),
          },
        }),
        prisma.post.update({
          where: { id: revision.postId },
          data: {
            currentPublishedRevisionId: revision.id,
            state: ContentState.PUBLISHED,
          },
        }),
        prisma.auditLog.create({
          data: {
            adminUserId: req.user!.id,
            action: 'APPROVE_POST',
            targetEntity: 'Post',
            targetId: revision.postId,
            details: { revisionId, title: revision.title },
          },
        }),
      ]);
      {
        const blocks: any[] = Array.isArray(revision.contentBlocks) ? (revision.contentBlocks as any[]) : [];
        const blockAssetIds = blocks.map((b: any) => b?.assetId).filter(Boolean);
        await publishAssetsForEntity(prisma, 'POST', revision.postId, [revision.coverAssetId, ...blockAssetIds]);
      }

      await sendNotification({
        userId: revision.post.authorUserId,
        type: 'POST_APPROVED',
        title: 'Bài trải nghiệm đã được phê duyệt',
        body: `Bài viết "${revision.title}" của bạn đã được xuất bản công khai.`,
        deepLinkUrl: `/posts/${revision.post.slug}`,
      });

      return res.json({
        success: true,
        data: { revisionId, status: ModerationStatus.APPROVED },
        message: 'Đã phê duyệt và xuất bản bài trải nghiệm',
      });
    }

    const targetStatus = action === 'REJECT' ? ModerationStatus.REJECTED : ModerationStatus.CHANGES_REQUESTED;
    await prisma.postRevision.update({
      where: { id: revisionId },
      data: { moderationStatus: targetStatus, reviewerNote },
    });

    await prisma.auditLog.create({
      data: {
        adminUserId: req.user!.id,
        action: action === 'REJECT' ? 'REJECT_POST' : 'REQUEST_CHANGES_POST',
        targetEntity: 'Post',
        targetId: revision.postId,
        details: { revisionId, reviewerNote },
      },
    });

    await sendNotification({
      userId: revision.post.authorUserId,
      type: action === 'REJECT' ? 'POST_REJECTED' : 'POST_CHANGES_REQUESTED',
      title: action === 'REJECT' ? 'Bài trải nghiệm bị từ chối' : 'Yêu cầu chỉnh sửa bài trải nghiệm',
      body: reviewerNote || `Bài viết "${revision.title}" cần điều chỉnh theo quy định.`,
    });

    return res.json({
      success: true,
      data: { revisionId, status: targetStatus, reviewerNote },
      message: action === 'REJECT' ? 'Đã từ chối bài viết' : 'Đã yêu cầu chỉnh sửa bài viết',
    });
  } catch (err) {
    next(err);
  }
});

// Admin xoá vĩnh viễn bài trải nghiệm
router.delete('/posts/:postId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const postId = req.params.postId as string;
    try {
      const post = await prisma.post.findUnique({ where: { id: postId } });
      if (!post) {
        throw new Error('PostNotFoundInDb');
      }

      await prisma.$transaction(async (tx) => {
        await unpublishAssetsForEntity(tx, 'POST', postId);
        await tx.comment.updateMany({ where: { targetType: TargetType.POST, targetId: postId }, data: { isDeleted: true } });
        await tx.post.update({ where: { id: postId }, data: { currentPublishedRevisionId: null } });
        await tx.post.delete({ where: { id: postId } });
      });

      await writeAudit({ adminUserId: req.user!.id, action: 'DELETE_POST', targetEntity: 'Post', targetId: postId, details: { slug: post.slug }, ipAddress: req.ip });

      return res.json({ success: true, message: 'Đã xóa bài viết thành công' });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Deleting post in admin mock mode:', (dbErr as Error).message);
      const idx = MOCK_POSTS.findIndex((p) => p.id === postId);
      if (idx !== -1) {
        MOCK_POSTS.splice(idx, 1);
      }
      return res.json({ success: true, message: 'Đã xóa bài viết thành công' });
    }
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 6. DUYỆT BỘ SƯU TẬP CÔNG KHAI (COLLECTIONS MODERATION)
// =========================================================================
router.get('/collections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as ModerationStatus | undefined;
    // Chỉ hiện bộ sưu tập có yêu cầu công khai (đang chờ/đã từ chối) hoặc đã công khai.
    // Bộ sưu tập riêng tư của sinh viên không đưa vào hàng đợi kiểm duyệt.
    const where: any = {
      OR: [{ moderationStatus: { not: ModerationStatus.APPROVED } }, { collection: { isPublic: true } }],
    };
    if (status) where.moderationStatus = status;

    const revisions = await prisma.collectionRevision.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        collection: {
          include: {
            user: { select: { id: true, username: true, email: true } },
          },
        },
      },
    });

    return res.json({ success: true, data: revisions });
  } catch (err) {
    next(err);
  }
});

router.post('/collections/:revisionId/moderate', validateBody(ModerateActionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const revisionId = req.params.revisionId as string;
    const { action, reviewerNote } = req.body;

    const revision = await prisma.collectionRevision.findUnique({
      where: { id: revisionId },
      include: { collection: true },
    });

    if (!revision) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy phiên bản bộ sưu tập' });
    }

    if (action === 'APPROVE') {
      await prisma.$transaction([
        prisma.collectionRevision.update({
          where: { id: revisionId },
          data: {
            moderationStatus: ModerationStatus.APPROVED,
            reviewerNote,
            approvedAt: new Date(),
          },
        }),
        prisma.collection.update({
          where: { id: revision.collectionId },
          data: {
            currentPublishedRevisionId: revision.id,
            isPublic: true,
          },
        }),
        prisma.auditLog.create({
          data: {
            adminUserId: req.user!.id,
            action: 'APPROVE_COLLECTION',
            targetEntity: 'Collection',
            targetId: revision.collectionId,
            details: { revisionId, name: revision.name },
          },
        }),
      ]);

      await sendNotification({
        userId: revision.collection.userId,
        type: 'COLLECTION_APPROVED',
        title: 'Bộ sưu tập đã được phê duyệt công khai',
        body: `Bộ sưu tập "${revision.name}" của bạn đã được xuất bản công khai.`,
        deepLinkUrl: `/collections/${revision.collectionId}`,
      });

      return res.json({
        success: true,
        data: { revisionId, status: ModerationStatus.APPROVED },
        message: 'Đã phê duyệt bộ sưu tập công khai',
      });
    }

    const targetStatus = action === 'REJECT' ? ModerationStatus.REJECTED : ModerationStatus.CHANGES_REQUESTED;
    await prisma.collectionRevision.update({
      where: { id: revisionId },
      data: { moderationStatus: targetStatus, reviewerNote },
    });

    await prisma.auditLog.create({
      data: {
        adminUserId: req.user!.id,
        action: action === 'REJECT' ? 'REJECT_COLLECTION' : 'REQUEST_CHANGES_COLLECTION',
        targetEntity: 'Collection',
        targetId: revision.collectionId,
        details: { revisionId, reviewerNote },
      },
    });

    await sendNotification({
      userId: revision.collection.userId,
      type: action === 'REJECT' ? 'COLLECTION_REJECTED' : 'COLLECTION_CHANGES_REQUESTED',
      title: action === 'REJECT' ? 'Bộ sưu tập bị từ chối' : 'Yêu cầu sửa bộ sưu tập',
      body: reviewerNote || `Bộ sưu tập "${revision.name}" cần chỉnh sửa.`,
    });

    return res.json({
      success: true,
      data: { revisionId, status: targetStatus, reviewerNote },
      message: action === 'REJECT' ? 'Đã từ chối bộ sưu tập' : 'Đã yêu cầu chỉnh sửa bộ sưu tập',
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 7. DUYỆT BÌNH LUẬN (COMMENTS MODERATION)
// =========================================================================
router.get('/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as ModerationStatus | undefined;
    // Bình luận đã bị xoá thì không đưa vào hàng đợi duyệt nữa
    const where: any = { comment: { isDeleted: false } };
    if (status) where.moderationStatus = status;

    try {
      const revisions = await prisma.commentRevision.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          comment: {
            include: {
              author: { select: { id: true, username: true, email: true, isLocked: true } },
            },
          },
        },
      });

      return res.json({ success: true, data: revisions });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Serving mock comments for admin:', (dbErr as Error).message);
      const list = MOCK_COMMENTS.map((c) => ({
        id: 'rev-comm-' + c.id,
        revisionNumber: 1,
        content: c.content,
        moderationStatus: c.moderationStatus,
        createdAt: c.createdAt,
        comment: {
          id: c.id,
          targetType: c.targetType,
          targetId: c.targetId,
          isDeleted: c.isDeleted,
          author: {
            id: c.author.id,
            username: c.author.username,
            email: c.author.username + '@ssg.vn',
            isLocked: c.author.isLocked || false,
          },
        },
      }));
      return res.json({ success: true, data: list });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/comments/:revisionId/moderate', validateBody(ModerateActionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const revisionId = req.params.revisionId as string;
    const { action, reviewerNote } = req.body;

    const revision = await prisma.commentRevision.findUnique({
      where: { id: revisionId },
      include: { comment: true },
    });

    if (!revision) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy phiên bản bình luận' });
    }

    if (action === 'APPROVE') {
      await prisma.$transaction([
        prisma.commentRevision.update({
          where: { id: revisionId },
          data: {
            moderationStatus: ModerationStatus.APPROVED,
            reviewerNote,
          },
        }),
        prisma.comment.update({
          where: { id: revision.commentId },
          data: {
            currentPublishedRevisionId: revision.id,
            state: ContentState.PUBLISHED,
          },
        }),
        prisma.auditLog.create({
          data: {
            adminUserId: req.user!.id,
            action: 'APPROVE_COMMENT',
            targetEntity: 'Comment',
            targetId: revision.commentId,
            details: { revisionId },
          },
        }),
      ]);
      if (revision.attachedAssetId) {
        await publishAssetsForEntity(prisma, 'COMMENT', revision.commentId, [revision.attachedAssetId]);
      }

      return res.json({
        success: true,
        data: { revisionId, status: ModerationStatus.APPROVED },
        message: 'Đã phê duyệt bình luận',
      });
    }

    const targetStatus = action === 'REJECT' ? ModerationStatus.REJECTED : ModerationStatus.CHANGES_REQUESTED;
    await prisma.commentRevision.update({
      where: { id: revisionId },
      data: { moderationStatus: targetStatus, reviewerNote },
    });

    return res.json({
      success: true,
      data: { revisionId, status: targetStatus, reviewerNote },
      message: action === 'REJECT' ? 'Đã từ chối bình luận' : 'Đã yêu cầu chỉnh sửa bình luận',
    });
  } catch (err) {
    next(err);
  }
});

// Admin xoá bình luận
router.delete('/comments/:commentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const commentId = req.params.commentId as string;
    try {
      const comment = await prisma.comment.findUnique({ where: { id: commentId } });
      if (!comment) {
        throw new Error('CommentNotFoundInDb');
      }

      await prisma.$transaction(async (tx) => {
        await unpublishAssetsForEntity(tx, 'COMMENT', commentId);
        await tx.comment.update({ where: { id: commentId }, data: { isDeleted: true } });
      });

      await writeAudit({ adminUserId: req.user!.id, action: 'DELETE_COMMENT', targetEntity: 'Comment', targetId: commentId, details: {}, ipAddress: req.ip });

      return res.json({ success: true, message: 'Đã xóa bình luận thành công' });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Deleting comment in admin mock mode:', (dbErr as Error).message);
      const idx = MOCK_COMMENTS.findIndex((c) => c.id === commentId);
      if (idx !== -1) {
        MOCK_COMMENTS[idx].isDeleted = true;
        MOCK_COMMENTS[idx].content = 'Bình luận đã bị xoá bởi Quản trị viên';
      }
      return res.json({ success: true, message: 'Đã xóa bình luận thành công' });
    }
  } catch (err) {
    next(err);
  }
});

export default router;

