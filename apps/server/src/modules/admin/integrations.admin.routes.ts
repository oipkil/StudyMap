import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ErrorCode } from '@ssg/shared';
import { requireAuth, requireRole } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { writeAudit } from '../../lib/audit.js';
import { ZALO_EVENTS, encryptBotToken, decryptBotToken, maskToken, sendZaloMessage, fetchZaloUpdates, fetchZaloBotInfo, notifyZalo, type ZaloEventKey } from '../integrations/zalo.service.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

const EVENT_KEYS = ZALO_EVENTS.map((e) => e.key) as [string, ...string[]];

const ChannelSchema = z.object({
  name: z.string().trim().min(2).max(80),
  chatId: z.string().trim().min(3).max(120),
  token: z.string().trim().min(20).max(300).optional(),
  isEnabled: z.boolean().optional(),
  events: z.array(z.enum(EVENT_KEYS)).optional(),
  throttleMinutes: z.number().int().min(0).max(1440).optional(),
});

const publicView = (c: any) => ({
  id: c.id,
  kind: c.kind,
  name: c.name,
  isEnabled: c.isEnabled,
  chatId: c.chatId,
  events: c.events,
  throttleMinutes: c.throttleMinutes,
  lastStatus: c.lastStatus,
  lastError: c.lastError,
  lastSentAt: c.lastSentAt,
  createdAt: c.createdAt,
  tokenMasked: (() => {
    try {
      return maskToken(decryptBotToken(c));
    } catch {
      return 'Không giải mã được';
    }
  })(),
});

/** Danh sách kênh + danh mục sự kiện để trang quản trị dựng form động. */
router.get('/channels', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const channels = await prisma.notificationChannel.findMany({ orderBy: { createdAt: 'asc' } });
    return res.json({ success: true, data: { channels: channels.map(publicView), events: ZALO_EVENTS } });
  } catch (err) {
    next(err);
  }
});

router.post('/channels', validateBody(ChannelSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as z.infer<typeof ChannelSchema>;
    if (!body.token) {
      return res.status(422).json({ success: false, errorCode: ErrorCode.VALIDATION_ERROR, message: 'Cần token của bot Zalo khi tạo kênh mới' });
    }
    const created = await prisma.notificationChannel.create({
      data: {
        kind: 'ZALO_BOT',
        name: body.name,
        chatId: body.chatId,
        ...encryptBotToken(body.token),
        isEnabled: body.isEnabled ?? true,
        events: body.events ?? ZALO_EVENTS.map((e) => e.key),
        throttleMinutes: body.throttleMinutes ?? 0,
      },
    });
    await writeAudit({ adminUserId: req.user!.id, action: 'CREATE_NOTIFICATION_CHANNEL', targetEntity: 'NotificationChannel', targetId: created.id, details: { name: created.name, events: created.events }, ipAddress: req.ip });
    return res.status(201).json({ success: true, data: publicView(created), message: 'Đã thêm kênh thông báo Zalo' });
  } catch (err) {
    next(err);
  }
});

router.put('/channels/:id', validateBody(ChannelSchema.partial()), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const body = req.body as Partial<z.infer<typeof ChannelSchema>>;
    const existing = await prisma.notificationChannel.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy kênh thông báo' });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.chatId !== undefined) data.chatId = body.chatId;
    if (body.isEnabled !== undefined) data.isEnabled = body.isEnabled;
    if (body.events !== undefined) data.events = body.events;
    if (body.throttleMinutes !== undefined) data.throttleMinutes = body.throttleMinutes;
    if (body.token) Object.assign(data, encryptBotToken(body.token));

    const updated = await prisma.notificationChannel.update({ where: { id }, data });
    await writeAudit({ adminUserId: req.user!.id, action: 'UPDATE_NOTIFICATION_CHANNEL', targetEntity: 'NotificationChannel', targetId: id, details: { fields: Object.keys(data) }, ipAddress: req.ip });
    return res.json({ success: true, data: publicView(updated), message: 'Đã cập nhật kênh thông báo' });
  } catch (err) {
    next(err);
  }
});

router.delete('/channels/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.notificationChannel.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy kênh thông báo' });
    await prisma.notificationChannel.delete({ where: { id } });
    await writeAudit({ adminUserId: req.user!.id, action: 'DELETE_NOTIFICATION_CHANNEL', targetEntity: 'NotificationChannel', targetId: id, details: { name: existing.name }, ipAddress: req.ip });
    return res.json({ success: true, message: 'Đã xoá kênh thông báo' });
  } catch (err) {
    next(err);
  }
});

/** Gửi thử một tin nhắn thật tới chat đã cấu hình (kiểm chứng token + chat_id). */
router.post('/channels/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const ch = await prisma.notificationChannel.findUnique({ where: { id } });
    if (!ch) return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy kênh thông báo' });

    let token: string;
    try {
      token = decryptBotToken(ch);
    } catch {
      return res.status(422).json({ success: false, errorCode: ErrorCode.VALIDATION_ERROR, message: 'Không giải mã được token — nhập lại token bot' });
    }
    const text = (req.body?.text as string) || `✅ SSG gửi thử từ kênh "${ch.name}" lúc ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
    const result = await sendZaloMessage(token, ch.chatId, text);
    await prisma.notificationChannel.update({
      where: { id },
      data: { lastStatus: result.ok ? 'OK' : 'ERROR', lastError: result.ok ? null : (result.error || `HTTP ${result.status}`).slice(0, 300), lastSentAt: result.ok ? new Date() : ch.lastSentAt },
    });
    if (!result.ok) {
      return res.status(502).json({ success: false, errorCode: ErrorCode.INTERNAL_ERROR, message: `Zalo từ chối: ${result.error || 'HTTP ' + result.status}`, data: result.body });
    }
    return res.json({ success: true, data: result.body, message: 'Đã gửi tin nhắn thử qua bot Zalo' });
  } catch (err) {
    next(err);
  }
});

/**
 * Lấy chat_id: Zalo không cho tra cứu, phải nhắn cho bot (hoặc trong nhóm) rồi đọc getUpdates.
 * Token lấy từ kênh đã lưu (:id) hoặc gửi kèm trong body khi chưa tạo kênh.
 */
router.post('/zalo/updates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token && req.body?.channelId) {
      const ch = await prisma.notificationChannel.findUnique({ where: { id: String(req.body.channelId) } });
      if (ch) token = decryptBotToken(ch);
    }
    if (!token) return res.status(422).json({ success: false, errorCode: ErrorCode.VALIDATION_ERROR, message: 'Cần token bot để đọc tin nhắn gần nhất' });

    const result = await fetchZaloUpdates(token, Number(req.body?.timeout) || 5);
    if (!result.ok && result.chats.length === 0 && !result.noNewMessage) {
      return res.status(502).json({ success: false, errorCode: ErrorCode.INTERNAL_ERROR, message: `Không đọc được tin nhắn: ${result.error || 'HTTP ' + result.status}` });
    }
    return res.json({
      success: true,
      data: { chats: result.chats },
      message: result.chats.length ? 'Đã đọc tin nhắn gần nhất của bot' : 'Chưa có tin nhắn mới — hãy nhắn cho bot (hoặc nhắn trong nhóm có bot) rồi bấm lại ngay sau đó',
    });
  } catch (err) {
    next(err);
  }
});

/** Kiểm tra token: gọi getMe của Zalo, trả về tên bot. */
router.post('/zalo/check', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token && req.body?.channelId) {
      const ch = await prisma.notificationChannel.findUnique({ where: { id: String(req.body.channelId) } });
      if (ch) token = decryptBotToken(ch);
    }
    if (!token) return res.status(422).json({ success: false, errorCode: ErrorCode.VALIDATION_ERROR, message: 'Cần token bot để kiểm tra' });
    const info = await fetchZaloBotInfo(token);
    if (!info.ok || !info.bot) {
      return res.status(502).json({ success: false, errorCode: ErrorCode.INTERNAL_ERROR, message: `Token không dùng được: ${info.error || 'HTTP ' + info.status}` });
    }
    return res.json({ success: true, data: info.bot, message: `Token hợp lệ — bot "${info.bot.display_name || info.bot.account_name}"` });
  } catch (err) {
    next(err);
  }
});

/** Bắn thử một sự kiện thật (ví dụ SUGGESTION_PENDING) qua toàn bộ kênh đang bật. */
router.post('/events/:event/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = req.params.event as ZaloEventKey;
    if (!EVENT_KEYS.includes(event)) return res.status(422).json({ success: false, errorCode: ErrorCode.VALIDATION_ERROR, message: 'Sự kiện không hợp lệ' });
    const result = await notifyZalo(event, { title: `[Thử] ${ZALO_EVENTS.find((e) => e.key === event)?.label}`, body: 'Tin nhắn thử từ trang quản trị SSG.', url: '/admin' });
    return res.json({ success: true, data: result, message: `Đã gửi tới ${result.sent} kênh` });
  } catch (err) {
    next(err);
  }
});

export default router;
