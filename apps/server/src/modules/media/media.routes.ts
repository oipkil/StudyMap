import { writeAudit } from '../../lib/audit.js';
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notifyZaloAsync } from '../integrations/zalo.service.js';
import { requireAuth, requireRole } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { QUARANTINE_DIR, detectRealMimeType, computeFileHash, resolveStoredFile } from './media.storage.js';
import { processAsset, cropAssetRevision } from './media.processor.js';
import { enqueueMediaProcessing } from '../../worker/media.queue.js';
import { ErrorCode, ModerationStatus, TechnicalStatus } from '@ssg/shared';
import { VariantType } from '@prisma/client';

const router = Router();

// Cấu hình Multer upload vào quarantine
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, QUARANTINE_DIR);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `upload-${uniqueSuffix}${ext}`);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // Hạn mức 10MB
  },
});

// =========================================================================
// 1. TẢI ẢNH LÊN KHO CÁ NHÂN (LƯU CÁCH LY & KIỂM TRA MAGIC BYTES)
// =========================================================================
router.post('/upload', requireAuth, upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Vui lòng cung cấp file ảnh tải lên',
      });
    }

    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);

    // Kiểm tra định dạng thực tế bằng Magic Bytes (Chống giả mạo đuôi file)
    const detected = detectRealMimeType(fileBuffer);
    if (!detected) {
      fs.unlinkSync(filePath); // Xóa file không hợp lệ
      return res.status(400).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Định dạng file không được hỗ trợ hoặc file bị hỏng. Chỉ chấp nhận JPEG, PNG, GIF, WebP.',
      });
    }

    const fileHash = computeFileHash(fileBuffer);

    // Tạo bản ghi Asset với trạng thái PROCESSING
    const asset = await prisma.asset.create({
      data: {
        uploaderId: req.user!.id,
        originalName: req.file.originalname,
        mimeType: detected.mime,
        byteSize: req.file.size,
        fileHash,
        quarantineKey: filePath,
        technicalStatus: TechnicalStatus.PROCESSING,
        moderationStatus: ModerationStatus.PENDING,
      },
    });

    // Nếu trong môi trường test, xử lý đồng bộ để đảm bảo kết quả tất định
    if (process.env.NODE_ENV === 'test') {
      try {
        await processAsset(asset.id);
      } catch {
        const failedAsset = await prisma.asset.findUnique({
          where: { id: asset.id },
        });
        return res.status(400).json({
          success: false,
          errorCode: ErrorCode.VALIDATION_ERROR,
          message: 'Tệp ảnh bị hỏng cấu trúc hoặc không thể giải mã',
          data: failedAsset,
        });
      }
    } else if (process.env.MEDIA_WORKER_MODE === 'queue') {
      // Production: đẩy vào BullMQ worker (chạy riêng: pnpm --filter @ssg/server worker); Redis lỗi thì xử lý đồng bộ
      try {
        await enqueueMediaProcessing(asset.id);
      } catch {
        await processAsset(asset.id);
      }
    } else {
      // Dev mặc định: xử lý ngay trong API để không cần bật worker riêng (ảnh treo PROCESSING mãi nếu quên bật)
      try {
        await processAsset(asset.id);
      } catch (err) {
        console.error('Xử lý ảnh thất bại', asset.id, (err as Error).message);
      }
    }

    // Admin tự tải ảnh lên (ảnh quán, banner...) thì không phải tự duyệt ảnh của chính mình
    if (req.user!.role === 'ADMIN') {
      await prisma.$transaction(async (tx) => {
        await tx.asset.update({ where: { id: asset.id }, data: { moderationStatus: ModerationStatus.APPROVED } });
        await tx.assetRevision.updateMany({ where: { assetId: asset.id }, data: { moderationStatus: ModerationStatus.APPROVED } });
      });
    } else {
      notifyZaloAsync('MEDIA_PENDING', { title: 'Ảnh mới chờ duyệt', body: `${req.user!.username || req.user!.id} vừa tải lên "${req.file.originalname}"`, url: '/admin/media' });
    }

    const updatedAsset = await prisma.asset.findUnique({
      where: { id: asset.id },
      include: { currentRevision: { include: { variants: true } } },
    });

    return res.status(201).json({
      success: true,
      data: updatedAsset,
      message: 'Ảnh đã được tải lên cách ly và đưa vào pipeline xử lý tối ưu',
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 2. DANH SÁCH ẢNH CỦA TÔI (CÓ PHÂN TRANG & BẢO VỆ RIÊNG TƯ)
// =========================================================================
router.get('/my', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.max(1, Math.min(50, parseInt((req.query.limit as string) || '20', 10)));
    const skip = (page - 1) * limit;
    const status = req.query.status as ModerationStatus | undefined;

    const where: any = { uploaderId: req.user!.id };
    if (status) {
      where.moderationStatus = status;
    }

    const [total, assets] = await Promise.all([
      prisma.asset.count({ where }),
      prisma.asset.findMany({
        where,
        include: {
          currentRevision: { include: { variants: true } },
          revisions: { include: { variants: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return res.json({
      success: true,
      data: {
        total,
        page,
        limit,
        assets,
      },
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 3. CẮT ẢNH BẢO TOÀN CHUYỂN ĐỘNG & TẠO PHIÊN BẢN MỚI (CROP PIPELINE)
// =========================================================================
const CropSchema = z.object({
  left: z.number().nonnegative(),
  top: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
});

router.post('/:assetId/crop', requireAuth, validateBody(CropSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assetId = req.params.assetId as string;
    const crop = req.body;

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy ảnh',
      });
    }

    // Chỉ người sở hữu hoặc Admin mới có quyền crop
    if (asset.uploaderId !== req.user!.id && req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Bạn không có quyền chỉnh sửa ảnh này',
      });
    }

    const { revision, metadata } = await cropAssetRevision(assetId, crop);

    return res.status(201).json({
      success: true,
      data: {
        revision,
        verification: {
          isAnimated: asset.isAnimated,
          frameCount: metadata.pages || 1,
          delays: metadata.delay,
          loop: metadata.loop,
        },
        message: 'Đã tạo phiên bản ảnh cắt mới bảo toàn toàn bộ khung hình và thuộc tính chuyển động',
      },
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 4. KIỂM DUYỆT ẢNH & SOI TỪNG KHUNG HÌNH (ADMIN MODERATION & FRAMES)
// =========================================================================
const ModerateMediaSchema = z
  .object({
    action: z.enum(['APPROVE', 'REJECT', 'REVOKE']),
    reviewerNote: z.string().optional(),
  })
  // Từ chối / thu hồi phải có lý do; phê duyệt thì không bắt buộc
  .refine((v) => v.action === 'APPROVE' || (v.reviewerNote && v.reviewerNote.trim().length > 0), {
    message: 'Vui lòng cung cấp lý do khi từ chối hoặc thu hồi ảnh',
    path: ['reviewerNote'],
  });

/** Duyệt nhiều ảnh một lượt (hàng đợi ảnh đại diện / ảnh bìa thường nhiều và đơn giản). */
const ModerateBulkSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['APPROVE', 'REJECT', 'REVOKE']),
  reviewerNote: z.string().optional(),
});

router.get('/admin/list', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as ModerationStatus | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.max(1, Math.min(50, parseInt((req.query.limit as string) || '20', 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.moderationStatus = status;
    }
    // Nguồn ảnh: 'content' (mặc định) bỏ qua ảnh của bộ nhãn dán — nhãn dán duyệt ở trang "Bộ nhãn dán",
    // không bắt admin duyệt hai lần; 'sticker' xem riêng phần nhãn dán; 'all' xem tất cả.
    const source = (req.query.source as string) || 'content';
    if (source !== 'all') {
      const stickerAssetIds = (await prisma.stickerItem.findMany({ select: { assetId: true } })).map((it) => it.assetId);
      if (stickerAssetIds.length) where.id = source === 'sticker' ? { in: stickerAssetIds } : { notIn: stickerAssetIds };
      else if (source === 'sticker') where.id = { in: ['__none__'] };
    }

    const [total, assets] = await Promise.all([
      prisma.asset.count({ where }),
      prisma.asset.findMany({
        where,
        include: {
          currentRevision: { include: { variants: true } },
          revisions: { include: { variants: true, usages: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return res.json({
      success: true,
      data: {
        total,
        page,
        limit,
        assets,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * XOÁ ẢNH: chủ ảnh xoá ảnh của mình, admin xoá bất kỳ ảnh nào.
 * Xoá cả file trên ổ đĩa (bản gốc cách ly + mọi phiên bản + variant) rồi mới xoá bản ghi.
 * Chủ ảnh không xoá được ảnh đang công khai trong nội dung đã duyệt (phải xoá/thu hồi nội dung trước) — admin thì được.
 */
router.delete('/:assetId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assetId = req.params.assetId as string;
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { revisions: { include: { variants: true, usages: true } }, stickerItems: { select: { id: true } } },
    });
    if (!asset) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy ảnh' });
    }
    const isAdmin = req.user!.role === 'ADMIN';
    if (!isAdmin && asset.uploaderId !== req.user!.id) {
      return res.status(403).json({ success: false, errorCode: ErrorCode.FORBIDDEN, message: 'Ảnh này không thuộc về bạn' });
    }
    const publishedUsages = asset.revisions.flatMap((rev) => rev.usages.filter((u) => u.isPublished));
    if (!isAdmin && publishedUsages.length > 0) {
      return res.status(409).json({
        success: false,
        errorCode: ErrorCode.CONFLICT,
        message: 'Ảnh đang hiển thị trong nội dung đã duyệt. Hãy xoá/gỡ nội dung đó trước rồi xoá ảnh.',
        data: { usedIn: publishedUsages.map((u) => ({ entityType: u.entityType, entityId: u.entityId })) },
      });
    }
    if (asset.stickerItems.length > 0 && !isAdmin) {
      return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: 'Ảnh đang nằm trong bộ nhãn dán — không xoá trực tiếp được' });
    }

    const files = new Set<string>([asset.quarantineKey, asset.storageKey || '']);
    for (const rev of asset.revisions) {
      files.add(rev.storageKey);
      for (const v of rev.variants) files.add(v.storageKey);
    }
    // Gỡ liên kết ảnh đại diện / ảnh bìa nếu đang trỏ tới ảnh này
    await prisma.userProfile.updateMany({ where: { currentPublishedAvatarAssetId: assetId }, data: { currentPublishedAvatarAssetId: null } });
    await prisma.userProfile.updateMany({ where: { currentPublishedCoverAssetId: assetId }, data: { currentPublishedCoverAssetId: null } });
    await prisma.asset.update({ where: { id: assetId }, data: { currentRevisionId: null } });
    await prisma.asset.delete({ where: { id: assetId } });

    for (const f of files) {
      if (!f) continue;
      const resolved = resolveStoredFile(f);
      try {
        if (resolved) fs.unlinkSync(resolved);
      } catch {
        // File có thể đã bị dọn trước đó — không chặn việc xoá bản ghi
      }
    }

    if (isAdmin) {
      void writeAudit({ adminUserId: req.user!.id, action: 'DELETE_ASSET', targetEntity: 'Asset', targetId: assetId, details: { originalName: asset.originalName, uploaderId: asset.uploaderId }, ipAddress: req.ip });
    }
    return res.json({ success: true, message: 'Đã xoá ảnh khỏi kho và ổ đĩa' });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/moderate-bulk', requireAuth, requireRole('ADMIN'), validateBody(ModerateBulkSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { assetIds, action, reviewerNote } = req.body as { assetIds: string[]; action: 'APPROVE' | 'REJECT' | 'REVOKE'; reviewerNote?: string };
    const targetStatus = action === 'APPROVE' ? ModerationStatus.APPROVED : action === 'REJECT' ? ModerationStatus.REJECTED : ModerationStatus.REVOKED;
    await prisma.$transaction([
      prisma.asset.updateMany({ where: { id: { in: assetIds } }, data: { moderationStatus: targetStatus } }),
      prisma.assetRevision.updateMany({ where: { assetId: { in: assetIds } }, data: { moderationStatus: targetStatus } }),
    ]);
    void writeAudit({ adminUserId: req.user!.id, action: 'MODERATE_MEDIA_BULK_' + action, targetEntity: 'Asset', targetId: assetIds[0] ?? '-', details: { count: assetIds.length, reviewerNote: reviewerNote || null }, ipAddress: req.ip });
    return res.json({ success: true, data: { count: assetIds.length, status: targetStatus }, message: `Đã cập nhật ${assetIds.length} ảnh` });
  } catch (err) {
    next(err);
  }
});

// Admin lấy danh sách khung hình (Contact Sheet / Frame Scrubber với phân trang 30 frames/lượt)
router.get('/admin/:assetId/frames', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assetId = req.params.assetId as string;
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt((req.query.limit as string) || '30', 10)));

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy ảnh' });
    }

    const framesDir = path.join(path.resolve(process.cwd(), 'uploads/public'), `frames-${assetId}`);
    const manifestPath = path.join(framesDir, 'manifest.json');

    let allFrames: Array<{ frameIndex: number; delay: number }> = [];
    let loop = 0;
    let delays: number[] = [100];

    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      allFrames = manifest.frames || [];
      loop = manifest.loop || 0;
      delays = manifest.delays || [];
    } else {
      const count = asset.frameCount || 1;
      for (let i = 0; i < count; i++) {
        allFrames.push({ frameIndex: i, delay: 100 });
      }
    }

    const totalFrames = asset.frameCount || allFrames.length;
    const totalPages = Math.ceil(totalFrames / limit);
    const startIndex = (page - 1) * limit;
    const pagedFrames = allFrames.slice(startIndex, startIndex + limit);
    const isSample = totalFrames > limit;

    return res.json({
      success: true,
      data: {
        assetId,
        frameCount: totalFrames,
        page,
        limit,
        totalPages,
        isSample,
        loop,
        delays,
        frames: pagedFrames,
        allFrameIndices: allFrames.map((f) => f.frameIndex),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Admin tải về frame con cụ thể (bảo vệ phân quyền ADMIN, trích xuất on-demand nếu chưa có)
router.get('/admin/:assetId/frames/:frameIndex', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assetId = req.params.assetId as string;
    const frameIndex = parseInt(req.params.frameIndex as string, 10);

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Ảnh không tồn tại' });
    }

    if (frameIndex < 0 || frameIndex >= (asset.frameCount || 1)) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Khung hình vượt quá giới hạn animation' });
    }

    const framesDir = path.join(path.resolve(process.cwd(), 'uploads/public'), `frames-${assetId}`);
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
    const framePath = path.join(framesDir, `frame-${frameIndex}.webp`);

    if (!fs.existsSync(framePath)) {
      // Trích xuất on-demand từ source buffer
      const sourceFile = resolveStoredFile(asset.storageKey) || resolveStoredFile(asset.quarantineKey) || '';
      if (sourceFile && fs.existsSync(sourceFile)) {
        await sharp(fs.readFileSync(sourceFile), { animated: true, page: frameIndex })
          .webp({ quality: 75 })
          .toFile(framePath);
      } else {
        return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy file nguồn của ảnh' });
      }
    }

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, no-cache');
    return res.sendFile(path.resolve(framePath));
  } catch (err) {
    next(err);
  }
});

router.post('/admin/:assetId/moderate', requireAuth, requireRole('ADMIN'), validateBody(ModerateMediaSchema), async (req: Request, res: Response, next: NextFunction) => {
  res.on('finish', () => { if (res.statusCode < 300) void writeAudit({ adminUserId: req.user!.id, action: 'MODERATE_MEDIA_' + String(req.body?.action || '').toUpperCase(), targetEntity: 'Asset', targetId: String(req.params.assetId), details: { reviewerNote: req.body?.reviewerNote || null }, ipAddress: req.ip }); });
  try {
    const assetId = req.params.assetId as string;
    const { action, reviewerNote } = req.body;

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { revisions: true },
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy ảnh',
      });
    }

    let targetStatus: ModerationStatus = ModerationStatus.PENDING;
    if (action === 'APPROVE') targetStatus = ModerationStatus.APPROVED;
    if (action === 'REJECT') targetStatus = ModerationStatus.REJECTED;
    if (action === 'REVOKE') targetStatus = ModerationStatus.REVOKED;

    await prisma.$transaction(async (tx) => {
      await tx.asset.update({
        where: { id: assetId },
        data: { moderationStatus: targetStatus },
      });

      await tx.assetRevision.updateMany({
        where: { assetId },
        data: { moderationStatus: targetStatus },
      });
    });

    return res.json({
      success: true,
      message: action === 'REVOKE'
        ? 'Ảnh đã được thu hồi thành công. Tất cả các lượt truy cập mới qua Media Gateway sẽ bị chặn.'
        : `Đã cập nhật trạng thái ảnh thành: ${action}`,
      data: { assetId, status: targetStatus, reviewerNote },
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 5. MEDIA GATEWAY: PHỤC VỤ ẢNH & BẢO TOÀN PHIÊN BẢN (ACCESS CONTROL)
// =========================================================================

async function serveRevisionVariant(
  targetRev: any,
  asset: any,
  variantType: string,
  isPreview: boolean,
  reqUser: any,
  res: Response
) {
  // 1. KIỂM TRA THU HỒI: Nếu ảnh hoặc revision đã bị thu hồi -> CHẶN 403 NGAY LẬP TỨC
  if (asset.moderationStatus === ModerationStatus.REVOKED || targetRev.moderationStatus === ModerationStatus.REVOKED) {
    return res.status(403).json({
      success: false,
      errorCode: ErrorCode.FORBIDDEN,
      message: 'Ảnh đã bị thu hồi bởi quản trị viên hệ thống',
    });
  }

  const isOwner = reqUser && reqUser.id === asset.uploaderId;
  const isAdmin = reqUser && reqUser.role === 'ADMIN';

  // 2. PHÂN QUYỀN TRUY CẬP:
  if (isPreview && (isOwner || isAdmin)) {
    // Cho phép xem trước trong chế độ preview của chủ ảnh hoặc admin
  } else {
    // Khách hoặc người dùng xem thông thường (kể cả admin/chủ khi không bật preview):
    // BẮT BUỘC: Revision phải APPROVED và READY
    if (targetRev.moderationStatus !== ModerationStatus.APPROVED || targetRev.technicalStatus !== TechnicalStatus.READY) {
      return res.status(403).json({
        success: false,
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Phiên bản ảnh chưa được phê duyệt hoặc chưa xử lý xong',
      });
    }

    // BẮT BUỘC: Phải có ít nhất 1 bản ghi AssetUsage ĐANG CÔNG KHAI (isPublished = true)
    const publishedUsage = await prisma.assetUsage.findFirst({
      where: {
        assetRevisionId: targetRev.id,
        isPublished: true,
      },
    });

    if (!publishedUsage) {
      return res.status(403).json({
        success: false,
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Phiên bản ảnh chưa được xuất bản công khai ở bất kỳ bài viết hoặc hồ sơ quán nào',
      });
    }
  }

  // Xác định file variant cần phục vụ
  let targetFile = targetRev.storageKey;
  let targetMime = asset.mimeType;

  // Bản gốc tải lên (chưa cắt) — chỉ chủ ảnh/admin ở chế độ preview; dùng cho hộp cắt lại ảnh (API crop cắt trên bản gốc)
  if (variantType === 'source' && isPreview && (isOwner || isAdmin) && asset.quarantineKey) {
    targetFile = asset.quarantineKey;
  }

  if (variantType === 'thumb') {
    const thumb = targetRev.variants?.find((v: any) => v.variantType === VariantType.THUMBNAIL_STATIC);
    if (thumb) {
      targetFile = thumb.storageKey;
      targetMime = thumb.mimeType;
    }
  } else if (variantType === 'poster') {
    const poster = targetRev.variants?.find((v: any) => v.variantType === VariantType.POSTER);
    if (poster) {
      targetFile = poster.storageKey;
      targetMime = poster.mimeType;
    }
  }

  // storageKey có thể là đường dẫn tuyệt đối của máy đã xử lý ảnh (vd. Windows) -> tìm lại theo tên file trên máy này
  const resolvedFile = resolveStoredFile(targetFile);
  if (!resolvedFile) {
    return res.status(404).json({
      success: false,
      errorCode: ErrorCode.NOT_FOUND,
      message: 'Không tìm thấy file lưu trữ trên ổ đĩa',
    });
  }
  targetFile = resolvedFile;

  res.setHeader('Content-Type', targetMime);
  res.setHeader('Cache-Control', isPreview ? 'private, no-cache' : 'public, max-age=86400');
  return res.sendFile(path.resolve(targetFile));
}

// Truy xuất trực tiếp theo Revision ID cố định của địa điểm đã xuất bản
router.get('/revisions/:revisionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const revisionId = req.params.revisionId as string;
    const variantType = (req.query.variant as string) || 'optimized';
    const isPreview = req.query.preview === 'true';

    const revision = await prisma.assetRevision.findUnique({
      where: { id: revisionId },
      include: { asset: true, variants: true },
    });

    if (!revision) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy phiên bản ảnh',
      });
    }

    return serveRevisionVariant(revision, revision.asset, variantType, isPreview, req.user, res);
  } catch (err) {
    next(err);
  }
});

// Truy xuất theo Asset ID (chọn revision cụ thể hoặc phân giải revision công khai)
router.get('/:assetId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assetId = req.params.assetId as string;
    const variantType = (req.query.variant as string) || 'optimized';
    const revisionId = req.query.revision as string | undefined;
    const isPreview = req.query.preview === 'true';

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        currentRevision: { include: { variants: true } },
        revisions: { include: { variants: true } },
      },
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy tài nguyên ảnh',
      });
    }

    if (asset.technicalStatus === TechnicalStatus.FAILED) {
      return res.status(400).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Tài nguyên ảnh xử lý thất bại hoặc bị hỏng',
      });
    }

    // Nếu có chỉ định revisionId cụ thể
    if (revisionId) {
      const targetRev = asset.revisions.find((r) => r.id === revisionId);
      if (!targetRev) {
        return res.status(404).json({
          success: false,
          errorCode: ErrorCode.NOT_FOUND,
          message: 'Không tìm thấy phiên bản ảnh được yêu cầu',
        });
      }
      return serveRevisionVariant(targetRev, asset, variantType, isPreview, req.user, res);
    }

    // Nếu KHÔNG chỉ định revisionId:
    const isOwner = req.user && req.user.id === asset.uploaderId;
    const isAdmin = req.user && req.user.role === 'ADMIN';

    // Preview mode: Phục vụ currentRevision (bản nháp gần nhất của chủ ảnh hoặc admin)
    if (isPreview && (isOwner || isAdmin)) {
      if (!asset.currentRevision) {
        return res.status(404).json({
          success: false,
          errorCode: ErrorCode.NOT_FOUND,
          message: 'Không tìm thấy phiên bản nháp hiện tại',
        });
      }
      return serveRevisionVariant(asset.currentRevision, asset, variantType, true, req.user, res);
    }

    // Khách công khai: Phân giải ĐÚNG revision đang được xuất bản công khai
    const publishedUsage = await prisma.assetUsage.findFirst({
      where: {
        assetRevision: { assetId, moderationStatus: ModerationStatus.APPROVED },
        isPublished: true,
      },
      include: {
        assetRevision: { include: { variants: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!publishedUsage || !publishedUsage.assetRevision) {
      return res.status(403).json({
        success: false,
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Ảnh chưa được xuất bản công khai ở bất kỳ bài viết hoặc hồ sơ quán nào',
      });
    }

    return serveRevisionVariant(publishedUsage.assetRevision, asset, variantType, false, req.user, res);
  } catch (err) {
    next(err);
  }
});

export default router;
