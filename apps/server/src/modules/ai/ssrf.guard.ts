import dns from 'node:dns/promises';
import { URL } from 'node:url';

/**
 * Kiểm tra xem một địa chỉ IP v4 / v6 có nằm trong dải mạng bị cấm (Private / Loopback / Link-local / Cloud Metadata) hay không
 */
export function isForbiddenIp(ip: string): boolean {
  // IPv4 loopback (127.0.0.0/8)
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

  // Private 10.0.0.0/8
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

  // Private 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  const match172 = ip.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (match172) {
    const second = parseInt(match172[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  // Private 192.168.0.0/16
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

  // Link-local / Cloud Metadata (169.254.0.0/16)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

  // IPv4 0.0.0.0/8
  if (/^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true;

  // IPv6 loopback & unspecified (::1, ::)
  if (ip === '::1' || ip === '::' || ip === '0:0:0:0:0:0:0:1' || ip === '0:0:0:0:0:0:0:0') return true;

  // IPv6 Link-local (fe80::/10)
  if (/^fe[89ab][0-9a-f]/i.test(ip)) return true;

  // IPv6 Unique Local Address (fc00::/7, fd00::/8)
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1, ::ffff:192.168.1.1...)
  const mappedIpv4 = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mappedIpv4) {
    return isForbiddenIp(mappedIpv4[1]);
  }

  return false;
}

/**
 * Kiểm tra host có nằm trong danh sách trusted internal hosts do người vận hành cấu hình hay không (ví dụ Ollama localhost:11434)
 */
export function isTrustedInternalHost(hostname: string, port: string): boolean {
  const trustedEnv = process.env.AI_TRUSTED_INTERNAL_HOSTS || '';
  if (!trustedEnv.trim()) return false;

  const trustedList = trustedEnv
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  const target = port ? `${hostname.toLowerCase()}:${port}` : hostname.toLowerCase();
  return trustedList.includes(target) || trustedList.includes(hostname.toLowerCase());
}

/**
 * Xác thực baseUrl chống SSRF
 */
export async function validateAiBaseUrl(rawUrl: string): Promise<{
  valid: boolean;
  error?: string;
  url?: URL;
}> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL không hợp lệ hoặc bị trống' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: 'Cú pháp URL không hợp lệ' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : '');

  // 1. Nếu là trusted internal host
  if (isTrustedInternalHost(hostname, parsed.port)) {
    return { valid: true, url: parsed };
  }

  // 2. Chỉ cho phép HTTPS đối với các endpoint thông thường
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Chỉ chấp nhận giao thức bảo mật https:// cho AI provider baseUrl' };
  }

  // 3. Chặn localhost trực tiếp
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === 'localhost.localdomain') {
    return { valid: false, error: 'Không được phép kết nối tới localhost hoặc mạng cục bộ' };
  }

  // 4. Nếu hostname là IP trực tiếp
  if (isForbiddenIp(hostname)) {
    return { valid: false, error: `Địa chỉ IP ${hostname} nằm trong dải mạng nội bộ hoặc cloud metadata bị cấm` };
  }

  // 5. Phân giải DNS và kiểm tra các IP trả về
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const record of addresses) {
      if (isForbiddenIp(record.address)) {
        return {
          valid: false,
          error: `Tên miền ${hostname} phân giải về IP nội bộ ${record.address} bị cấm (SSRF Protection)`,
        };
      }
    }
  } catch (err: any) {
    return { valid: false, error: `Không thể phân giải tên miền DNS cho ${hostname}: ${err.message}` };
  }

  return { valid: true, url: parsed };
}

/**
 * Custom fetch an toàn chống SSRF và chặn redirect tự động
 */
export function createSafeAiFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const validation = await validateAiBaseUrl(urlStr);
    if (!validation.valid) {
      throw new Error(`SSRF Blocked: ${validation.error}`);
    }

    return fetch(input, {
      ...init,
      redirect: 'error', // Chặn redirect tránh bypass SSRF
    });
  };
}
