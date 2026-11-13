import { prisma } from './prisma.js';

/**
 * Ghi nhật ký quản trị (Audit Log). Không bao giờ làm hỏng luồng chính:
 * lỗi ghi log chỉ được in ra console.
 */
export async function writeAudit(params: {
  adminUserId: string;
  action: string;
  targetEntity: string;
  targetId: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        adminUserId: params.adminUserId,
        action: params.action,
        targetEntity: params.targetEntity,
        targetId: params.targetId,
        details: (params.details ?? {}) as any,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error('Không ghi được audit log:', params.action, String(err).slice(0, 120));
  }
}
