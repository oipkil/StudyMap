-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('OPERATING', 'TEMPORARILY_CLOSED', 'PERMANENTLY_CLOSED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PENDING', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'PUBLISHED', 'HIDDEN', 'REVOKED', 'ARCHIVED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DataType" AS ENUM ('TEXT', 'LONG_TEXT', 'RICH_TEXT', 'NUMBER', 'NUMBER_WITH_UNIT', 'CURRENCY', 'RANGE', 'SELECT_ONE', 'SELECT_MANY', 'BOOLEAN_TRI_STATE', 'DATE', 'TIME', 'SAFE_LINK', 'IMAGE', 'GALLERY', 'TABLE', 'REPEATER');

-- CreateEnum
CREATE TYPE "ContentState" AS ENUM ('PUBLISHED', 'HIDDEN', 'REVOKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('PLACE', 'REVIEW', 'COMMENT', 'POST', 'ASSET', 'USER', 'STICKER_PACK');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "TechnicalStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "VariantType" AS ENUM ('THUMBNAIL_STATIC', 'POSTER', 'OPTIMIZED_ANIMATED', 'CROPPED');

-- CreateEnum
CREATE TYPE "AIProviderType" AS ENUM ('OPENAI', 'ANTHROPIC', 'GOOGLE', 'OPENAI_COMPATIBLE');

-- CreateEnum
CREATE TYPE "AITaskType" AS ENUM ('STUDENT_CHAT', 'DRAFT_ASSISTANT', 'REVIEW_SUMMARIZER', 'CONTENT_MODERATION');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('AI_ACTIVE', 'HUMAN_WAITING', 'HUMAN_ACTIVE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "AIMessageStatus" AS ENUM ('STARTED', 'STREAMING', 'COMPLETED', 'INTERRUPTED', 'FAILED');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('WAITING', 'HUMAN_ACTIVE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "BudgetScope" AS ENUM ('SYSTEM_DAILY', 'USER_DAILY', 'ADMIN_DAILY');

-- CreateEnum
CREATE TYPE "AnnouncementLevel" AS ENUM ('INFO', 'WARNING', 'SUCCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "TargetAudience" AS ENUM ('ALL', 'USERS', 'ADMINS');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "currentPublishedAvatarAssetId" TEXT,
    "currentPublishedBio" TEXT,
    "universityCampusId" TEXT,
    "isUniversityPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profile_revisions" (
    "id" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "pendingAvatarAssetId" TEXT,
    "pendingBio" TEXT,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "reviewerAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "user_profile_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenType" "AuthTokenType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_audit_logs" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "performedByAdminId" TEXT NOT NULL,
    "oldRole" "Role" NOT NULL,
    "newRole" "Role" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoAssetId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campuses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "universityName" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL,
    "regionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "defaultName" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "brandId" TEXT,
    "parentPlaceId" TEXT,
    "operationalStatus" "OperationalStatus" NOT NULL DEFAULT 'OPERATING',
    "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "currentPublishedRevisionId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_revisions" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "baseRevisionId" TEXT,
    "snapshotData" JSONB NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "reviewerAdminId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_published_projections" (
    "placeId" TEXT NOT NULL,
    "publishedRevisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alternateNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slug" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "campusId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "priceMin" DOUBLE PRECISION,
    "priceMax" DOUBLE PRECISION,
    "is24h" BOOLEAN NOT NULL DEFAULT false,
    "ratingOverall" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "studyAmenities" JSONB NOT NULL DEFAULT '{}',
    "filterableAttributes" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "place_published_projections_pkey" PRIMARY KEY ("placeId")
);

-- CreateTable
CREATE TABLE "field_groups" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "dataType" "DataType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isFilterable" BOOLEAN NOT NULL DEFAULT false,
    "isComparable" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "fieldGroupId" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_definition_versions" (
    "id" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" "DataType" NOT NULL,
    "unit" TEXT,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tableColumnsConfig" JSONB,
    "repeaterConfig" JSONB,
    "displayConditions" JSONB,
    "permissions" JSONB NOT NULL DEFAULT '{"viewRole":"PUBLIC","editRole":"ADMIN"}',
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_definition_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_field_bindings" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "fieldDefinitionId" TEXT NOT NULL,
    "isRequiredOverride" BOOLEAN,

    CONSTRAINT "category_field_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_suggestions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "proposedName" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "addressDescription" TEXT NOT NULL,
    "regionId" TEXT,
    "campusId" TEXT,
    "initialData" JSONB NOT NULL DEFAULT '{}',
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "convertedPlaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "targetAspects" JSONB NOT NULL DEFAULT '[]',
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_change_requests" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedChanges" JSONB NOT NULL,
    "evidenceAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "baseRevisionId" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_criteria" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "maxScore" INTEGER NOT NULL DEFAULT 5,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "review_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentPublishedRevisionId" TEXT,
    "ratingOverall" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "helpfulVotesCount" INTEGER NOT NULL DEFAULT 0,
    "state" "ContentState" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_revisions" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "ratingOverall" INTEGER NOT NULL,
    "criteriaScores" JSONB NOT NULL DEFAULT '[]',
    "content" TEXT NOT NULL,
    "visitDate" TEXT,
    "attachedAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "reviewerAdminId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "currentPublishedRevisionId" TEXT,
    "state" "ContentState" NOT NULL DEFAULT 'PUBLISHED',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_revisions" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "stickerItemId" TEXT,
    "attachedAssetId" TEXT,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "currentPublishedRevisionId" TEXT,
    "state" "ContentState" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_revisions" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "coverAssetId" TEXT,
    "placeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contentBlocks" JSONB NOT NULL DEFAULT '[]',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "description" TEXT,
    "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "actionTaken" TEXT,
    "resolutionNote" TEXT,
    "assignedAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "helpful_votes" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "helpful_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "fileHash" TEXT NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "frameCount" INTEGER NOT NULL DEFAULT 1,
    "durationSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isAnimated" BOOLEAN NOT NULL DEFAULT false,
    "currentRevisionId" TEXT,
    "storageKey" TEXT,
    "quarantineKey" TEXT NOT NULL,
    "technicalStatus" "TechnicalStatus" NOT NULL DEFAULT 'PENDING',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_revisions" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "cropInstruction" JSONB,
    "byteSize" INTEGER NOT NULL,
    "fileHash" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "frameCount" INTEGER NOT NULL DEFAULT 1,
    "storageKey" TEXT NOT NULL,
    "technicalStatus" "TechnicalStatus" NOT NULL DEFAULT 'PENDING',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_variants" (
    "id" TEXT NOT NULL,
    "assetRevisionId" TEXT NOT NULL,
    "variantType" "VariantType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_usages" (
    "id" TEXT NOT NULL,
    "assetRevisionId" TEXT NOT NULL,
    "entityType" "TargetType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_packs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sticker_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sticker_items" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "shortcode" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "altText" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sticker_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_favorites" (
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_favorites_pkey" PRIMARY KEY ("userId","placeId")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "currentPublishedRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_revisions" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverAssetId" TEXT,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_items" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adapterType" "AIProviderType" NOT NULL,
    "baseUrl" TEXT,
    "encryptedApiKey" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_configs" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "maxTokens" INTEGER NOT NULL DEFAULT 2048,
    "contextWindow" INTEGER NOT NULL DEFAULT 128000,
    "supportsTools" BOOLEAN NOT NULL DEFAULT true,
    "supportsStreaming" BOOLEAN NOT NULL DEFAULT true,
    "supportsVision" BOOLEAN NOT NULL DEFAULT false,
    "defaultTemperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_task_configs" (
    "id" TEXT NOT NULL,
    "taskType" "AITaskType" NOT NULL,
    "activeModelId" TEXT NOT NULL,
    "fallbackModelId" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL DEFAULT 1,
    "maxPlacesInAnswer" INTEGER NOT NULL DEFAULT 3,
    "toolAllowlist" TEXT[] DEFAULT ARRAY['searchPlaces', 'getPublishedPlaceDetail', 'comparePlaces']::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_task_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_task_config_versions" (
    "id" TEXT NOT NULL,
    "taskConfigId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "modelId" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "toolAllowlist" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_task_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Hội thoại mới',
    "status" "ConversationStatus" NOT NULL DEFAULT 'AI_ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "status" "AIMessageStatus" NOT NULL DEFAULT 'COMPLETED',
    "sourcesJson" JSONB,
    "interruptedAt" TIMESTAMP(3),
    "errorDetails" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_attempts" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "modelId" TEXT NOT NULL,
    "taskConfigVersionId" TEXT NOT NULL,
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_cases" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAdminId" TEXT,
    "status" "SupportStatus" NOT NULL DEFAULT 'WAITING',
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "support_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_budgets" (
    "id" TEXT NOT NULL,
    "scopeType" "BudgetScope" NOT NULL,
    "targetUserId" TEXT,
    "maxTokens" INTEGER NOT NULL DEFAULT 50000,
    "maxRequests" INTEGER NOT NULL DEFAULT 20,
    "currentTokens" INTEGER NOT NULL DEFAULT 0,
    "currentRequests" INTEGER NOT NULL DEFAULT 0,
    "currentDate" TEXT NOT NULL,

    CONSTRAINT "ai_usage_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "level" "AnnouncementLevel" NOT NULL DEFAULT 'INFO',
    "linkUrl" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "targetAudience" "TargetAudience" NOT NULL DEFAULT 'ALL',
    "targetPageScope" TEXT NOT NULL DEFAULT 'ALL',
    "isDismissible" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_dismissals" (
    "userId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "dismissedVersion" INTEGER NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_dismissals_pkey" PRIMARY KEY ("userId","announcementId")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLinkUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetEntity" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionTokenHash_key" ON "sessions"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_tokens_userId_tokenType_idx" ON "auth_tokens"("userId", "tokenType");

-- CreateIndex
CREATE INDEX "role_audit_logs_targetUserId_idx" ON "role_audit_logs"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE INDEX "campuses_regionId_idx" ON "campuses"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "places_slug_key" ON "places"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "places_currentPublishedRevisionId_key" ON "places"("currentPublishedRevisionId");

-- CreateIndex
CREATE INDEX "places_categoryId_idx" ON "places"("categoryId");

-- CreateIndex
CREATE INDEX "places_brandId_idx" ON "places"("brandId");

-- CreateIndex
CREATE INDEX "places_parentPlaceId_idx" ON "places"("parentPlaceId");

-- CreateIndex
CREATE INDEX "place_revisions_placeId_moderationStatus_idx" ON "place_revisions"("placeId", "moderationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "place_revisions_placeId_revisionNumber_key" ON "place_revisions"("placeId", "revisionNumber");

-- CreateIndex
CREATE INDEX "place_published_projections_categoryId_idx" ON "place_published_projections"("categoryId");

-- CreateIndex
CREATE INDEX "place_published_projections_campusId_idx" ON "place_published_projections"("campusId");

-- CreateIndex
CREATE INDEX "place_published_projections_latitude_longitude_idx" ON "place_published_projections"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "place_published_projections_ratingOverall_idx" ON "place_published_projections"("ratingOverall");

-- CreateIndex
CREATE UNIQUE INDEX "field_groups_key_key" ON "field_groups"("key");

-- CreateIndex
CREATE UNIQUE INDEX "field_definitions_key_key" ON "field_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "field_definition_versions_fieldDefinitionId_version_key" ON "field_definition_versions"("fieldDefinitionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "category_field_bindings_categoryId_fieldDefinitionId_key" ON "category_field_bindings"("categoryId", "fieldDefinitionId");

-- CreateIndex
CREATE INDEX "place_suggestions_userId_idx" ON "place_suggestions"("userId");

-- CreateIndex
CREATE INDEX "place_suggestions_status_idx" ON "place_suggestions"("status");

-- CreateIndex
CREATE INDEX "survey_requests_placeId_idx" ON "survey_requests"("placeId");

-- CreateIndex
CREATE INDEX "place_change_requests_placeId_idx" ON "place_change_requests"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "review_criteria_categoryId_code_key" ON "review_criteria"("categoryId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_currentPublishedRevisionId_key" ON "reviews"("currentPublishedRevisionId");

-- CreateIndex
CREATE INDEX "reviews_placeId_state_idx" ON "reviews"("placeId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_placeId_userId_key" ON "reviews"("placeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "review_revisions_reviewId_revisionNumber_key" ON "review_revisions"("reviewId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "comments_currentPublishedRevisionId_key" ON "comments"("currentPublishedRevisionId");

-- CreateIndex
CREATE INDEX "comments_targetType_targetId_idx" ON "comments"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "comment_revisions_commentId_revisionNumber_key" ON "comment_revisions"("commentId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "posts_currentPublishedRevisionId_key" ON "posts"("currentPublishedRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "post_revisions_postId_revisionNumber_key" ON "post_revisions"("postId", "revisionNumber");

-- CreateIndex
CREATE INDEX "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "helpful_votes_reviewId_userId_key" ON "helpful_votes"("reviewId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "assets_currentRevisionId_key" ON "assets"("currentRevisionId");

-- CreateIndex
CREATE INDEX "assets_uploaderId_idx" ON "assets"("uploaderId");

-- CreateIndex
CREATE INDEX "assets_moderationStatus_idx" ON "assets"("moderationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "asset_revisions_assetId_revisionNumber_key" ON "asset_revisions"("assetId", "revisionNumber");

-- CreateIndex
CREATE INDEX "asset_variants_assetRevisionId_variantType_idx" ON "asset_variants"("assetRevisionId", "variantType");

-- CreateIndex
CREATE INDEX "asset_usages_assetRevisionId_idx" ON "asset_usages"("assetRevisionId");

-- CreateIndex
CREATE INDEX "asset_usages_entityType_entityId_idx" ON "asset_usages"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "sticker_packs_slug_key" ON "sticker_packs"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "sticker_items_shortcode_key" ON "sticker_items"("shortcode");

-- CreateIndex
CREATE UNIQUE INDEX "collections_currentPublishedRevisionId_key" ON "collections"("currentPublishedRevisionId");

-- CreateIndex
CREATE INDEX "collections_userId_idx" ON "collections"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "collection_revisions_collectionId_revisionNumber_key" ON "collection_revisions"("collectionId", "revisionNumber");

-- CreateIndex
CREATE INDEX "collection_items_collectionId_idx" ON "collection_items"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_configs_providerId_modelId_key" ON "ai_model_configs"("providerId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_task_configs_taskType_key" ON "ai_task_configs"("taskType");

-- CreateIndex
CREATE UNIQUE INDEX "ai_task_config_versions_taskConfigId_version_key" ON "ai_task_config_versions"("taskConfigId", "version");

-- CreateIndex
CREATE INDEX "ai_conversations_userId_idx" ON "ai_conversations"("userId");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_sequenceNumber_idx" ON "ai_messages"("conversationId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ai_attempts_idempotencyKey_key" ON "ai_attempts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ai_attempts_messageId_idx" ON "ai_attempts"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "support_cases_conversationId_key" ON "support_cases"("conversationId");

-- CreateIndex
CREATE INDEX "support_cases_status_idx" ON "support_cases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_budgets_scopeType_targetUserId_currentDate_key" ON "ai_usage_budgets"("scopeType", "targetUserId", "currentDate");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "outbox_events_status_createdAt_idx" ON "outbox_events"("status", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_adminUserId_idx" ON "audit_logs"("adminUserId");

-- CreateIndex
CREATE INDEX "audit_logs_targetEntity_targetId_idx" ON "audit_logs"("targetEntity", "targetId");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profile_revisions" ADD CONSTRAINT "user_profile_revisions_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campuses" ADD CONSTRAINT "campuses_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_parentPlaceId_fkey" FOREIGN KEY ("parentPlaceId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "places" ADD CONSTRAINT "places_currentPublishedRevisionId_fkey" FOREIGN KEY ("currentPublishedRevisionId") REFERENCES "place_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_revisions" ADD CONSTRAINT "place_revisions_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_published_projections" ADD CONSTRAINT "place_published_projections_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_published_projections" ADD CONSTRAINT "place_published_projections_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "place_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_published_projections" ADD CONSTRAINT "place_published_projections_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_definitions" ADD CONSTRAINT "field_definitions_fieldGroupId_fkey" FOREIGN KEY ("fieldGroupId") REFERENCES "field_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_definition_versions" ADD CONSTRAINT "field_definition_versions_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_field_bindings" ADD CONSTRAINT "category_field_bindings_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_field_bindings" ADD CONSTRAINT "category_field_bindings_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_suggestions" ADD CONSTRAINT "place_suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_requests" ADD CONSTRAINT "survey_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_requests" ADD CONSTRAINT "survey_requests_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_change_requests" ADD CONSTRAINT "place_change_requests_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_change_requests" ADD CONSTRAINT "place_change_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_criteria" ADD CONSTRAINT "review_criteria_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_currentPublishedRevisionId_fkey" FOREIGN KEY ("currentPublishedRevisionId") REFERENCES "review_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_revisions" ADD CONSTRAINT "review_revisions_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_currentPublishedRevisionId_fkey" FOREIGN KEY ("currentPublishedRevisionId") REFERENCES "comment_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_revisions" ADD CONSTRAINT "comment_revisions_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_currentPublishedRevisionId_fkey" FOREIGN KEY ("currentPublishedRevisionId") REFERENCES "post_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpful_votes" ADD CONSTRAINT "helpful_votes_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpful_votes" ADD CONSTRAINT "helpful_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "asset_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_revisions" ADD CONSTRAINT "asset_revisions_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_assetRevisionId_fkey" FOREIGN KEY ("assetRevisionId") REFERENCES "asset_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_usages" ADD CONSTRAINT "asset_usages_assetRevisionId_fkey" FOREIGN KEY ("assetRevisionId") REFERENCES "asset_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_packs" ADD CONSTRAINT "sticker_packs_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_items" ADD CONSTRAINT "sticker_items_packId_fkey" FOREIGN KEY ("packId") REFERENCES "sticker_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sticker_items" ADD CONSTRAINT "sticker_items_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_favorites" ADD CONSTRAINT "place_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_favorites" ADD CONSTRAINT "place_favorites_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_currentPublishedRevisionId_fkey" FOREIGN KEY ("currentPublishedRevisionId") REFERENCES "collection_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_revisions" ADD CONSTRAINT "collection_revisions_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_task_configs" ADD CONSTRAINT "ai_task_configs_activeModelId_fkey" FOREIGN KEY ("activeModelId") REFERENCES "ai_model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_task_config_versions" ADD CONSTRAINT "ai_task_config_versions_taskConfigId_fkey" FOREIGN KEY ("taskConfigId") REFERENCES "ai_task_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_attempts" ADD CONSTRAINT "ai_attempts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ai_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_attempts" ADD CONSTRAINT "ai_attempts_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ai_model_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_attempts" ADD CONSTRAINT "ai_attempts_taskConfigVersionId_fkey" FOREIGN KEY ("taskConfigVersionId") REFERENCES "ai_task_config_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_budgets" ADD CONSTRAINT "ai_usage_budgets_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_dismissals" ADD CONSTRAINT "announcement_dismissals_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
