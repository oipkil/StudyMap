export const SocketEvents = {
  // Client -> Server
  CHAT_SEND: 'chat.message.send',
  CHAT_STOP: 'chat.message.stop',
  JOIN_ROOM: 'room.join',
  LEAVE_ROOM: 'room.leave',

  // Server -> Client (AI Streaming)
  CHAT_STARTED: 'chat.message.started',
  CHAT_DELTA: 'chat.message.delta',
  CHAT_SOURCES: 'chat.message.sources',
  CHAT_COMPLETED: 'chat.message.completed',
  CHAT_FAILED: 'chat.message.failed',

  // Server -> Client (Support)
  SUPPORT_STATUS_CHANGED: 'support.status.changed',

  // Server -> Client (Moderation & Processing)
  MODERATION_UPDATED: 'moderation.updated',
  ASSET_PROCESSING_UPDATED: 'asset.processing.updated',

  // Server -> Client (General Notifications)
  NOTIFICATION_CREATED: 'notification.created',
  PLACE_PUBLISHED_UPDATED: 'place.published.updated',
  ANNOUNCEMENT_UPDATED: 'announcement.updated',
} as const;

export const SocketRooms = {
  user: (userId: string) => `user:${userId}`,
  adminQueue: () => 'admin:moderation_queue',
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  placePublic: (placeId: string) => `place:public:${placeId}`,
} as const;

export interface EventEnvelope<T = any> {
  id: string;
  event: string;
  payload: T;
  timestamp: string;
}

export interface ModerationUpdatedPayload {
  targetType: string;
  targetId: string;
  status: string;
  version?: number;
  reviewerNote?: string;
}

export interface AssetProcessingUpdatedPayload {
  assetId: string;
  revisionId?: string;
  status: string;
  isReady: boolean;
}

export interface NotificationCreatedPayload {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  deepLinkUrl?: string | null;
  createdAt: string;
}

export interface PlacePublishedUpdatedPayload {
  placeId: string;
  slug: string;
  publishedRevisionId: string;
  name: string;
}

export interface AnnouncementUpdatedPayload {
  id: string;
  version: number;
  title: string;
  level: string;
  action: 'PUBLISHED' | 'UPDATED' | 'REMOVED';
}

export interface SupportStatusChangedPayload {
  caseId: string;
  userId: string;
  status: string;
  updatedByAdminId?: string;
}

