import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { ErrorCode } from '@ssg/shared';

const CSRF_COOKIE_NAME = 'ssg_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Middleware phát sinh CSRF token và gửi về qua cookie có thể đọc được bởi JS (httpOnly: false)
 */
export function csrfTokenGenerator(req: Request, res: Response, next: NextFunction) {
  let token = req.cookies?.[CSRF_COOKIE_NAME];
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Để client đọc và gửi lại qua header x-csrf-token
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      path: '/',
    });
  }
  next();
}

/**
 * Middleware bảo vệ chống CSRF cho các phương thức ghi dữ liệu (POST, PUT, PATCH, DELETE)
 * Ngoại lệ: Public endpoints như login, register, forgot-password không yêu cầu CSRF session có sẵn
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Bỏ qua cho các route auth công khai khởi tạo phiên
  const publicAuthPaths = [
    '/api/v1/auth/register',
    '/api/v1/auth/login',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
  ];
  if (publicAuthPaths.some((p) => req.path.startsWith(p))) {
    return next();
  }

  // Nếu request có cookie session, bắt buộc phải có x-csrf-token hợp lệ
  const sessionToken = req.cookies?.ssg_session;
  if (sessionToken) {
    const expectedToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

    if (!expectedToken || !headerToken || headerToken !== expectedToken) {
      return res.status(403).json({
        success: false,
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Mã CSRF token không hợp lệ hoặc bị thiếu. Yêu cầu bị từ chối để bảo vệ phiên của bạn.',
      });
    }
  }

  next();
}
