import { Request, Response, NextFunction } from 'express';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'newpassword',
  'oldpassword',
  'token',
  'apikey',
  'secret',
  'authorization',
  'cookie',
  'ssg_session',
  'ssg_csrf',
]);

/**
 * Hàm khử các trường nhạy cảm trước khi ghi log
 */
export function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item));
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      result[key] = redactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function structuredLog(level: 'INFO' | 'WARN' | 'ERROR', event: string, data?: Record<string, any>) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(data ? redactSensitiveData(data) : {}),
  };
  if (level === 'ERROR') {
    console.error(JSON.stringify(payload));
  } else if (level === 'WARN') {
    console.warn(JSON.stringify(payload));
  } else {
    console.log(JSON.stringify(payload));
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const latencyMs = Date.now() - start;
    if (req.path !== '/health' && req.path !== '/ready') {
      structuredLog('INFO', 'HTTP_REQUEST', {
        requestId: req.id,
        userId: req.user?.id || null,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        latencyMs,
      });
    }
  });
  next();
}
