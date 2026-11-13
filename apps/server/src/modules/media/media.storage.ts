import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const QUARANTINE_DIR = path.resolve(process.cwd(), 'uploads/quarantine');
export const PUBLIC_DIR = path.resolve(process.cwd(), 'uploads/public');
export const FRAMES_DIR = path.resolve(process.cwd(), 'uploads/frames');

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(QUARANTINE_DIR)) fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });

export interface DetectedFormat {
  mime: string;
  ext: string;
}

/**
 * Kiểm tra Magic Bytes thực tế của file, không tin tưởng header Content-Type của client
 */
export function detectRealMimeType(buffer: Buffer): DetectedFormat | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // GIF: 47 49 46 38 37 61 (GIF87a) hoặc 47 49 46 38 39 61 (GIF89a)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return { mime: 'image/gif', ext: 'gif' };
  }

  // WebP: RIFF .... WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  return null;
}

export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Chuyển storageKey (có thể là đường dẫn tuyệt đối của máy khác, ví dụ Windows "D:\...\uploads\public\x.webp")
 * về file thật trên máy hiện tại. Thử đúng đường dẫn trước, sau đó tìm theo tên file trong uploads/public|quarantine|frames.
 */
export function resolveStoredFile(storageKey: string | null | undefined): string | null {
  if (!storageKey) return null;
  if (fs.existsSync(storageKey)) return storageKey;
  // Tách theo cả "/" (Linux) và "\" (Windows)
  const parts = storageKey.split('\\').join('/').split('/');
  const base = parts.pop() || '';
  if (!base) return null;
  // frames: uploads/frames/<assetId>/<file> hoặc uploads/public/frames-<assetId>/<file>
  const parentDir = parts.length >= 2 ? parts[parts.length - 2] : '';
  const candidates = [
    path.join(PUBLIC_DIR, base),
    path.join(QUARANTINE_DIR, base),
    parentDir ? path.join(FRAMES_DIR, parentDir, base) : '',
    parentDir ? path.join(PUBLIC_DIR, parentDir, base) : '',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}
