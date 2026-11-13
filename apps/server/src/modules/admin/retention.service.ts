import { prisma } from '../../lib/prisma.js';
import { structuredLog } from '../../lib/logger.js';

export interface RetentionCleanupOptions {
  chatRetentionDays?: number;
  rejectedMediaDays?: number;
  abandonedUploadsDays?: number;
  dryRun?: boolean;
}

export async function runRetentionCleanup(options: RetentionCleanupOptions = {}) {
  const chatDays = options.chatRetentionDays ?? 30;
  const rejectedMediaDays = options.rejectedMediaDays ?? 30;
  const abandonedUploadsDays = options.abandonedUploadsDays ?? 7;
  const isDryRun = options.dryRun ?? false;

  const chatThreshold = new Date(Date.now() - chatDays * 24 * 60 * 60 * 1000);
  const mediaThreshold = new Date(Date.now() - rejectedMediaDays * 24 * 60 * 60 * 1000);
  const abandonedThreshold = new Date(Date.now() - abandonedUploadsDays * 24 * 60 * 60 * 1000);

  // 1. Quét tin nhắn chat AI cũ hơn chatDays
  const oldConversationsCount = await prisma.aIConversation.count({
    where: {
      updatedAt: { lt: chatThreshold },
      status: { not: 'HUMAN_ACTIVE' }, // Không xóa các phiên đang hỗ trợ
    },
  });

  // 2. Quét tài nguyên media bị REJECTED cũ hơn rejectedMediaDays
  const rejectedAssetsCount = await prisma.asset.count({
    where: {
      moderationStatus: 'REJECTED',
      createdAt: { lt: mediaThreshold },
    },
  });

  // 3. Quét các upload bị bỏ dở (PROCESSING) cũ hơn abandonedUploadsDays
  const abandonedAssetsCount = await prisma.asset.count({
    where: {
      technicalStatus: 'PROCESSING',
      createdAt: { lt: abandonedThreshold },
    },
  });

  const summary = {
    chatConversationsAffected: oldConversationsCount,
    rejectedAssetsAffected: rejectedAssetsCount,
    abandonedAssetsAffected: abandonedAssetsCount,
    dryRun: isDryRun,
    executedAt: new Date().toISOString(),
  };

  if (!isDryRun) {
    // Thực thi xóa nếu không phải dryRun
    if (oldConversationsCount > 0) {
      await prisma.aIConversation.deleteMany({
        where: {
          updatedAt: { lt: chatThreshold },
          status: { not: 'HUMAN_ACTIVE' },
        },
      });
    }

    if (rejectedAssetsCount > 0) {
      await prisma.asset.deleteMany({
        where: {
          moderationStatus: 'REJECTED',
          createdAt: { lt: mediaThreshold },
        },
      });
    }

    if (abandonedAssetsCount > 0) {
      await prisma.asset.deleteMany({
        where: {
          technicalStatus: 'PROCESSING',
          createdAt: { lt: abandonedThreshold },
        },
      });
    }

    structuredLog('INFO', 'RETENTION_CLEANUP_EXECUTED', summary);
  } else {
    structuredLog('INFO', 'RETENTION_CLEANUP_DRY_RUN', summary);
  }

  return summary;
}
