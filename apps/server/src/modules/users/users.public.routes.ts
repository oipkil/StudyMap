import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';
import { ErrorCode, ContentState } from '@ssg/shared';
import { loadPlaceCards } from '../../lib/place-card.js';

const router = Router();

const mediaUrl = (assetId: string, variant: 'thumb' | 'optimized' = 'thumb') => `/api/v1/media/${assetId}?variant=${variant}`;

/**
 * Hồ sơ công khai của một người dùng.
 * Chỉ trả nội dung ĐÃ DUYỆT (đánh giá, bài viết, bộ sưu tập công khai) kèm ảnh đã được phép công khai
 * — không lộ nội dung đang chờ kiểm duyệt.
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        reviews: {
          where: { state: ContentState.PUBLISHED, currentPublishedRevisionId: { not: null } },
          include: {
            place: { select: { id: true, defaultName: true, slug: true } },
            currentPublishedRevision: { select: { content: true, attachedAssetIds: true, visitDate: true, ratingOverall: true, approvedAt: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
        posts: {
          where: { state: ContentState.PUBLISHED, currentPublishedRevisionId: { not: null } },
          include: { currentPublishedRevision: { select: { title: true, summary: true, coverAssetId: true, contentBlocks: true, placeIds: true, approvedAt: true } } },
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
        // Bộ sưu tập công khai đã duyệt của người này
        collections: {
          where: { isPublic: true, currentPublishedRevision: { moderationStatus: 'APPROVED' } },
          include: { currentPublishedRevision: { select: { name: true, description: true } }, items: { select: { id: true, placeId: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!user || user.isLocked) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy hồ sơ người dùng',
      });
    }

    // Ảnh đại diện / ảnh bìa chỉ hiện với người khác sau khi được duyệt ở "Thư viện ảnh"
    const profileAssetIds = [user.profile?.currentPublishedAvatarAssetId, user.profile?.currentPublishedCoverAssetId].filter((x): x is string => !!x);
    const approvedProfileAssets = new Set(
      profileAssetIds.length
        ? (await prisma.asset.findMany({ where: { id: { in: profileAssetIds }, moderationStatus: 'APPROVED' }, select: { id: true } })).map((a) => a.id)
        : [],
    );
    const approvedOrNull = (assetId: string | null | undefined) => (assetId && approvedProfileAssets.has(assetId) ? assetId : null);
    // Chính chủ xem hồ sơ của mình thì thấy ngay ảnh vừa đổi (kèm cờ "đang chờ duyệt"); người khác chỉ thấy ảnh đã duyệt
    const isOwner = req.user?.id === user.id;
    const ownPreview = (assetId: string | null | undefined, variant = 'thumb') => (assetId ? `/api/v1/media/${assetId}?variant=${variant}&preview=true` : null);

    const campus = user.profile?.universityCampusId && user.profile.isUniversityPublic
      ? await prisma.campus.findUnique({ where: { id: user.profile.universityCampusId }, select: { id: true, name: true, universityName: true } })
      : null;

    // Thẻ quán (tên, ảnh bìa, địa chỉ) cho đánh giá / bài viết / bộ sưu tập
    const placeIds = [
      ...user.reviews.map((r) => r.placeId),
      ...user.posts.flatMap((p) => (p.currentPublishedRevision?.placeIds ?? []).slice(0, 1)),
      ...user.collections.flatMap((c) => c.items.slice(0, 4).map((it) => it.placeId)),
    ];
    const cards = await loadPlaceCards(placeIds);

    const reviews = user.reviews.map((r) => {
      const rev = r.currentPublishedRevision;
      const photoIds = rev?.attachedAssetIds ?? [];
      return {
        kind: 'review' as const,
        id: r.id,
        ratingOverall: rev?.ratingOverall ?? r.ratingOverall,
        place: cards.get(r.placeId) ?? (r.place ? { placeId: r.place.id, name: r.place.defaultName, slug: r.place.slug } : null),
        content: rev?.content ?? '',
        excerpt: rev?.content?.slice(0, 160) ?? null,
        visitDate: rev?.visitDate ?? null,
        photos: photoIds.map((assetId) => ({ assetId, url: mediaUrl(assetId), fullUrl: mediaUrl(assetId, 'optimized') })),
        helpfulVotesCount: r.helpfulVotesCount,
        createdAt: rev?.approvedAt ?? r.createdAt,
      };
    });

    const posts = user.posts.map((p) => {
      const rev = p.currentPublishedRevision;
      const blocks: any[] = Array.isArray(rev?.contentBlocks) ? (rev!.contentBlocks as any[]) : [];
      const photoIds = Array.from(
        new Set([rev?.coverAssetId, ...blocks.map((b) => b?.assetId)].filter((x): x is string => typeof x === 'string')),
      );
      const firstPlace = rev?.placeIds?.[0];
      return {
        kind: 'post' as const,
        id: p.id,
        slug: p.slug,
        title: rev?.title ?? null,
        summary: rev?.summary ?? null,
        content: blocks.map((b) => (typeof b === 'string' ? b : b?.text ?? '')).filter(Boolean).join('\n\n'),
        photos: photoIds.map((assetId) => ({ assetId, url: mediaUrl(assetId), fullUrl: mediaUrl(assetId, 'optimized') })),
        place: firstPlace ? cards.get(firstPlace) ?? null : null,
        createdAt: rev?.approvedAt ?? p.createdAt,
      };
    });

    // Tab "Ảnh": gom mọi ảnh đã công khai trong đánh giá + bài viết
    const photos = [...reviews, ...posts]
      .flatMap((item) => item.photos.map((ph) => ({ ...ph, kind: item.kind, sourceId: item.id, placeName: item.place?.name ?? null, createdAt: item.createdAt })))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        displayName: user.profile?.displayName || user.username,
        bio: user.profile?.currentPublishedBio || null,
        avatarUrl: approvedOrNull(user.profile?.currentPublishedAvatarAssetId)
          ? mediaUrl(user.profile!.currentPublishedAvatarAssetId!)
          : isOwner
            ? ownPreview(user.profile?.currentPublishedAvatarAssetId)
            : null,
        avatarAssetId: user.profile?.currentPublishedAvatarAssetId ?? null,
        coverUrl: approvedOrNull(user.profile?.currentPublishedCoverAssetId)
          ? mediaUrl(user.profile!.currentPublishedCoverAssetId!, 'optimized')
          : isOwner
            ? ownPreview(user.profile?.currentPublishedCoverAssetId, 'optimized')
            : null,
        // Cờ để hồ sơ của chính mình hiện nhãn "Ảnh đang chờ duyệt"
        avatarPending: Boolean(user.profile?.currentPublishedAvatarAssetId && !approvedProfileAssets.has(user.profile.currentPublishedAvatarAssetId)),
        coverPending: Boolean(user.profile?.currentPublishedCoverAssetId && !approvedProfileAssets.has(user.profile.currentPublishedCoverAssetId)),
        campusName: campus ? campus.name : user.profile?.isUniversityPublic ? user.profile.customUniversityName ?? null : null,
        campus,
        createdAt: user.createdAt,
        role: user.role,
        stats: {
          reviews: user.reviews.length,
          posts: user.posts.length,
          collections: user.collections.length,
          photos: photos.length,
        },
        collections: user.collections.map((c) => ({
          id: c.id,
          name: c.currentPublishedRevision?.name ?? 'Bộ sưu tập',
          description: c.currentPublishedRevision?.description ?? null,
          itemCount: c.items.length,
          previews: c.items.slice(0, 4).map((it) => cards.get(it.placeId)?.coverPhoto?.thumbUrl ?? null).filter(Boolean),
          createdAt: c.createdAt,
        })),
        reviews,
        posts,
        photos,
        // Dòng thời gian gộp đánh giá + bài viết, mới nhất trước (giao diện hồ sơ kiểu mạng xã hội)
        timeline: [...reviews, ...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
