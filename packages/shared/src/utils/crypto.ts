import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

/**
 * Mã hóa khóa bí mật bằng AES-256-GCM
 * @param plaintext Chuỗi nhạy cảm cần mã hóa (ví dụ API Key)
 * @param masterKeyHex Chuỗi hex 64 ký tự (32 bytes)
 */
export function encryptSecret(plaintext: string, masterKeyHex: string): EncryptedData {
  const key = Buffer.from(masterKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_MASTER_KEY phải là chuỗi hex 64 ký tự (32 bytes)');
  }

  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag,
  };
}

/**
 * Giải mã khóa bí mật bằng AES-256-GCM
 */
export function decryptSecret(data: EncryptedData, masterKeyHex: string): string {
  const key = Buffer.from(masterKeyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_MASTER_KEY phải là chuỗi hex 64 ký tự (32 bytes)');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(data.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

  let plaintext = decipher.update(data.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Che giấu API key khi trả về UI
 * Ví dụ: "sk-proj-1234567890abcdef" -> "sk-proj-••••••••cdef"
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return '••••••••';
  const prefix = apiKey.slice(0, 8);
  const suffix = apiKey.slice(-4);
  return `${prefix}••••••••${suffix}`;
}
