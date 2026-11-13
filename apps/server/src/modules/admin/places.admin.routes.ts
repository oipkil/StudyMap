import { writeAudit } from '../../lib/audit.js';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { unpublishAssetsForEntity } from '../../lib/asset-usage.js';
import { requireAuth, requireRole } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import {
  ErrorCode,
  ModerationStatus,
  OperationalStatus,
  PublicationStatus,
  PlaceSnapshotDataSchema,
} from '@ssg/shared';

const router = Router();
router.use(requireAuth);
router.use(requireRole('ADMIN'));

// 1. Danh sách địa điểm trong khu vực quản trị
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const status = req.query.status as PublicationStatus | undefined;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.publicationStatus = status;
    }

    const [places, total] = await Promise.all([
      prisma.place.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          brand: { select: { id: true, name: true } },
          currentPublishedRevision: {
            select: { id: true, revisionNumber: true, approvedAt: true },
          },
          _count: { select: { revisions: true } },
        },
      }),
      prisma.place.count({ where }),
    ]);

    return res.json({
      success: true,
      data: places,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// Schema tạo địa điểm mới kèm revision đầu tiên
const CreatePlaceSchema = z.object({
  slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/, 'Slug chỉ gồm chữ thường, số và dấu gạch nối'),
  defaultName: z.string().min(1).max(150),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().optional(),
  parentPlaceId: z.string().uuid().optional(),
  operationalStatus: z.nativeEnum(OperationalStatus).default(OperationalStatus.OPERATING),
  snapshotData: PlaceSnapshotDataSchema,
  initialStatus: z.enum(['DRAFT', 'PENDING', 'APPROVED']).default('PENDING'),
});

/**
 * Khi một revision quán được XUẤT BẢN: ảnh trong gallery của snapshot trở thành "đang dùng công khai".
 * - Upsert AssetUsage(PLACE, placeId, assetRevisionId, isPublished=true) cho từng ảnh trong gallery.
 * - Usage PLACE cũ của quán không còn trong gallery mới -> isPublished=false (ảnh không còn hiện ở quán này).
 * - Admin duyệt hồ sơ quán đã nhìn thấy gallery, nên ảnh còn PENDING được duyệt cùng lúc (ghi reviewer = admin).
 * Media gateway chỉ phục vụ khách khi revision ảnh APPROVED + có usage isPublished -> đây là mắt xích bắt buộc.
 */
export async function syncPlaceAssetUsages(tx: any, placeId: string, snapshot: any, _adminUserId: string) {
  const gallery: Array<{ assetId?: string; assetRevisionId?: string }> = Array.isArray(snapshot?.gallery) ? snapshot.gallery : [];
  const revisionIds = gallery.map((g) => g.assetRevisionId).filter((x): x is string => typeof x === 'string' && x.length > 0);

  // Ảnh không còn trong gallery -> gỡ quyền công khai ở quán này
  await tx.assetUsage.updateMany({
    where: { entityType: 'PLACE', entityId: placeId, assetRevisionId: { notIn: revisionIds } },
    data: { isPublished: false },
  });

  for (const revId of revisionIds) {
    const rev = await tx.assetRevision.findUnique({ where: { id: revId }, select: { id: true, moderationStatus: true } });
    if (!rev) continue;
    if (rev.moderationStatus === 'PENDING') {
      await tx.assetRevision.update({
        where: { id: revId },
        data: { moderationStatus: 'APPROVED' },
      });
    }
    const existing = await tx.assetUsage.findFirst({ where: { entityType: 'PLACE', entityId: placeId, assetRevisionId: revId } });
    if (existing) {
      if (!existing.isPublished) await tx.assetUsage.update({ where: { id: existing.id }, data: { isPublished: true } });
    } else {
      await tx.assetUsage.create({ data: { entityType: 'PLACE', entityId: placeId, assetRevisionId: revId, isPublished: true } });
    }
  }
}

// Helper: Cập nhật bản chiếu công khai (PlacePublishedProjection)
export async function syncPublishedProjection(tx: any, placeId: string, revisionId: string, snapshot: any, categoryId: string, slug: string) {
  const lat = typeof snapshot.latitude === 'number' ? snapshot.latitude : (snapshot.coordinates?.latitude || 0);
  const lng = typeof snapshot.longitude === 'number' ? snapshot.longitude : (snapshot.coordinates?.longitude || 0);
  const campusId = snapshot.nearestCampusId || snapshot.nearbyCampusId || null;

  return tx.placePublishedProjection.upsert({
    where: { placeId },
    create: {
      placeId,
      publishedRevisionId: revisionId,
      name: snapshot.name,
      alternateNames: snapshot.alternateNames || [],
      slug,
      categoryId,
      campusId,
      latitude: lat,
      longitude: lng,
      priceMin: snapshot.priceMin || null,
      priceMax: snapshot.priceMax || null,
      is24h: snapshot.is24h || false,
      ratingOverall: 0,
      reviewCount: 0,
      studyAmenities: snapshot.amenities || {},
      filterableAttributes: snapshot.dynamicFieldValues || {},
    },
    update: {
      publishedRevisionId: revisionId,
      name: snapshot.name,
      alternateNames: snapshot.alternateNames || [],
      slug,
      categoryId,
      campusId,
      latitude: lat,
      longitude: lng,
      priceMin: snapshot.priceMin || null,
      priceMax: snapshot.priceMax || null,
      is24h: snapshot.is24h || false,
      studyAmenities: snapshot.amenities || {},
      filterableAttributes: snapshot.dynamicFieldValues || {},
    },
  });
}

// 2. Tạo địa điểm mới kèm revision số 1
router.post('/', validateBody(CreatePlaceSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body;

    const existingSlug = await prisma.place.findUnique({ where: { slug: data.slug } });
    if (existingSlug) {
      return res.status(409).json({
        success: false,
        errorCode: ErrorCode.CONFLICT,
        message: `Slug '${data.slug}' đã tồn tại`,
      });
    }

    const isAutoApproved = data.initialStatus === 'APPROVED';

    const result = await prisma.$transaction(async (tx) => {
      const place = await tx.place.create({
        data: {
          slug: data.slug,
          defaultName: data.defaultName,
          categoryId: data.categoryId,
          brandId: data.brandId,
          parentPlaceId: data.parentPlaceId,
          operationalStatus: data.operationalStatus,
          publicationStatus: isAutoApproved ? PublicationStatus.PUBLISHED : PublicationStatus.PENDING,
          createdByUserId: req.user!.id,
        },
      });

      const revision = await tx.placeRevision.create({
        data: {
          placeId: place.id,
          revisionNumber: 1,
          snapshotData: data.snapshotData,
          authorUserId: req.user!.id,
          moderationStatus: isAutoApproved ? ModerationStatus.APPROVED : ModerationStatus.PENDING,
          reviewerAdminId: isAutoApproved ? req.user!.id : null,
          approvedAt: isAutoApproved ? new Date() : null,
        },
      });

      if (isAutoApproved) {
        await tx.place.update({
          where: { id: place.id },
          data: { currentPublishedRevisionId: revision.id },
        });

        await syncPublishedProjection(tx, place.id, revision.id, data.snapshotData, place.categoryId, place.slug);
        await syncPlaceAssetUsages(tx, place.id, data.snapshotData, req.user!.id);
      }

      return {
        ...place,
        currentPublishedRevisionId: isAutoApproved ? revision.id : null,
        currentRevision: revision,
      };
    });

    await writeAudit({ adminUserId: req.user!.id, action: 'CREATE_PLACE', targetEntity: 'Place', targetId: result.id, details: { name: result.defaultName, slug: result.slug, autoApproved: Boolean(result.currentPublishedRevisionId) }, ipAddress: req.ip });
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Schema tạo phiên bản (revision) mới cho địa điểm đã tồn tại
const CreateRevisionSchema = z.object({
  baseRevisionId: z.string().uuid().optional().nullable(),
  snapshotData: PlaceSnapshotDataSchema,
  reasonForChange: z.string().max(255).optional(),
});

// 3. Tạo một revision mới (Chống ghi đè - 3-way conflict detection)
/**
 * ẨN / HIỆN LẠI QUÁN.
 * Ẩn = xoá bản chiếu công khai (projection) nên quán biến mất khỏi danh sách, tìm kiếm, bản đồ, so sánh
 * nhưng dữ liệu và lịch sử phiên bản vẫn còn để hiện lại bất cứ lúc nào. Dùng cho quán trùng, quán đóng cửa.
 */
router.post('/:id/visibility', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const hidden = req.body?.hidden !== false; // mặc định là ẩn
    const place = await prisma.place.findUnique({
      where: { id },
      include: { currentPublishedRevision: true },
    });
    if (!place) return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy quán' });

    if (hidden) {
      await prisma.$transaction(async (tx) => {
        await tx.placePublishedProjection.deleteMany({ where: { placeId: id } });
        await tx.place.update({ where: { id }, data: { publicationStatus: 'HIDDEN' } });
      });
    } else {
      if (!place.currentPublishedRevision) {
        return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: 'Quán chưa có phiên bản đã duyệt để hiện lại — hãy duyệt một phiên bản trước' });
      }
      const snapshot = place.currentPublishedRevision.snapshotData as any;
      await prisma.$transaction(async (tx) => {
        await syncPublishedProjection(tx, id, place.currentPublishedRevisionId!, snapshot, place.categoryId, place.slug);
        await syncPlaceAssetUsages(tx, id, snapshot, req.user!.id);
        await tx.place.update({ where: { id }, data: { publicationStatus: 'PUBLISHED' } });
      });
    }

    void writeAudit({ adminUserId: req.user!.id, action: hidden ? 'HIDE_PLACE' : 'UNHIDE_PLACE', targetEntity: 'Place', targetId: id, details: { name: place.defaultName, slug: place.slug }, ipAddress: req.ip });
    return res.json({ success: true, data: { id, publicationStatus: hidden ? 'HIDDEN' : 'PUBLISHED' }, message: hidden ? 'Đã ẩn quán khỏi trang công khai' : 'Đã hiện lại quán' });
  } catch (err) {
    next(err);
  }
});

/**
 * XOÁ HẲN QUÁN (dùng cho quán trùng / quán tạo nhầm).
 * Xoá kèm phiên bản, bản chiếu, đánh giá, lượt lưu; ảnh của quán bị gỡ công khai (ảnh vẫn nằm trong kho).
 * Bắt buộc gửi kèm ?confirm=<slug> để tránh bấm nhầm.
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const place = await prisma.place.findUnique({
      where: { id },
      include: { _count: { select: { reviews: true, favorites: true, revisions: true } } },
    });
    if (!place) return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy quán' });

    const confirm = String(req.query.confirm || req.body?.confirm || '');
    if (confirm !== place.slug) {
      return res.status(422).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: `Cần xác nhận bằng đường dẫn của quán ("${place.slug}") để xoá`,
        data: { slug: place.slug, counts: place._count },
      });
    }

    await prisma.$transaction(async (tx) => {
      await unpublishAssetsForEntity(tx, 'PLACE', id);
      await tx.place.update({ where: { id }, data: { currentPublishedRevisionId: null } });
      await tx.place.delete({ where: { id } });
    });

    void writeAudit({ adminUserId: req.user!.id, action: 'DELETE_PLACE', targetEntity: 'Place', targetId: id, details: { name: place.defaultName, slug: place.slug, counts: place._count }, ipAddress: req.ip });
    return res.json({ success: true, message: `Đã xoá quán "${place.defaultName}" cùng ${place._count.reviews} đánh giá và ${place._count.revisions} phiên bản` });
  } catch (err) {
    next(err);
  }
});

/**
 * TÌM QUÁN TRÙNG: gom nhóm theo tên đã chuẩn hoá (bỏ dấu, bỏ ký tự đặc biệt) hoặc theo vị trí rất gần nhau
 * (< ~60 m). Trả về từng nhóm để admin ẩn / xoá bản thừa.
 */
router.get('/duplicates', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const places = await prisma.place.findMany({
      include: {
        projection: { select: { name: true, latitude: true, longitude: true, reviewCount: true, ratingOverall: true } },
        currentPublishedRevision: { select: { snapshotData: true } },
        _count: { select: { reviews: true, revisions: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const norm = (v: string) =>
      v
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const rows = places.map((p) => {
      const snap = (p.currentPublishedRevision?.snapshotData as any) || {};
      const name = p.projection?.name || snap.name || p.defaultName;
      return {
        id: p.id,
        slug: p.slug,
        name,
        normalizedName: norm(name),
        address: snap.address ?? null,
        latitude: p.projection?.latitude ?? snap.latitude ?? null,
        longitude: p.projection?.longitude ?? snap.longitude ?? null,
        publicationStatus: p.publicationStatus,
        isPublic: Boolean(p.projection),
        reviewCount: p._count.reviews,
        revisionCount: p._count.revisions,
        createdAt: p.createdAt,
      };
    });

    const groups: Array<{ reason: string; label: string; places: typeof rows }> = [];
    const used = new Set<string>();

    // 1. Trùng tên (sau khi bỏ dấu)
    const byName = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.normalizedName) continue;
      const arr = byName.get(r.normalizedName) || [];
      arr.push(r);
      byName.set(r.normalizedName, arr);
    }
    for (const [key, arr] of byName) {
      if (arr.length < 2) continue;
      arr.forEach((r) => used.add(r.id));
      groups.push({ reason: 'name', label: `Trùng tên: "${arr[0].name}"`, places: arr });
    }

    // 2. Trùng vị trí (< ~60 m) mà chưa nằm trong nhóm trùng tên
    const meters = (a: any, b: any) => {
      if (!a.latitude || !b.latitude) return Infinity;
      const dLat = (a.latitude - b.latitude) * 111_320;
      const dLng = (a.longitude - b.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
      return Math.sqrt(dLat * dLat + dLng * dLng);
    };
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i];
        const b = rows[j];
        if (used.has(a.id) && used.has(b.id)) continue;
        const d = meters(a, b);
        if (d > 60) continue;
        used.add(a.id);
        used.add(b.id);
        groups.push({ reason: 'location', label: `Cách nhau ${Math.round(d)} m: "${a.name}" và "${b.name}"`, places: [a, b] });
      }
    }

    return res.json({ success: true, data: { groups, totalPlaces: rows.length } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/revisions', validateBody(CreateRevisionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const placeId = req.params.id as string;
    const { baseRevisionId, snapshotData } = req.body;

    const place = await prisma.place.findUnique({
      where: { id: placeId },
      include: {
        revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
      },
    });

    if (!place) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy địa điểm',
      });
    }

    // 3-way Conflict Check: Nếu baseRevisionId khác currentPublishedRevisionId thì báo xung đột phiên bản
    let hasConflict = false;
    let conflictMessage = null;
    if (baseRevisionId && place.currentPublishedRevisionId && baseRevisionId !== place.currentPublishedRevisionId) {
      hasConflict = true;
      conflictMessage = 'Địa điểm đã có phiên bản được xuất bản mới hơn kể từ thời điểm bạn bắt đầu chỉnh sửa. Vui lòng đối chiếu lại.';
    }

    const latestRevisionNumber = place.revisions[0]?.revisionNumber || 0;
    const nextRevisionNumber = latestRevisionNumber + 1;

    const newRevision = await prisma.placeRevision.create({
      data: {
        placeId,
        revisionNumber: nextRevisionNumber,
        baseRevisionId: baseRevisionId || place.currentPublishedRevisionId,
        snapshotData,
        authorUserId: req.user!.id,
        moderationStatus: ModerationStatus.PENDING,
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        revision: newRevision,
        hasConflict,
        conflictMessage,
      },
    });
  } catch (err) {
    next(err);
  }
});

// 4. Lấy lịch sử tất cả các phiên bản (revisions) của một địa điểm
router.get('/:id/revisions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const placeId = req.params.id as string;
    const revisions = await prisma.placeRevision.findMany({
      where: { placeId },
      orderBy: { revisionNumber: 'desc' },
    });

    return res.json({ success: true, data: revisions });
  } catch (err) {
    next(err);
  }
});

// Schema duyệt phiên bản
const ModerateRevisionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'CHANGES_REQUESTED']),
  reviewerNote: z.string().max(500).optional(),
  forceOverride: z.boolean().default(false),
});

// 5. Kiểm duyệt phiên bản địa điểm (Duyệt -> Kích hoạt ngay lập tức snapshot và projection)
router.post('/:id/revisions/:revisionId/moderate', validateBody(ModerateRevisionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const placeId = req.params.id as string;
    const revisionId = req.params.revisionId as string;
    const { action, reviewerNote, forceOverride } = req.body;

    const revision = await prisma.placeRevision.findUnique({
      where: { id: revisionId },
      include: { place: true },
    });

    if (!revision || revision.placeId !== placeId) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy phiên bản địa điểm cần duyệt',
      });
    }

    // CHẶN GHI ĐÈ XUNG ĐỘT (3-WAY MERGE CONFLICT GUARD):
    // Nếu phiên bản công khai hiện tại đã thay đổi so với baseRevisionId của bản duyệt này,
    // bắt buộc phải chặn duyệt và trả về 409 Conflict trừ khi admin bật cờ forceOverride.
    if (action === 'APPROVE') {
      if (
        revision.baseRevisionId &&
        revision.place.currentPublishedRevisionId &&
        revision.baseRevisionId !== revision.place.currentPublishedRevisionId &&
        !forceOverride
      ) {
        return res.status(409).json({
          success: false,
          errorCode: ErrorCode.CONFLICT,
          message: 'XUNG ĐỘT PHIÊN BẢN: Địa điểm này đã được xuất bản một phiên bản khác kể từ khi phiên bản này được tạo dựa trên bản gốc. Yêu cầu đối chiếu hoặc xác nhận ghi đè có kiểm soát.',
          details: {
            revisionBaseRevisionId: revision.baseRevisionId,
            currentPublishedRevisionId: revision.place.currentPublishedRevisionId,
          },
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let targetStatus: ModerationStatus = ModerationStatus.PENDING;
      if (action === 'APPROVE') targetStatus = ModerationStatus.APPROVED;
      if (action === 'REJECT') targetStatus = ModerationStatus.REJECTED;
      if (action === 'CHANGES_REQUESTED') targetStatus = ModerationStatus.CHANGES_REQUESTED;

      const updatedRevision = await tx.placeRevision.update({
        where: { id: revisionId },
        data: {
          moderationStatus: targetStatus,
          reviewerNote,
          reviewerAdminId: req.user!.id,
          approvedAt: action === 'APPROVE' ? new Date() : null,
        },
      });

      if (action === 'APPROVE') {
        // Các bản CŨ hơn còn chờ duyệt đã bị bản này thay thế -> đóng lại để không treo mãi trong hàng đợi
        await tx.placeRevision.updateMany({
          where: { placeId, moderationStatus: ModerationStatus.PENDING, revisionNumber: { lt: revision.revisionNumber } },
          data: { moderationStatus: ModerationStatus.REJECTED, reviewerNote: `Bị thay thế bởi phiên bản #${revision.revisionNumber} đã được duyệt`, reviewerAdminId: req.user!.id },
        });
        // Cập nhật địa điểm công khai trỏ vào revision mới này
        await tx.place.update({
          where: { id: placeId },
          data: {
            publicationStatus: PublicationStatus.PUBLISHED,
            currentPublishedRevisionId: revisionId,
            defaultName: (revision.snapshotData as any).name || revision.place.defaultName,
          },
        });

        // Đồng bộ bản chiếu PlacePublishedProjection tức thì
        await syncPublishedProjection(
          tx,
          placeId,
          revisionId,
          revision.snapshotData,
          revision.place.categoryId,
          revision.place.slug
        );
        // Ảnh trong gallery của bản vừa duyệt -> công khai qua media gateway
        await syncPlaceAssetUsages(tx, placeId, revision.snapshotData, req.user!.id);
      }

      return updatedRevision;
    });

    await writeAudit({
      adminUserId: req.user!.id,
      action: action === 'APPROVE' ? 'APPROVE_PLACE_REVISION' : action === 'REJECT' ? 'REJECT_PLACE_REVISION' : 'REQUEST_CHANGES_PLACE_REVISION',
      targetEntity: 'Place',
      targetId: placeId,
      details: { revisionId, revisionNumber: revision.revisionNumber, reviewerNote: reviewerNote || null, forceOverride: Boolean(forceOverride) },
      ipAddress: req.ip,
    });

    return res.json({
      success: true,
      data: {
        revision: result,
        message: action === 'APPROVE'
          ? 'Phiên bản đã được phê duyệt và xuất bản công khai thành công'
          : 'Đã cập nhật trạng thái kiểm duyệt',
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
