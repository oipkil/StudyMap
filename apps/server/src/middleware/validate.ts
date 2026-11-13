import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';
import { ErrorCode } from '@ssg/shared';

export function validateBody(schema: ZodTypeAny) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await schema.safeParseAsync(req.body);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(422).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: issues.length ? `Dữ liệu không hợp lệ: ${issues.slice(0, 3).map((i) => (i.path ? `${i.path} — ` : '') + i.message).join('; ')}` : 'Dữ liệu yêu cầu không hợp lệ',
        requestId: req.id,
        issues,
      });
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await schema.safeParseAsync(req.query);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(422).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: issues.length ? `Tham số không hợp lệ: ${issues.slice(0, 3).map((i) => (i.path ? `${i.path} — ` : '') + i.message).join('; ')}` : 'Tham số truy vấn không hợp lệ',
        requestId: req.id,
        issues,
      });
    }
    req.query = result.data as any;
    next();
  };
}
