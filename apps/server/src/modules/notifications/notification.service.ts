import { prisma } from '../../lib/prisma.js';
import { SocketEvents, SocketRooms } from '@ssg/shared';
import { recordOutboxEvent } from '../outbox/outbox.service.js';
import { emitToUser } from '../../socket/index.js';

export interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  body: string;
  deepLinkUrl?: string | null;
}

/**
 * Lưu thông báo vào DB trước, ghi OutboxEvent và phát sự kiện realtime
 */
export async function sendNotification(
  params: CreateNotificationParams,
  dbClient: any = prisma
) {
  const notification = await dbClient.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      deepLinkUrl: params.deepLinkUrl || null,
      isRead: false,
    },
  });

  const payload = {
    id: notification.id,
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    deepLinkUrl: params.deepLinkUrl || null,
    createdAt: notification.createdAt.toISOString(),
  };

  // Ghi vào outbox event
  await recordOutboxEvent(
    dbClient,
    'NOTIFICATION',
    notification.id,
    SocketEvents.NOTIFICATION_CREATED,
    {
      ...payload,
      targetRoom: SocketRooms.user(params.userId),
    }
  );

  // Phát trực tiếp qua socket nếu socket đang mở
  try {
    emitToUser(params.userId, SocketEvents.NOTIFICATION_CREATED, payload, notification.id);
  } catch (err) {
    // Nếu socket lỗi, outbox worker sẽ retry
  }

  return notification;
}
