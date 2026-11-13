import { z } from 'zod';

export const AIProviderType = {
  OPENAI: 'OPENAI',
  ANTHROPIC: 'ANTHROPIC',
  GOOGLE: 'GOOGLE',
  OPENAI_COMPATIBLE: 'OPENAI_COMPATIBLE',
} as const;
export type AIProviderType = (typeof AIProviderType)[keyof typeof AIProviderType];

export const AIMessageStatus = {
  STARTED: 'STARTED',
  STREAMING: 'STREAMING',
  COMPLETED: 'COMPLETED',
  INTERRUPTED: 'INTERRUPTED',
  FAILED: 'FAILED',
} as const;
export type AIMessageStatus = (typeof AIMessageStatus)[keyof typeof AIMessageStatus];

export const SendChatMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(2000),
  idempotencyKey: z.string().min(10).max(64), // Client-provided idempotency key
  activePlaceId: z.string().uuid().optional(), // Place context if user is on place detail page
});
export type SendChatMessage = z.infer<typeof SendChatMessageSchema>;

export const StreamMessageDeltaPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  attemptId: z.string().uuid(),
  chunkSequence: z.number().int().nonnegative(),
  deltaText: z.string(),
});
export type StreamMessageDeltaPayload = z.infer<typeof StreamMessageDeltaPayloadSchema>;

export const StreamMessageSourcesPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  attemptId: z.string().uuid(),
  places: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      address: z.string(),
      priceRange: z.string().optional(),
      avatarUrl: z.string().optional(),
      matchReason: z.string().optional(),
    })
  ),
});
export type StreamMessageSourcesPayload = z.infer<typeof StreamMessageSourcesPayloadSchema>;

export const StreamMessageCompletedPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  attemptId: z.string().uuid(),
  totalChunks: z.number().int(),
  promptTokens: z.number().int().optional(),
  completionTokens: z.number().int().optional(),
  durationMs: z.number().int(),
});
export type StreamMessageCompletedPayload = z.infer<typeof StreamMessageCompletedPayloadSchema>;

export const StreamMessageFailedPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  attemptId: z.string().uuid(),
  errorCode: z.string(),
  errorMessage: z.string(),
  canRetryWithFallback: z.boolean().default(false),
});
export type StreamMessageFailedPayload = z.infer<typeof StreamMessageFailedPayloadSchema>;
