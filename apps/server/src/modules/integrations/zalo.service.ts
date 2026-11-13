import { prisma } from '../../lib/prisma.js';
import { encryptSecret, decryptSecret } from '@ssg/shared';

/**
 * Bot Zalo: gửi thông báo ra nhóm/chat khi có việc cần duyệt.
 * Cấu hình động trong trang quản trị (token mã hoá AES-256-GCM như API key AI), không hard-code.
 * API: POST https://bot-api.zaloplatforms.com/bot{token}/sendMessage  { chat_id, text }
 */

const ZALO_API_BASE = process.env.ZALO_BOT_API_BASE || 'https://bot-api.zaloplatforms.com';

/** Các sự kiện có thể gửi sang Zalo — dùng chung cho server và trang cấu hình. */
export const ZALO_EVENTS = [
  { key: 'SUGGESTION_PENDING', label: 'Đề xuất quán mới chờ duyệt' },
  { key: 'REVIEW_PENDING', label: 'Đánh giá mới chờ duyệt' },
  { key: 'COMMENT_PENDING', label: 'Bình luận mới chờ duyệt' },
  { key: 'POST_PENDING', label: 'Bài trải nghiệm mới chờ duyệt' },
  { key: 'COLLECTION_PENDING', label: 'Bộ sưu tập mới chờ duyệt' },
  { key: 'STICKER_PACK_PENDING', label: 'Bộ nhãn dán mới chờ duyệt' },
  { key: 'MEDIA_PENDING', label: 'Ảnh mới chờ duyệt' },
  { key: 'REPORT_CREATED', label: 'Báo cáo vi phạm mới' },
  { key: 'SUPPORT_CASE', label: 'Yêu cầu hỗ trợ sinh viên mới' },
  { key: 'SURVEY_REQUEST', label: 'Khảo sát / báo sai thông tin quán' },
] as const;

export type ZaloEventKey = (typeof ZALO_EVENTS)[number]['key'];

const masterKey = () => process.env.ENCRYPTION_MASTER_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export function encryptBotToken(token: string) {
  const enc = encryptSecret(token, masterKey());
  return { encryptedToken: enc.ciphertext, iv: enc.iv, authTag: enc.authTag };
}

export function decryptBotToken(channel: { encryptedToken: string; iv: string; authTag: string }) {
  return decryptSecret({ ciphertext: channel.encryptedToken, iv: channel.iv, authTag: channel.authTag }, masterKey());
}

/** Che token khi trả về trang quản trị: chỉ lộ 6 ký tự đầu (phần id bot) và 4 ký tự cuối. */
export function maskToken(token: string) {
  if (token.length <= 12) return '••••••';
  return `${token.slice(0, 6)}••••••${token.slice(-4)}`;
}

interface ZaloCallResult {
  ok: boolean;
  status: number;
  body: any;
  error?: string;
}

async function callZalo(token: string, method: string, payload: Record<string, unknown>, timeoutMs = 10000): Promise<ZaloCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ZALO_API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 300) };
    }
    return { ok: res.ok && body?.ok !== false, status: res.status, body, error: body?.ok === false ? body?.message || body?.description : undefined };
  } catch (err) {
    return { ok: false, status: 0, body: null, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/** Gửi một tin nhắn văn bản tới chat_id chỉ định (dùng cho nút "Gửi thử"). */
export async function sendZaloMessage(token: string, chatId: string, text: string) {
  return callZalo(token, 'sendMessage', { chat_id: chatId, text: text.slice(0, 2000) });
}

/** Thông tin bot (kiểm tra token còn dùng được, hiện tên bot cho admin). */
export async function fetchZaloBotInfo(token: string) {
  const res = await callZalo(token, 'getMe', {}, 10000);
  return { ...res, bot: res.body?.result ?? null };
}

/** Đọc tin nhắn gần nhất bot nhận được — để lấy chat_id của người/nhóm (Zalo không cho tra cứu id trực tiếp). */
export async function fetchZaloUpdates(token: string, timeoutSeconds = 5) {
  const res = await callZalo(token, 'getUpdates', { timeout: String(timeoutSeconds) }, (timeoutSeconds + 5) * 1000);
  // 408 = không có tin mới trong khoảng chờ (long-poll), không phải lỗi token
  const noNewMessage = res.body?.error_code === 408 || /timeout/i.test(String(res.error || ''));
  const result = res.body?.result;
  const list = Array.isArray(result) ? result : result ? [result] : [];
  const chats = list
    .map((u: any) => u?.message ?? u)
    .filter(Boolean)
    .map((m: any) => ({
      chatId: m?.chat?.id ?? null,
      chatType: m?.chat?.chat_type ?? null,
      from: m?.from?.display_name ?? null,
      text: typeof m?.text === 'string' ? m.text.slice(0, 120) : null,
      date: m?.date ?? null,
    }))
    .filter((c: any) => c.chatId);
  return { ...res, chats, noNewMessage };
}

const fmtTime = () => new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

/**
 * Gửi thông báo sự kiện tới mọi kênh đang bật có đăng ký sự kiện đó.
 * Không bao giờ ném lỗi ra ngoài: hỏng kênh Zalo không được làm hỏng luồng nghiệp vụ.
 */
export async function notifyZalo(event: ZaloEventKey, payload: { title: string; body?: string; url?: string }) {
  try {
    const channels = await prisma.notificationChannel.findMany({ where: { isEnabled: true, kind: 'ZALO_BOT' } });
    const targets = channels.filter((c) => c.events.length === 0 || c.events.includes(event));
    if (targets.length === 0) return { sent: 0 };

    const base = process.env.PUBLIC_WEB_URL || process.env.CLIENT_URL || 'http://localhost:5173';
    const lines = [`🔔 ${payload.title}`, payload.body || '', payload.url ? `${base}${payload.url}` : '', `⏰ ${fmtTime()}`].filter(Boolean);
    const text = lines.join('\n');

    let sent = 0;
    for (const ch of targets) {
      // Gộp tin: nếu kênh đặt throttle và vừa gửi trong khoảng đó thì bỏ qua (tránh spam khi có nhiều việc liên tiếp)
      if (ch.throttleMinutes > 0 && ch.lastSentAt && Date.now() - new Date(ch.lastSentAt).getTime() < ch.throttleMinutes * 60000) continue;
      let token: string;
      try {
        token = decryptBotToken(ch);
      } catch {
        await prisma.notificationChannel.update({ where: { id: ch.id }, data: { lastStatus: 'ERROR', lastError: 'Không giải mã được token (ENCRYPTION_MASTER_KEY đã đổi?)' } });
        continue;
      }
      const res = await sendZaloMessage(token, ch.chatId, text);
      await prisma.notificationChannel.update({
        where: { id: ch.id },
        data: {
          lastStatus: res.ok ? 'OK' : 'ERROR',
          lastError: res.ok ? null : (res.error || `HTTP ${res.status}`).slice(0, 300),
          lastSentAt: res.ok ? new Date() : ch.lastSentAt,
        },
      });
      if (res.ok) sent += 1;
    }
    return { sent };
  } catch (err) {
    console.error('Gửi thông báo Zalo thất bại:', (err as Error).message);
    return { sent: 0 };
  }
}

/** Bắn thông báo nhưng không chờ (dùng trong route để không làm chậm phản hồi cho người dùng). */
export function notifyZaloAsync(event: ZaloEventKey, payload: { title: string; body?: string; url?: string }) {
  if (process.env.NODE_ENV === 'test') return;
  void notifyZalo(event, payload);
}
