import { prisma } from './prisma.js';

/**
 * Ảnh đại diện chỉ được trả URL khi ĐÃ DUYỆT.
 * Trước đây các API cộng đồng (bình luận, bài viết, đánh giá, bộ sưu tập) trả URL cho mọi ảnh:
 * ảnh chưa duyệt -> trình duyệt nhận 403 -> antd Avatar thử lại liên tục -> hàng trăm request/phút
 * đốt sạch hạn mức chung và cả site nhận "Bạn đã gửi quá nhiều yêu cầu".
 */
export async function approvedAssetIds(ids: Array<string | null | undefined>): Promise<Set<string>> {
  const list = Array.from(new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0)));
  if (list.length === 0) return new Set();
  const rows = await prisma.asset.findMany({ where: { id: { in: list }, moderationStatus: 'APPROVED' }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

/** URL ảnh đại diện công khai (null nếu chưa duyệt / không có ảnh). */
export function avatarUrlOf(assetId: string | null | undefined, approved: Set<string>, variant = 'thumb') {
  return assetId && approved.has(assetId) ? `/api/v1/media/${assetId}?variant=${variant}` : null;
}
