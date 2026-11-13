-- Kênh thông báo ngoài hệ thống (bot Zalo), cấu hình động trong trang quản trị
DO $$ BEGIN
  CREATE TYPE "IntegrationKind" AS ENUM ('ZALO_BOT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "notification_channels" (
  "id" TEXT NOT NULL,
  "kind" "IntegrationKind" NOT NULL DEFAULT 'ZALO_BOT',
  "name" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "chatId" TEXT NOT NULL,
  "encryptedToken" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "throttleMinutes" INTEGER NOT NULL DEFAULT 0,
  "lastStatus" TEXT,
  "lastError" TEXT,
  "lastSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);
