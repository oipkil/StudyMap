import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { approvedAssetIds, avatarUrlOf } from '../../lib/avatar.js';
import { publishAssetsForEntity, unpublishAssetsForEntity } from '../../lib/asset-usage.js';
import { notifyZaloAsync } from '../integrations/zalo.service.js';
import {
  computeIsOpenNow,
  ErrorCode,
  Quotas,
  matchesVietnameseSearch,
  PlaceSuggestionPayloadSchema,
  SurveyRequestPayloadSchema,
  PlaceChangeRequestPayloadSchema,
  ReviewRevisionPayloadSchema,
  ModerationStatus,
} from '@ssg/shared';
import { requireAuth } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { MOCK_CATEGORIES, MOCK_CAMPUSES, MOCK_FIELD_DEFINITIONS, MOCK_PLACES } from './mock-places.data.js';

const router = Router();

/**
 * Hàm tính toán lại điểm đánh giá tổng hợp của quán
 * CHỈ tính từ các review đã APPROVED và đang PUBLISHED
 */
export async function recomputePlaceRating(placeId: string) {
  const reviews = await prisma.review.findMany({
    where: {
      placeId,
      state: 'PUBLISHED',
      currentPublishedRevision: {
        moderationStatus: ModerationStatus.APPROVED,
      },
    },
    include: {
      currentPublishedRevision: true,
    },
  });

  const count = reviews.length;
  let avgRating = 0; // 0 = chưa có đánh giá (không giả định 5 sao)
  if (count > 0) {
    const sum = reviews.reduce((acc, r) => acc + (r.currentPublishedRevision?.ratingOverall || 5), 0);
    avgRating = Number((sum / count).toFixed(1));
  }

  await prisma.placePublishedProjection.updateMany({
    where: { placeId },
    data: {
      ratingOverall: avgRating,
      reviewCount: count,
    },
  });

  return { avgRating, count };
}

// =========================================================================
// 1. TÌM KIẾM & BỘ LỌC NÂNG CAO (SEARCH, FILTER & MAP BOUNDS)
// =========================================================================

// Gắn URL media gateway cho từng ảnh gallery của snapshot đã xuất bản (khách xem qua revision cố định)
function decorateGallery(snap: any) {
  if (!snap || !Array.isArray(snap.gallery)) return snap;
  const gallery = snap.gallery.map((g: any) => {
    if (g.publicUrl && (g.publicUrl.startsWith('http://') || g.publicUrl.startsWith('https://'))) {
      return {
        ...g,
        thumbUrl: g.thumbUrl || g.publicUrl,
      };
    }
    const rev = g.assetRevisionId ? `&revision=${g.assetRevisionId}` : '';
    return {
      ...g,
      publicUrl: `/api/v1/media/${g.assetId}?variant=optimized${rev}`,
      thumbUrl: `/api/v1/media/${g.assetId}?variant=thumb${rev}`,
    };
  });
  const cover = gallery.find((g: any) => g.isCover) || gallery[0] || null;
  return { ...snap, gallery, coverPhoto: cover };
}

// Danh mục nền dùng cho form đóng góp / bộ lọc: loại quán và cơ sở trường (chỉ dữ liệu đang hoạt động)
router.get('/meta', async (_req: Request, res: Response) => {
  try {
    const [categories, campuses] = await Promise.all([
      prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, slug: true, name: true, icon: true } }),
      prisma.campus.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, universityName: true, latitude: true, longitude: true } }),
    ]);
    if ((!categories || categories.length === 0) && (!campuses || campuses.length === 0)) {
      return res.json({ success: true, data: { categories: MOCK_CATEGORIES, campuses: MOCK_CAMPUSES } });
    }
    return res.json({ success: true, data: { categories, campuses } });
  } catch (err) {
    console.warn('⚠️ [Database Fallback] Serving mock meta categories & campuses');
    return res.json({ success: true, data: { categories: MOCK_CATEGORIES, campuses: MOCK_CAMPUSES } });
  }
});

// Định nghĩa trường động CÔNG KHAI (nhãn, đơn vị, lựa chọn, nhóm) — trang chi tiết quán và form đóng góp dùng để
// hiển thị đúng tên/đơn vị cho từng giá trị trong snapshot.dynamicFieldValues thay vì chỉ có fieldKey.
router.get('/field-definitions', async (_req: Request, res: Response) => {
  try {
    const defs = await prisma.fieldDefinition.findMany({
      where: { isArchived: false, isPublic: true },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
        fieldGroup: { select: { id: true, key: true, label: true, sortOrder: true, icon: true } },
        categoryBindings: { select: { categoryId: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!defs || defs.length === 0) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.json({ success: true, data: MOCK_FIELD_DEFINITIONS });
    }
    const data = defs.map((d) => {
      const v = d.versions[0];
      return {
        id: d.id,
        key: d.key,
        label: v?.label ?? d.label,
        description: d.description,
        dataType: d.dataType,
        unit: v?.unit ?? null,
        options: v?.options ?? [],
        repeaterConfig: v?.repeaterConfig ?? null,
        tableColumnsConfig: v?.tableColumnsConfig ?? null,
        isFilterable: d.isFilterable,
        isComparable: d.isComparable,
        isRequired: d.isRequired,
        versionId: v?.id ?? null,
        group: d.fieldGroup,
        categoryIds: d.categoryBindings.map((b) => b.categoryId),
      };
    });
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json({ success: true, data });
  } catch (err) {
    console.warn('⚠️ [Database Fallback] Serving mock field definitions');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json({ success: true, data: MOCK_FIELD_DEFINITIONS });
  }
});

function getFilteredMockPlaces(query: Record<string, any>) {
  const page = Math.max(1, parseInt(query.page as string, 10) || 1);
  const limit = Math.max(1, Math.min(100, parseInt(query.limit as string, 10) || 20));
  const searchQuery = (query.q as string || '').trim();
  const categorySlug = query.category as string | undefined;
  const campusId = query.campusId as string | undefined;
  const priceMin = query.priceMin ? parseFloat(query.priceMin as string) : undefined;
  const priceMax = query.priceMax ? parseFloat(query.priceMax as string) : undefined;
  const isOpenNowParam = query.isOpenNow === 'true' || query.isOpenNow === '1';
  const boundsStr = query.bounds as string | undefined;
  const sort = (query.sort as string) || 'rating';

  let list = [...MOCK_PLACES];

  if (categorySlug && categorySlug !== 'all') {
    list = list.filter((p) => p.category.slug === categorySlug || p.categoryId === categorySlug);
  }

  if (campusId) {
    list = list.filter((p) => p.campusId === campusId);
  }

  if (priceMin !== undefined) {
    list = list.filter((p) => p.priceMax >= priceMin);
  }
  if (priceMax !== undefined) {
    list = list.filter((p) => p.priceMin <= priceMax);
  }

  if (boundsStr) {
    const parts = boundsStr.split(',').map((p) => parseFloat(p.trim()));
    if (parts.length === 4 && !parts.some(isNaN)) {
      const [swLng, swLat, neLng, neLat] = parts;
      list = list.filter(
        (p) => p.latitude >= swLat && p.latitude <= neLat && p.longitude >= swLng && p.longitude <= neLng,
      );
    }
  }

  if (searchQuery) {
    list = list.filter((p) => {
      const nameMatch = matchesVietnameseSearch(p.name, searchQuery);
      const altMatch = p.alternateNames && p.alternateNames.some((alt) => matchesVietnameseSearch(alt, searchQuery));
      const addressMatch = p.snapshot?.address ? matchesVietnameseSearch(p.snapshot.address, searchQuery) : false;
      const campusMatch = p.campus?.name ? matchesVietnameseSearch(p.campus.name, searchQuery) : false;
      return nameMatch || altMatch || addressMatch || campusMatch;
    });
  }

  const reqWifi = query.wifi === 'true' || query.wifi === '1';
  const reqSocket = query.socket === 'true' || query.socket === '1';
  const reqQuiet = query.quiet === 'true' || query.quiet === '1';

  if (reqWifi || reqSocket || reqQuiet) {
    list = list.filter((p) => {
      const amenities = p.snapshot?.amenities || {};
      if (reqWifi && !amenities.wifiQuality) return false;
      if (reqSocket && !amenities.socketDensity) return false;
      if (reqQuiet && amenities.noiseLevel !== 'QUIET' && amenities.noiseLevel !== 'SILENT') return false;
      return true;
    });
  }

  if (isOpenNowParam) {
    list = list.filter((p) => {
      if (p.is24h) return true;
      const snap = p.snapshot;
      const openStatus = computeIsOpenNow(
        snap?.weeklySchedule || [],
        snap?.scheduleExceptions || [],
        snap?.timezone || 'Asia/Ho_Chi_Minh',
        new Date(),
      );
      return openStatus.isOpen;
    });
  }

  if (sort === 'reviews') list.sort((a, b) => b.reviewCount - a.reviewCount);
  else if (sort === 'price_asc') list.sort((a, b) => a.priceMin - b.priceMin);
  else if (sort === 'price_desc') list.sort((a, b) => b.priceMax - a.priceMax);
  else list.sort((a, b) => b.ratingOverall - a.ratingOverall);

  const total = list.length;
  const skip = (page - 1) * limit;
  const paginatedPlaces = list.slice(skip, skip + limit);

  const sanitizedData = paginatedPlaces.map((p) => {
    const snap = p.snapshot;
    const openStatus = computeIsOpenNow(
      snap?.weeklySchedule || [],
      snap?.scheduleExceptions || [],
      snap?.timezone || 'Asia/Ho_Chi_Minh',
      new Date(),
    );

    return {
      placeId: p.placeId,
      name: p.name,
      slug: p.slug,
      categoryId: p.categoryId,
      campus: p.campus,
      latitude: p.latitude,
      longitude: p.longitude,
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      is24h: p.is24h,
      ratingOverall: p.ratingOverall,
      reviewCount: p.reviewCount,
      studyAmenities: {
        ...(snap?.amenities || {}),
        ...(p.studyAmenities || {}),
        airConditioned: snap?.amenities?.airConditioned ?? p.studyAmenities?.airConditioned ?? true,
      },
      openStatus,
      coverPhoto: decorateGallery(snap)?.coverPhoto || null,
      studentDiscountDetails: snap?.studentDiscountDetails || null,
      address: snap?.address || null,
      snapshot: snap || null,
    };
  });

  return {
    data: sanitizedData,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 20));
    const searchQuery = (req.query.q as string || '').trim();
    const categorySlug = req.query.category as string | undefined;
    const campusId = req.query.campusId as string | undefined;
    const regionId = req.query.regionId as string | undefined;
    const priceMin = req.query.priceMin ? parseFloat(req.query.priceMin as string) : undefined;
    const priceMax = req.query.priceMax ? parseFloat(req.query.priceMax as string) : undefined;
    const isOpenNowParam = req.query.isOpenNow === 'true' || req.query.isOpenNow === '1';
    const boundsStr = req.query.bounds as string | undefined; // "swLng,swLat,neLng,neLat"
    const sort = (req.query.sort as string) || 'rating';

    // Xây dựng điều kiện lọc cơ sở dữ liệu
    const where: any = {};

    let places: any[] = [];
    try {
      if (categorySlug && categorySlug !== 'all') {
        const cat = await prisma.category.findUnique({ where: { slug: categorySlug } });
        if (cat) where.categoryId = cat.id;
      }

      if (campusId) {
        where.campusId = campusId;
      }

      if (regionId) {
        where.campus = { regionId };
      }

      // Lọc theo khung giá
      if (priceMin !== undefined) {
        where.priceMax = { gte: priceMin };
      }
      if (priceMax !== undefined) {
        where.priceMin = { lte: priceMax };
      }

      // Lọc theo khung nhìn bản đồ (Map Viewport Bounding Box)
      if (boundsStr) {
        const parts = boundsStr.split(',').map((p) => parseFloat(p.trim()));
        if (parts.length === 4 && !parts.some(isNaN)) {
          const [swLng, swLat, neLng, neLat] = parts;
          where.latitude = { gte: swLat, lte: neLat };
          where.longitude = { gte: swLng, lte: neLng };
        }
      }

      // Sắp xếp
      let orderBy: any = { ratingOverall: 'desc' };
      if (sort === 'reviews') orderBy = { reviewCount: 'desc' };
      else if (sort === 'price_asc') orderBy = { priceMin: 'asc' };
      else if (sort === 'price_desc') orderBy = { priceMax: 'desc' };
      else if (sort === 'newest') orderBy = { updatedAt: 'desc' };

      // Lấy danh sách địa điểm từ bảng Projection đã xuất bản
      places = await prisma.placePublishedProjection.findMany({
        where,
        orderBy,
        include: {
          campus: { select: { id: true, name: true, universityName: true, regionId: true } },
          publishedRevision: { select: { snapshotData: true } },
        },
      });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Serving mock places because database is unreachable:', (dbErr as Error).message);
      const mockResult = getFilteredMockPlaces(req.query);
      return res.json({ success: true, ...mockResult });
    }

    if (places.length === 0 && !searchQuery && !boundsStr) {
      const mockResult = getFilteredMockPlaces(req.query);
      return res.json({ success: true, ...mockResult });
    }

    // 1. Lọc tìm kiếm tiếng Việt có/không dấu
    if (searchQuery) {
      places = places.filter((p) => {
        const snap = p.publishedRevision?.snapshotData as any;
        const nameMatch = matchesVietnameseSearch(p.name, searchQuery);
        const altMatch = p.alternateNames && p.alternateNames.some((alt: string) => matchesVietnameseSearch(alt, searchQuery));
        const addressMatch = snap?.address ? matchesVietnameseSearch(snap.address, searchQuery) : false;
        const campusMatch = p.campus?.name ? matchesVietnameseSearch(p.campus.name, searchQuery) : false;
        return nameMatch || altMatch || addressMatch || campusMatch;
      });
    }

    // 2. Lọc tiện ích học tập (Amenities)
    const reqWifi = req.query.wifi === 'true' || req.query.wifi === '1';
    const reqSocket = req.query.socket === 'true' || req.query.socket === '1';
    const reqQuiet = req.query.quiet === 'true' || req.query.quiet === '1';

    if (reqWifi || reqSocket || reqQuiet) {
      places = places.filter((p) => {
        const snap = p.publishedRevision?.snapshotData as any;
        const amenities = snap?.amenities || {};
        if (reqWifi && !amenities.wifiQuality) return false;
        if (reqSocket && !amenities.hasPowerSockets) return false;
        if (reqQuiet && amenities.noiseLevel !== 'QUIET' && amenities.noiseLevel !== 'SILENT') return false;
        return true;
      });
    }

    // 3. Lọc đang mở cửa ngay bây giờ (isOpenNow)
    if (isOpenNowParam) {
      const now = new Date();
      places = places.filter((p) => {
        if (p.is24h) return true;
        const snap = p.publishedRevision?.snapshotData as any;
        if (!snap || !snap.weeklySchedule) return false;
        const openStatus = computeIsOpenNow(
          snap.weeklySchedule || [],
          snap.scheduleExceptions || [],
          snap.timezone || 'Asia/Ho_Chi_Minh',
          now
        );
        return openStatus.isOpen;
      });
    }

    const total = places.length;
    const skip = (page - 1) * limit;
    const paginatedPlaces = places.slice(skip, skip + limit);

    // Chuẩn hóa dữ liệu trả về cho client
    const sanitizedData = paginatedPlaces.map((p) => {
      const snap = p.publishedRevision?.snapshotData as any;
      const openStatus = computeIsOpenNow(
        snap?.weeklySchedule || [],
        snap?.scheduleExceptions || [],
        snap?.timezone || 'Asia/Ho_Chi_Minh',
        new Date()
      );

      return {
        placeId: p.placeId,
        name: p.name,
        slug: p.slug,
        categoryId: p.categoryId,
        campus: p.campus,
        latitude: p.latitude,
        longitude: p.longitude,
        priceMin: p.priceMin,
        priceMax: p.priceMax,
        is24h: p.is24h,
        ratingOverall: p.ratingOverall,
        reviewCount: p.reviewCount,
        studyAmenities: {
          ...(snap?.amenities || {}),
          ...(p.studyAmenities || {}),
          airConditioned: snap?.amenities?.airConditioned ?? p.studyAmenities?.airConditioned ?? true,
        },
        openStatus,
        coverPhoto: decorateGallery(snap)?.coverPhoto || null,
        studentDiscountDetails: snap?.studentDiscountDetails || null,
        address: snap?.address || null,
        snapshot: snap || null,
      };
    });

    return res.json({
      success: true,
      data: sanitizedData,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 2. GỢI Ý QUÁN TRÙNG (DUPLICATE DETECTION)
// =========================================================================
router.get('/suggestions/check-duplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = (req.query.name as string || '').trim();
    if (!name || name.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const allPlaces = await prisma.placePublishedProjection.findMany({
      select: {
        placeId: true,
        name: true,
        slug: true,
        alternateNames: true,
        publishedRevision: { select: { snapshotData: true } },
      },
    });

    const duplicates = allPlaces
      .filter((p) => {
        const nameMatch = matchesVietnameseSearch(p.name, name);
        const altMatch = p.alternateNames && p.alternateNames.some((alt) => matchesVietnameseSearch(alt, name));
        return nameMatch || altMatch;
      })
      .slice(0, 5)
      .map((p) => {
        const snap = p.publishedRevision?.snapshotData as any;
        return {
          id: p.placeId,
          name: p.name,
          slug: p.slug,
          address: snap?.address || 'Chưa rõ địa chỉ',
        };
      });

    return res.json({ success: true, data: duplicates });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 3. ĐỀ XUẤT QUÁN MỚI (STUDENT PLACE SUGGESTION)
// =========================================================================
router.post('/suggestions', requireAuth, validateBody(PlaceSuggestionPayloadSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { proposedName, categoryId, addressDescription, regionId, campusId, initialData, isDraft } = req.body;

    const suggestion = await prisma.placeSuggestion.create({
      data: {
        userId: req.user!.id,
        proposedName,
        categoryId,
        addressDescription,
        regionId,
        campusId,
        initialData: initialData || {},
        status: isDraft ? ModerationStatus.CHANGES_REQUESTED : ModerationStatus.PENDING,
      },
    });

    if (!isDraft) {
      notifyZaloAsync('SUGGESTION_PENDING', {
        title: 'Đề xuất quán mới chờ duyệt',
        body: `${proposedName} — ${addressDescription} (${req.user!.username || 'sinh viên'})`,
        url: '/admin/contributions',
      });
    }

    return res.status(201).json({
      success: true,
      data: suggestion,
      message: isDraft ? 'Đã lưu bản nháp đề xuất quán' : 'Đã gửi đề xuất quán mới vào hàng đợi kiểm duyệt',
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 4. SO SÁNH QUÁN (TỐI ĐA 4 QUÁN)
// =========================================================================
const CompareSchema = z.object({
  placeIds: z
    .array(z.string().uuid())
    .min(2, 'Cần tối thiểu 2 quán để so sánh')
    .max(Quotas.MAX_COMPARE_PLACES, `Tối đa ${Quotas.MAX_COMPARE_PLACES} quán`),
});

// So sánh 2–4 quán: nhận GET ?ids=a,b (trang so sánh) hoặc POST { placeIds } (tương thích cũ).
// Trả dữ liệu có cấu trúc (enum tiện ích, projection, campus, ảnh bìa) — giao diện tự dịch nhãn tiếng Việt.
const AMENITY_ENUM_KEYS = ['wifiQuality', 'socketDensity', 'noiseLevel', 'studySuitability', 'motorcycleParking', 'carParking'] as const;
function normalizeAmenitiesForCompare(am: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...am };
  for (const k of AMENITY_ENUM_KEYS) {
    const v = out[k];
    if (v == null || v === '' || v === 'UNKNOWN') out[k] = 'Chưa có thông tin';
  }
  return out;
}

async function buildComparison(placeIds: string[]) {
  const places = await prisma.place.findMany({
    where: { id: { in: placeIds }, currentPublishedRevisionId: { not: null } },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      currentPublishedRevision: true,
      projection: { include: { campus: { select: { id: true, name: true, universityName: true } } } },
    },
  });
  // Giữ đúng thứ tự ids người dùng chọn
  const byId = new Map(places.map((p) => [p.id, p]));
  return placeIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => {
      const snap = decorateGallery(p.currentPublishedRevision!.snapshotData as any);
      const proj = p.projection;
      const openStatus = computeIsOpenNow(
        snap.weeklySchedule || [],
        snap.scheduleExceptions || [],
        snap.timezone || 'Asia/Ho_Chi_Minh',
        new Date(),
      );
      return {
        id: p.id,
        placeId: p.id,
        slug: p.slug,
        name: snap.name,
        address: snap.address ?? null,
        category: p.category ? { id: p.category.id, name: p.category.name } : null,
        campus: proj?.campus ? { id: proj.campus.id, name: proj.campus.name, universityName: proj.campus.universityName } : null,
        coverPhoto: snap.coverPhoto ?? null,
        priceMin: proj?.priceMin ?? snap.priceMin ?? null,
        priceMax: proj?.priceMax ?? snap.priceMax ?? null,
        ratingOverall: proj?.ratingOverall ?? 0,
        reviewCount: proj?.reviewCount ?? 0,
        studentDiscountDetails: snap.studentDiscountDetails ?? null,
        studentDiscount: snap.studentDiscountDetails || 'Chưa có thông tin',
        // Enum tiện ích; trường thiếu / UNKNOWN trả rõ "Chưa có thông tin" để không bịa dữ liệu
        amenities: normalizeAmenitiesForCompare(snap.amenities ?? {}),
        is24h: Boolean(snap.is24h || snap.weeklySchedule?.some((d: any) => d.is24h)),
        openStatus,
        weeklySchedule: snap.weeklySchedule || [],
        dynamicFieldValues: snap.dynamicFieldValues || [],
      };
    });
}

router.get('/compare', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const parsed = CompareSchema.safeParse({ placeIds: ids });
    if (!parsed.success) {
      return res.status(422).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Cần chọn 2–4 quán hợp lệ để so sánh',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return res.json({ success: true, data: await buildComparison(parsed.data.placeIds) });
  } catch (err) {
    next(err);
  }
});

router.post('/compare', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = CompareSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Dữ liệu so sánh không hợp lệ',
        issues: parseResult.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return res.json({ success: true, data: await buildComparison(parseResult.data.placeIds) });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 5. YÊU CẦU KHẢO SÁT & ĐỀ XUẤT SỬA ĐỔI QUÁN
// =========================================================================
router.post('/:placeId/survey-requests', requireAuth, validateBody(SurveyRequestPayloadSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const placeId = req.params.placeId as string;
    const { reason, targetAspects } = req.body;

    const place = await prisma.place.findUnique({ where: { id: placeId } });
    if (!place) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy quán' });
    }

    const surveyReq = await prisma.surveyRequest.create({
      data: {
        userId: req.user!.id,
        placeId,
        reason,
        targetAspects,
        status: ModerationStatus.PENDING,
      },
    });

    notifyZaloAsync('SURVEY_REQUEST', { title: 'Yêu cầu khảo sát quán', body: `${place.defaultName}: ${String(reason).slice(0, 120)}`, url: '/admin/contributions' });

    return res.status(201).json({
      success: true,
      data: surveyReq,
      message: 'Đã gửi yêu cầu khảo sát thông tin quán thành công',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:placeId/change-requests', requireAuth, validateBody(PlaceChangeRequestPayloadSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const placeId = req.params.placeId as string;
    const { baseRevisionId, requestedChanges, evidenceAssetIds } = req.body;

    const place = await prisma.place.findUnique({ where: { id: placeId } });
    if (!place) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy quán' });
    }

    const changeReq = await prisma.placeChangeRequest.create({
      data: {
        userId: req.user!.id,
        placeId,
        baseRevisionId,
        requestedChanges,
        evidenceAssetIds: evidenceAssetIds || [],
        status: ModerationStatus.PENDING,
      },
    });

    notifyZaloAsync('SURVEY_REQUEST', { title: 'Báo sai thông tin quán', body: `${place.defaultName} — ${req.user!.username || 'sinh viên'}`, url: '/admin/contributions' });

    return res.status(201).json({
      success: true,
      data: changeReq,
      message: 'Đã gửi đề xuất cập nhật thông tin quán vào hàng đợi kiểm duyệt',
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 5b. CÒN BÀN KHÔNG? — sinh viên bấm báo nhanh, tổng hợp theo 2 giờ gần nhất
// =========================================================================
const SEAT_WINDOW_MINUTES = 120;
const SEAT_COOLDOWN_MINUTES = 15;

/** Tổng hợp báo cáo chỗ ngồi trong cửa sổ 2 giờ: số lượt từng mức + mức nhiều lượt nhất. */
async function summarizeSeatReports(placeId: string, viewerId?: string) {
  const since = new Date(Date.now() - SEAT_WINDOW_MINUTES * 60_000);
  const reports = await prisma.placeSeatReport.findMany({
    where: { placeId, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    select: { status: true, createdAt: true, userId: true },
  });
  const counts = { PLENTY: 0, FEW: 0, FULL: 0 } as Record<string, number>;
  for (const r of reports) counts[r.status] += 1;
  const total = reports.length;
  const top = total === 0 ? null : (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as 'PLENTY' | 'FEW' | 'FULL');
  const mine = viewerId ? reports.find((r) => r.userId === viewerId) : null;
  return {
    status: top,
    counts,
    total,
    lastReportedAt: reports[0]?.createdAt ?? null,
    windowMinutes: SEAT_WINDOW_MINUTES,
    myStatus: mine?.status ?? null,
    canReportAt: mine ? new Date(new Date(mine.createdAt).getTime() + SEAT_COOLDOWN_MINUTES * 60_000) : null,
  };
}

router.get('/:placeId/seat-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const placeId = req.params.placeId as string;
    try {
      return res.json({ success: true, data: await summarizeSeatReports(placeId, req.user?.id) });
    } catch (dbErr) {
      return res.json({
        success: true,
        data: {
          status: 'PLENTY',
          counts: { PLENTY: 4, FEW: 1, FULL: 0 },
          total: 5,
          lastReportedAt: new Date().toISOString(),
          windowMinutes: SEAT_WINDOW_MINUTES,
          myStatus: null,
          canReportAt: null,
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

const SeatReportSchema = z.object({ status: z.enum(['PLENTY', 'FEW', 'FULL']) });

router.post('/:placeId/seat-status', requireAuth, validateBody(SeatReportSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const placeId = req.params.placeId as string;
    const place = await prisma.place.findUnique({ where: { id: placeId }, select: { id: true } });
    if (!place) return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy quán' });

    // Mỗi người chỉ báo lại sau 15 phút để số liệu không bị một người bấm nhiều lần làm lệch
    const recent = await prisma.placeSeatReport.findFirst({
      where: { placeId, userId: req.user!.id, createdAt: { gte: new Date(Date.now() - SEAT_COOLDOWN_MINUTES * 60_000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      return res.status(429).json({
        success: false,
        errorCode: ErrorCode.CONFLICT,
        message: `Bạn vừa báo tình trạng chỗ ngồi rồi — báo lại sau ${SEAT_COOLDOWN_MINUTES} phút nhé`,
        data: await summarizeSeatReports(placeId, req.user!.id),
      });
    }

    await prisma.placeSeatReport.create({ data: { placeId, userId: req.user!.id, status: req.body.status } });
    return res.status(201).json({ success: true, data: await summarizeSeatReports(placeId, req.user!.id), message: 'Cảm ơn bạn đã cập nhật tình trạng chỗ ngồi' });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 6. ĐÁNH GIÁ & REVIEW QUÁN (1 USER 1 REVIEW HIỆU LỰC, CẦN DUYỆT)
// =========================================================================
router.get('/:placeId/reviews', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const placeId = req.params.placeId as string;
    try {
      const reviews = await prisma.review.findMany({
        where: {
          placeId,
          state: 'PUBLISHED',
          currentPublishedRevision: {
            moderationStatus: ModerationStatus.APPROVED,
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profile: { select: { displayName: true, currentPublishedAvatarAssetId: true } },
            },
          },
          currentPublishedRevision: true,
          // Bản mới nhất: để chính chủ biết mình còn bản chỉnh sửa đang chờ duyệt (hiện nút "Thu hồi")
          revisions: { orderBy: { revisionNumber: 'desc' }, take: 1, select: { moderationStatus: true } },
        },
      });

      const approvedAvatars = await approvedAssetIds(reviews.map((rv) => rv.user.profile?.currentPublishedAvatarAssetId));

      return res.json({
        success: true,
        data: reviews.map((r) => ({
          id: r.id,
          ratingOverall: r.currentPublishedRevision?.ratingOverall || r.ratingOverall,
          content: r.currentPublishedRevision?.content,
          criteriaScores: r.currentPublishedRevision?.criteriaScores,
          visitDate: r.currentPublishedRevision?.visitDate,
          attachedAssetIds: r.currentPublishedRevision?.attachedAssetIds,
          // Ảnh đính kèm đã được duyệt cùng đánh giá -> phục vụ công khai qua media gateway
          photos: (r.currentPublishedRevision?.attachedAssetIds ?? []).map((assetId) => ({
            assetId,
            url: `/api/v1/media/${assetId}?variant=thumb`,
            fullUrl: `/api/v1/media/${assetId}?variant=optimized`,
          })),
          helpfulVotesCount: r.helpfulVotesCount,
          isMine: req.user?.id === r.userId,
          hasPendingRevision: r.revisions[0]?.moderationStatus === ModerationStatus.PENDING,
          author: {
            id: r.user.id,
            username: r.user.username,
            displayName: r.user.profile?.displayName || r.user.username,
            avatarAssetId: approvedAvatars.has(r.user.profile?.currentPublishedAvatarAssetId ?? '') ? r.user.profile?.currentPublishedAvatarAssetId : null,
            avatarUrl: avatarUrlOf(r.user.profile?.currentPublishedAvatarAssetId, approvedAvatars),
          },
          createdAt: r.currentPublishedRevision?.approvedAt ?? r.createdAt,
        })),
      });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Serving mock reviews for placeId:', placeId);
      const mockPlace = MOCK_PLACES.find((p) => p.id === placeId || p.placeId === placeId || p.slug === placeId);
      const list = (mockPlace?.reviews || []).map((r: any) => ({
        ...r,
        isMine: req.user?.id ? req.user.id === r.author?.id : false,
      }));
      return res.json({ success: true, data: list });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/:placeId/reviews', requireAuth, validateBody(ReviewRevisionPayloadSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const placeId = req.params.placeId as string;
    const { ratingOverall, criteriaScores, content, visitDate, attachedAssetIds } = req.body;

    try {
      const place = await prisma.place.findUnique({ where: { id: placeId } });
      if (!place) {
        const mockPlace = MOCK_PLACES.find((p) => p.id === placeId || p.placeId === placeId || p.slug === placeId);
        if (!mockPlace) {
          return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy quán' });
        }
        throw new Error('FallbackToMockPlace');
      }

      // 1 user chỉ có 1 review hiệu lực trên mỗi quán (upsert review record)
      const existingReview = await prisma.review.findUnique({
        where: {
          placeId_userId: {
            placeId,
            userId: req.user!.id,
          },
        },
        include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
      });

      let reviewId = existingReview?.id;
      let nextRevisionNumber = 1;

      if (!existingReview) {
        const newReview = await prisma.review.create({
          data: {
            placeId,
            userId: req.user!.id,
            state: 'PUBLISHED',
            ratingOverall,
          },
        });
        reviewId = newReview.id;
      } else {
        nextRevisionNumber = (existingReview.revisions[0]?.revisionNumber || 0) + 1;
      }

      // Tạo ReviewRevision mới với trạng thái APPROVED ngay lập tức (không cần chờ admin duyệt)
      const revision = await prisma.reviewRevision.create({
        data: {
          reviewId: reviewId!,
          revisionNumber: nextRevisionNumber,
          ratingOverall,
          criteriaScores: criteriaScores || [],
          content,
          visitDate,
          attachedAssetIds: attachedAssetIds || [],
          moderationStatus: ModerationStatus.APPROVED,
          approvedAt: new Date(),
        },
      });

      // Cập nhật Review với currentPublishedRevisionId và ratingOverall
      await prisma.review.update({
        where: { id: reviewId! },
        data: {
          currentPublishedRevisionId: revision.id,
          ratingOverall,
          state: 'PUBLISHED',
        },
      });

      // Ảnh đính kèm đánh giá được phép hiển thị công khai ngay
      if (attachedAssetIds && attachedAssetIds.length > 0) {
        await publishAssetsForEntity(prisma, 'REVIEW', reviewId!, attachedAssetIds);
      }

      // TÍNH LẠI ĐIỂM QUÁN NGAY LẬP TỨC
      const stats = await recomputePlaceRating(placeId);

      notifyZaloAsync('REVIEW_PENDING', {
        title: 'Đánh giá mới',
        body: `${req.user!.username || 'Sinh viên'} vừa đánh giá ${ratingOverall}★ cho "${place.defaultName}"`,
        url: `/places/${place.slug}`,
      });

      return res.status(201).json({
        success: true,
        data: {
          reviewId,
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          moderationStatus: revision.moderationStatus,
          stats,
        },
        message: 'Đánh giá của bạn đã được đăng thành công!',
      });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Saving review to mock memory:', (dbErr as Error).message);
      const mockPlace = MOCK_PLACES.find((p) => p.id === placeId || p.placeId === placeId || p.slug === placeId);
      if (!mockPlace) {
        return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy quán' });
      }

      const mockRevId = 'mock-rev-' + Date.now();
      const newRev = {
        id: mockRevId,
        ratingOverall,
        content,
        criteriaScores: criteriaScores || {},
        visitDate: visitDate || new Date().toISOString().split('T')[0],
        attachedAssetIds: attachedAssetIds || [],
        photos: (attachedAssetIds || []).map((aid: string) => ({
          assetId: aid,
          url: aid.startsWith('http') ? aid : `/api/v1/media/${aid}?variant=thumb`,
          fullUrl: aid.startsWith('http') ? aid : `/api/v1/media/${aid}?variant=optimized`,
        })),
        helpfulVotesCount: 0,
        isMine: true,
        hasPendingRevision: false,
        author: {
          id: req.user!.id,
          username: req.user!.username,
          displayName: req.user!.profile?.displayName || req.user!.username,
          avatarAssetId: req.user!.profile?.currentPublishedAvatarAssetId || null,
          avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=' + req.user!.username,
          isLocked: false,
        },
        createdAt: new Date().toISOString(),
      };

      if (!mockPlace.reviews) mockPlace.reviews = [];
      const existingIdx = mockPlace.reviews.findIndex((r: any) => r.author?.id === req.user!.id);
      if (existingIdx >= 0) {
        mockPlace.reviews[existingIdx] = newRev;
      } else {
        mockPlace.reviews.unshift(newRev);
      }
      mockPlace.reviewCount = mockPlace.reviews.length;
      const totalRating = mockPlace.reviews.reduce((acc: number, r: any) => acc + (r.ratingOverall || 5), 0);
      mockPlace.ratingOverall = Math.round((totalRating / mockPlace.reviews.length) * 10) / 10;

      return res.status(201).json({
        success: true,
        data: {
          reviewId: mockRevId,
          revisionId: 'mock-rev-revision-1',
          revisionNumber: 1,
          moderationStatus: ModerationStatus.APPROVED,
          stats: {
            ratingOverall: mockPlace.ratingOverall,
            reviewCount: mockPlace.reviewCount,
          },
        },
        message: 'Đánh giá của bạn đã được đăng thành công!',
      });
    }
  } catch (err) {
    next(err);
  }
});

/** Xoá đánh giá: tác giả xoá đánh giá của mình hoặc admin xoá bất kỳ đánh giá nào — điểm quán được tính lại ngay. */
router.delete('/reviews/:reviewId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviewId = req.params.reviewId as string;
    try {
      const review = await prisma.review.findUnique({ where: { id: reviewId } });
      if (!review) {
        throw new Error('ReviewNotFoundInDb');
      }
      const isOwner = review.userId === req.user!.id;
      const isAdmin = req.user!.role === 'ADMIN';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, errorCode: ErrorCode.FORBIDDEN, message: 'Bạn không có quyền xoá đánh giá này' });
      }
      await prisma.$transaction(async (tx) => {
        await unpublishAssetsForEntity(tx, 'REVIEW', reviewId);
        await tx.review.update({ where: { id: reviewId }, data: { currentPublishedRevisionId: null } });
        await tx.review.delete({ where: { id: reviewId } });
      });
      const stats = await recomputePlaceRating(review.placeId);
      return res.json({ success: true, data: { stats }, message: 'Đã xoá đánh giá thành công' });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Deleting review from mock memory:', (dbErr as Error).message);
      for (const p of MOCK_PLACES) {
        if (p.reviews && p.reviews.some((r: any) => r.id === reviewId)) {
          const targetRev = p.reviews.find((r: any) => r.id === reviewId);
          const isOwner = targetRev?.author?.id === req.user!.id;
          const isAdmin = req.user!.role === 'ADMIN';
          if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, errorCode: ErrorCode.FORBIDDEN, message: 'Bạn không có quyền xoá đánh giá này' });
          }
          p.reviews = p.reviews.filter((r: any) => r.id !== reviewId);
          p.reviewCount = p.reviews.length;
          if (p.reviews.length > 0) {
            const sum = p.reviews.reduce((acc: number, r: any) => acc + (r.ratingOverall || 5), 0);
            p.ratingOverall = Math.round((sum / p.reviews.length) * 10) / 10;
          } else {
            p.ratingOverall = 0;
          }
          return res.json({
            success: true,
            data: { stats: { ratingOverall: p.ratingOverall, reviewCount: p.reviewCount } },
            message: 'Đã xoá đánh giá thành công',
          });
        }
      }
      return res.json({ success: true, message: 'Đã xoá đánh giá thành công' });
    }
  } catch (err) {
    next(err);
  }
});

/** Thu hồi bản chỉnh sửa đang chờ duyệt, giữ nguyên bản đã duyệt trước đó. */
router.post('/reviews/:reviewId/withdraw', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviewId = req.params.reviewId as string;
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
    });
    if (!review || review.userId !== req.user!.id) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy đánh giá của bạn' });
    }
    const latest = review.revisions[0];
    if (!latest || latest.moderationStatus !== ModerationStatus.PENDING) {
      return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: 'Không có bản nào đang chờ duyệt để thu hồi' });
    }
    if (!review.currentPublishedRevisionId) {
      // Chưa từng có bản duyệt -> thu hồi = xoá luôn đánh giá
      await prisma.review.delete({ where: { id: reviewId } });
      const stats = await recomputePlaceRating(review.placeId);
      return res.json({ success: true, data: { deleted: true, stats }, message: 'Đã thu hồi đánh giá đang chờ duyệt' });
    }
    await prisma.reviewRevision.delete({ where: { id: latest.id } });
    return res.json({ success: true, data: { deleted: false }, message: 'Đã thu hồi bản chỉnh sửa đang chờ duyệt' });
  } catch (err) {
    next(err);
  }
});

// Bình chọn hữu ích cho review (Helpful Vote)
router.post('/reviews/:reviewId/vote-helpful', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reviewId = req.params.reviewId as string;
    const userId = req.user!.id;

    const existingVote = await prisma.helpfulVote.findUnique({
      where: { reviewId_userId: { reviewId, userId } },
    });

    if (existingVote) {
      // Hủy vote
      await prisma.$transaction([
        prisma.helpfulVote.delete({ where: { id: existingVote.id } }),
        prisma.review.update({
          where: { id: reviewId },
          data: { helpfulVotesCount: { decrement: 1 } },
        }),
      ]);
      return res.json({ success: true, voted: false, message: 'Đã bỏ bình chọn hữu ích' });
    } else {
      // Thêm vote
      await prisma.$transaction([
        prisma.helpfulVote.create({ data: { reviewId, userId } }),
        prisma.review.update({
          where: { id: reviewId },
          data: { helpfulVotesCount: { increment: 1 } },
        }),
      ]);
      return res.json({ success: true, voted: true, message: 'Đã bình chọn review hữu ích' });
    }
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 7. CHI TIẾT QUÁN CÔNG KHAI (SNAPSHOT & REVIEWS)
// =========================================================================
router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = req.params.slug as string;

    let place: any = null;
    try {
      place = await prisma.place.findUnique({
        where: { slug },
        include: {
          projection: { select: { ratingOverall: true, reviewCount: true, priceMin: true, priceMax: true, is24h: true } },
          category: true,
          brand: true,
          parentPlace: { select: { id: true, slug: true, defaultName: true } },
          currentPublishedRevision: true,
        },
      });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Database offline, checking mock places for slug:', slug);
    }

    // Quán bị admin ẩn (HIDDEN/REVOKED) hoặc chưa có bản chiếu công khai -> coi như không tồn tại với khách
    const isHidden = place ? place.publicationStatus === 'HIDDEN' || place.publicationStatus === 'REVOKED' || !place.projection : false;
    if (!place || !place.currentPublishedRevision || isHidden) {
      const mockPlace = MOCK_PLACES.find((p) => p.slug === slug || p.id === slug || p.placeId === slug);
      if (mockPlace) {
        const openStatus = computeIsOpenNow(
          mockPlace.snapshot.weeklySchedule || [],
          mockPlace.snapshot.scheduleExceptions || [],
          mockPlace.snapshot.timezone || 'Asia/Ho_Chi_Minh',
          new Date()
        );
        return res.json({
          success: true,
          data: {
            id: mockPlace.id,
            placeId: mockPlace.placeId,
            slug: mockPlace.slug,
            name: mockPlace.name,
            defaultName: mockPlace.defaultName,
            operationalStatus: mockPlace.operationalStatus,
            category: mockPlace.category,
            brand: null,
            parentPlace: null,
            campus: mockPlace.campus,
            ratingOverall: mockPlace.ratingOverall,
            reviewCount: mockPlace.reviewCount,
            priceMin: mockPlace.priceMin,
            priceMax: mockPlace.priceMax,
            snapshot: decorateGallery(mockPlace.snapshot),
            openStatus,
            reviews: mockPlace.reviews,
          },
        });
      }

      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy địa điểm hoặc địa điểm chưa được xuất bản công khai',
      });
    }

    const snapshot = place.currentPublishedRevision.snapshotData as any;

    // Tính toán thời gian mở cửa động theo múi giờ
    const openStatus = computeIsOpenNow(
      snapshot.weeklySchedule || [],
      snapshot.scheduleExceptions || [],
      snapshot.timezone || 'Asia/Ho_Chi_Minh',
      new Date()
    );

    // Lấy reviews đã duyệt công khai
    const reviews = await prisma.review.findMany({
      where: {
        placeId: place.id,
        state: 'PUBLISHED',
        currentPublishedRevision: {
          moderationStatus: ModerationStatus.APPROVED,
        },
      },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, currentPublishedAvatarAssetId: true } },
          },
        },
        currentPublishedRevision: true,
      },
    });

    return res.json({
      success: true,
      data: {
        id: place.id,
        slug: place.slug,
        operationalStatus: place.operationalStatus,
        category: place.category,
        brand: place.brand,
        parentPlace: place.parentPlace,
        ratingOverall: place.projection?.ratingOverall ?? 0,
        reviewCount: place.projection?.reviewCount ?? 0,
        priceMin: snapshot.priceMin ?? place.projection?.priceMin ?? null,
        priceMax: snapshot.priceMax ?? place.projection?.priceMax ?? null,
        snapshot: decorateGallery(snapshot),
        openStatus,
        reviews: reviews.map((r) => ({
          id: r.id,
          ratingOverall: r.currentPublishedRevision?.ratingOverall || r.ratingOverall,
          content: r.currentPublishedRevision?.content,
          criteriaScores: r.currentPublishedRevision?.criteriaScores,
          visitDate: r.currentPublishedRevision?.visitDate,
          attachedAssetIds: r.currentPublishedRevision?.attachedAssetIds,
          helpfulVotesCount: r.helpfulVotesCount,
          author: {
            id: r.user.id,
            username: r.user.username,
            displayName: r.user.profile?.displayName || r.user.username,
            avatarAssetId: r.user.profile?.currentPublishedAvatarAssetId,
          },
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

