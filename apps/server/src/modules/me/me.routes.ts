import { loadPlaceCards } from '../../lib/place-card.js';
import { publishAssetsForEntity } from '../../lib/asset-usage.js';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { disconnectUserSockets } from '../../socket/index.js';
import { ErrorCode, ModerationStatus } from '@ssg/shared';

const router = Router();
router.use(requireAuth);

// 1. Lấy danh sách bộ sưu tập của chính mình
// Gắn thông tin quán (tên, ảnh bìa, địa chỉ...) vào từng item của bộ sưu tập — CollectionItem chỉ lưu placeId
async function withPlaceCards<T extends { items: Array<{ placeId: string }> }>(cols: T[]) {
  const cards = await loadPlaceCards(cols.flatMap((c) => c.items.map((it) => it.placeId)));
  return cols.map((c) => ({
    ...c,
    // Tên/mô tả lấy từ bản revision mới nhất để giao diện không phải tự đào
    name: (c as any).currentPublishedRevision?.name ?? (c as any).name ?? null,
    description: (c as any).currentPublishedRevision?.description ?? (c as any).description ?? null,
    items: c.items.map((it) => ({ ...it, place: cards.get(it.placeId) ?? null })),
  }));
}

router.get('/collections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const collections = await prisma.collection.findMany({
      where: { userId: req.user!.id },
      include: {
        currentPublishedRevision: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: await withPlaceCards(collections) });
  } catch (err) {
    next(err);
  }
});

// 2. Tạo bộ sưu tập mới (Nếu public -> Cần kiểm duyệt)
const CreateCollectionSchema = z.object({
  name: z.string().min(1, 'Tên bộ sưu tập không được để trống').max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(false),
});

router.post('/collections', validateBody(CreateCollectionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, isPublic } = req.body;

    const collection = await prisma.$transaction(async (tx) => {
      const col = await tx.collection.create({
        data: {
          userId: req.user!.id,
          isPublic,
        },
      });

      const rev = await tx.collectionRevision.create({
        data: {
          collectionId: col.id,
          revisionNumber: 1,
          name,
          description,
          moderationStatus: isPublic ? ModerationStatus.PENDING : ModerationStatus.APPROVED,
          approvedAt: isPublic ? null : new Date(),
        },
      });

      if (!isPublic) {
        // Bộ sưu tập riêng tư thì không cần duyệt, kích hoạt ngay
        await tx.collection.update({
          where: { id: col.id },
          data: { currentPublishedRevisionId: rev.id },
        });
      }

      return { ...col, revision: rev };
    });

    return res.status(201).json({ success: true, data: collection });
  } catch (err) {
    next(err);
  }
});

// 3. Xem chi tiết bộ sưu tập (Chống IDOR: Không phải chủ sở hữu và không public -> 403)
router.get('/collections/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const collectionId = req.params.id as string;
    const col = await prisma.collection.findUnique({
      where: { id: collectionId },
      include: {
        currentPublishedRevision: true,
        items: true,
      },
    });

    if (!col) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy bộ sưu tập',
      });
    }

    // CHỐNG IDOR: Nếu bộ sưu tập riêng tư và người gọi không phải chủ sở hữu -> Chặn 403
    if (!col.isPublic && col.userId !== req.user!.id && req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Bạn không có quyền truy cập vào bộ sưu tập riêng tư của người dùng khác',
      });
    }

    const [withCards] = await withPlaceCards([col]);
    return res.json({ success: true, data: withCards });
  } catch (err) {
    next(err);
  }
});

// 4. Sửa bộ sưu tập (Chống IDOR: Chỉ chủ sở hữu mới có quyền sửa)
const UpdateCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

router.patch('/collections/:id', validateBody(UpdateCollectionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const collectionId = req.params.id as string;
    const { name, description } = req.body;

    const col = await prisma.collection.findUnique({
      where: { id: collectionId },
    });

    if (!col) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy bộ sưu tập',
      });
    }

    // CHỐNG IDOR: Chỉ chủ sở hữu mới được sửa
    if (col.userId !== req.user!.id) {
      return res.status(403).json({
        success: false,
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Bạn không có quyền chỉnh sửa bộ sưu tập của người dùng khác',
      });
    }

    const updatedRev = await prisma.collectionRevision.create({
      data: {
        collectionId: col.id,
        revisionNumber: (await prisma.collectionRevision.count({ where: { collectionId: col.id } })) + 1,
        name,
        description,
        moderationStatus: col.isPublic ? ModerationStatus.PENDING : ModerationStatus.APPROVED,
        approvedAt: col.isPublic ? null : new Date(),
      },
    });

    if (!col.isPublic) {
      await prisma.collection.update({
        where: { id: col.id },
        data: { currentPublishedRevisionId: updatedRev.id },
      });
    }

    return res.json({
      success: true,
      data: {
        id: col.id,
        message: col.isPublic
          ? 'Đã gửi bản cập nhật bộ sưu tập vào hàng đợi duyệt'
          : 'Đã cập nhật bộ sưu tập riêng tư thành công',
      },
    });
  } catch (err) {
    next(err);
  }
});

// 5. Thêm quán vào bộ sưu tập
const AddCollectionItemSchema = z.object({
  placeId: z.string().min(1),
  note: z.string().max(200).optional(),
});

router.post('/collections/:id/items', validateBody(AddCollectionItemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const collectionId = req.params.id as string;
    const { placeId, note } = req.body;

    const col = await prisma.collection.findUnique({ where: { id: collectionId } });
    if (!col || col.userId !== req.user!.id) {
      return res.status(403).json({ success: false, errorCode: ErrorCode.FORBIDDEN, message: 'Bạn không có quyền sửa bộ sưu tập này' });
    }

    // Không thêm trùng quán; quán phải tồn tại và đã xuất bản
    const place = await prisma.place.findUnique({ where: { id: placeId }, select: { id: true, currentPublishedRevisionId: true } });
    if (!place || !place.currentPublishedRevisionId) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Quán không tồn tại hoặc chưa được công khai' });
    }
    const existing = await prisma.collectionItem.findFirst({ where: { collectionId, placeId } });
    if (existing) {
      return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: 'Quán này đã có trong bộ sưu tập' });
    }

    const item = await prisma.collectionItem.create({
      data: {
        collectionId,
        placeId,
        note,
        sortOrder: (await prisma.collectionItem.count({ where: { collectionId } })) + 1,
      },
    });

    return res.status(201).json({ success: true, data: item, message: 'Đã thêm quán vào bộ sưu tập' });
  } catch (err) {
    next(err);
  }
});

// Xóa quán khỏi bộ sưu tập
router.delete('/collections/:id/items/:placeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const collectionId = req.params.id as string;
    const placeId = req.params.placeId as string;

    const col = await prisma.collection.findUnique({ where: { id: collectionId } });
    if (!col || col.userId !== req.user!.id) {
      return res.status(403).json({ success: false, errorCode: ErrorCode.FORBIDDEN, message: 'Bạn không có quyền sửa bộ sưu tập này' });
    }

    await prisma.collectionItem.deleteMany({
      where: { collectionId, placeId },
    });

    return res.json({ success: true, message: 'Đã xóa quán khỏi bộ sưu tập' });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 6. YÊU THÍCH QUÁN (FAVORITES)
// =========================================================================
/** Xoá bộ sưu tập của chính mình (kèm các mục bên trong và ảnh bìa đã công khai). */
router.delete('/collections/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const collection = await prisma.collection.findUnique({ where: { id } });
    if (!collection || collection.userId !== req.user!.id) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy bộ sưu tập của bạn' });
    }
    // Bộ sưu tập chưa có ảnh công khai riêng (TargetType không có COLLECTION) -> chỉ cần gỡ liên kết bản duyệt rồi xoá
    await prisma.$transaction(async (tx) => {
      await tx.collection.update({ where: { id }, data: { currentPublishedRevisionId: null } });
      await tx.collection.delete({ where: { id } });
    });
    return res.json({ success: true, message: 'Đã xoá bộ sưu tập' });
  } catch (err) {
    next(err);
  }
});

router.get('/favorites', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const favorites = await prisma.placeFavorite.findMany({
      where: { userId: req.user!.id },
      include: {
        place: {
          include: {
            category: true,
            currentPublishedRevision: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const cards = await loadPlaceCards(favorites.map((f) => f.placeId));
    const formatted = favorites.map((f) => {
      const card = cards.get(f.placeId);
      return {
        placeId: f.placeId,
        slug: f.place.slug,
        name: card?.name || f.place.defaultName,
        category: f.place.category.name,
        address: card?.address ?? null,
        coverPhoto: card?.coverPhoto ?? null,
        ratingOverall: card?.ratingOverall ?? 0,
        reviewCount: card?.reviewCount ?? 0,
        priceMin: card?.priceMin ?? null,
        favoritedAt: f.createdAt,
        createdAt: f.createdAt,
      };
    });

    return res.json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
});

router.post('/favorites/:placeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const placeId = req.params.placeId as string;
    const userId = req.user!.id;

    const existing = await prisma.placeFavorite.findUnique({
      where: { userId_placeId: { userId, placeId } },
    });

    if (existing) {
      await prisma.placeFavorite.delete({
        where: { userId_placeId: { userId, placeId } },
      });
      return res.json({ success: true, isFavorited: false, message: 'Đã xóa quán khỏi danh sách yêu thích' });
    } else {
      await prisma.placeFavorite.create({
        data: { userId, placeId },
      });
      return res.json({ success: true, isFavorited: true, message: 'Đã thêm quán vào danh sách yêu thích' });
    }
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 7. THEO DÕI ĐÓNG GÓP CỦA SINH VIÊN (MY CONTRIBUTIONS TRACKING)
// =========================================================================
router.get('/contributions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [suggestions, myPosts, surveyRequests, changeRequests] = await Promise.all([
      prisma.placeSuggestion.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: 'desc' },
      }),
      // Bài trải nghiệm của chính user, kể cả bản đang chờ duyệt (lấy revision mới nhất để biết trạng thái)
      prisma.post.findMany({
        where: { authorUserId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 }, currentPublishedRevision: { select: { id: true, title: true, moderationStatus: true } } },
      }),
      prisma.surveyRequest.findMany({
        where: { userId: req.user!.id },
        include: { place: { select: { id: true, defaultName: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.placeChangeRequest.findMany({
        where: { userId: req.user!.id },
        include: { place: { select: { id: true, defaultName: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return res.json({
      success: true,
      data: {
        suggestions,
        surveyRequests,
        changeRequests,
        posts: myPosts.map((p) => {
          const latest = p.revisions[0];
          return {
            id: p.id,
            slug: p.slug,
            title: latest?.title ?? p.currentPublishedRevision?.title ?? '',
            status: latest?.moderationStatus ?? 'PENDING',
            reviewerNote: latest?.reviewerNote ?? null,
            isPublished: Boolean(p.currentPublishedRevisionId),
            createdAt: p.createdAt,
            currentPublishedRevision: p.currentPublishedRevision,
          };
        }),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Chỉnh sửa & gửi lại đề xuất quán khi cần bổ sung thông tin (Resubmit suggestion)
const UpdateSuggestionSchema = z.object({
  proposedName: z.string().min(1).max(100).optional(),
  addressDescription: z.string().max(200).optional(),
  initialData: z.any().optional(),
});

router.put('/contributions/suggestions/:id', validateBody(UpdateSuggestionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { proposedName, addressDescription, initialData } = req.body;

    const suggestion = await prisma.placeSuggestion.findUnique({ where: { id } });
    if (!suggestion || suggestion.userId !== req.user!.id) {
      return res.status(403).json({ success: false, errorCode: ErrorCode.FORBIDDEN, message: 'Bạn không có quyền sửa đề xuất này' });
    }

    const updated = await prisma.placeSuggestion.update({
      where: { id },
      data: {
        proposedName: proposedName || suggestion.proposedName,
        addressDescription: addressDescription || suggestion.addressDescription,
        initialData: initialData || suggestion.initialData,
        status: ModerationStatus.PENDING, // Gửi lại vào hàng đợi duyệt
      },
    });

    return res.json({
      success: true,
      data: updated,
      message: 'Đã cập nhật và gửi lại đề xuất quán vào hàng đợi kiểm duyệt',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Thu hồi đề xuất quán của chính mình khi chưa được duyệt.
 * Đã duyệt (đã thành quán công khai) thì không xoá được — phải nhờ admin gỡ quán.
 */
router.delete('/contributions/suggestions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const suggestion = await prisma.placeSuggestion.findUnique({ where: { id } });
    if (!suggestion || suggestion.userId !== req.user!.id) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy đề xuất của bạn' });
    }
    if (suggestion.status === ModerationStatus.APPROVED) {
      return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: 'Đề xuất đã được duyệt thành quán công khai — liên hệ ban quản trị nếu cần gỡ' });
    }
    await prisma.placeSuggestion.delete({ where: { id } });
    return res.json({ success: true, message: 'Đã thu hồi đề xuất quán' });
  } catch (err) {
    next(err);
  }
});

/** Thu hồi yêu cầu khảo sát / báo sai thông tin khi chưa xử lý. */
router.delete('/contributions/survey-requests/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const item = await prisma.surveyRequest.findUnique({ where: { id } });
    if (!item || item.userId !== req.user!.id) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy yêu cầu của bạn' });
    }
    if (item.status === ModerationStatus.APPROVED) {
      return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: 'Yêu cầu đã được xử lý' });
    }
    await prisma.surveyRequest.delete({ where: { id } });
    return res.json({ success: true, message: 'Đã thu hồi yêu cầu khảo sát' });
  } catch (err) {
    next(err);
  }
});

/** Thu hồi đề nghị sửa thông tin quán khi chưa xử lý. */
router.delete('/contributions/change-requests/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const item = await prisma.placeChangeRequest.findUnique({ where: { id } });
    if (!item || item.userId !== req.user!.id) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy đề nghị của bạn' });
    }
    if (item.status === ModerationStatus.APPROVED) {
      return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: 'Đề nghị đã được xử lý' });
    }
    await prisma.placeChangeRequest.delete({ where: { id } });
    return res.json({ success: true, message: 'Đã thu hồi đề nghị sửa thông tin' });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 7b. HỒ SƠ CÁ NHÂN: XEM & CẬP NHẬT (tên hiển thị, giới thiệu, ảnh đại diện, trường)
// Ảnh đại diện được công khai ngay (giống mạng xã hội); admin vẫn có thể thu hồi ở trang Kiểm duyệt ảnh.
// =========================================================================
const UpdateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(60).optional(),
  bio: z.string().trim().max(300).nullable().optional(),
  avatarAssetId: z.string().uuid().nullable().optional(),
  coverAssetId: z.string().uuid().nullable().optional(),
  universityCampusId: z.string().uuid().nullable().optional(),
  /** Trường không có trong danh sách: sinh viên tự ghi (khi có giá trị thì bỏ universityCampusId) */
  customUniversityName: z.string().trim().max(120).nullable().optional(),
  isUniversityPublic: z.boolean().optional(),
});

// Chính chủ luôn xem được ảnh của mình kể cả khi đang chờ duyệt -> preview=true
const avatarUrlOf = (assetId: string | null | undefined) => (assetId ? `/api/v1/media/${assetId}?variant=thumb&preview=true` : null);
const coverUrlOf = (assetId: string | null | undefined) => (assetId ? `/api/v1/media/${assetId}?variant=optimized&preview=true` : null);

/** Trạng thái duyệt của ảnh để báo cho chính chủ biết "đang chờ duyệt". */
async function assetModeration(assetId: string | null | undefined) {
  if (!assetId) return null;
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { moderationStatus: true } });
  return asset?.moderationStatus ?? null;
}

/** Ảnh phải do chính người dùng tải lên và đã xử lý xong. Trả về thông báo lỗi hoặc null. */
async function checkOwnAsset(assetId: string, userId: string, label: string): Promise<{ status: number; message: string } | null> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { uploaderId: true, technicalStatus: true } });
  if (!asset || asset.uploaderId !== userId) return { status: 404, message: `${label} không tồn tại hoặc không thuộc về bạn` };
  if (asset.technicalStatus !== 'READY') return { status: 422, message: 'Ảnh chưa xử lý xong, thử lại sau vài giây' };
  return null;
}

router.get('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await prisma.userProfile.findUnique({ where: { userId: req.user!.id } });
    const campus = profile?.universityCampusId
      ? await prisma.campus.findUnique({ where: { id: profile.universityCampusId }, select: { id: true, name: true, universityName: true } })
      : null;
    return res.json({
      success: true,
      data: {
        displayName: profile?.displayName ?? req.user!.username,
        bio: profile?.currentPublishedBio ?? null,
        avatarAssetId: profile?.currentPublishedAvatarAssetId ?? null,
        avatarUrl: avatarUrlOf(profile?.currentPublishedAvatarAssetId),
        coverAssetId: profile?.currentPublishedCoverAssetId ?? null,
        coverUrl: coverUrlOf(profile?.currentPublishedCoverAssetId),
        avatarModerationStatus: await assetModeration(profile?.currentPublishedAvatarAssetId),
        coverModerationStatus: await assetModeration(profile?.currentPublishedCoverAssetId),
        universityCampusId: profile?.universityCampusId ?? null,
        campus,
        customUniversityName: profile?.customUniversityName ?? null,
        isUniversityPublic: profile?.isUniversityPublic ?? true,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/profile', validateBody(UpdateProfileSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as z.infer<typeof UpdateProfileSchema>;
    const userId = req.user!.id;

    for (const [id, label] of [
      [body.avatarAssetId, 'Ảnh đại diện'],
      [body.coverAssetId, 'Ảnh bìa'],
    ] as const) {
      if (!id) continue;
      const err = await checkOwnAsset(id, userId, label);
      if (err) return res.status(err.status).json({ success: false, errorCode: err.status === 404 ? ErrorCode.NOT_FOUND : ErrorCode.VALIDATION_ERROR, message: err.message });
    }
    if (body.universityCampusId) {
      const campus = await prisma.campus.findUnique({ where: { id: body.universityCampusId }, select: { id: true } });
      if (!campus) return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Cơ sở trường không tồn tại' });
    }

    const data: Record<string, unknown> = {};
    if (body.displayName !== undefined) data.displayName = body.displayName;
    if (body.bio !== undefined) data.currentPublishedBio = body.bio || null;
    if (body.avatarAssetId !== undefined) data.currentPublishedAvatarAssetId = body.avatarAssetId;
    if (body.coverAssetId !== undefined) data.currentPublishedCoverAssetId = body.coverAssetId;
    if (body.universityCampusId !== undefined) data.universityCampusId = body.universityCampusId;
    if (body.customUniversityName !== undefined) data.customUniversityName = body.customUniversityName || null;
    // Chọn trường trong danh sách và tự ghi trường là hai lựa chọn loại trừ nhau
    if (body.universityCampusId) data.customUniversityName = null;
    else if (body.customUniversityName) data.universityCampusId = null;
    if (body.isUniversityPublic !== undefined) data.isUniversityPublic = body.isUniversityPublic;

    const profile = await prisma.$transaction(async (tx) => {
      const p = await tx.userProfile.upsert({
        where: { userId },
        create: { userId, displayName: body.displayName || req.user!.username, ...data },
        update: data,
      });
      if (body.avatarAssetId !== undefined || body.bio !== undefined) {
        await tx.userProfileRevision.create({
          data: {
            userProfileId: p.id,
            pendingAvatarAssetId: body.avatarAssetId ?? null,
            pendingBio: body.bio ?? null,
            moderationStatus: ModerationStatus.APPROVED,
            approvedAt: new Date(),
          },
        });
      }
      // Ảnh đại diện + ảnh bìa cùng thuộc thực thể USER: phải công bố cả hai cùng lúc (hàm sẽ gỡ ảnh không còn trong danh sách)
      if (body.avatarAssetId !== undefined || body.coverAssetId !== undefined) {
        // autoApprove = false: ảnh mới phải được duyệt ở "Thư viện ảnh" thì người khác mới thấy (chính chủ vẫn xem được)
        await publishAssetsForEntity(tx, 'USER', userId, [p.currentPublishedAvatarAssetId, p.currentPublishedCoverAssetId], false);
      }
      return p;
    });

    return res.json({
      success: true,
      data: {
        displayName: profile.displayName,
        bio: profile.currentPublishedBio,
        avatarAssetId: profile.currentPublishedAvatarAssetId,
        avatarUrl: avatarUrlOf(profile.currentPublishedAvatarAssetId),
        coverAssetId: profile.currentPublishedCoverAssetId,
        coverUrl: coverUrlOf(profile.currentPublishedCoverAssetId),
        universityCampusId: profile.universityCampusId,
        customUniversityName: profile.customUniversityName,
        isUniversityPublic: profile.isUniversityPublic,
      },
      message: 'Đã cập nhật hồ sơ',
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 7c. DÒNG THỜI GIAN CỦA CHÍNH CHỦ: đánh giá + bài viết (kể cả đang chờ duyệt / bị từ chối)
// =========================================================================
router.get('/timeline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const [reviews, posts] = await Promise.all([
      prisma.review.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
      }),
      prisma.post.findMany({
        where: { authorUserId: userId },
        orderBy: { createdAt: 'desc' },
        include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
      }),
    ]);
    const cards = await loadPlaceCards([
      ...reviews.map((r) => r.placeId),
      ...posts.flatMap((p) => (p.revisions[0]?.placeIds ?? []).slice(0, 1)),
    ]);
    // Chính chủ xem ảnh của mình qua preview=true (ảnh chưa duyệt vẫn hiện với người tải lên)
    const imageUrl = (assetId: string) => `/api/v1/media/${assetId}?variant=thumb&preview=true`;
    const items = [
      ...reviews.map((r) => {
        const rev = r.revisions[0];
        return {
          kind: 'review' as const,
          id: r.id,
          status: rev?.moderationStatus ?? 'PENDING',
          reviewerNote: rev?.reviewerNote ?? null,
          ratingOverall: rev?.ratingOverall ?? r.ratingOverall,
          content: rev?.content ?? '',
          visitDate: rev?.visitDate ?? null,
          photos: (rev?.attachedAssetIds ?? []).map((id) => ({ assetId: id, url: imageUrl(id) })),
          place: cards.get(r.placeId) ?? null,
          createdAt: rev?.createdAt ?? r.createdAt,
        };
      }),
      ...posts.map((p) => {
        const rev = p.revisions[0];
        const blocks: any[] = Array.isArray(rev?.contentBlocks) ? (rev!.contentBlocks as any[]) : [];
        const photoIds = [rev?.coverAssetId, ...blocks.map((b) => b?.assetId)].filter((x): x is string => typeof x === 'string');
        return {
          kind: 'post' as const,
          id: p.id,
          slug: p.slug,
          status: rev?.moderationStatus ?? 'PENDING',
          reviewerNote: rev?.reviewerNote ?? null,
          title: rev?.title ?? '',
          summary: rev?.summary ?? '',
          content: blocks.map((b) => (typeof b === 'string' ? b : b?.text ?? '')).filter(Boolean).join('\n\n'),
          photos: Array.from(new Set(photoIds)).map((id) => ({ assetId: id, url: imageUrl(id) })),
          place: rev?.placeIds?.[0] ? cards.get(rev.placeIds[0]) ?? null : null,
          createdAt: rev?.createdAt ?? p.createdAt,
        };
      }),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 8. TỰ XÓA TÀI KHOẢN (ACCOUNT DELETION & ANONYMIZATION)
// =========================================================================
router.post('/delete-account', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    await prisma.$transaction(async (tx) => {
      // 1. Cập nhật hồ sơ thành vô danh
      await tx.userProfile.updateMany({
        where: { userId },
        data: {
          displayName: 'Người dùng đã rời đi',
          currentPublishedBio: null,
          currentPublishedAvatarAssetId: null,
        },
      });

      // 2. Ẩn danh hóa thông tin User và khóa tài khoản
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted_${userId}@ssg.internal`,
          username: `deleted_${userId.slice(0, 8)}_${Date.now()}`,
          isLocked: true,
        },
      });

      // 3. Xóa các phiên đăng nhập & token
      await tx.session.deleteMany({ where: { userId } });
      await tx.authToken.deleteMany({ where: { userId } });

      // 4. Dọn dẹp dữ liệu riêng tư (thông báo, yêu thích, bộ sưu tập riêng tư)
      await tx.notification.deleteMany({ where: { userId } });
      await tx.placeFavorite.deleteMany({ where: { userId } });
      await tx.collection.deleteMany({ where: { userId, isPublic: false } });
    });

    // 5. Ngắt toàn bộ kết nối WebSocket tức thì
    disconnectUserSockets(userId);

    // 6. Xóa cookie phiên
    res.clearCookie('ssg_session', { path: '/' });

    return res.json({
      success: true,
      message: 'Tài khoản của bạn đã được xóa và ẩn danh hóa thành công.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;

