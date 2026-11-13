import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { prisma } from '../../lib/prisma.js';
import { PUBLIC_DIR, resolveStoredFile } from './media.storage.js';
import { TechnicalStatus, ModerationStatus, VariantType } from '@prisma/client';

export async function processAsset(assetId: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error(`Asset not found: ${assetId}`);

  try {
    const inputPath = resolveStoredFile(asset.quarantineKey) || asset.quarantineKey;
    const inputBuffer = fs.readFileSync(inputPath);
    const meta = await sharp(inputBuffer, { animated: true }).metadata();

    const isAnimated = (meta.pages && meta.pages > 1) || false;
    const frameCount = meta.pages || 1;
    const width = meta.width || 0;
    const height = meta.pageHeight || meta.height || 0;

    // 1. Tạo Poster (Frame đầu tiên static WebP)
    const posterFileName = `${assetId}-poster.webp`;
    const posterPath = path.join(PUBLIC_DIR, posterFileName);
    await sharp(inputBuffer, { animated: true, page: 0 })
      .webp({ quality: 80 })
      .toFile(posterPath);

    // 2. Tạo Thumbnail (300x300 static WebP)
    const thumbFileName = `${assetId}-thumb.webp`;
    const thumbPath = path.join(PUBLIC_DIR, thumbFileName);
    await sharp(inputBuffer, { animated: true, page: 0 })
      .resize(300, 300, { fit: 'cover' })
      .webp({ quality: 75 })
      .toFile(thumbPath);

    // 3. Tạo Bản tối ưu (Optimized)
    let optimizedFileName = `${assetId}-optimized.webp`;
    if (asset.mimeType === 'image/gif') {
      optimizedFileName = `${assetId}-optimized.gif`;
    }
    const optimizedPath = path.join(PUBLIC_DIR, optimizedFileName);

    if (isAnimated) {
      if (asset.mimeType === 'image/gif') {
        await sharp(inputBuffer, { animated: true })
          .gif({ loop: meta.loop || 0, delay: meta.delay })
          .toFile(optimizedPath);
      } else {
        await sharp(inputBuffer, { animated: true })
          .webp({ quality: 80, loop: meta.loop || 0, delay: meta.delay })
          .toFile(optimizedPath);
      }
    } else {
      await sharp(inputBuffer)
        .webp({ quality: 85 })
        .toFile(optimizedPath);
    }

    const optimizedStat = fs.statSync(optimizedPath);
    const thumbStat = fs.statSync(thumbPath);
    const posterStat = fs.statSync(posterPath);

    // 4. Trích xuất frames cho ảnh động phục vụ Contact Sheet & Frame Scrubber (hỗ trợ toàn bộ frames trong hạn mức)
    if (isAnimated) {
      const assetFramesDir = path.join(PUBLIC_DIR, `frames-${assetId}`);
      if (!fs.existsSync(assetFramesDir)) fs.mkdirSync(assetFramesDir, { recursive: true });

      const totalToExtract = Math.min(120, frameCount); // Hỗ trợ toàn bộ frames trong hạn mức upload
      const delays = Array.isArray(meta.delay) ? meta.delay : [100];
      const framesList = [];

      for (let i = 0; i < totalToExtract; i++) {
        const frameFileName = `frame-${i}.webp`;
        const frameFilePath = path.join(assetFramesDir, frameFileName);
        await sharp(inputBuffer, { animated: true, page: i })
          .webp({ quality: 75 })
          .toFile(frameFilePath);
        
        framesList.push({
          frameIndex: i,
          delay: delays[i % delays.length] || 100,
          storageKey: frameFilePath,
        });
      }

      fs.writeFileSync(
        path.join(assetFramesDir, 'manifest.json'),
        JSON.stringify({
          assetId,
          frameCount,
          extractedCount: framesList.length,
          loop: meta.loop || 0,
          delays: meta.delay || [],
          frames: framesList.map(f => ({ frameIndex: f.frameIndex, delay: f.delay })),
        })
      );
    }

    // Tạo Revision 1 và các Variants trong database
    const result = await prisma.$transaction(async (tx) => {
      const revision = await tx.assetRevision.create({
        data: {
          assetId,
          revisionNumber: 1,
          storageKey: optimizedPath,
          byteSize: optimizedStat.size,
          fileHash: asset.fileHash,
          width,
          height,
          frameCount,
          technicalStatus: TechnicalStatus.READY,
          moderationStatus: ModerationStatus.PENDING,
        },
      });

      // Tạo Variant THUMBNAIL_STATIC
      await tx.assetVariant.create({
        data: {
          assetRevisionId: revision.id,
          variantType: VariantType.THUMBNAIL_STATIC,
          storageKey: thumbPath,
          width: 300,
          height: 300,
          mimeType: 'image/webp',
          byteSize: thumbStat.size,
        },
      });

      // Tạo Variant POSTER
      await tx.assetVariant.create({
        data: {
          assetRevisionId: revision.id,
          variantType: VariantType.POSTER,
          storageKey: posterPath,
          width,
          height,
          mimeType: 'image/webp',
          byteSize: posterStat.size,
        },
      });

      // Cập nhật Asset chính
      await tx.asset.update({
        where: { id: assetId },
        data: {
          width,
          height,
          frameCount,
          isAnimated,
          technicalStatus: TechnicalStatus.READY,
          currentRevisionId: revision.id,
          storageKey: optimizedPath,
        },
      });

      return revision;
    });

    return result;
  } catch (err: any) {
    console.error(`Lỗi xử lý asset ${assetId}:`, err);
    await prisma.asset.update({
      where: { id: assetId },
      data: { technicalStatus: TechnicalStatus.FAILED },
    });
    throw err;
  }
}

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export async function cropAssetRevision(assetId: string, crop: CropRect) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: {
      revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
    },
  });

  if (!asset) throw new Error('Asset not found');

  const inputBuffer = fs.readFileSync(resolveStoredFile(asset.quarantineKey) || asset.quarantineKey);
  const meta = await sharp(inputBuffer, { animated: true }).metadata();
  const isAnimated = (meta.pages && meta.pages > 1) || false;
  const nextRevNumber = (asset.revisions[0]?.revisionNumber || 1) + 1;

  // Thực hiện crop giữ trọn chuyển động
  let croppedFileName = `${assetId}-rev${nextRevNumber}.webp`;
  if (asset.mimeType === 'image/gif') {
    croppedFileName = `${assetId}-rev${nextRevNumber}.gif`;
  }
  const croppedPath = path.join(PUBLIC_DIR, croppedFileName);

  const roundedCrop = {
    left: Math.max(0, Math.round(crop.left)),
    top: Math.max(0, Math.round(crop.top)),
    width: Math.max(1, Math.round(crop.width)),
    height: Math.max(1, Math.round(crop.height)),
  };

  if (isAnimated) {
    if (asset.mimeType === 'image/gif') {
      await sharp(inputBuffer, { animated: true })
        .extract(roundedCrop)
        .gif({ loop: meta.loop || 0, delay: meta.delay })
        .toFile(croppedPath);
    } else {
      await sharp(inputBuffer, { animated: true })
        .extract(roundedCrop)
        .webp({ quality: 80, loop: meta.loop || 0, delay: meta.delay })
        .toFile(croppedPath);
    }
  } else {
    await sharp(inputBuffer)
      .extract(roundedCrop)
      .webp({ quality: 85 })
      .toFile(croppedPath);
  }

  // Đo đạc và kiểm chứng lại metadata sau crop
  const croppedBuffer = fs.readFileSync(croppedPath);
  const croppedMeta = await sharp(croppedBuffer, { animated: true }).metadata();
  const croppedStat = fs.statSync(croppedPath);

  // Tạo thumbnail cho crop mới
  const croppedThumbFileName = `${assetId}-rev${nextRevNumber}-thumb.webp`;
  const croppedThumbPath = path.join(PUBLIC_DIR, croppedThumbFileName);
  await sharp(croppedBuffer, { animated: true, page: 0 })
    .resize(300, 300, { fit: 'cover' })
    .webp({ quality: 75 })
    .toFile(croppedThumbPath);

  // Lưu Revision mới (Bất biến, không sửa đổi revision cũ)
  const newRevision = await prisma.$transaction(async (tx) => {
    const rev = await tx.assetRevision.create({
      data: {
        assetId,
        revisionNumber: nextRevNumber,
        cropInstruction: crop as any,
        storageKey: croppedPath,
        byteSize: croppedStat.size,
        fileHash: asset.fileHash,
        width: croppedMeta.width || roundedCrop.width,
        height: croppedMeta.pageHeight || roundedCrop.height,
        frameCount: croppedMeta.pages || 1,
        technicalStatus: TechnicalStatus.READY,
        moderationStatus: ModerationStatus.PENDING,
      },
    });

    await tx.assetVariant.create({
      data: {
        assetRevisionId: rev.id,
        variantType: VariantType.CROPPED,
        storageKey: croppedPath,
        width: rev.width,
        height: rev.height,
        mimeType: asset.mimeType === 'image/gif' ? 'image/gif' : 'image/webp',
        byteSize: croppedStat.size,
      },
    });

    await tx.assetVariant.create({
      data: {
        assetRevisionId: rev.id,
        variantType: VariantType.THUMBNAIL_STATIC,
        storageKey: croppedThumbPath,
        width: 300,
        height: 300,
        mimeType: 'image/webp',
        byteSize: fs.statSync(croppedThumbPath).size,
      },
    });

    await tx.asset.update({
      where: { id: assetId },
      data: { currentRevisionId: rev.id },
    });

    return rev;
  });

  return { revision: newRevision, metadata: croppedMeta };
}
