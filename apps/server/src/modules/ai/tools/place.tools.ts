import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma.js';
import { PublicationStatus, ContentState } from '@ssg/shared';

/**
 * Helper: Bọc dữ liệu thực tế trong delimiter an toàn chống Prompt Injection
 */
function wrapData(data: any): string {
  return `<verified_grounding_data>\n${JSON.stringify(data, null, 2)}\n</verified_grounding_data>`;
}

/**
 * 1. Tool tìm kiếm quán đã xuất bản
 */
export const searchPlacesTool = tool({
  description:
    'Tìm danh sách quán cà phê / không gian học tập ĐÃ XUẤT BẢN CÔNG KHAI. Không cần biết mã cơ sở: truyền tên/viết tắt trường (ví dụ "KHTN", "Nguyễn Văn Cừ", "Thủ Đức") vào campus. Nếu không truyền gì sẽ trả về toàn bộ quán công khai (dữ liệu hiện còn ít).',
  inputSchema: z.object({
    query: z.string().optional().describe('Từ khóa tên quán / tên phụ (tùy chọn)'),
    campus: z
      .string()
      .optional()
      .describe('Tên hoặc viết tắt cơ sở trường / khu vực (ví dụ "KHTN cơ sở 1", "Nguyễn Văn Cừ", "Linh Trung")'),
    is24h: z.boolean().optional().describe('Chỉ lấy quán mở 24/7'),
    hasSockets: z.boolean().optional().describe('Ưu tiên quán có ổ cắm điện (socketDensity khác NONE/UNKNOWN)'),
    limit: z.number().min(1).max(10).default(5).describe('Số quán tối đa'),
  }),
  execute: async ({ query, campus, is24h, hasSockets, limit }) => {
    const where: any = {};
    if (is24h !== undefined) where.is24h = is24h;

    // Giải mã cơ sở trường theo tên (không bắt AI/sinh viên nhớ UUID)
    let campusNote: string | null = null;
    if (campus) {
      const raw = campus.trim();
      const compact = raw.replace(/\s+/g, ' ');
      const tokens = compact.split(' ').filter((t) => t.length >= 2);
      const campuses = await prisma.campus.findMany({ select: { id: true, name: true, universityName: true, address: true } });
      const norm = (x: string) =>
        x
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd')
          .replace(/Đ/g, 'D')
          .toLowerCase();
      const abbrev = (name: string) =>
        name
          .split(/[^A-Za-zÀ-ỹ]+/)
          .filter(Boolean)
          .map((w) => norm(w)[0])
          .join('');
      const matched = campuses.filter((c) => {
        const hay = norm(`${c.name} ${c.universityName} ${c.address}`);
        const ab = abbrev(c.name.replace(/^(ĐH|DH|Đại học|Dai hoc)\s*/i, ''));
        return tokens.some((t) => {
          const nt = norm(t);
          return hay.includes(nt) || (nt.length >= 3 && ab.includes(nt));
        });
      });
      if (matched.length > 0) {
        where.campusId = { in: matched.map((c) => c.id) };
        campusNote = `Đã khớp cơ sở: ${matched.map((c) => c.name).join('; ')}`;
      } else {
        campusNote = `Không tìm thấy cơ sở trường khớp "${raw}" — trả về toàn bộ quán công khai để bạn tự lọc.`;
      }
    }

    if (query) {
      where.OR = [{ name: { contains: query, mode: 'insensitive' } }, { alternateNames: { has: query } }];
    }

    const select = {
      placeId: true,
      slug: true,
      name: true,
      priceMin: true,
      priceMax: true,
      ratingOverall: true,
      reviewCount: true,
      is24h: true,
      studyAmenities: true,
      campus: { select: { name: true } },
      publishedRevision: { select: { snapshotData: true } },
    } as const;

    let projections = await prisma.placePublishedProjection.findMany({
      where,
      take: limit,
      orderBy: { ratingOverall: 'desc' },
      select,
    });

    // Không có kết quả với từ khóa -> nới lỏng (bỏ query) để AI vẫn có dữ liệu thật để trả lời
    let relaxedNote: string | null = null;
    if (projections.length === 0 && query) {
      delete where.OR;
      projections = await prisma.placePublishedProjection.findMany({ where, take: limit, orderBy: { ratingOverall: 'desc' }, select });
      if (projections.length) relaxedNote = `Không có quán khớp từ khóa "${query}" — đã trả về các quán công khai khác.`;
    }

    const items = projections.map((p) => {
      const am: any = p.studyAmenities || {};
      const snap: any = p.publishedRevision?.snapshotData || {};
      return {
        id: p.placeId,
        placeId: p.placeId,
        slug: p.slug,
        name: p.name,
        address: snap.address ?? null,
        coverPhoto: (() => {
          const g: any[] = Array.isArray(snap.gallery) ? snap.gallery : [];
          const c = g.find((x) => x?.isCover) || g[0];
          return c?.assetId ? { assetId: c.assetId, thumbUrl: `/api/v1/media/${c.assetId}?variant=thumb` } : null;
        })(),
        campus: p.campus?.name ?? null,
        priceMin: p.priceMin,
        priceMax: p.priceMax,
        ratingOverall: p.ratingOverall,
        reviewCount: p.reviewCount,
        is24h: p.is24h,
        amenities: {
          wifiQuality: am.wifiQuality ?? 'UNKNOWN',
          socketDensity: am.socketDensity ?? 'UNKNOWN',
          noiseLevel: am.noiseLevel ?? 'UNKNOWN',
          studySuitability: am.studySuitability ?? 'UNKNOWN',
          groupStudyAllowed: am.groupStudyAllowed ?? null,
          airConditioned: am.airConditioned ?? null,
          motorcycleParking: am.motorcycleParking ?? 'UNKNOWN',
          privateRoomsCount: am.privateRoomsCount ?? 0,
        },
        hasSockets: ['SPARSE', 'MANY', 'EVERY_TABLE'].includes(am.socketDensity),
      };
    });

    // Ổ cắm: ưu tiên quán có ổ cắm; quán "UNKNOWN" vẫn giữ nhưng xếp sau và ghi rõ chưa có thông tin
    const ordered = hasSockets ? [...items].sort((a, b) => Number(b.hasSockets) - Number(a.hasSockets)) : items;

    return wrapData({
      note: [campusNote, relaxedNote, 'Chỉ dùng dữ liệu dưới đây; giá trị UNKNOWN nghĩa là chưa có thông tin — nói rõ với sinh viên, không đoán.']
        .filter(Boolean)
        .join(' '),
      total: ordered.length,
      places: ordered,
    });
  },
});

/**
 * 2. Tool lấy chi tiết quán đã xuất bản
 */
export const getPublishedPlaceTool = tool({
  description: 'Lấy thông tin chi tiết (địa chỉ, giờ mở cửa, menu, tiện ích) của một địa điểm học tập đã xuất bản',
  inputSchema: z.object({
    placeIdOrSlug: z.string().describe('ID hoặc slug duy nhất của quán'),
  }),
  execute: async ({ placeIdOrSlug }) => {
    const place = await prisma.place.findFirst({
      where: {
        OR: [{ id: placeIdOrSlug }, { slug: placeIdOrSlug }],
        publicationStatus: PublicationStatus.PUBLISHED,
      },
      include: {
        currentPublishedRevision: true,
        projection: true,
      },
    });

    if (!place || !place.currentPublishedRevision) {
      return wrapData({
        found: false,
        message: 'Quán này hiện không tồn tại hoặc chưa được xuất bản công khai trên hệ thống SSG.',
      });
    }

    const snap = (place.currentPublishedRevision.snapshotData as any) || {};

    return wrapData({
      found: true,
      placeId: place.id,
      name: place.defaultName,
      slug: place.slug,
      address: snap.address || 'Gần cơ sở HCMUS',
      priceRange: `${snap.priceMin?.toLocaleString() || 0}đ - ${snap.priceMax?.toLocaleString() || 0}đ`,
      amenities: snap.amenities || {},
      studentDiscount: snap.studentDiscountDetails || 'Không có thông tin',
      ratingOverall: place.projection?.ratingOverall || 5.0,
      reviewCount: place.projection?.reviewCount || 0,
      is24h: place.projection?.is24h || false,
    });
  },
});

/**
 * 3. Tool so sánh từ 2 đến 4 quán
 */
export const comparePlacesTool = tool({
  description: 'So sánh các tiêu chí học tập (Wi-Fi, ổ cắm, độ ồn, giá nước, giờ mở cửa) giữa 2 đến 4 quán',
  inputSchema: z.object({
    placeSlugsOrIds: z.array(z.string()).min(2).max(4).describe('Danh sách 2-4 ID hoặc slug của các quán cần so sánh'),
  }),
  execute: async ({ placeSlugsOrIds }) => {
    const places = await prisma.place.findMany({
      where: {
        OR: [{ id: { in: placeSlugsOrIds } }, { slug: { in: placeSlugsOrIds } }],
        publicationStatus: PublicationStatus.PUBLISHED,
      },
      include: {
        currentPublishedRevision: true,
        projection: true,
      },
    });

    const comparisonList = places.map((p) => {
      const snap = (p.currentPublishedRevision?.snapshotData as any) || {};
      return {
        placeId: p.id,
        name: p.defaultName,
        slug: p.slug,
        address: snap.address || 'Chưa có thông tin',
        priceRange: `${snap.priceMin?.toLocaleString() || 'Chưa rõ'}đ - ${snap.priceMax?.toLocaleString() || 'Chưa rõ'}đ`,
        rating: p.projection?.ratingOverall || 5.0,
        wifi: snap.amenities?.wifiQuality || 'Chưa có thông tin',
        sockets: snap.amenities?.hasPowerSockets ? 'Nhiều từng bàn' : 'Hạn chế / Chưa có thông tin',
        noise: snap.amenities?.noiseLevel || 'Chưa có thông tin',
        studentDiscount: snap.studentDiscountDetails || 'Chưa có thông tin',
      };
    });

    return wrapData(comparisonList);
  },
});

/**
 * 4. Tool lấy đánh giá đã duyệt
 */
export const getApprovedReviewsTool = tool({
  description: 'Lấy các cảm nhận và đánh giá đã được kiểm duyệt công khai của sinh viên về một địa điểm',
  inputSchema: z.object({
    placeId: z.string().describe('ID của quán'),
    limit: z.number().min(1).max(10).default(3).describe('Số lượng đánh giá cần lấy'),
  }),
  execute: async ({ placeId, limit }) => {
    const reviews = await prisma.review.findMany({
      where: {
        placeId,
        state: ContentState.PUBLISHED,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        currentPublishedRevision: true,
        user: { select: { username: true } },
      },
    });

    const formatted = reviews
      .filter((r) => r.currentPublishedRevision !== null)
      .map((r) => ({
        author: r.user.username,
        ratingOverall: r.ratingOverall,
        content: r.currentPublishedRevision?.content || '',
        visitDate: r.currentPublishedRevision?.visitDate || 'Mới đây',
        criteriaScores: r.currentPublishedRevision?.criteriaScores || {},
      }));

    return wrapData(formatted);
  },
});

/**
 * 5. Tool tìm quán theo tọa độ xung quanh
 */
export const getNearbyPlacesTool = tool({
  description: 'Tìm các quán học bài gần vị trí GPS của sinh viên',
  inputSchema: z.object({
    latitude: z.number().describe('Vĩ độ'),
    longitude: z.number().describe('Kinh độ'),
    radiusKm: z.number().min(0.5).max(10).default(2).describe('Bán kính tìm kiếm (km)'),
  }),
  execute: async ({ latitude, longitude, radiusKm }) => {
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

    const places = await prisma.placePublishedProjection.findMany({
      where: {
        latitude: { gte: latitude - latDelta, lte: latitude + latDelta },
        longitude: { gte: longitude - lngDelta, lte: longitude + lngDelta },
      },
      take: 6,
      select: {
        placeId: true,
        name: true,
        slug: true,
        latitude: true,
        longitude: true,
        ratingOverall: true,
        priceMin: true,
        priceMax: true,
      },
    });

    return wrapData(places);
  },
});

export const allAiTools = {
  searchPlaces: searchPlacesTool,
  getPublishedPlace: getPublishedPlaceTool,
  comparePlaces: comparePlacesTool,
  getApprovedReviews: getApprovedReviewsTool,
  getNearbyPlaces: getNearbyPlacesTool,
};
