import { prisma } from './prisma.js';

/** Thẻ quán rút gọn dùng cho danh sách yêu thích, bộ sưu tập, nguồn AI... (chỉ dữ liệu đã xuất bản). */
export interface PlaceCard {
  placeId: string;
  slug: string;
  name: string;
  address: string | null;
  categoryName: string | null;
  ratingOverall: number;
  reviewCount: number;
  priceMin: number | null;
  priceMax: number | null;
  coverPhoto: { assetId: string; thumbUrl: string; publicUrl: string } | null;
  isPublished: boolean;
}

function coverOf(snap: any) {
  const gallery: any[] = Array.isArray(snap?.gallery) ? snap.gallery : [];
  const c = gallery.find((g) => g?.isCover) || gallery[0];
  if (!c?.assetId) return null;
  const rev = c.assetRevisionId ? `&revision=${c.assetRevisionId}` : '';
  return {
    assetId: c.assetId as string,
    thumbUrl: `/api/v1/media/${c.assetId}?variant=thumb${rev}`,
    publicUrl: `/api/v1/media/${c.assetId}?variant=optimized${rev}`,
  };
}

/** Nạp thẻ quán cho danh sách placeId (giữ thứ tự truyền vào; quán chưa xuất bản vẫn trả về nhưng isPublished=false). */
export async function loadPlaceCards(placeIds: string[]): Promise<Map<string, PlaceCard>> {
  const ids = Array.from(new Set(placeIds.filter(Boolean)));
  if (ids.length === 0) return new Map();
  const places = await prisma.place.findMany({
    where: { id: { in: ids } },
    include: {
      category: { select: { name: true } },
      currentPublishedRevision: { select: { snapshotData: true } },
      projection: { select: { ratingOverall: true, reviewCount: true, priceMin: true, priceMax: true } },
    },
  });
  const map = new Map<string, PlaceCard>();
  for (const p of places) {
    const snap: any = p.currentPublishedRevision?.snapshotData ?? null;
    map.set(p.id, {
      placeId: p.id,
      slug: p.slug,
      name: snap?.name || p.defaultName,
      address: snap?.address ?? null,
      categoryName: p.category?.name ?? null,
      ratingOverall: p.projection?.ratingOverall ?? 0,
      reviewCount: p.projection?.reviewCount ?? 0,
      priceMin: p.projection?.priceMin ?? snap?.priceMin ?? null,
      priceMax: p.projection?.priceMax ?? snap?.priceMax ?? null,
      coverPhoto: coverOf(snap),
      isPublished: Boolean(p.currentPublishedRevisionId),
    });
  }
  return map;
}
