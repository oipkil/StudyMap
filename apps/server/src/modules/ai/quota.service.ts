import { prisma } from '../../lib/prisma.js';
import { BudgetScope } from '@prisma/client';

// Quản lý khóa đồng thời (In-memory lock cho Generation / Request đang chạy)
const activeGenerations = new Set<string>();

export function getServerCurrentDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Khóa đồng thời cho 1 generation của user
 * Trả về true nếu nhận khóa thành công, false nếu user đang có 1 generation đang chạy
 */
export function acquireUserGenerationLock(userId: string): boolean {
  if (activeGenerations.has(userId)) {
    return false;
  }
  activeGenerations.add(userId);
  return true;
}

/**
 * Giải phóng khóa đồng thời sau khi generation kết thúc (thành công / lỗi / dừng)
 */
export function releaseUserGenerationLock(userId: string) {
  activeGenerations.delete(userId);
}

/**
 * Kiểm tra hạn mức sử dụng (Quota) của người dùng và toàn hệ thống trong ngày
 */
export async function checkAiQuota(
  userId: string,
  userRole: string
): Promise<{ allowed: boolean; reason?: string }> {
  const currentDate = getServerCurrentDate();

  // 1. Kiểm tra ngân sách toàn hệ thống (SYSTEM_DAILY)
  const systemBudget = await prisma.aIUsageBudget.findFirst({
    where: {
      scopeType: BudgetScope.SYSTEM_DAILY,
      currentDate,
    },
  });

  if (systemBudget) {
    if (systemBudget.currentRequests >= systemBudget.maxRequests || systemBudget.currentTokens >= systemBudget.maxTokens) {
      return {
        allowed: false,
        reason: 'Hệ thống đã đạt giới hạn ngân sách AI trong ngày. Vui lòng quay lại vào ngày mai hoặc sử dụng tính năng tìm kiếm bộ lọc.',
      };
    }
  }

  // 2. Kiểm tra hạn mức riêng của sinh viên / admin
  const userScope = userRole === 'ADMIN' ? BudgetScope.ADMIN_DAILY : BudgetScope.USER_DAILY;
  const userBudget = await prisma.aIUsageBudget.findFirst({
    where: {
      scopeType: userScope,
      targetUserId: userId,
      currentDate,
    },
  });

  if (userBudget) {
    if (userBudget.currentRequests >= userBudget.maxRequests) {
      return {
        allowed: false,
        reason: `Bạn đã sử dụng hết hạn mức ${userBudget.maxRequests} lượt trò chuyện AI trong ngày hôm nay.`,
      };
    }
    if (userBudget.currentTokens >= userBudget.maxTokens) {
      return {
        allowed: false,
        reason: 'Bạn đã đạt giới hạn token AI trong ngày. Vui lòng quay lại vào ngày mai.',
      };
    }
  }

  return { allowed: true };
}

/**
 * Ghi nhận sử dụng token sau khi hoàn tất lượt generation
 */
export async function recordAiUsage(
  userId: string,
  userRole: string,
  tokensUsed: number
) {
  const currentDate = getServerCurrentDate();
  const userScope = userRole === 'ADMIN' ? BudgetScope.ADMIN_DAILY : BudgetScope.USER_DAILY;
  const defaultMaxUserRequests = userRole === 'ADMIN' ? 100 : 25;
  const defaultMaxUserTokens = userRole === 'ADMIN' ? 200000 : 40000;

  try {
    // 1. Tăng cho user
    const existingUserBudget = await prisma.aIUsageBudget.findFirst({
      where: {
        scopeType: userScope,
        targetUserId: userId,
        currentDate,
      },
    });

    if (existingUserBudget) {
      await prisma.aIUsageBudget.update({
        where: { id: existingUserBudget.id },
        data: {
          currentRequests: { increment: 1 },
          currentTokens: { increment: tokensUsed },
        },
      });
    } else {
      await prisma.aIUsageBudget.create({
        data: {
          scopeType: userScope,
          targetUserId: userId,
          currentDate,
          maxRequests: defaultMaxUserRequests,
          maxTokens: defaultMaxUserTokens,
          currentRequests: 1,
          currentTokens: tokensUsed,
        },
      });
    }

    // 2. Tăng cho hệ thống (SYSTEM_DAILY)
    const existingSystemBudget = await prisma.aIUsageBudget.findFirst({
      where: {
        scopeType: BudgetScope.SYSTEM_DAILY,
        currentDate,
      },
    });

    if (existingSystemBudget) {
      await prisma.aIUsageBudget.update({
        where: { id: existingSystemBudget.id },
        data: {
          currentRequests: { increment: 1 },
          currentTokens: { increment: tokensUsed },
        },
      });
    } else {
      await prisma.aIUsageBudget.create({
        data: {
          scopeType: BudgetScope.SYSTEM_DAILY,
          currentDate,
          maxRequests: 5000,
          maxTokens: 5000000,
          currentRequests: 1,
          currentTokens: tokensUsed,
        },
      });
    }
  } catch (err) {
    console.error('Lỗi khi ghi nhận ngân sách AI:', err);
  }
}
