import { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { parseCookie } from 'cookie';
import { prisma } from '../lib/prisma.js';
import { hashToken } from '../middleware/session.js';
import { SocketEvents, SocketRooms } from '@ssg/shared';

let io: SocketIOServer | null = null;
const userSocketsMap = new Map<string, Set<string>>(); // userId -> Set of socketIds

export function initSocketServer(httpServer: HttpServer, clientUrl: string): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: clientUrl,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication Middleware cho Socket.IO
  io.use(async (socket: Socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie;
      const parsedCookies = rawCookie ? parseCookie(rawCookie) : {};
      const token = parsedCookies.ssg_session || (socket.handshake.auth?.token as string | undefined);

      if (!token) {
        // Cho phép guest kết nối public room nhưng không gán user
        return next();
      }

      const tokenHash = hashToken(token);
      const session = await prisma.session.findUnique({
        where: { sessionTokenHash: tokenHash },
        include: { user: true },
      });

      if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.isLocked) {
        return next(new Error('Phiên đăng nhập không hợp lệ hoặc đã bị thu hồi'));
      }

      socket.data.user = session.user;
      socket.data.sessionId = session.id;
      next();
    } catch (err) {
      console.error('Lỗi xác thực socket:', err);
      next();
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;

    if (user) {
      const userRoom = SocketRooms.user(user.id);
      socket.join(userRoom);

      if (!userSocketsMap.has(user.id)) {
        userSocketsMap.set(user.id, new Set());
      }
      userSocketsMap.get(user.id)!.add(socket.id);

      if (user.role === 'ADMIN') {
        socket.join(SocketRooms.adminQueue());
      }

      console.log(`🔌 Người dùng ${user.username} đã kết nối WebSocket (Socket ID: ${socket.id})`);
    } else {
      console.log(`🔌 Khách đã kết nối WebSocket (Socket ID: ${socket.id})`);
    }

    // Room Join/Leave Handler
    socket.on(SocketEvents.JOIN_ROOM, (data: { room: string }) => {
      const room = data?.room;
      if (!room || typeof room !== 'string') return;

      // Bảo vệ: Chỉ cho phép join room công khai hoặc room hợp lệ
      if (room.startsWith('place:public:')) {
        socket.join(room);
      } else if (room.startsWith('conversation:') && user) {
        const convId = room.replace('conversation:', '');
        prisma.aIConversation
          .findUnique({
            where: { id: convId },
            select: { userId: true },
          })
          .then((conv) => {
            if (conv && (conv.userId === user.id || user.role === 'ADMIN')) {
              socket.join(room);
            }
          })
          .catch(() => {});
      }
    });

    socket.on(SocketEvents.LEAVE_ROOM, (data: { room: string }) => {
      const room = data?.room;
      if (room && typeof room === 'string') {
        socket.leave(room);
      }
    });

    socket.on('disconnect', () => {
      if (user && userSocketsMap.has(user.id)) {
        userSocketsMap.get(user.id)!.delete(socket.id);
        if (userSocketsMap.get(user.id)!.size === 0) {
          userSocketsMap.delete(user.id);
        }
      }
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO chưa được khởi tạo!');
  }
  return io;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}

/**
 * Phát sự kiện kèm Envelope ID & timestamp chống nhận trùng
 */
export function emitEnvelope<T>(targetRoom: string, event: string, payload: T, envelopeId?: string) {
  if (!io) return;
  const envelope = {
    id: envelopeId || crypto.randomUUID(),
    event,
    payload,
    timestamp: new Date().toISOString(),
  };
  io.to(targetRoom).emit(event, envelope);
  return envelope;
}

export function emitToUser<T>(userId: string, event: string, payload: T, envelopeId?: string) {
  return emitEnvelope(SocketRooms.user(userId), event, payload, envelopeId);
}

export function emitToAdminQueue<T>(event: string, payload: T, envelopeId?: string) {
  return emitEnvelope(SocketRooms.adminQueue(), event, payload, envelopeId);
}

export function emitToPlacePublic<T>(placeId: string, event: string, payload: T, envelopeId?: string) {
  return emitEnvelope(SocketRooms.placePublic(placeId), event, payload, envelopeId);
}

/**
 * Ngắt kết nối socket của user ngay lập tức khi session bị thu hồi hoặc tài khoản bị khóa
 */
export function disconnectUserSockets(userId: string) {
  if (!io) return;
  const socketIds = userSocketsMap.get(userId);
  if (socketIds) {
    for (const socketId of socketIds) {
      const sock = io.sockets.sockets.get(socketId);
      if (sock) {
        sock.emit('session.revoked', { message: 'Phiên đăng nhập đã bị thu hồi hoặc hết hạn' });
        sock.disconnect(true);
      }
    }
    userSocketsMap.delete(userId);
  }
}

