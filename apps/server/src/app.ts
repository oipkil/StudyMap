import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requestLogger } from './lib/logger.js';
import { sessionMiddleware } from './middleware/session.js';
import { errorHandler } from './middleware/errorHandler.js';
import { csrfTokenGenerator, csrfProtection } from './middleware/csrf.js';

import authRoutes from './modules/auth/auth.routes.js';
import adminUsersRoutes from './modules/admin/users.routes.js';
import adminFieldDefinitionsRoutes from './modules/admin/field-definitions.routes.js';
import adminPlacesRoutes from './modules/admin/places.admin.routes.js';
import placesRoutes from './modules/places/places.routes.js';
import geocodeRoutes from './modules/places/geocode.routes.js';
import meRoutes from './modules/me/me.routes.js';
import mediaRoutes from './modules/media/media.routes.js';
import communityRoutes from './modules/community/community.routes.js';
import adminCommunityRoutes from './modules/admin/community.admin.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import announcementsRoutes from './modules/announcements/announcements.routes.js';
import adminAnnouncementsRoutes from './modules/admin/announcements.admin.routes.js';
import supportRoutes from './modules/support/support.routes.js';
import adminSupportRoutes from './modules/admin/support.admin.routes.js';
import adminDashboardRoutes from './modules/admin/dashboard.admin.routes.js';
import adminAuditLogsRoutes from './modules/admin/audit-logs.admin.routes.js';
import adminReferenceRoutes from './modules/admin/reference.admin.routes.js';
import adminRetentionRoutes from './modules/admin/retention.admin.routes.js';
import cmsRoutes from './modules/cms/cms.routes.js';
import publicUserRoutes from './modules/users/users.public.routes.js';
import aiRoutes from './modules/ai/ai.routes.js';
import adminAiRoutes from './modules/admin/ai.admin.routes.js';
import adminIntegrationsRoutes from './modules/admin/integrations.admin.routes.js';
import readyRoutes from './modules/health/ready.routes.js';
import seoRoutes from './modules/seo/seo.routes.js';

export function createApp() {
  const app = express();
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const isTest = process.env.NODE_ENV === 'test';
  const isProd = process.env.NODE_ENV === 'production';
  // Sau nginx/Cloudflare: mặc định tin 1 lớp proxy khi chạy production, nếu không rate limit sẽ tính chung
  // cho MỌI người dùng theo IP của nginx (một người tải nhiều ảnh là cả site bị 429).
  const trustProxy = process.env.TRUST_PROXY ?? (isProd ? '1' : '');
  if (trustProxy) app.set('trust proxy', Number(trustProxy) || 1);

  // 1. Request ID & Request Logger
  app.use(requestIdMiddleware);
  app.use(requestLogger);

  // 2. Helmet & Content Security Policy
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          connectSrc: [
            "'self'",
            'ws:',
            'wss:',
            'http:',
            'https:',
            'https://unpkg.com',
            'https://demotiles.maplibre.org',
            'https://api.maptiler.com',
            'https://*.tile.openstreetmap.org',
          ],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // 3. CORS Configuration
  app.use(
    cors({
      origin: clientUrl,
      credentials: true,
    })
  );

  // 4. Rate Limiting (ponytail: in-memory store; use Redis Store when scaling to multi-node cluster)
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 50000 : isProd ? 1000 : 20000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, errorCode: 'RATE_LIMIT_EXCEEDED', message: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.' },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 50000 : isProd ? 100 : 1000, // prod: 100/15 phút mỗi IP (nhiều người dùng chung NAT trường); dev: nới lỏng
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, errorCode: 'RATE_LIMIT_EXCEEDED', message: 'Quá nhiều lần thử đăng nhập/đăng ký. Vui lòng chờ 15 phút.' },
  });

  // Ảnh phục vụ qua gateway: một trang có thể nạp hàng chục ảnh -> hạn mức riêng, rộng hơn,
  // để việc xem ảnh không bao giờ "ăn" hết hạn mức chung của các API nghiệp vụ.
  const mediaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 50000 : isProd ? 5000 : 50000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, errorCode: 'RATE_LIMIT_EXCEEDED', message: 'Bạn đang tải quá nhiều ảnh. Vui lòng thử lại sau.' },
  });

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isTest ? 50000 : isProd ? 60 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, errorCode: 'RATE_LIMIT_EXCEEDED', message: 'Hạn mức tải ảnh tạm thời bị vượt quá. Vui lòng thử lại sau.' },
  });

  // Bỏ ảnh ra khỏi hạn mức chung (đã có mediaLimiter riêng)
  app.use((req, res, next) => (req.method === 'GET' && req.path.startsWith('/api/v1/media/') ? next() : globalLimiter(req, res, next)));
  app.use('/api/v1/media', mediaLimiter);
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);
  app.use('/api/v1/auth/forgot-password', authLimiter);
  app.use('/api/v1/media/upload', uploadLimiter);

  // 5. Parsers & CSRF
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(csrfTokenGenerator);
  app.use(csrfProtection);
  app.use(sessionMiddleware);

  // 6. Health & Readiness & SEO endpoints
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
  app.use(readyRoutes);
  app.use(seoRoutes);

  // 7. Mount API modules
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/me/notifications', notificationsRoutes);
  app.use('/api/v1/me', meRoutes);
  app.use('/api/v1/announcements', announcementsRoutes);
  app.use('/api/v1/support', supportRoutes);
  app.use('/api/v1/cms', cmsRoutes);
  app.use('/api/v1/users', publicUserRoutes);
  app.use('/api/v1/admin/users', adminUsersRoutes);
  app.use('/api/v1/admin/field-definitions', adminFieldDefinitionsRoutes);
  app.use('/api/v1/admin/places', adminPlacesRoutes);
  app.use('/api/v1/admin/community', adminCommunityRoutes);
  app.use('/api/v1/admin/announcements', adminAnnouncementsRoutes);
  app.use('/api/v1/admin/support', adminSupportRoutes);
  app.use('/api/v1/admin/dashboard', adminDashboardRoutes);
  app.use('/api/v1/admin/audit-logs', adminAuditLogsRoutes);
  app.use('/api/v1/admin/reference', adminReferenceRoutes);
  app.use('/api/v1/admin/retention', adminRetentionRoutes);
  app.use('/api/v1/admin/ai', adminAiRoutes);
  app.use('/api/v1/admin/integrations', adminIntegrationsRoutes);
  app.use('/api/v1/places', geocodeRoutes); // trước placesRoutes để /geocode không bị /:slug bắt
  app.use('/api/v1/places', placesRoutes);
  app.use('/api/v1/media', mediaRoutes);
  app.use('/api/v1/community', communityRoutes);
  app.use('/api/v1/ai', aiRoutes);

  // 8. Centralized Error Handler
  app.use(errorHandler);

  return app;
}
