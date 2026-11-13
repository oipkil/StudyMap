import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { hashToken } from '../middleware/session.js';
import { sanitizeHtml, ModerationStatus, PublicationStatus, ContentState } from '@ssg/shared';
import { redactSensitiveData } from '../lib/logger.js';
import { errorCounters } from '../middleware/errorHandler.js';

const app = createApp();

describe('Phase 8 Verification: Security Hardening, IDOR Table-Driven, XSS, Cache Invalidation & System Readiness', () => {
  let userA: any;
  let userB: any;
  let adminUser: any;

  let sessionTokenA: string;
  let sessionTokenB: string;
  let adminSessionToken: string;

  let cookieA: string;
  let cookieB: string;
  let adminCookie: string;

  let testPlaceA: any;
  let testCollectionA: any;
  let testSuggestionA: any;
  let testSupportCaseA: any;
  let testNotificationA: any;
  let testConversationA: any;
  let testReviewA: any;
  let testAssetA: any;

  beforeAll(async () => {
    // 1. Tạo 3 user test: User A, User B, Admin
    const time = Date.now();
    userA = await prisma.user.create({
      data: {
        email: `phase8_user_a_${time}@ssg.edu.vn`,
        username: `phase8_user_a_${time}`,
        passwordHash: 'dummy_hash',
        isEmailVerified: true,
        profile: {
          create: { displayName: 'Sinh Viên A (GĐ8)' },
        },
      },
      include: { profile: true },
    });

    userB = await prisma.user.create({
      data: {
        email: `phase8_user_b_${time}@ssg.edu.vn`,
        username: `phase8_user_b_${time}`,
        passwordHash: 'dummy_hash',
        isEmailVerified: true,
        profile: {
          create: { displayName: 'Sinh Viên B (GĐ8)' },
        },
      },
      include: { profile: true },
    });

    // Dùng admin seed thay vì tạo admin thứ hai: tạo thêm ADMIN sẽ làm test "bảo vệ admin cuối cùng"
    // (auth-and-admin.test.ts, chạy song song) khoá được admin seed và làm hỏng mọi suite khác.
    adminUser = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@ssg.edu.vn' },
      include: { profile: true },
    });

    // 2. Tạo Session cho từng user
    sessionTokenA = `session-token-a-${time}`;
    sessionTokenB = `session-token-b-${time}`;
    adminSessionToken = `session-token-admin-${time}`;

    await prisma.session.createMany({
      data: [
        {
          userId: userA.id,
          sessionTokenHash: hashToken(sessionTokenA),
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          userId: userB.id,
          sessionTokenHash: hashToken(sessionTokenB),
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          userId: adminUser.id,
          sessionTokenHash: hashToken(adminSessionToken),
          expiresAt: new Date(Date.now() + 86400000),
        },
      ],
    });

    cookieA = `ssg_session=${sessionTokenA}; ssg_csrf=csrf-token-${time}`;
    cookieB = `ssg_session=${sessionTokenB}; ssg_csrf=csrf-token-${time}`;
    adminCookie = `ssg_session=${adminSessionToken}; ssg_csrf=csrf-token-${time}`;

    // 3. Tạo Category và Place mẫu
    const cat = await prisma.category.findFirst() || await prisma.category.create({
      data: { name: 'Cà phê học tập GĐ8', slug: `cat-phase8-${time}` },
    });

    testPlaceA = await prisma.place.create({
      data: {
        slug: `place-phase8-${time}`,
        defaultName: 'Quán Test Bảo Mật GĐ8',
        categoryId: cat.id,
        publicationStatus: PublicationStatus.PUBLISHED,
      },
    });

    // 4. Tạo tài nguyên riêng tư của User A
    testCollectionA = await prisma.collection.create({
      data: {
        userId: userA.id,
        isPublic: false,
      },
    });

    testSuggestionA = await prisma.placeSuggestion.create({
      data: {
        userId: userA.id,
        categoryId: cat.id,
        proposedName: 'Đề xuất quán A',
        addressDescription: '123 Đường A',
        status: ModerationStatus.PENDING,
      },
    });

    testConversationA = await prisma.aIConversation.create({
      data: {
        userId: userA.id,
        title: 'Hội thoại AI của A',
      },
    });

    testSupportCaseA = await prisma.supportCase.create({
      data: {
        userId: userA.id,
        conversationId: testConversationA.id,
        status: 'WAITING',
      },
    });

    testNotificationA = await prisma.notification.create({
      data: {
        userId: userA.id,
        type: 'SYSTEM',
        title: 'Thông báo riêng tư của A',
        body: 'Nội dung bảo mật',
      },
    });

    testReviewA = await prisma.review.create({
      data: {
        placeId: testPlaceA.id,
        userId: userA.id,
        state: ContentState.PUBLISHED,
        ratingOverall: 5.0,
      },
    });

    testAssetA = await prisma.asset.create({
      data: {
        uploaderId: userA.id,
        originalName: 'test-private.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024,
        fileHash: `hash-${time}`,
        quarantineKey: `uploads/quarantine/test-private-${time}.jpg`,
        moderationStatus: ModerationStatus.PENDING,
      },
    });
  });

  afterAll(async () => {
    // Dọn dẹp an toàn các bản ghi test
    await prisma.notification.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.supportCase.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.aIConversation.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.collection.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.placeSuggestion.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.review.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.asset.deleteMany({ where: { uploaderId: { in: [userA.id, userB.id] } } });
    await prisma.session.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.session.deleteMany({ where: { sessionTokenHash: hashToken(adminSessionToken) } });
    if (testPlaceA) {
      await prisma.placePublishedProjection.deleteMany({ where: { placeId: testPlaceA.id } });
      await prisma.place.deleteMany({ where: { id: testPlaceA.id } });
    }
    await prisma.userProfile.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  });

  // =========================================================================
  // 1. TABLE-DRIVEN IDOR VERIFICATION
  // =========================================================================
  describe('1. IDOR & Access Control Table-Driven Verification', () => {
    const idorCases = [
      {
        name: 'Private Collection: User B cannot view User A private collection',
        method: 'get' as const,
        path: () => `/api/v1/me/collections/${testCollectionA.id}`,
        expectedStatus: 403,
      },
      {
        name: 'Private Collection: User B cannot update User A collection',
        method: 'patch' as const,
        path: () => `/api/v1/me/collections/${testCollectionA.id}`,
        body: { name: 'Hacked collection' },
        expectedStatus: 403,
      },
      {
        name: 'Suggestion: User B cannot update User A place suggestion',
        method: 'put' as const,
        path: () => `/api/v1/me/contributions/suggestions/${testSuggestionA.id}`,
        body: { proposedName: 'Hacked name' },
        expectedStatus: 403,
      },
      {
        name: 'Support Case: User B cannot view User A support case',
        method: 'get' as const,
        path: () => `/api/v1/support/cases/${testSupportCaseA.id}`,
        expectedStatus: 403,
      },
      {
        name: 'Notification: User B cannot mark User A notification as read',
        method: 'patch' as const,
        path: () => `/api/v1/me/notifications/${testNotificationA.id}/read`,
        expectedStatus: 404,
      },
      {
        name: 'AI Conversation: User B cannot view User A messages',
        method: 'get' as const,
        path: () => `/api/v1/ai/conversations/${testConversationA.id}/messages`,
        expectedStatus: 403,
      },
      {
        name: 'Private Media: User B cannot view User A pending/quarantined asset',
        method: 'get' as const,
        path: () => `/api/v1/media/${testAssetA.id}`,
        expectedStatus: 403,
      },
    ];

    idorCases.forEach((tc) => {
      it(`IDOR Guard: ${tc.name}`, async () => {
        let req = (request(app) as any)[tc.method](tc.path())
          .set('Cookie', cookieB)
          .set('X-CSRF-Token', cookieB.split('ssg_csrf=')[1] || 'csrf-token');
        if (tc.body) {
          req = req.send(tc.body);
        }
        const res = await req;
        expect([403, 404]).toContain(res.status);
      });
    });

    it('Guest access without session returns 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/me/notifications');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('Admin can access support case of User A with full permission', async () => {
      const res = await request(app).get(`/api/v1/support/cases/${testSupportCaseA.id}`).set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // =========================================================================
  // 2. MASS ASSIGNMENT PREVENTION
  // =========================================================================
  describe('2. Mass Assignment Prevention', () => {
    it('User cannot escalate role to ADMIN via registration or payload injection', async () => {
      const evilTime = Date.now();
      const res = await request(app).post('/api/v1/auth/register').send({
        email: `mass_assign_${evilTime}@ssg.edu.vn`,
        username: `mass_assign_${evilTime}`,
        password: 'Password@123',
        displayName: 'Attacker',
        role: 'ADMIN',
        isLocked: false,
        isEmailVerified: true,
      });

      expect(res.status).toBe(201);
      const createdUser = await prisma.user.findUnique({ where: { email: `mass_assign_${evilTime}@ssg.edu.vn` } });
      expect(createdUser?.role).toBe('USER');
      expect(createdUser?.isEmailVerified).toBe(false);

      // Clean up
      if (createdUser) {
        await prisma.session.deleteMany({ where: { userId: createdUser.id } });
        await prisma.authToken.deleteMany({ where: { userId: createdUser.id } });
        await prisma.userProfile.deleteMany({ where: { userId: createdUser.id } });
        await prisma.user.delete({ where: { id: createdUser.id } });
      }
    });
  });

  // =========================================================================
  // 3. XSS & HTML SANITIZATION
  // =========================================================================
  describe('3. XSS & HTML Sanitization', () => {
    it('Strips dangerous tags <script>, <iframe>, <object>, <embed>, <style>', () => {
      const dirty = '<p>Xin chào</p><script>alert("XSS")</script><iframe src="evil.com"></iframe><b>Quán rất đẹp</b>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('alert');
      expect(clean).not.toContain('<iframe');
      expect(clean).toContain('<p>Xin chào</p>');
      expect(clean).toContain('<b>Quán rất đẹp</b>');
    });

    it('Strips inline event handlers (onload, onclick, onerror)', () => {
      const dirty = '<img src="x" onerror="alert(1)" onload="evil()" /> <div onclick="steal()">Click</div>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('onload');
      expect(clean).not.toContain('onclick');
    });

    it('Strips javascript: and data: pseudo-protocols from links', () => {
      const dirty = '<a href="javascript:alert(1)">Click me</a> <a href="data:text/html,<script>alert(1)</script>">Dangerous</a>';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain('javascript:');
      expect(clean).not.toContain('data:text/html');
    });

    it('Enforces rel="noopener noreferrer" and target="_blank" on external links', () => {
      const link = '<a href="https://hcmus.edu.vn">HCMUS Portal</a>';
      const clean = sanitizeHtml(link);
      expect(clean).toContain('target="_blank"');
      expect(clean).toContain('rel="noopener noreferrer"');
    });
  });

  // =========================================================================
  // 4. REQUEST ID, STRUCTURED LOGGING & ERROR SANITIZATION
  // =========================================================================
  describe('4. Request ID, Structured Logging & Error Masking', () => {
    it('Responses include X-Request-Id header', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('Custom X-Request-Id sent in header is echoed back', async () => {
      const customId = 'req-trace-custom-999';
      const res = await request(app).get('/health').set('X-Request-Id', customId);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('Sensitive fields (password, apiKey, tokens) are redacted in logs', () => {
      const payload = {
        username: 'student1',
        password: 'SuperSecretPassword',
        apiKey: 'sk-secret-live-123456',
        nested: {
          token: 'jwt-token-val',
          publicInfo: 'visible',
        },
      };

      const redacted = redactSensitiveData(payload);
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.apiKey).toBe('[REDACTED]');
      expect(redacted.nested.token).toBe('[REDACTED]');
      expect(redacted.username).toBe('student1');
      expect(redacted.nested.publicInfo).toBe('visible');
    });

    it('Prisma error does NOT expose raw table names or SQL in response', async () => {
      // Intentionally trigger validation/Prisma error with invalid payload format
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: '', password: '' });

      expect(res.body.success).toBe(false);
      expect(res.body.requestId).toBeDefined();
      expect(JSON.stringify(res.body)).not.toContain('SELECT');
      expect(JSON.stringify(res.body)).not.toContain('INSERT');
      expect(JSON.stringify(res.body)).not.toContain('users_table');
    });
  });

  // =========================================================================
  // 5. CACHE & LIFECYCLE INVALIDATION (LUỒNG 3, 5, §30)
  // =========================================================================
  describe('5. Multi-Module Lifecycle & Cache Invalidation', () => {
    let lifecyclePlace: any;

    it('Step 1: When place is PUBLISHED, it is available across Search, Map, Compare, and SEO', async () => {
      const time = Date.now();
      const cat = await prisma.category.findFirst();

      lifecyclePlace = await prisma.place.create({
        data: {
          slug: `lifecycle-place-${time}`,
          defaultName: `Quán Vòng Đời ${time}`,
          categoryId: cat!.id,
          publicationStatus: PublicationStatus.PUBLISHED,
        },
      });

      const rev = await prisma.placeRevision.create({
        data: {
          placeId: lifecyclePlace.id,
          authorUserId: adminUser.id,
          revisionNumber: 1,
          moderationStatus: ModerationStatus.APPROVED,
          snapshotData: {
            name: `Quán Vòng Đời ${time}`,
            address: '227 Nguyễn Văn Cừ, Q5',
            priceMin: 20000,
            priceMax: 50000,
          },
        },
      });

      await prisma.place.update({
        where: { id: lifecyclePlace.id },
        data: { currentPublishedRevisionId: rev.id },
      });

      await prisma.placePublishedProjection.create({
        data: {
          placeId: lifecyclePlace.id,
          publishedRevisionId: rev.id,
          name: `Quán Vòng Đời ${time}`,
          slug: lifecyclePlace.slug,
          categoryId: cat!.id,
          latitude: 10.762622,
          longitude: 106.682331,
          priceMin: 20000,
          priceMax: 50000,
          ratingOverall: 4.8,
          reviewCount: 5,
        },
      });

      // 1. Check Search/List
      const searchRes = await request(app).get(`/api/v1/places?q=${encodeURIComponent(`Quán Vòng Đời ${time}`)}`);
      expect(searchRes.body.data.length).toBeGreaterThanOrEqual(1);

      // 2. Check Detail
      const detailRes = await request(app).get(`/api/v1/places/${lifecyclePlace.slug}`);
      expect(detailRes.status).toBe(200);

      // 3. Check Compare
      const compareRes = await request(app).post('/api/v1/places/compare').send({ placeIds: [testPlaceA.id, lifecyclePlace.id] });
      expect(compareRes.body.data.length).toBeGreaterThanOrEqual(1);

      // 4. Check SEO Share Preview
      const seoRes = await request(app).get(`/share/places/${lifecyclePlace.slug}`);
      expect(seoRes.status).toBe(200);
      expect(seoRes.text).toContain(`Quán Vòng Đời ${time}`);
    });

    it('Step 2: When place is UNPUBLISHED / REVOKED, it immediately disappears across all modules', async () => {
      // Unpublish place and remove projection
      await prisma.placePublishedProjection.deleteMany({ where: { placeId: lifecyclePlace.id } });
      await prisma.place.update({
        where: { id: lifecyclePlace.id },
        data: {
          publicationStatus: PublicationStatus.HIDDEN,
          currentPublishedRevisionId: null,
        },
      });

      // 1. Search must NOT return it
      const searchRes = await request(app).get(`/api/v1/places?q=${encodeURIComponent(lifecyclePlace.defaultName)}`);
      expect(searchRes.body.data.find((p: any) => p.slug === lifecyclePlace.slug)).toBeUndefined();

      // 2. Compare must NOT return it
      const compareRes = await request(app).post('/api/v1/places/compare').send({ placeIds: [testPlaceA.id, lifecyclePlace.id] });
      expect(compareRes.body.data.find((p: any) => p.id === lifecyclePlace.id)).toBeUndefined();

      // 3. SEO share preview must return 404 HTML
      const seoRes = await request(app).get(`/share/places/${lifecyclePlace.slug}`);
      expect(seoRes.status).toBe(404);
      expect(seoRes.text).toContain('404');

      // Clean up
      await prisma.placeRevision.deleteMany({ where: { placeId: lifecyclePlace.id } });
      await prisma.place.delete({ where: { id: lifecyclePlace.id } });
    });
  });

  // =========================================================================
  // 6. ACCOUNT DELETION & ANONYMIZATION
  // =========================================================================
  describe('6. Account Deletion & Anonymization Lifecycle', () => {
    it('Self-deletion revokes session, anonymizes profile to "Người dùng đã rời đi", and public profile becomes 404', async () => {
      const time = Date.now();
      const victim = await prisma.user.create({
        data: {
          email: `victim_${time}@ssg.edu.vn`,
          username: `victim_${time}`,
          passwordHash: 'dummy_hash',
          isEmailVerified: true,
          profile: {
            create: { displayName: 'Sinh Viên Xóa Tài Khoản' },
          },
        },
        include: { profile: true },
      });

      const token = `victim-token-${time}`;
      await prisma.session.create({
        data: {
          userId: victim.id,
          sessionTokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const victimCookie = `ssg_session=${token}; ssg_csrf=victim-csrf-${time}`;

      // Create a public review before deletion
      await prisma.review.create({
        data: {
          placeId: testPlaceA.id,
          userId: victim.id,
          state: ContentState.PUBLISHED,
          ratingOverall: 4.5,
        },
      });

      // Call delete-account
      const delRes = await request(app)
        .post('/api/v1/me/delete-account')
        .set('Cookie', victimCookie)
        .set('X-CSRF-Token', `victim-csrf-${time}`);
      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify sessions are gone
      const remainingSessions = await prisma.session.count({ where: { userId: victim.id } });
      expect(remainingSessions).toBe(0);

      // Verify user is locked and anonymized
      const updatedUser = await prisma.user.findUnique({
        where: { id: victim.id },
        include: { profile: true },
      });
      expect(updatedUser?.isLocked).toBe(true);
      expect(updatedUser?.profile?.displayName).toBe('Người dùng đã rời đi');

      // Verify public profile returns 404
      const profileRes = await request(app).get(`/api/v1/users/${victim.id}`);
      expect(profileRes.status).toBe(404);

      // Clean up
      await prisma.review.deleteMany({ where: { userId: victim.id } });
      await prisma.userProfile.deleteMany({ where: { userId: victim.id } });
      await prisma.user.delete({ where: { id: victim.id } });
    });
  });

  // =========================================================================
  // 7. SYSTEM READINESS & SEO ENDPOINTS
  // =========================================================================
  describe('7. System Readiness & SEO Endpoints', () => {
    it('GET /ready returns 200 with all components status', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.ready).toBe(true);
      expect(res.body.checks.db).toBe('ok');
      expect(res.body.checks.redis).toBe('ok');
      expect(res.body.checks.storage).toBe('ok');
      expect(res.body.checks.worker).toBe('ok');
    });

    it('GET /sitemap.xml returns XML sitemap', async () => {
      const res = await request(app).get('/sitemap.xml');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/xml');
      expect(res.text).toContain('<urlset');
    });

    it('GET /robots.txt returns robots content with sitemap reference', async () => {
      const res = await request(app).get('/robots.txt');
      expect(res.status).toBe(200);
      expect(res.text).toContain('User-agent: *');
      expect(res.text).toContain('Sitemap:');
    });

    it('Admin Dashboard Stats includes errorStats and aiQuota metrics', async () => {
      const res = await request(app).get('/api/v1/admin/dashboard/stats').set('Cookie', adminCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.errorStats).toBeDefined();
      expect(res.body.data.aiQuota).toBeDefined();
      expect(res.body.data.aiQuota.isNearLimit).toBe(false);
    });
  });
});
