import { Request, Response, NextFunction } from 'express';
import { ErrorCode, Role } from '@ssg/shared';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.sessionRecord) {
    return res.status(401).json({
      success: false,
      errorCode: ErrorCode.UNAUTHORIZED,
      message: 'Bạn cần đăng nhập để thực hiện chức năng này',
    });
  }

  if (req.user.isLocked) {
    return res.status(403).json({
      success: false,
      errorCode: ErrorCode.FORBIDDEN,
      message: 'Tài khoản của bạn đã bị khóa bởi quản trị viên',
    });
  }

  next();
}

export function requireRole(expectedRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.sessionRecord) {
      return res.status(401).json({
        success: false,
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Bạn cần đăng nhập để truy cập tài nguyên này',
      });
    }

    if (req.user.role !== expectedRole) {
      return res.status(403).json({
        success: false,
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Bạn không có quyền truy cập vào khu vực quản trị này',
      });
    }

    next();
  };
}

export function requireEmailVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.sessionRecord) {
    return res.status(401).json({
      success: false,
      errorCode: ErrorCode.UNAUTHORIZED,
      message: 'Bạn cần đăng nhập để thực hiện chức năng này',
    });
  }

  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      errorCode: ErrorCode.FORBIDDEN,
      message: 'Vui lòng xác minh địa chỉ email trước khi gửi đóng góp nội dung',
    });
  }

  next();
}
