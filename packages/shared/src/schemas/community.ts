import { z } from 'zod';
import { Quotas } from '../constants/quotas.js';
import { TargetType } from '../constants/status.js';

// Tiêu chí có thể là bản ghi ReviewCriteria (criteriaId) hoặc khoá cố định của form (criteriaKey: wifi/socket/noise/price)
export const CriteriaScoreSchema = z
  .object({
    criteriaId: z.string().uuid().optional(),
    criteriaKey: z.string().min(1).max(50).optional(),
    label: z.string().max(100).optional(),
    score: z.number().int().min(1).max(5),
  })
  .refine((c) => Boolean(c.criteriaId || c.criteriaKey), { message: 'Thiếu criteriaId hoặc criteriaKey' });
export type CriteriaScore = z.infer<typeof CriteriaScoreSchema>;

export const ReviewRevisionPayloadSchema = z.object({
  ratingOverall: z.number().int().min(1).max(5),
  criteriaScores: z.array(CriteriaScoreSchema).default([]),
  content: z.string().min(Quotas.REVIEW_MIN_LENGTH).max(Quotas.REVIEW_MAX_LENGTH),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  attachedAssetIds: z.array(z.string().uuid()).max(10).default([]),
});
export type ReviewRevisionPayload = z.infer<typeof ReviewRevisionPayloadSchema>;

export const CommentRevisionPayloadSchema = z.object({
  content: z.string().min(1).max(Quotas.COMMENT_MAX_LENGTH),
  stickerItemId: z.string().uuid().optional().nullable(),
  attachedAssetId: z.string().uuid().optional().nullable(),
});
export type CommentRevisionPayload = z.infer<typeof CommentRevisionPayloadSchema>;

export const CollectionItemPayloadSchema = z.object({
  placeId: z.string().uuid(),
  note: z.string().max(500).optional(),
  sortOrder: z.number().int().default(0),
});
export type CollectionItemPayload = z.infer<typeof CollectionItemPayloadSchema>;

export const CollectionRevisionPayloadSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  coverAssetId: z.string().uuid().optional().nullable(),
  isPublic: z.boolean().default(false),
  items: z.array(CollectionItemPayloadSchema).default([]),
});
export type CollectionRevisionPayload = z.infer<typeof CollectionRevisionPayloadSchema>;

export const PostRevisionPayloadSchema = z.object({
  title: z.string().min(5).max(200),
  summary: z.string().max(500).optional(),
  coverAssetId: z.string().uuid().optional().nullable(),
  placeIds: z.array(z.string().uuid()).default([]),
  contentBlocks: z.array(z.record(z.string(), z.any())).max(Quotas.MAX_BLOCKS_PER_REQUEST),
});
export type PostRevisionPayload = z.infer<typeof PostRevisionPayloadSchema>;

export const ReportCreateSchema = z.object({
  targetType: z.enum([
    TargetType.PLACE,
    TargetType.REVIEW,
    TargetType.COMMENT,
    TargetType.POST,
    TargetType.ASSET,
    TargetType.USER,
    TargetType.STICKER_PACK,
  ]),
  targetId: z.string().uuid(),
  reasonCode: z.string().min(1),
  description: z.string().max(2000).optional(),
  evidenceUrls: z.array(z.string().url()).default([]),
});
export type ReportCreate = z.infer<typeof ReportCreateSchema>;

export const PlaceSuggestionPayloadSchema = z.object({
  proposedName: z.string().min(2).max(150),
  categoryId: z.string().uuid(),
  addressDescription: z.string().min(5).max(300),
  regionId: z.string().uuid().optional().nullable(),
  campusId: z.string().uuid().optional().nullable(),
  initialData: z.record(z.string(), z.any()).default({}),
  isDraft: z.boolean().default(false),
});
export type PlaceSuggestionPayload = z.infer<typeof PlaceSuggestionPayloadSchema>;

export const SurveyRequestPayloadSchema = z.object({
  placeId: z.string().uuid().optional(),
  reason: z.string().min(5).max(500),
  targetAspects: z.array(z.string()).min(1).max(10),
});
export type SurveyRequestPayload = z.infer<typeof SurveyRequestPayloadSchema>;

export const PlaceChangeRequestPayloadSchema = z.object({
  placeId: z.string().uuid().optional(),
  baseRevisionId: z.string().uuid(),
  requestedChanges: z.record(z.string(), z.any()),
  evidenceAssetIds: z.array(z.string().uuid()).default([]),
});
export type PlaceChangeRequestPayload = z.infer<typeof PlaceChangeRequestPayloadSchema>;

