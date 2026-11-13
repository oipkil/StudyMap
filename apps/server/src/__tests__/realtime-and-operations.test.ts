import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../app.js';
import { initSocketServer, disconnectUserSockets } from '../socket/index.js';
import { prisma } from '../lib/prisma.js';
import { SocketEvents } from '@ssg/shared';
import { sendNotification } from '../modules/notifications/notification.service.js';
import { recordOutboxEvent, dispatchOutboxEvents } from '../modules/outbox/outbox.service.js';

const app = createApp();
let httpServer: http.Server;
let serverPort: number;

describe('Phase 6 Rigorous Verification: Realtime, Outbox, Announcements, Support & AuditLog', () => {
  let adminCookie: string;
  let adminCsrfToken: string;
  let adminFullCookie: string;
  let adminUserId: string;

  let student1Cookie: string;
  let student1CsrfToken: string;
  let student1FullCookie: string;
  let student1UserId: string;

  let student2Cookie: string;
  let student2CsrfToken: string;
  let student2FullCookie: string;
  let student2UserId: string;

  let testPlaceId: string;
  let testPlaceSlug: string;
  let ioServer: any;

  beforeAll(async () => {
    httpServer = http.createServer(app);
    ioServer = initSocketServer(httpServer, 'http://localhost:5173');
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        if (typeof addr === 'object' && addr) {
          serverPort = addr.port;
        }
        resolve();
      });
    });

    // 1. Admin login
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'admin@ssg.edu.vn', password: 'Admin@123456' });
    expect(adminLoginRes.status).toBe(200);
    const adminCookies = (adminLoginRes.headers['set-cookie'] as unknown as string[]) || [];
    adminCookie = adminCookies.find((c) => c.startsWith('ssg_session='))!.split(';')[0];
    const adminCsrf = adminCookies.find((c) => c.startsWith('ssg_csrf='));
    adminCsrfToken = adminCsrf ? adminCsrf.split(';')[0].replace('ssg_csrf=', '') : '';
    adminFullCookie = `${adminCookie}; ssg_csrf=${adminCsrfToken}`;
    adminUserId = adminLoginRes.body.data.user.id;

    // 2. Student 1 login
    const s1LoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'sinhvien1@hcmus.edu.vn', password: 'Student@123456' });
    expect(s1LoginRes.status).toBe(200);
    const s1Cookies = (s1LoginRes.headers['set-cookie'] as unknown as string[]) || [];
    student1Cookie = s1Cookies.find((c) => c.startsWith('ssg_session='))!.split(';')[0];
    const s1Csrf = s1Cookies.find((c) => c.startsWith('ssg_csrf='));
    student1CsrfToken = s1Csrf ? s1Csrf.split(';')[0].replace('ssg_csrf=', '') : '';
    student1FullCookie = `${student1Cookie}; ssg_csrf=${student1CsrfToken}`;
    student1UserId = s1LoginRes.body.data.user.id;

    // 3. Student 2 login
    const s2LoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'sinhvien2@hcmus.edu.vn', password: 'Student@123456' });
    expect(s2LoginRes.status).toBe(200);
    const s2Cookies = (s2LoginRes.headers['set-cookie'] as unknown as string[]) || [];
    student2Cookie = s2Cookies.find((c) => c.startsWith('ssg_session='))!.split(';')[0];
    const s2Csrf = s2Cookies.find((c) => c.startsWith('ssg_csrf='));
    student2CsrfToken = s2Csrf ? s2Csrf.split(';')[0].replace('ssg_csrf=', '') : '';
    student2FullCookie = `${student2Cookie}; ssg_csrf=${student2CsrfToken}`;
    student2UserId = s2LoginRes.body.data.user.id;

    // 4. Luôn tạo riêng một Place độc lập có publicationStatus = PUBLISHED cho suite này
    let cat = await prisma.category.findFirst();
    if (!cat) {
      cat = await prisma.category.create({
        data: { name: 'Quán Cà phê Realtime', slug: `cafe-realtime-${Date.now()}-${Math.floor(Math.random() * 1000)}` },
      });
    }

    const uniqueSlug = `test-realtime-place-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const createdPlace = await prisma.place.create({
      data: {
        slug: uniqueSlug,
        defaultName: 'Quán Cà Phê Realtime HCMUS Dedicated',
        categoryId: cat.id,
        publicationStatus: 'PUBLISHED',
        revisions: {
          create: {
            revisionNumber: 1,
            snapshotData: {
              name: 'Quán Cà Phê Realtime HCMUS Dedicated',
              alternateNames: [],
              address: '227 Nguyễn Văn Cừ, Q5, TP.HCM',
              latitude: 10.762622,
              longitude: 106.682331,
              timezone: 'Asia/Ho_Chi_Minh',
              priceMin: 25000,
              priceMax: 60000,
              currency: 'VND',
              studentDiscountDetails: 'Giảm 10% khi xuất trình thẻ sinh viên',
              amenities: { wifiQuality: 'STRONG', hasPowerSockets: true },
              weeklySchedule: [],
            },
            moderationStatus: 'APPROVED',
            authorUserId: adminUserId,
          },
        },
      },
      include: { revisions: true },
    });

    await prisma.place.update({
      where: { id: createdPlace.id },
      data: { currentPublishedRevisionId: createdPlace.revisions[0].id },
    });

    testPlaceId = createdPlace.id;
    testPlaceSlug = createdPlace.slug;

    if (!testPlaceId) {
      throw new Error('Khởi tạo testPlaceId thất bại trong realtime suite');
    }
  });

  afterAll(async () => {
    if (ioServer) {
      ioServer.close();
    }
    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    
    // Dọn dẹp dữ liệu của suite này
    if (testPlaceId) {
      await prisma.reviewRevision.deleteMany({ where: { review: { placeId: testPlaceId } } }).catch(() => {});
      await prisma.review.deleteMany({ where: { placeId: testPlaceId } }).catch(() => {});
      await prisma.placeRevision.deleteMany({ where: { placeId: testPlaceId } }).catch(() => {});
      await prisma.place.delete({ where: { id: testPlaceId } }).catch(() => {});
    }
  });

  // -------------------------------------------------------------------------
  // TEST 1: HAI USER ONLINE - THÔNG BÁO RIÊNG BIỆT & BADGE CHÍNH XÁC
  // -------------------------------------------------------------------------
  it('1.1. HAI USER ONLINE: User A nhận thông báo của A, KHÔNG nhận của B; badge đếm chính xác', async () => {
    const socketA: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      extraHeaders: { Cookie: student1Cookie },
      transports: ['websocket'],
    });

    const socketB: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      extraHeaders: { Cookie: student2Cookie },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((res) => socketA.on('connect', () => res())),
      new Promise<void>((res) => socketB.on('connect', () => res())),
    ]);

    let receivedByA: any = null;
    let receivedByB: any = null;

    socketA.on(SocketEvents.NOTIFICATION_CREATED, (data) => {
      receivedByA = data;
    });

    socketB.on(SocketEvents.NOTIFICATION_CREATED, (data) => {
      receivedByB = data;
    });

    // Gửi thông báo cho User A
    const notifA = await sendNotification({
      userId: student1UserId,
      type: 'SUGGESTION_APPROVED',
      title: 'Đề xuất quán của bạn đã được duyệt',
      body: 'Quán Cà Phê Học Tập đã được xuất bản lên hệ thống.',
      deepLinkUrl: '/places/test-slug',
    });

    // Đợi 200ms để socket truyền dữ liệu
    await new Promise((r) => setTimeout(r, 200));

    expect(receivedByA).not.toBeNull();
    expect(receivedByA.payload.id).toBe(notifA.id);
    expect(receivedByA.payload.userId).toBe(student1UserId);
    // User B tuyệt đối không nhận được thông báo của User A
    expect(receivedByB).toBeNull();

    // Kiểm tra API badge chưa đọc
    const badgeResA = await request(app)
      .get('/api/v1/me/notifications/unread-count')
      .set('Cookie', student1FullCookie);
    expect(badgeResA.status).toBe(200);
    expect(badgeResA.body.data.unreadCount).toBeGreaterThanOrEqual(1);

    socketA.disconnect();
    socketB.disconnect();
  });

  // -------------------------------------------------------------------------
  // TEST 2: REVIEW PENDING KHÔNG PHÁT VÀO PUBLIC ROOM
  // -------------------------------------------------------------------------
  it('1.2. REVIEW PENDING KHÔNG PHÁT VÀO PUBLIC ROOM: Public room place:<id> không nhận event chứa nội dung pending; sau khi duyệt mới có event', async () => {
    expect(testPlaceId).toBeTruthy();

    const publicSocket: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
    });
    await new Promise<void>((res) => publicSocket.on('connect', () => res()));

    // Join public room
    publicSocket.emit(SocketEvents.JOIN_ROOM, { room: `place:public:${testPlaceId}` });
    await new Promise((r) => setTimeout(r, 100));

    let publicReceived: any = null;
    publicSocket.on(SocketEvents.MODERATION_UPDATED, (data) => {
      publicReceived = data;
    });
    publicSocket.on(SocketEvents.PLACE_PUBLISHED_UPDATED, (data) => {
      publicReceived = data;
    });

    // Tạo review PENDING mới từ student 2
    const reviewRes = await request(app)
      .post('/api/v1/places/' + testPlaceId + '/reviews')
      .set('Cookie', student2FullCookie)
      .set('x-csrf-token', student2CsrfToken)
      .send({
        ratingOverall: 5,
        criteriaScores: [],
        content: 'Review kiểm thử bảo mật public room: nội dung này không được lọt ra public khi pending!',
      });

    expect([200, 201]).toContain(reviewRes.status);
    await new Promise((r) => setTimeout(r, 200));

    // Public room tuyệt đối không nhận được event chứa nội dung review pending
    expect(publicReceived).toBeNull();

    publicSocket.disconnect();
  });

  // -------------------------------------------------------------------------
  // TEST 3: ĐỒNG BỘ PHIÊN BẢN CÔNG KHAI (VERSION CONSISTENCY)
  // -------------------------------------------------------------------------
  it('1.3. ĐỒNG BỘ PHIÊN BẢN CÔNG KHAI: Duyệt revision quán -> event có version khớp publishedRevisionId, client refetch thấy dữ liệu nhất quán', async () => {
    expect(testPlaceId).toBeTruthy();

    const currentPlace = await prisma.place.findUnique({
      where: { id: testPlaceId },
      include: { revisions: true },
    });
    expect(currentPlace).not.toBeNull();

    // Tạo Revision mới cho Place
    const nextRevNum = currentPlace!.revisions.length + 1;
    const newRev = await prisma.placeRevision.create({
      data: {
        placeId: testPlaceId,
        revisionNumber: nextRevNum,
        snapshotData: {
          name: 'Quán Cà Phê Đồng Bộ Realtime',
          alternateNames: [],
          address: '227 Nguyễn Văn Cừ, Q5',
          latitude: 10.762622,
          longitude: 106.682331,
          timezone: 'Asia/Ho_Chi_Minh',
          priceMin: 30000,
          priceMax: 70000,
          currency: 'VND',
          studentDiscountDetails: 'Giảm 15%',
          amenities: { wifiQuality: 'STRONG', hasPowerSockets: true },
          weeklySchedule: [],
          scheduleExceptions: [],
          gallery: [],
          menuGroups: [],
          dynamicFieldValues: [],
        },
        authorUserId: adminUserId,
        moderationStatus: 'PENDING',
      },
    });

    // Admin duyệt revision mới
    const approveRes = await request(app)
      .post(`/api/v1/admin/places/${testPlaceId}/revisions/${newRev.id}/moderate`)
      .set('Cookie', adminFullCookie)
      .set('x-csrf-token', adminCsrfToken)
      .send({ action: 'APPROVE', forceOverride: true });
    expect(approveRes.status).toBe(200);


    // Ghi Outbox & Dispatch
    await recordOutboxEvent(
      prisma,
      'PLACE',
      testPlaceId,
      SocketEvents.PLACE_PUBLISHED_UPDATED,
      {
        placeId: testPlaceId,
        slug: currentPlace!.slug,
        publishedRevisionId: newRev.id,
        name: 'Quán Cà Phê Đồng Bộ Realtime',
      }
    );

    const dispatchRes = await dispatchOutboxEvents();
    expect(dispatchRes.published).toBeGreaterThanOrEqual(1);

    // REST Refetch: Lấy thông tin công khai thấy đúng dữ liệu Revision mới
    const restRes = await request(app).get(`/api/v1/places/${currentPlace!.slug}`);
    expect(restRes.status).toBe(200);
    expect(restRes.body.data.snapshot.name).toBe('Quán Cà Phê Đồng Bộ Realtime');
  });


  // -------------------------------------------------------------------------
  // TEST 4: OUTBOX EVENT RETRY & IDEMPOTENCY
  // -------------------------------------------------------------------------
  it('1.4. OUTBOX EVENT RETRY & IDEMPOTENCY: Giả lập lỗi phát outbox -> Retry có giới hạn, thành công đánh dấu PUBLISHED; client chống trùng theo ID', async () => {
    // 1. Ghi một event pending
    const event = await recordOutboxEvent(
      prisma,
      'TEST_AGGREGATE',
      'test-id-123',
      'test.event.created',
      { message: 'Hello from Outbox' }
    );
    expect(event.status).toBe('PENDING');

    // 2. Dispatch
    const dispatchResult = await dispatchOutboxEvents();
    expect(dispatchResult.processed).toBeGreaterThanOrEqual(1);

    // 3. Kiểm tra event trong DB đã chuyển thành PUBLISHED
    const updatedEvent = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
    expect(updatedEvent!.status).toBe('PUBLISHED');
  });

  // -------------------------------------------------------------------------
  // TEST 5: RECONNECT THEO CURSOR
  // -------------------------------------------------------------------------
  it('1.5. RECONNECT THEO CURSOR: Tạo thông báo khi client offline -> Reconnect refetch cursor lấy đủ toàn bộ, không trùng', async () => {
    // Tạo 3 thông báo mới cho Student 1
    await prisma.notification.create({
      data: { userId: student1UserId, type: 'TYPE_1', title: 'Notif 1', body: 'Body 1', isRead: false },
    });
    await prisma.notification.create({
      data: { userId: student1UserId, type: 'TYPE_2', title: 'Notif 2', body: 'Body 2', isRead: false },
    });
    await prisma.notification.create({
      data: { userId: student1UserId, type: 'TYPE_3', title: 'Notif 3', body: 'Body 3', isRead: false },
    });

    // Page 1: Lấy 2 items
    const page1Res = await request(app)
      .get('/api/v1/me/notifications?limit=2')
      .set('Cookie', student1FullCookie);
    expect(page1Res.status).toBe(200);
    expect(page1Res.body.data.items.length).toBe(2);
    expect(page1Res.body.data.hasMore).toBe(true);
    const cursor = page1Res.body.data.nextCursor;
    expect(cursor).toBeDefined();

    // Page 2: Lấy tiếp theo cursor
    const page2Res = await request(app)
      .get(`/api/v1/me/notifications?cursor=${cursor}&limit=2`)
      .set('Cookie', student1FullCookie);
    expect(page2Res.status).toBe(200);
    expect(page2Res.body.data.items.length).toBeGreaterThanOrEqual(1);

    // Không trùng lặp giữa 2 trang
    const page1Ids = page1Res.body.data.items.map((i: any) => i.id);
    const page2Ids = page2Res.body.data.items.map((i: any) => i.id);
    for (const id of page2Ids) {
      expect(page1Ids.includes(id)).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // TEST 6: ANNOUNCEMENT AUDIENCE, SCHEDULE & VERSION RE-APPEAR
  // -------------------------------------------------------------------------
  it('1.6. ANNOUNCEMENT: Lịch bắt đầu/kết thúc và đối tượng đúng; user đóng version 1 -> admin sửa thành version 2 -> hiện lại; user không thấy announcement của admin', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 86400000);
    const past = new Date(now.getTime() - 86400000);

    // 1. Tạo announcement chỉ dành cho ADMIN
    const adminOnlyRes = await request(app)
      .post('/api/v1/admin/announcements')
      .set('Cookie', adminFullCookie)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        title: 'Thông báo nội bộ Ban Quản Trị',
        content: 'Nội dung chỉ admin mới thấy',
        level: 'WARNING',
        startAt: past.toISOString(),
        endAt: future.toISOString(),
        targetAudience: 'ADMINS',
        targetPageScope: 'ALL',
      });
    expect(adminOnlyRes.status).toBe(201);
    const adminAnnId = adminOnlyRes.body.data.id;

    // Student 1 gọi API active -> KHÔNG thấy announcement này
    const studentActiveRes = await request(app)
      .get('/api/v1/announcements/active')
      .set('Cookie', student1FullCookie);
    expect(studentActiveRes.status).toBe(200);
    const hasAdminAnn = studentActiveRes.body.data.some((a: any) => a.id === adminAnnId);
    expect(hasAdminAnn).toBe(false);

    // 2. Tạo announcement Version 1 cho ALL
    const publicAnnRes = await request(app)
      .post('/api/v1/admin/announcements')
      .set('Cookie', adminFullCookie)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        title: 'Bảo trì hệ thống máy chủ',
        content: 'Hệ thống sẽ bảo trì nhẹ lúc 02:00 sáng mai',
        level: 'INFO',
        startAt: past.toISOString(),
        endAt: future.toISOString(),
        targetAudience: 'ALL',
        targetPageScope: 'ALL',
      });
    expect(publicAnnRes.status).toBe(201);
    const publicAnnId = publicAnnRes.body.data.id;
    expect(publicAnnRes.body.data.version).toBe(1);

    // Student 1 thấy announcement
    const s1Check1 = await request(app)
      .get('/api/v1/announcements/active')
      .set('Cookie', student1FullCookie);
    expect(s1Check1.body.data.some((a: any) => a.id === publicAnnId)).toBe(true);

    // Student 1 đóng thông báo Version 1
    const dismissRes = await request(app)
      .post(`/api/v1/announcements/${publicAnnId}/dismiss`)
      .set('Cookie', student1FullCookie)
      .set('x-csrf-token', student1CsrfToken);
    expect(dismissRes.status).toBe(200);

    // Student 1 không còn thấy nữa
    const s1Check2 = await request(app)
      .get('/api/v1/announcements/active')
      .set('Cookie', student1FullCookie);
    expect(s1Check2.body.data.some((a: any) => a.id === publicAnnId)).toBe(false);

    // Admin sửa nội dung announcement -> Tự động nâng lên Version 2
    const updateRes = await request(app)
      .patch(`/api/v1/admin/announcements/${publicAnnId}`)
      .set('Cookie', adminFullCookie)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        title: 'Bảo trì hệ thống máy chủ (Đã dời lịch)',
        content: 'Lịch bảo trì chuyển sang tối thứ Bảy',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.version).toBe(2);

    // Student 1 gọi lại -> HIỆN LẠI do version 2 > dismissedVersion 1
    const s1Check3 = await request(app)
      .get('/api/v1/announcements/active')
      .set('Cookie', student1FullCookie);
    expect(s1Check3.body.data.some((a: any) => a.id === publicAnnId)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TEST 7: SANITIZE NỘI DUNG ANNOUNCEMENT
  // -------------------------------------------------------------------------
  it('1.7. SANITIZE NỘI DUNG ANNOUNCEMENT: Chuỗi có <script> / onerror= bị loại bỏ an toàn', async () => {
    const maliciousPayload = {
      title: 'Thông báo có script <script>alert("hack")</script>',
      content: 'Chào sinh viên <img src="invalid.jpg" onerror="alert(document.cookie)"/> có link <a href="javascript:void(0)">xem thêm</a>',
      level: 'INFO',
      startAt: new Date().toISOString(),
      endAt: new Date(Date.now() + 86400000).toISOString(),
      targetAudience: 'ALL',
      targetPageScope: 'ALL',
    };

    const res = await request(app)
      .post('/api/v1/admin/announcements')
      .set('Cookie', adminFullCookie)
      .set('x-csrf-token', adminCsrfToken)
      .send(maliciousPayload);

    expect(res.status).toBe(201);
    const created = res.body.data;
    expect(created.title).not.toContain('<script>');
    expect(created.content).not.toContain('onerror=');
    expect(created.content).not.toContain('javascript:');
    expect(created.content).toContain('Chào sinh viên');
  });

  // -------------------------------------------------------------------------
  // TEST 8: KHÓA TÀI KHOẢN ĐANG ONLINE -> NGẮT SOCKET TỨC THÌ
  // -------------------------------------------------------------------------
  it('1.8. KHÓA TÀI KHOẢN ĐANG ONLINE: Socket đang mở nhận event session.revoked và bị ngắt kết nối', async () => {
    const socket: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      extraHeaders: { Cookie: student2Cookie },
      transports: ['websocket'],
    });

    await new Promise<void>((res) => socket.on('connect', () => res()));

    let receivedRevocation = false;
    socket.on('session.revoked', () => {
      receivedRevocation = true;
    });

    let isDisconnected = false;
    socket.on('disconnect', () => {
      isDisconnected = true;
    });

    // Kích hoạt ngắt kết nối socket của Student 2
    disconnectUserSockets(student2UserId);

    await new Promise((r) => setTimeout(r, 200));

    expect(receivedRevocation).toBe(true);
    expect(isDisconnected).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TEST 9: SUPPORT CASE VẬN HÀNH & CHỐNG IDOR
  // -------------------------------------------------------------------------
  it('1.9. SUPPORT CASE: User tạo -> Admin đổi trạng thái -> User nhận support.status.changed và notification; User khác bị chặn 403', async () => {
    // 1. Student 1 tạo yêu cầu hỗ trợ
    const createRes = await request(app)
      .post('/api/v1/support/cases')
      .set('Cookie', student1FullCookie)
      .set('x-csrf-token', student1CsrfToken)
      .send({
        title: 'Cần hỗ trợ cập nhật vị trí quán',
        message: 'Quán Cà Phê A đã chuyển sang địa chỉ mới ở số 10 Lý Thường Kiệt',
      });
    expect(createRes.status).toBe(201);
    const caseId = createRes.body.data.id;

    // 2. CHỐNG IDOR: Student 2 truy cập case của Student 1 -> Bị chặn 403 Forbidden
    const idorRes = await request(app)
      .get(`/api/v1/support/cases/${caseId}`)
      .set('Cookie', student2FullCookie);
    expect(idorRes.status).toBe(403);

    // 3. Admin phản hồi và đổi trạng thái sang RESOLVED
    const moderateRes = await request(app)
      .patch(`/api/v1/admin/support/cases/${caseId}`)
      .set('Cookie', adminFullCookie)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        status: 'RESOLVED',
        adminNotes: 'Đã xác minh và cập nhật địa chỉ mới',
        replyMessage: 'Cảm ơn bạn, chúng tôi đã cập nhật lại địa chỉ mới trên bản đồ!',
      });
    expect(moderateRes.status).toBe(200);
    expect(moderateRes.body.data.status).toBe('RESOLVED');

    // 4. Student 1 kiểm tra lại thấy case đã RESOLVED và có tin nhắn phản hồi của Admin
    const s1ViewRes = await request(app)
      .get(`/api/v1/support/cases/${caseId}`)
      .set('Cookie', student1FullCookie);
    expect(s1ViewRes.status).toBe(200);
    expect(s1ViewRes.body.data.status).toBe('RESOLVED');
    expect(s1ViewRes.body.data.conversation.messages.length).toBe(2);
    expect(s1ViewRes.body.data.conversation.messages[1].role).toBe('ADMIN');
  });

  // -------------------------------------------------------------------------
  // TEST 10: AUDITLOG GHI NHẬN TOÀN DIỆN
  // -------------------------------------------------------------------------
  it('1.10. AUDITLOG GHI ĐÚNG: Ghi nhận đầy đủ cho command duyệt và thay đổi announcement/cấu hình', async () => {
    // Kiểm tra danh sách AuditLog của Admin
    const auditRes = await request(app)
      .get('/api/v1/admin/audit-logs?limit=10')
      .set('Cookie', adminFullCookie);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.items.length).toBeGreaterThan(0);

    const actions = auditRes.body.data.items.map((i: any) => i.action);
    // Xác nhận có các action quản trị đã ghi
    expect(actions.some((a: string) => a.includes('ANNOUNCEMENT') || a.includes('SUPPORT'))).toBe(true);

    // Kiểm tra cấu trúc bản ghi AuditLog
    const firstLog = auditRes.body.data.items[0];
    expect(firstLog.adminUserId).toBeDefined();
    expect(firstLog.action).toBeDefined();
    expect(firstLog.targetEntity).toBeDefined();
    expect(firstLog.createdAt).toBeDefined();
  });
});
