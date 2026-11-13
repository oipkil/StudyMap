import { Request, Response, NextFunction } from 'express';
import { ErrorCode } from '@ssg/shared';
import { structuredLog } from '../lib/logger.js';

// Global in-memory error counter for Admin Dashboard statistics
export const errorCounters: Record<string, number> = {};

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = req.id;
  const isPrismaError =
    err?.name?.includes('Prisma') ||
    err?.constructor?.name?.includes('Prisma') ||
    err?.code?.startsWith?.('P');

  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || ErrorCode.INTERNAL_ERROR;
  let message = err.message || 'Đã xảy ra lỗi hệ thống nội bộ. Vui lòng thử lại sau.';

  // If Prisma error, sanitize and NEVER expose database tables, columns, or SQL syntax
  if (isPrismaError) {
    statusCode = 500;
    errorCode = ErrorCode.INTERNAL_ERROR;
    message = 'Đã xảy ra lỗi khi xử lý dữ liệu cơ sở dữ liệu. Vui lòng thử lại sau.';
  }

  // Increment error statistics
  const codeKey = errorCode || 'INTERNAL_ERROR';
  errorCounters[codeKey] = (errorCounters[codeKey] || 0) + 1;

  // Log error with structured logger
  structuredLog('ERROR', 'UNHANDLED_ERROR', {
    requestId,
    userId: req.user?.id || null,
    path: req.path,
    method: req.method,
    errorCode,
    errorMessage: err?.message,
    statusCode,
  });

  res.status(statusCode).json({
    success: false,
    errorCode,
    message,
    requestId,
    issues: err.issues || undefined,
  });
}
