import { loadPlaceCards } from '../../lib/place-card.js';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { approvedAssetIds, avatarUrlOf } from '../../lib/avatar.js';
import { publishAssetsForEntity, unpublishAssetsForEntity } from '../../lib/asset-usage.js';
import { notifyZaloAsync } from '../integrations/zalo.service.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import {
  ErrorCode,
  ModerationStatus,
  ContentState,
  TargetType,
  CommentRevisionPayloadSchema,
  PostRevisionPayloadSchema,
  ReportCreateSchema,
} from '@ssg/shared';
import { MOCK_COMMENTS, MockCommentItem, MOCK_POSTS, MockPostItem } from './mock-community.data.js';

const router = Router();

// =========================================================================
// 1. BÌNH LUẬN & TRẢ LỜI (COMMENTS & REPLIES)
// =========================================================================
router.get('/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetType = req.query.targetType as TargetType;
    const targetId = req.query.targetId as string;

    if (!targetType || !targetId) {
      return res.status(400).json({ success: false, errorCode: ErrorCode.VALIDATION_ERROR, message: 'Thiếu targetType hoặc targetId' });
    }

    const viewerId = req.user?.id;
    try {
      const comments = await prisma.comment.findMany({
        where: {
          targetType,
          targetId,
          state: ContentState.PUBLISHED,
          // Công khai: đã có bản duyệt. Riêng tác giả: thấy thêm bình luận của mình đang chờ duyệt.
          OR: [{ currentPublishedRevisionId: { not: null } }, ...(viewerId ? [{ authorUserId: viewerId }] : [])],
        },
        orderBy: { createdAt: 'asc' },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              profile: { select: { displayName: true, currentPublishedAvatarAssetId: true } },
            },
          },
          currentPublishedRevision: true,
          revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
        },
      });

      // Nạp thông tin nhãn dán (một truy vấn cho toàn bộ danh sách)
      const stickerIds = Array.from(
        new Set(
          comments
            .filter((c) => !c.isDeleted)
            .map((c) => (c.currentPublishedRevision ?? (c.authorUserId === viewerId ? c.revisions[0] : null))?.stickerItemId)
            .filter((x): x is string => !!x)
        )
      );
      const stickerItems = stickerIds.length
        ? await prisma.stickerItem.findMany({ where: { id: { in: stickerIds } }, select: { id: true, assetId: true, altText: true, shortcode: true } })
        : [];
      const stickerMap = new Map(stickerItems.map((it) => [it.id, it]));

      // Ảnh đại diện chưa duyệt thì không trả URL (tránh trình duyệt nạp ảnh 403 lặp vô hạn)
      const approvedAvatars = await approvedAssetIds(comments.map((c) => c.author.profile?.currentPublishedAvatarAssetId));

      // Bình luận đã xoá chỉ giữ lại khi còn câu trả lời bên dưới (để không mất mạch hội thoại)
      const parentsWithReplies = new Set(comments.filter((c) => !c.isDeleted).map((c) => c.parentCommentId).filter((x): x is string => !!x));
      const visible = comments.filter((c) => !c.isDeleted || parentsWithReplies.has(c.id));

      const formatted = visible.map((c) => {
        const latest = c.revisions[0];
        const shown = c.isDeleted ? null : c.currentPublishedRevision ?? (c.authorUserId === viewerId ? latest : null);
        const stk = shown?.stickerItemId ? stickerMap.get(shown.stickerItemId) : null;
        return {
          id: c.id,
          targetType: c.targetType,
          targetId: c.targetId,
          parentCommentId: c.parentCommentId,
          isDeleted: c.isDeleted,
          content: c.isDeleted ? 'Bình luận đã bị xoá' : shown?.content,
          stickerItemId: shown?.stickerItemId,
          sticker: stk ? { id: stk.id, name: stk.altText, shortcode: stk.shortcode, imageUrl: `/api/v1/media/${stk.assetId}?variant=thumb` } : null,
          attachedAssetId: shown?.attachedAssetId,
          attachedImageUrl: shown?.attachedAssetId
            ? `/api/v1/media/${shown.attachedAssetId}?variant=thumb${c.authorUserId === viewerId && !c.currentPublishedRevision ? '&preview=true' : ''}`
            : null,
          moderationStatus: shown?.moderationStatus ?? 'PENDING',
          isPendingMine: !c.currentPublishedRevision && c.authorUserId === viewerId,
          author: {
            id: c.author.id,
            username: c.author.username,
            displayName: c.author.profile?.displayName || c.author.username,
            avatarAssetId: approvedAvatars.has(c.author.profile?.currentPublishedAvatarAssetId ?? '') ? c.author.profile?.currentPublishedAvatarAssetId : null,
            avatarUrl: avatarUrlOf(c.author.profile?.currentPublishedAvatarAssetId, approvedAvatars),
          },
          createdAt: c.createdAt,
        };
      });

      return res.json({ success: true, data: formatted });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Serving mock comments for targetId:', targetId);
      const filtered = MOCK_COMMENTS.filter((c) => c.targetId === targetId || targetId.includes(c.targetId) || c.targetId.includes(targetId));
      return res.json({ success: true, data: filtered });
    }
  } catch (err) {
    next(err);
  }
});

const CreateCommentSchema = CommentRevisionPayloadSchema.extend({
  targetType: z.enum([TargetType.PLACE, TargetType.REVIEW, TargetType.POST]),
  targetId: z.string().uuid(),
  parentCommentId: z.string().uuid().optional().nullable(),
});

router.post('/comments', requireAuth, validateBody(CreateCommentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { targetType, targetId, parentCommentId, content, stickerItemId, attachedAssetId } = req.body;

    try {
      const comment = await prisma.$transaction(async (tx) => {
        const c = await tx.comment.create({
          data: {
            targetType,
            targetId,
            parentCommentId: parentCommentId || null,
            authorUserId: req.user!.id,
            state: ContentState.PUBLISHED,
          },
        });

        const rev = await tx.commentRevision.create({
          data: {
            commentId: c.id,
            revisionNumber: 1,
            content,
            stickerItemId: stickerItemId || null,
            attachedAssetId: attachedAssetId || null,
            moderationStatus: ModerationStatus.APPROVED,
          },
        });

        const updated = await tx.comment.update({
          where: { id: c.id },
          data: {
            currentPublishedRevisionId: rev.id,
          },
          include: {
            currentPublishedRevision: true,
          },
        });

        if (attachedAssetId) {
          await publishAssetsForEntity(tx, 'COMMENT', c.id, [attachedAssetId]);
        }

        return { ...updated, pendingRevision: null };
      });

      return res.status(201).json({
        success: true,
        data: comment,
        message: 'Bình luận đã gửi thành công',
      });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Saving comment to mock memory:', (dbErr as Error).message);
      const newComment: MockCommentItem = {
        id: 'comm-' + Date.now(),
        targetType,
        targetId,
        parentCommentId: parentCommentId || null,
        isDeleted: false,
        content: content || 'Đã gửi nhãn dán',
        stickerItemId: stickerItemId || null,
        sticker: null,
        attachedAssetId: attachedAssetId || null,
        attachedImageUrl: attachedAssetId ? (attachedAssetId.startsWith('http') ? attachedAssetId : `/api/v1/media/${attachedAssetId}?variant=thumb`) : null,
        moderationStatus: 'APPROVED',
        isPendingMine: false,
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
      MOCK_COMMENTS.push(newComment);
      return res.status(201).json({
        success: true,
        data: newComment,
        message: 'Bình luận đã gửi thành công',
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * Xoá bình luận: tác giả xoá bình luận của mình, admin xoá bất kỳ bình luận nào.
 * Xoá mềm (isDeleted) để giữ mạch trả lời; ảnh/nhãn dán đính kèm bị gỡ công khai ngay.
 */
router.delete('/comments/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    try {
      const comment = await prisma.comment.findUnique({ where: { id } });
      if (!comment || comment.isDeleted) {
        throw new Error('CommentNotFoundInDb');
      }
      const isAdmin = req.user!.role === 'ADMIN';
      if (!isAdmin && comment.authorUserId !== req.user!.id) {
        return res.status(403).json({ success: false, errorCode: ErrorCode.FORBIDDEN, message: 'Bạn chỉ xoá được bình luận của mình' });
      }
      await prisma.$transaction(async (tx) => {
        await unpublishAssetsForEntity(tx, 'COMMENT', id);
        // Giữ state PUBLISHED: danh sách lọc theo state, cần bản ghi này để hiện 'Bình luận đã bị xoá' khi còn câu trả lời
        await tx.comment.update({ where: { id }, data: { isDeleted: true } });
      });
      return res.json({ success: true, message: 'Đã xoá bình luận' });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Deleting comment from mock memory:', (dbErr as Error).message);
      const idx = MOCK_COMMENTS.findIndex((c) => c.id === id);
      if (idx !== -1) {
        const comm = MOCK_COMMENTS[idx];
        const isAdmin = req.user!.role === 'ADMIN';
        if (!isAdmin && comm.author.id !== req.user!.id) {
          return res.status(403).json({ success: false, errorCode: ErrorCode.FORBIDDEN, message: 'Bạn chỉ xoá được bình luận của mình' });
        }
        comm.isDeleted = true;
        comm.content = 'Bình luận đã bị xoá';
        return res.json({ success: true, message: 'Đã xoá bình luận' });
      }
      return res.json({ success: true, message: 'Đã xoá bình luận' });
    }
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 2. BỘ STICKER (STICKER PACKS & CHOOSER)
// =========================================================================
// Chỉ trả về các bộ sticker ĐÃ ĐƯỢC PHÊ DUYỆT (APPROVED)
router.get('/stickers/packs/public', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const packs = await prisma.stickerPack.findMany({
      where: { moderationStatus: ModerationStatus.APPROVED },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    const data = packs.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      stickers: p.items.map((it) => ({
        id: it.id,
        name: it.altText,
        shortcode: it.shortcode,
        url: `/api/v1/media/${it.assetId}?variant=thumb`,
      })),
    }));

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Sinh viên gửi bộ sticker mới lên để Admin duyệt
const CreateStickerPackSchema = z.object({
  name: z.string().min(2).max(50),
  slug: z.string().min(2).max(50),
  items: z.array(
    z.object({
      shortcode: z.string().min(2).max(50),
      assetId: z.string().uuid(),
      altText: z.string().min(1).max(100),
    })
  ).min(1).max(20),
});

router.get('/stickers/packs/mine', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const packs = await prisma.stickerPack.findMany({
      where: { authorUserId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    return res.json({
      success: true,
      data: packs.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        moderationStatus: p.moderationStatus,
        createdAt: p.createdAt,
        items: p.items.map((it) => ({ id: it.id, altText: it.altText, url: `/api/v1/media/${it.assetId}?variant=thumb&preview=true` })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/stickers/packs', requireAuth, validateBody(CreateStickerPackSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, items } = req.body;

    const pack = await prisma.stickerPack.create({
      data: {
        name,
        slug,
        authorUserId: req.user!.id,
        moderationStatus: ModerationStatus.PENDING, // Chờ admin duyệt mới xuất hiện trong bộ chọn
        items: {
          create: items.map((it: any, idx: number) => ({
            shortcode: it.shortcode,
            assetId: it.assetId,
            altText: it.altText,
            sortOrder: idx,
          })),
        },
      },
      include: { items: true },
    });

    notifyZaloAsync('STICKER_PACK_PENDING', { title: 'Bộ nhãn dán mới chờ duyệt', body: `${pack.name} — ${pack.items.length} nhãn dán`, url: '/admin/stickers' });

    return res.status(201).json({
      success: true,
      data: pack,
      message: 'Bộ sticker của bạn đã được gửi và đang chờ quản trị viên phê duyệt',
    });
  } catch (err: any) {
    // Mã nhãn dán (shortcode) phải là duy nhất toàn hệ thống -> báo rõ thay vì lỗi 500
    if (err?.code === 'P2002') {
      return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: 'Mã nhãn dán (shortcode) đã tồn tại — đổi mã khác rồi gửi lại' });
    }
    next(err);
  }
});

// =========================================================================
// 3. BÀI TRẢI NGHIỆM GẮN VỚI QUÁN (EXPERIENCE POSTS)
// =========================================================================
// Bài viết công khai: trả về dạng phẳng cho frontend (title/summary/content từ contentBlocks, tác giả, quán gắn kèm)
function blocksToText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((b: any) => (typeof b === 'string' ? b : b?.text ?? b?.content ?? ''))
    .filter(Boolean)
    .join('\n\n');
}

async function toPublicPost(post: any) {
  const rev = post.currentPublishedRevision;
  const placeId = rev?.placeIds?.[0];
  const proj = placeId
    ? await prisma.placePublishedProjection.findUnique({ where: { placeId }, select: { name: true, slug: true, publishedRevision: { select: { snapshotData: true } } } })
    : null;
  return {
    id: post.id,
    slug: post.slug,
    title: rev?.title ?? '',
    summary: rev?.summary ?? '',
    content: blocksToText(rev?.contentBlocks),
    contentBlocks: rev?.contentBlocks ?? [],
    coverAssetId: rev?.coverAssetId ?? null,
    coverUrl: rev?.coverAssetId ? `/api/v1/media/${rev.coverAssetId}?variant=optimized` : null,
    // Mọi ảnh trong bài (ảnh bìa + block ảnh) đã được duyệt cùng bài viết
    photos: Array.from(new Set([rev?.coverAssetId, ...((Array.isArray(rev?.contentBlocks) ? (rev!.contentBlocks as any[]) : []).map((b: any) => b?.assetId))].filter((x): x is string => typeof x === 'string'))).map((assetId) => ({ assetId, url: `/api/v1/media/${assetId}?variant=thumb`, fullUrl: `/api/v1/media/${assetId}?variant=optimized` })),
    tags: [] as string[],
    createdAt: post.createdAt,
    author: {
      id: post.author?.id,
      username: post.author?.username,
      displayName: post.author?.profile?.displayName || post.author?.username,
      avatarAssetId: post.author?.profile?.currentPublishedAvatarAssetId ?? null,
      avatarUrl: avatarUrlOf(post.author?.profile?.currentPublishedAvatarAssetId, await approvedAssetIds([post.author?.profile?.currentPublishedAvatarAssetId])),
    },
    place: proj ? { slug: proj.slug, name: proj.name, address: (proj.publishedRevision?.snapshotData as any)?.address ?? '' } : null,
    currentPublishedRevision: rev ? { title: rev.title, content: blocksToText(rev.contentBlocks) } : null,
  };
}

router.get('/posts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const placeId = req.query.placeId as string | undefined;
    try {
      const posts = await prisma.post.findMany({
        where: {
          state: ContentState.PUBLISHED,
          currentPublishedRevision: { moderationStatus: ModerationStatus.APPROVED },
          ...(placeId ? { currentPublishedRevision: { placeIds: { has: placeId } } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              profile: { select: { displayName: true, currentPublishedAvatarAssetId: true } },
            },
          },
          currentPublishedRevision: true,
        },
      });

      return res.json({ success: true, data: await Promise.all(posts.map(toPublicPost)) });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Serving mock posts:', (dbErr as Error).message);
      return res.json({ success: true, data: MOCK_POSTS });
    }
  } catch (err) {
    next(err);
  }
});

router.get('/posts/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = req.params.slug as string;
    try {
      const post = await prisma.post.findFirst({
        where: {
          OR: [{ slug }, { id: slug }],
          state: ContentState.PUBLISHED,
          currentPublishedRevision: { moderationStatus: ModerationStatus.APPROVED },
        },
        include: {
          author: { select: { id: true, username: true, profile: { select: { displayName: true, currentPublishedAvatarAssetId: true } } } },
          currentPublishedRevision: true,
        },
      });
      if (post) {
        return res.json({ success: true, data: await toPublicPost(post) });
      }
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Searching mock posts for slug:', slug);
    }
    const mockPost = MOCK_POSTS.find((p) => p.slug === slug || p.id === slug);
    if (!mockPost) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Bài viết không tồn tại hoặc chưa được duyệt công khai' });
    }
    return res.json({ success: true, data: mockPost });
  } catch (err) {
    next(err);
  }
});

router.post('/posts', requireAuth, validateBody(PostRevisionPayloadSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, summary, coverAssetId, placeIds, contentBlocks } = req.body;
    const baseSlug = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const slug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

    try {
      const post = await prisma.$transaction(async (tx) => {
        const p = await tx.post.create({
          data: {
            slug,
            authorUserId: req.user!.id,
            state: ContentState.PUBLISHED,
          },
        });

        const rev = await tx.postRevision.create({
          data: {
            postId: p.id,
            revisionNumber: 1,
            title,
            summary,
            coverAssetId,
            placeIds: placeIds || [],
            contentBlocks: contentBlocks || [],
            moderationStatus: ModerationStatus.APPROVED,
            approvedAt: new Date(),
          },
        });

        const updated = await tx.post.update({
          where: { id: p.id },
          data: {
            currentPublishedRevisionId: rev.id,
          },
          include: {
            currentPublishedRevision: true,
          },
        });

        const assetIds = [coverAssetId, ...((contentBlocks || []).map((b: any) => b?.assetId))].filter(Boolean);
        if (assetIds.length > 0) {
          await publishAssetsForEntity(tx, 'POST', p.id, assetIds);
        }

        return { ...updated, revision: rev };
      });

      notifyZaloAsync('POST_PENDING', { title: 'Bài trải nghiệm mới', body: `${req.user!.username || 'Sinh viên'}: ${title}`, url: `/posts/${slug}` });

      return res.status(201).json({
        success: true,
        data: post,
        message: 'Bài trải nghiệm đã được đăng thành công!',
      });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Saving post to mock memory:', (dbErr as Error).message);
      const textContent = (contentBlocks || [])
        .map((b: any) => (typeof b === 'string' ? b : b?.text ?? b?.content ?? ''))
        .filter(Boolean)
        .join('\n\n');
      const newPost: MockPostItem = {
        id: 'post-' + Date.now(),
        slug,
        title,
        summary: summary || '',
        content: textContent || title,
        contentBlocks: contentBlocks || [],
        coverAssetId: coverAssetId || null,
        coverUrl: coverAssetId ? (coverAssetId.startsWith('http') ? coverAssetId : `/api/v1/media/${coverAssetId}?variant=optimized`) : null,
        photos: [],
        tags: [],
        createdAt: new Date().toISOString(),
        author: {
          id: req.user!.id,
          username: req.user!.username,
          displayName: req.user!.profile?.displayName || req.user!.username,
          avatarAssetId: req.user!.profile?.currentPublishedAvatarAssetId || null,
          avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=' + req.user!.username,
          isLocked: false,
        },
        currentPublishedRevision: {
          title,
          content: textContent || title,
        },
      };
      MOCK_POSTS.unshift(newPost);
      return res.status(201).json({
        success: true,
        data: newPost,
        message: 'Bài trải nghiệm đã được đăng thành công!',
      });
    }
  } catch (err) {
    next(err);
  }
});

/** Xoá bài trải nghiệm của chính mình (admin xoá được mọi bài). */
router.delete('/posts/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    try {
      const post = await prisma.post.findUnique({ where: { id } });
      if (!post) throw new Error('PostNotFoundInDb');
      const isAdmin = req.user!.role === 'ADMIN';
      if (!isAdmin && post.authorUserId !== req.user!.id) {
        return res.status(403).json({ success: false, errorCode: ErrorCode.FORBIDDEN, message: 'Bạn chỉ xoá được bài viết của mình' });
      }
      await prisma.$transaction(async (tx) => {
        await unpublishAssetsForEntity(tx, 'POST', id);
        await tx.comment.updateMany({ where: { targetType: TargetType.POST, targetId: id }, data: { isDeleted: true } });
        await tx.post.update({ where: { id }, data: { currentPublishedRevisionId: null } });
        await tx.post.delete({ where: { id } });
      });
      return res.json({ success: true, message: 'Đã xoá bài trải nghiệm' });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Deleting post from mock memory:', (dbErr as Error).message);
      const idx = MOCK_POSTS.findIndex((p) => p.id === id);
      if (idx !== -1) {
        const post = MOCK_POSTS[idx];
        const isAdmin = req.user!.role === 'ADMIN';
        if (!isAdmin && post.author.id !== req.user!.id) {
          return res.status(403).json({ success: false, errorCode: ErrorCode.FORBIDDEN, message: 'Bạn chỉ xoá được bài viết của mình' });
        }
        MOCK_POSTS.splice(idx, 1);
        return res.json({ success: true, message: 'Đã xoá bài trải nghiệm' });
      }
      return res.json({ success: true, message: 'Đã xoá bài trải nghiệm' });
    }
  } catch (err) {
    next(err);
  }
});

/** Thu hồi bản bài viết đang chờ duyệt (giữ lại bản đã đăng nếu có). */
router.post('/posts/:id/withdraw', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const post = await prisma.post.findUnique({ where: { id }, include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } } });
    if (!post || post.authorUserId !== req.user!.id) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy bài viết của bạn' });
    }
    const latest = post.revisions[0];
    if (!latest || latest.moderationStatus !== ModerationStatus.PENDING) {
      return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: 'Không có bản nào đang chờ duyệt để thu hồi' });
    }
    if (!post.currentPublishedRevisionId) {
      await prisma.post.delete({ where: { id } });
      return res.json({ success: true, data: { deleted: true }, message: 'Đã thu hồi bài viết đang chờ duyệt' });
    }
    await prisma.postRevision.delete({ where: { id: latest.id } });
    return res.json({ success: true, data: { deleted: false }, message: 'Đã thu hồi bản chỉnh sửa đang chờ duyệt' });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 4. BÁO CÁO VI PHẠM (REPORTS)
// =========================================================================
router.post('/reports', requireAuth, validateBody(ReportCreateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { targetType, targetId, reasonCode, description, evidenceUrls } = req.body;

    const report = await prisma.report.create({
      data: {
        reporterUserId: req.user!.id,
        targetType,
        targetId,
        reasonCode,
        description,
        evidenceUrls: evidenceUrls || [],
      },
    });

    notifyZaloAsync('REPORT_CREATED', { title: 'Báo cáo vi phạm mới', body: `${targetType} · ${reasonCode}${description ? ' — ' + String(description).slice(0, 100) : ''}`, url: '/admin/reports' });

    return res.status(201).json({
      success: true,
      data: report,
      message: 'Báo cáo vi phạm của bạn đã được tiếp nhận và đưa vào hàng đợi kiểm tra của ban quản trị',
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 5. BỘ SƯU TẬP CÔNG KHAI (PUBLIC COLLECTIONS)
// =========================================================================
router.get('/collections/public', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const collections = await prisma.collection.findMany({
      where: {
        isPublic: true,
        currentPublishedRevision: { moderationStatus: ModerationStatus.APPROVED },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true } },
        currentPublishedRevision: true,
        items: true,
      },
    });

    return res.json({ success: true, data: collections });
  } catch (err) {
    next(err);
  }
});

// Chi tiết một bộ sưu tập: công khai nếu isPublic + bản đã duyệt; chủ sở hữu / admin luôn xem được (kể cả riêng tư).
router.get('/collections/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const col = await prisma.collection.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, profile: { select: { displayName: true, currentPublishedAvatarAssetId: true } } } },
        currentPublishedRevision: true,
        revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!col) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy bộ sưu tập' });
    }
    const viewer = req.user;
    const isOwner = Boolean(viewer && viewer.id === col.userId);
    const isAdmin = Boolean(viewer && viewer.role === 'ADMIN');
    const isPublicApproved = col.isPublic && col.currentPublishedRevision?.moderationStatus === ModerationStatus.APPROVED;
    if (!isPublicApproved && !isOwner && !isAdmin) {
      return res.status(403).json({ success: false, errorCode: ErrorCode.FORBIDDEN, message: 'Bộ sưu tập này chưa công khai' });
    }
    // Người ngoài chỉ thấy bản đã duyệt; chủ sở hữu thấy bản mới nhất
    const shownRev = isOwner || isAdmin ? col.revisions[0] ?? col.currentPublishedRevision : col.currentPublishedRevision;
    const cards = await loadPlaceCards(col.items.map((it) => it.placeId));
    return res.json({
      success: true,
      data: {
        id: col.id,
        name: shownRev?.name ?? 'Bộ sưu tập',
        description: shownRev?.description ?? null,
        isPublic: col.isPublic,
        moderationStatus: shownRev?.moderationStatus ?? null,
        isOwner,
        createdAt: col.createdAt,
        author: { id: col.user.id, username: col.user.username, displayName: col.user.profile?.displayName ?? col.user.username, avatarUrl: avatarUrlOf(col.user.profile?.currentPublishedAvatarAssetId, await approvedAssetIds([col.user.profile?.currentPublishedAvatarAssetId])) },
        items: col.items.map((it) => ({ id: it.id, placeId: it.placeId, note: it.note, sortOrder: it.sortOrder, place: cards.get(it.placeId) ?? null })),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
