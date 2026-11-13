import { ModerationStatus, TargetType } from '@ssg/shared';

/**
 * Cấp quyền công khai cho ảnh gắn vào một thực thể (review/post/comment/sticker pack)
 * sau khi thực thể đó được admin phê duyệt.
 *
 * Media gateway chỉ phục vụ ảnh cho khách khi: bản ảnh APPROVED + READY và có AssetUsage isPublished.
 * Hàm này: duyệt bản ảnh hiện tại nếu còn PENDING, rồi upsert AssetUsage(isPublished = true).
 * Ảnh không còn nằm trong danh sách sẽ bị gỡ quyền công khai ở thực thể này.
 */
export async function publishAssetsForEntity(
  tx: any,
  entityType: TargetType | string,
  entityId: string,
  assetIds: Array<string | null | undefined>,
  /**
   * true (mặc định): duyệt luôn bản ảnh còn PENDING — dùng khi admin đã nhìn thấy ảnh trong màn duyệt nội dung.
   * false: chỉ gắn quyền công khai, ảnh vẫn phải qua hàng đợi "Thư viện ảnh" mới hiển thị cho người khác
   * (ảnh đại diện / ảnh bìa do người dùng tự đổi).
   */
  autoApprove = true,
) {
  const ids = Array.from(new Set(assetIds.filter((x): x is string => typeof x === 'string' && x.length > 0)));

  const assets = ids.length
    ? await tx.asset.findMany({
        where: { id: { in: ids } },
        select: { id: true, currentRevisionId: true, currentRevision: { select: { id: true, moderationStatus: true } } },
      })
    : [];

  const revisionIds: string[] = [];
  for (const a of assets) {
    const rev = a.currentRevision;
    if (!rev) continue;
    revisionIds.push(rev.id);
    if (autoApprove && rev.moderationStatus === ModerationStatus.PENDING) {
      await tx.assetRevision.update({ where: { id: rev.id }, data: { moderationStatus: ModerationStatus.APPROVED } });
    }
    const existing = await tx.assetUsage.findFirst({ where: { entityType, entityId, assetRevisionId: rev.id } });
    if (existing) {
      if (!existing.isPublished) await tx.assetUsage.update({ where: { id: existing.id }, data: { isPublished: true } });
    } else {
      await tx.assetUsage.create({ data: { entityType, entityId, assetRevisionId: rev.id, isPublished: true } });
    }
  }

  await tx.assetUsage.updateMany({
    where: { entityType, entityId, assetRevisionId: { notIn: revisionIds } },
    data: { isPublished: false },
  });
}

/** Thu hồi quyền công khai của mọi ảnh gắn vào thực thể (khi ẩn/từ chối). */
export async function unpublishAssetsForEntity(tx: any, entityType: TargetType | string, entityId: string) {
  await tx.assetUsage.updateMany({ where: { entityType, entityId }, data: { isPublished: false } });
}
