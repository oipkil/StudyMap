-- AlterEnum
ALTER TYPE "AIProviderType" ADD VALUE 'MOCK';

-- AlterTable
ALTER TABLE "ai_messages" ADD COLUMN     "feedback" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "aiPrivacyConsentAccepted" BOOLEAN NOT NULL DEFAULT false;
