-- Ảnh bìa hồ sơ người dùng (kiểu mạng xã hội)
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "currentPublishedCoverAssetId" TEXT;

-- Cột đã có trong schema.prisma nhưng trước đây được đưa vào DB bằng db push (không có migration) -> bổ sung cho DB mới
ALTER TABLE "ai_attempts" ADD COLUMN IF NOT EXISTS "usageEstimated" BOOLEAN NOT NULL DEFAULT false;
