import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { User, Session, UserProfile } from '@prisma/client';
import { MOCK_SESSIONS } from '../lib/mock-auth.store.js';

export interface AuthenticatedUser extends User {
  profile: UserProfile | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionRecord?: Session;
    }
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.ssg_session || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return next();
  }

  try {
    const tokenHash = hashToken(token);
    const session = await prisma.session.findUnique({
      where: { sessionTokenHash: tokenHash },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (session && !session.revokedAt && session.expiresAt >= new Date()) {
      if (session.user.isLocked) {
        return next();
      }
      req.user = session.user;
      req.sessionRecord = session;
      return next();
    }
  } catch (err) {
    // Database offline or query error -> fallback to mock session
  }

  // Check mock session store (for development / offline mode)
  const mockSess = MOCK_SESSIONS.get(token);
  if (mockSess && mockSess.expiresAt >= new Date()) {
    if (mockSess.user.isLocked) {
      return next();
    }
    req.user = mockSess.user as any;
    req.sessionRecord = {
      id: 'mock-session-' + token,
      userId: mockSess.user.id,
      sessionTokenHash: hashToken(token),
      ipAddress: req.ip || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'MockAgent',
      expiresAt: mockSess.expiresAt,
      createdAt: new Date(),
      revokedAt: null,
    } as any;
  }

  next();
}
