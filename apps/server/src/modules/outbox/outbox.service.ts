import { prisma } from '../../lib/prisma.js';
import { SocketEvents, SocketRooms } from '@ssg/shared';
import { emitEnvelope } from '../../socket/index.js';

export interface OutboxPayloadWrapper {
  targetRoom?: string;
  [key: string]: any;
}

/**
 * Ghi OutboxEvent trong cùng transaction với thay đổi nghiệp vụ
 */
export async function recordOutboxEvent(
  db: any,
  aggregateType: string,
  aggregateId: string,
  eventType: string,
  payload: OutboxPayloadWrapper
) {
  return db.outboxEvent.create({
    data: {
      aggregateType,
      aggregateId,
      eventType,
      payload: payload as any,
      status: 'PENDING',
    },
  });
}

/**
 * Dispatcher quét và phát các sự kiện PENDING qua Socket.IO
 * # ponytail: synchronous scan with retry limit 3, migrate to BullMQ job if high throughput
 */
export async function dispatchOutboxEvents(limit = 50): Promise<{ processed: number; published: number; failed: number }> {
  const pendingEvents = await prisma.outboxEvent.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let published = 0;
  let failed = 0;

  for (const event of pendingEvents) {
    const payload = (event.payload || {}) as OutboxPayloadWrapper;
    let targetRoom = payload.targetRoom;

    if (!targetRoom) {
      // Xác định room mặc định theo loại event
      if (event.eventType === SocketEvents.NOTIFICATION_CREATED && payload.userId) {
        targetRoom = SocketRooms.user(payload.userId);
      } else if (event.eventType === SocketEvents.MODERATION_UPDATED) {
        targetRoom = SocketRooms.adminQueue();
      } else if (event.eventType === SocketEvents.PLACE_PUBLISHED_UPDATED && payload.placeId) {
        targetRoom = SocketRooms.placePublic(payload.placeId);
      } else if (event.eventType === SocketEvents.SUPPORT_STATUS_CHANGED && payload.userId) {
        targetRoom = SocketRooms.user(payload.userId);
      } else if (event.eventType === SocketEvents.ANNOUNCEMENT_UPDATED) {
        targetRoom = 'ALL'; // Broadcast hoặc public
      } else {
        targetRoom = SocketRooms.adminQueue();
      }
    }

    try {
      // Phát Socket.IO với Envelope ID trùng với OutboxEvent ID để client deduplicate
      emitEnvelope(targetRoom, event.eventType, payload, event.id);

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PUBLISHED' },
      });
      published++;
    } catch (err) {
      console.error(`Lỗi phát OutboxEvent ${event.id}:`, err);
      const nextRetry = event.retryCount + 1;
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          retryCount: nextRetry,
          status: nextRetry >= 3 ? 'FAILED' : 'PENDING',
        },
      });
      failed++;
    }
  }

  return { processed: pendingEvents.length, published, failed };
}
