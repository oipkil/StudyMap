import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../app.js';
import { initSocketServer, disconnectUserSockets } from '../socket/index.js';
import { prisma } from '../lib/prisma.js';
import { hashToken } from '../middleware/session.js';
import { Role } from '@ssg/shared';

const app = createApp();
let httpServer: http.Server;
let serverPort: number;

describe('Phase 2 Rigorous Verification: Account Lifecycle, CSRF, IDOR & Socket Revocation', () => {
  let adminCookie: string;
  let adminCsrfToken: string;
  let adminUserId: string;

  let student1Cookie: string;
  let student1CsrfToken: string;
  let student1UserId: string;

  let student2Cookie: string;
  let student2CsrfToken: string;
  let student2UserId: string;

  beforeAll(async () => {
    // Khởi động server HTTP & Socket.IO trên ephemeral port để test socket thật
    httpServer = http.createServer(app);
    initSocketServer(httpServer, 'http://localhost:5173');
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        if (typeof addr === 'object' && addr) {
          serverPort = addr.port;
        }
        resolve();
      });
    });

    // 1. Đăng nhập Admin
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'admin@ssg.edu.vn', password: 'Admin@123456' });
    expect(adminLoginRes.status).toBe(200);

    const cookies = (adminLoginRes.headers['set-cookie'] as unknown as string[]) || [];
    const sessionCookie = cookies.find((c) => c.startsWith('ssg_session='));
    const csrfCookie = cookies.find((c) => c.startsWith('ssg_csrf='));

    adminCookie = sessionCookie!.split(';')[0];
    adminCsrfToken = csrfCookie ? csrfCookie.split(';')[0].replace('ssg_csrf=', '') : '';
    adminUserId = adminLoginRes.body.data.user.id;

    // 2. Đăng nhập Student 1
    const s1LoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'sinhvien1@hcmus.edu.vn', password: 'Student@123456' });
    expect(s1LoginRes.status).toBe(200);

    const s1Cookies = (s1LoginRes.headers['set-cookie'] as unknown as string[]) || [];
    student1Cookie = s1Cookies.find((c) => c.startsWith('ssg_session='))!.split(';')[0];
    const s1Csrf = s1Cookies.find((c) => c.startsWith('ssg_csrf='));
    student1CsrfToken = s1Csrf ? s1Csrf.split(';')[0].replace('ssg_csrf=', '') : '';
    student1UserId = s1LoginRes.body.data.user.id;

    // 3. Đăng nhập Student 2
    const s2LoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'sinhvien2@hcmus.edu.vn', password: 'Student@123456' });
    expect(s2LoginRes.status).toBe(200);

    const s2Cookies = (s2LoginRes.headers['set-cookie'] as unknown as string[]) || [];
    student2Cookie = s2Cookies.find((c) => c.startsWith('ssg_session='))!.split(';')[0];
    const s2Csrf = s2Cookies.find((c) => c.startsWith('ssg_csrf='));
    student2CsrfToken = s2Csrf ? s2Csrf.split(';')[0].replace('ssg_csrf=', '') : '';
    student2UserId = s2LoginRes.body.data.user.id;
  });

  // =========================================================================
  // 0. BẢO VỆ XÁC THỰC CƠ BẢN, PHÂN QUYỀN RBAC & BẢO VỆ ADMIN CUỐI CÙNG
  // =========================================================================

  it('0.1. Đăng nhập sai mật khẩu trả về 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'sinhvien1@hcmus.edu.vn', password: 'SaiMatKhau@123' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('0.2. Khách vãng lai (chưa đăng nhập) truy cập route admin bị từ chối 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('0.3. Sinh viên đăng nhập thông thường cố truy cập route admin bị từ chối 403 FORBIDDEN', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Cookie', student1Cookie);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('0.4. Quản trị viên truy cập route admin thành công 200 OK', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('0.5. BẢO VỆ ADMIN CUỐI CÙNG: Chặn đứng hành vi khóa quản trị viên hoạt động duy nhất (400)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${adminUserId}/lock`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({ isLocked: true, reason: 'Thử nghiệm khóa admin duy nhất' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('quản trị viên hoạt động cuối cùng');
  });

  it('0.6. BẢO VỆ ADMIN CUỐI CÙNG: Chặn đứng hành vi hạ quyền quản trị viên hoạt động duy nhất (400)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${adminUserId}/role`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({ role: Role.USER, reason: 'Thử nghiệm hạ quyền admin duy nhất' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('quản trị viên hoạt động cuối cùng');
  });

  // =========================================================================
  // 1. TOÀN BỘ LUỒNG TÀI KHOẢN: ĐĂNG KÝ, XÁC THỰC EMAIL, RESET PASS, HẾT HẠN
  // =========================================================================

  it('1.1. Đăng ký tài khoản mới -> tạo email verification token trong database', async () => {
    const timestamp = Date.now();
    const email = `student_lifecycle_${timestamp}@hcmus.edu.vn`;
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        username: `lifecycle_${timestamp}`,
        password: 'Password@123456',
        displayName: 'Sinh Viên Kiểm Thử Lifecycle',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeDefined();
    expect(user!.isEmailVerified).toBe(false);

    // Kiểm tra token xác thực email tồn tại trong DB
    const tokenRecord = await prisma.authToken.findFirst({
      where: { userId: user!.id, tokenType: 'EMAIL_VERIFICATION' },
    });
    expect(tokenRecord).toBeDefined();
    expect(tokenRecord!.usedAt).toBeNull();
  });

  let reusableToken: string;

  it('1.2. Xác thực email thành công bằng token hợp lệ', async () => {
    const user = await prisma.user.create({
      data: {
        email: `verify_test_${Date.now()}@hcmus.edu.vn`,
        username: `verify_${Date.now()}`,
        passwordHash: 'dummy_hash',
        isEmailVerified: false,
      },
    });

    reusableToken = `raw_verify_token_${Date.now()}_${Math.random()}`;
    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(reusableToken),
        tokenType: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() + 3600000), // 1h
      },
    });

    const res = await request(app).get(`/api/v1/auth/verify-email?token=${reusableToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toContain('thành công');

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser!.isEmailVerified).toBe(true);
  });

  it('1.3. Chặn tái sử dụng token xác thực email đã dùng (Token reuse prevention)', async () => {
    const reuseRes = await request(app).get(`/api/v1/auth/verify-email?token=${reusableToken}`);
    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.success).toBe(false);
    expect(reuseRes.body.message).toContain('đã được sử dụng');
  });

  it('1.4. Chặn token xác thực email đã hết hạn', async () => {
    const user = await prisma.user.create({
      data: {
        email: `expired_test_${Date.now()}@hcmus.edu.vn`,
        username: `expired_${Date.now()}`,
        passwordHash: 'dummy_hash',
        isEmailVerified: false,
      },
    });

    const expiredToken = `expired_raw_token_${Date.now()}_${Math.random()}`;
    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(expiredToken),
        tokenType: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() - 3600000), // Đã hết hạn 1h trước
      },
    });

    const res = await request(app).get(`/api/v1/auth/verify-email?token=${expiredToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('hết hạn');
  });

  it('1.5. Quên mật khẩu & Đặt lại mật khẩu mới, thu hồi toàn bộ session cũ', async () => {
    const resetUserEmail = `reset_pwd_user_${Date.now()}@hcmus.edu.vn`;
    const user = await prisma.user.create({
      data: {
        email: resetUserEmail,
        username: `pwd_user_${Date.now()}`,
        passwordHash: 'dummy_hash',
        isEmailVerified: true,
      },
    });

    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: resetUserEmail });
    expect(forgotRes.status).toBe(200);

    const resetRecord = await prisma.authToken.findFirst({
      where: { userId: user.id, tokenType: 'PASSWORD_RESET' },
      orderBy: { createdAt: 'desc' },
    });
    expect(resetRecord).toBeDefined();

    const rawResetToken = `raw_reset_token_${Date.now()}_${Math.random()}`;
    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawResetToken),
        tokenType: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: rawResetToken,
        newPassword: 'BrandNewPassword@2026',
      });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);

    const newLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: resetUserEmail, password: 'BrandNewPassword@2026' });
    expect(newLoginRes.status).toBe(200);

    const reuseResetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({
        token: rawResetToken,
        newPassword: 'AnotherPassword@2026',
      });
    expect(reuseResetRes.status).toBe(400);
  });

  // =========================================================================
  // 2. KIỂM THỬ CSRF VÀ PHÂN QUYỀN DỮ LIỆU CÁ NHÂN (CHỐNG IDOR)
  // =========================================================================

  it('2.1. CHỐNG CSRF: Thao tác ghi dữ liệu (POST) có cookie session nhưng THIẾU CSRF token bị chặn 403', async () => {
    const res = await request(app)
      .post('/api/v1/me/collections')
      .set('Cookie', `ssg_session=${student1Cookie.replace('ssg_session=', '')}; ssg_csrf=dummy_csrf_token`)
      .send({ name: 'Bộ Sưu Tập Tấn Công CSRF', isPublic: false });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('CSRF token không hợp lệ hoặc bị thiếu');
  });

  it('2.2. CHỐNG CSRF: Thao tác ghi dữ liệu có CSRF token khớp hợp lệ được chấp thuận (201 Created)', async () => {
    const testCsrfToken = 'valid_test_csrf_token_123456';
    const res = await request(app)
      .post('/api/v1/me/collections')
      .set('Cookie', `${student1Cookie}; ssg_csrf=${testCsrfToken}`)
      .set('x-csrf-token', testCsrfToken)
      .send({ name: 'Quán Café Ôn Thi Riêng Tư Của An', description: 'Chỉ mình tôi xem', isPublic: false });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.revision.name).toBe('Quán Café Ôn Thi Riêng Tư Của An');
  });

  it('2.3. CHỐNG IDOR: User B KHÔNG thể đọc bộ sưu tập riêng tư của User A (403 FORBIDDEN)', async () => {
    const testCsrf = 'csrf_token_idor_test';
    const createRes = await request(app)
      .post('/api/v1/me/collections')
      .set('Cookie', `${student1Cookie}; ssg_csrf=${testCsrf}`)
      .set('x-csrf-token', testCsrf)
      .send({ name: 'Bí Mật Riêng Tư Của Student 1', isPublic: false });

    const collectionId = createRes.body.data.id;
    expect(collectionId).toBeDefined();

    const idorReadRes = await request(app)
      .get(`/api/v1/me/collections/${collectionId}`)
      .set('Cookie', student2Cookie);

    expect(idorReadRes.status).toBe(403);
    expect(idorReadRes.body.success).toBe(false);
    expect(idorReadRes.body.errorCode).toBe('FORBIDDEN');
    expect(idorReadRes.body.message).toContain('không có quyền truy cập');
  });

  it('2.4. CHỐNG IDOR: User B KHÔNG thể chỉnh sửa bộ sưu tập của User A (403 FORBIDDEN)', async () => {
    const testCsrf = 'csrf_token_idor_test_edit';
    const createRes = await request(app)
      .post('/api/v1/me/collections')
      .set('Cookie', `${student1Cookie}; ssg_csrf=${testCsrf}`)
      .set('x-csrf-token', testCsrf)
      .send({ name: 'Bộ Sưu Tập Gốc Của Student 1', isPublic: false });

    const collectionId = createRes.body.data.id;

    const idorEditRes = await request(app)
      .patch(`/api/v1/me/collections/${collectionId}`)
      .set('Cookie', `${student2Cookie}; ssg_csrf=${testCsrf}`)
      .set('x-csrf-token', testCsrf)
      .send({ name: 'Tên Đã Bị User B Hack' });

    expect(idorEditRes.status).toBe(403);
    expect(idorEditRes.body.success).toBe(false);
    expect(idorEditRes.body.errorCode).toBe('FORBIDDEN');
    expect(idorEditRes.body.message).toContain('không có quyền chỉnh sửa');
  });

  // =========================================================================
  // 3. KIỂM THỬ KẾT NỐI WEBSOCKET THẬT VÀ NGẮT KẾT NỐI KHI KHÓA / THU HỒI PHIÊN
  // =========================================================================

  it('3.1. Mở kết nối Socket.IO thật với session cookie hợp lệ -> kết nối thành công', async () => {
    const rawToken = student1Cookie.replace('ssg_session=', '');

    const clientSocket: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      extraHeaders: {
        cookie: `ssg_session=${rawToken}`,
      },
    });

    const isConnected = await new Promise<boolean>((resolve) => {
      clientSocket.on('connect', () => {
        resolve(true);
      });
      clientSocket.on('connect_error', () => {
        resolve(false);
      });
    });

    expect(isConnected).toBe(true);
    expect(clientSocket.connected).toBe(true);

    clientSocket.disconnect();
  });

  it('3.2. Khi tài khoản bị khóa hoặc phiên bị thu hồi -> Socket đang mở nhận event session.revoked và bị ngắt kết nối', async () => {
    const rawToken = student1Cookie.replace('ssg_session=', '');

    const clientSocket: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      extraHeaders: {
        cookie: `ssg_session=${rawToken}`,
      },
    });

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => resolve());
    });
    expect(clientSocket.connected).toBe(true);

    const revokedPromise = new Promise<string>((resolve) => {
      clientSocket.on('session.revoked', (data: any) => {
        resolve(data.message);
      });
    });

    const disconnectPromise = new Promise<boolean>((resolve) => {
      clientSocket.on('disconnect', () => {
        resolve(true);
      });
    });

    disconnectUserSockets(student1UserId);

    const revokedMsg = await revokedPromise;
    const isDisconnected = await disconnectPromise;

    expect(revokedMsg).toContain('bị thu hồi');
    expect(isDisconnected).toBe(true);
    expect(clientSocket.connected).toBe(false);
  });

  it('3.3. Thử kết nối lại Socket.IO bằng token không hợp lệ hoặc đã thu hồi -> Bị từ chối kết nối (connect_error)', async () => {
    const invalidSocket: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      extraHeaders: {
        cookie: 'ssg_session=invalid_or_revoked_session_token',
      },
    });

    const errorPromise = new Promise<boolean>((resolve) => {
      invalidSocket.on('connect_error', () => {
        resolve(true);
      });
      invalidSocket.on('connect', () => {
        resolve(false);
      });
    });

    const hasError = await errorPromise;
    expect(hasError).toBe(true);
    expect(invalidSocket.connected).toBe(false);
    invalidSocket.disconnect();
  });

  afterAll(async () => {
    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await prisma.$disconnect();
  });
});
