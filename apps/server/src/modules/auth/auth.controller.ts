import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { hashToken } from '../../middleware/session.js';
import { sendEmail } from '../../lib/mailer.js';
import { disconnectUserSockets } from '../../socket/index.js';
import { ErrorCode, Role } from '@ssg/shared';
import { MOCK_SESSIONS, findMockUserByIdentifier } from '../../lib/mock-auth.store.js';

const SESSION_EXPIRY_DAYS = 30;

function setSessionCookie(res: Response, token: string) {
  const isSecure = process.env.COOKIE_SECURE === 'true';
  res.cookie('ssg_session', token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie('ssg_session', { path: '/' });
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, username, password, displayName } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUsername = username.toLowerCase().trim();

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: normalizedEmail }, { username: normalizedUsername }],
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        errorCode: ErrorCode.CONFLICT,
        message: 'Email hoặc tên người dùng đã tồn tại trong hệ thống',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        username: normalizedUsername,
        passwordHash,
        role: Role.USER,
        profile: {
          create: {
            displayName: displayName.trim(),
          },
        },
      },
      include: { profile: true },
    });

    // Tạo verification token
    const verificationRaw = crypto.randomBytes(32).toString('hex');
    const verificationHash = hashToken(verificationRaw);
    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash: verificationHash,
        tokenType: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    });

    // Gửi email xác thực
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const verifyLink = `${clientUrl}/verify-email?token=${verificationRaw}`;
    await sendEmail({
      to: user.email,
      subject: 'Xác nhận địa chỉ email tài khoản SSG',
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Chào mừng bạn đến với SSG!</h2>
          <p>Vui lòng nhấn vào liên kết dưới đây để xác thực email của bạn:</p>
          <a href="${verifyLink}" style="background: #1890ff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Xác thực Email</a>
          <p style="color: #888; margin-top: 20px;">Liên kết có hiệu lực trong 24 giờ.</p>
        </div>
      `,
    });

    // Tự động tạo session đăng nhập
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = hashToken(rawSessionToken);
    await prisma.session.create({
      data: {
        userId: user.id,
        sessionTokenHash,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    setSessionCookie(res, rawSessionToken);

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.profile?.displayName,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          aiPrivacyConsentAccepted: user.aiPrivacyConsentAccepted,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.query.token as string;
    if (!token) {
      return res.status(400).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Mã xác thực email không được để trống',
      });
    }

    const tokenHash = hashToken(token);
    const authToken = await prisma.authToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!authToken || authToken.tokenType !== 'EMAIL_VERIFICATION') {
      return res.status(400).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Mã xác thực không hợp lệ',
      });
    }

    if (authToken.usedAt) {
      return res.status(400).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Mã xác thực này đã được sử dụng trước đó',
      });
    }

    if (authToken.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Mã xác thực email đã hết hạn',
      });
    }

    await prisma.$transaction([
      prisma.authToken.update({
        where: { id: authToken.id },
        data: { usedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: authToken.userId },
        data: { isEmailVerified: true },
      }),
    ]);

    return res.json({
      success: true,
      data: { message: 'Xác thực địa chỉ email thành công!' },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { identifier, password } = req.body;
    const normalizedIdentifier = identifier.toLowerCase().trim();

    let user: any = null;
    try {
      user = await prisma.user.findFirst({
        where: {
          OR: [{ email: normalizedIdentifier }, { username: normalizedIdentifier }],
        },
        include: { profile: true },
      });
    } catch (dbErr) {
      console.warn('⚠️ [Database Fallback] Checking mock users for login:', (dbErr as Error).message);
    }

    if (!user) {
      const mockUser = findMockUserByIdentifier(normalizedIdentifier);
      if (mockUser) {
        if (mockUser.isLocked) {
          return res.status(403).json({
            success: false,
            errorCode: ErrorCode.FORBIDDEN,
            message: 'Tài khoản đã bị khóa do vi phạm chính sách',
          });
        }
        const rawSessionToken = crypto.randomBytes(32).toString('hex');
        MOCK_SESSIONS.set(rawSessionToken, {
          user: mockUser,
          expiresAt: new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        });
        setSessionCookie(res, rawSessionToken);
        return res.json({
          success: true,
          data: {
            user: {
              id: mockUser.id,
              email: mockUser.email,
              username: mockUser.username,
              displayName: mockUser.profile?.displayName,
              avatarUrl: null,
              role: mockUser.role,
              isEmailVerified: mockUser.isEmailVerified,
              aiPrivacyConsentAccepted: mockUser.aiPrivacyConsentAccepted,
            },
          },
        });
      }

      return res.status(401).json({
        success: false,
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Tài khoản hoặc mật khẩu không chính xác',
      });
    }

    if (user.isLocked) {
      return res.status(403).json({
        success: false,
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Tài khoản đã bị khóa do vi phạm chính sách',
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Tài khoản hoặc mật khẩu không chính xác',
      });
    }

    // Tạo Session mới
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = hashToken(rawSessionToken);
    try {
      await prisma.session.create({
        data: {
          userId: user.id,
          sessionTokenHash,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          expiresAt: new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        },
      });
    } catch {
      MOCK_SESSIONS.set(rawSessionToken, {
        user: user as any,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      });
    }

    setSessionCookie(res, rawSessionToken);

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.profile?.displayName,
          avatarUrl: user.profile?.currentPublishedAvatarAssetId ? `/api/v1/media/${user.profile.currentPublishedAvatarAssetId}?variant=thumb&preview=true` : null,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          aiPrivacyConsentAccepted: user.aiPrivacyConsentAccepted,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.ssg_session || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      MOCK_SESSIONS.delete(token);
    }
    if (req.sessionRecord) {
      try {
        await prisma.session.update({
          where: { id: req.sessionRecord.id },
          data: { revokedAt: new Date() },
        });
      } catch {}
    }
    clearSessionCookie(res);
    return res.json({ success: true, data: { message: 'Đăng xuất thành công' } });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.json({ success: true, data: null });
    }

    let unreadCount = 0;
    try {
      unreadCount = await prisma.notification.count({
        where: { userId: req.user.id, isRead: false },
      });
    } catch {}

    return res.json({
      success: true,
      data: {
        id: req.user.id,
        email: req.user.email,
        username: req.user.username,
        displayName: req.user.profile?.displayName || req.user.username,
        bio: req.user.profile?.currentPublishedBio || null,
        avatarAssetId: req.user.profile?.currentPublishedAvatarAssetId || null,
        avatarUrl: req.user.profile?.currentPublishedAvatarAssetId ? `/api/v1/media/${req.user.profile.currentPublishedAvatarAssetId}?variant=thumb&preview=true` : null,
        role: req.user.role,
        isEmailVerified: req.user.isEmailVerified,
        aiPrivacyConsentAccepted: req.user.aiPrivacyConsentAccepted,
        unreadNotificationsCount: unreadCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    // Tránh timing/enumeration attack: Luôn trả về thông điệp thành công chung
    if (user) {
      const resetRaw = crypto.randomBytes(32).toString('hex');
      const resetHash = hashToken(resetRaw);

      await prisma.authToken.create({
        data: {
          userId: user.id,
          tokenHash: resetHash,
          tokenType: 'PASSWORD_RESET',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 giờ
        },
      });

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const resetLink = `${clientUrl}/reset-password?token=${resetRaw}`;
      await sendEmail({
        to: user.email,
        subject: 'Yêu cầu đặt lại mật khẩu SSG',
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>Yêu cầu đặt lại mật khẩu</h2>
            <p>Bạn nhận được email này vì đã gửi yêu cầu đặt lại mật khẩu tài khoản SSG.</p>
            <a href="${resetLink}" style="background: #ff4d4f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Đặt lại Mật Khẩu</a>
            <p style="color: #888; margin-top: 20px;">Liên kết này hết hạn sau 1 giờ. Nếu bạn không yêu cầu, vui lòng bỏ qua email này.</p>
          </div>
        `,
      });
    }

    return res.json({
      success: true,
      data: {
        message: 'Nếu địa chỉ email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi tới hòm thư của bạn.',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token, newPassword } = req.body;
    const tokenHash = hashToken(token);

    const authToken = await prisma.authToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!authToken || authToken.usedAt || authToken.expiresAt < new Date() || authToken.tokenType !== 'PASSWORD_RESET') {
      return res.status(400).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Cập nhật mật khẩu và thu hồi toàn bộ session cũ
    await prisma.$transaction([
      prisma.user.update({
        where: { id: authToken.userId },
        data: { passwordHash },
      }),
      prisma.authToken.update({
        where: { id: authToken.id },
        data: { usedAt: new Date() },
      }),
      prisma.session.updateMany({
        where: { userId: authToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Ngắt kết nối socket của user ngay lập tức
    disconnectUserSockets(authToken.userId);
    clearSessionCookie(res);

    return res.json({
      success: true,
      data: { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại với mật khẩu mới.' },
    });
  } catch (err) {
    next(err);
  }
}

export async function getSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const sessions = await prisma.session.findMany({
      where: {
        userId: req.user!.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return res.json({
      success: true,
      data: {
        currentSessionId: req.sessionRecord!.id,
        sessions,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function revokeAllOtherSessions(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.session.updateMany({
      where: {
        userId: req.user!.id,
        id: { not: req.sessionRecord!.id },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    // Ngắt kết nối socket của các thiết bị khác
    disconnectUserSockets(req.user!.id);

    return res.json({
      success: true,
      data: { message: 'Đã thu hồi tất cả các phiên đăng nhập khác thành công' },
    });
  } catch (err) {
    next(err);
  }
}
