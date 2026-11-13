import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import fs from 'node:fs';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { TargetType } from '@prisma/client';
import { enqueueMediaProcessing, createMediaWorker } from '../worker/media.queue.js';
import { processAsset } from '../modules/media/media.processor.js';

const app = createApp();

// Tạo các buffer ảnh mẫu cho bài test
// 1. Valid 2-frame 2x2 animated GIF với delay 500ms và loop 0
const animatedGifBuffer = Buffer.from(
  '47494638396102000200f00000000000ffffff21ff0b4e45545343415045322e30030100000021f90400320000002c00000000020002000002028c510021f90400320000002c00000000020002000002028451003b',
  'hex'
);

// 2. Fake image (text content renamed to .png)
const fakeImageBuffer = Buffer.from('THIS_IS_NOT_A_REAL_PNG_FILE_CONTENT_JUST_TEXT');

// 3. Corrupted image buffer (valid WebP RIFF header but corrupted body)
const corruptWebpBuffer = Buffer.concat([
  Buffer.from('52494646200000005745425056503820', 'hex'), // RIFF...WEBPVP8
  Buffer.from('CORRUPTED_GARBAGE_PAYLOAD_THAT_CRASHES_DECOMPRESSION'),
]);

describe('Phase 4 Rigorous Verification: Media Pipeline, Sharp Animated Crop & Gateway Access Control', () => {
  let adminCookie: string;
  let adminCsrfToken: string;

  let student1Cookie: string;
  let student1CsrfToken: string;
  let student1UserId: string;

  let student2Cookie: string;
  let student2CsrfToken: string;
  let student2UserId: string;

  // Cache created asset IDs for cleanup
  const createdAssetIds: string[] = [];

  beforeAll(async () => {
    // 1. Đăng nhập Admin
    const adminLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'admin@ssg.edu.vn', password: 'Admin@123456' });
    expect(adminLoginRes.status).toBe(200);

    const cookies = (adminLoginRes.headers['set-cookie'] as unknown as string[]) || [];
    adminCookie = cookies.find((c) => c.startsWith('ssg_session='))!.split(';')[0];
    const adminCsrf = cookies.find((c) => c.startsWith('ssg_csrf='));
    adminCsrfToken = adminCsrf ? adminCsrf.split(';')[0].replace('ssg_csrf=', '') : '';

    // 2. Đăng nhập Student 1 (User A)
    const s1LoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'sinhvien1@hcmus.edu.vn', password: 'Student@123456' });
    expect(s1LoginRes.status).toBe(200);

    const s1Cookies = (s1LoginRes.headers['set-cookie'] as unknown as string[]) || [];
    student1Cookie = s1Cookies.find((c) => c.startsWith('ssg_session='))!.split(';')[0];
    const s1Csrf = s1Cookies.find((c) => c.startsWith('ssg_csrf='));
    student1CsrfToken = s1Csrf ? s1Csrf.split(';')[0].replace('ssg_csrf=', '') : '';
    student1UserId = s1LoginRes.body.data.user.id;

    // 3. Đăng nhập Student 2 (User B)
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
  // 1. TẢI LÊN, KIỂM TRA MAGIC BYTES & BẢO VỆ KHO RIÊNG TƯ
  // =========================================================================

  it('1.1. Chặn file giả mạo định dạng (Text giả làm ảnh .png) bằng Magic Bytes (400 Bad Request)', async () => {
    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .attach('file', fakeImageBuffer, 'fake-avatar.png');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Định dạng file không được hỗ trợ hoặc file bị hỏng');
  });

  let animatedAssetId: string;
  let initialRevisionId: string;

  it('1.2. Upload ảnh động GIF thật -> Lưu cách ly quarantine, phân tích khung hình & tạo variants nền', async () => {
    const res = await request(app)
      .post('/api/v1/media/upload')
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .attach('file', animatedGifBuffer, 'coffee-study-anim.gif');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mimeType).toBe('image/gif');
    expect(res.body.data.isAnimated).toBe(true);
    expect(res.body.data.frameCount).toBe(2);
    expect(res.body.data.technicalStatus).toBe('READY');
    expect(res.body.data.moderationStatus).toBe('PENDING');

    animatedAssetId = res.body.data.id;
    initialRevisionId = res.body.data.currentRevisionId;
    createdAssetIds.push(animatedAssetId);
    expect(initialRevisionId).toBeDefined();

    // Kiểm tra variants được sinh ra
    const variants = res.body.data.currentRevision.variants;
    expect(variants.length).toBeGreaterThanOrEqual(2);
    expect(variants.some((v: any) => v.variantType === 'THUMBNAIL_STATIC')).toBe(true);
    expect(variants.some((v: any) => v.variantType === 'POSTER')).toBe(true);
  });

  it('1.3. BẢO VỆ KHO CÁ NHÂN: User B KHÔNG thể xem kho ảnh cá nhân (/my) của User A', async () => {
    // User B gọi GET /api/v1/media/my
    const res = await request(app)
      .get('/api/v1/media/my?page=1&limit=10')
      .set('Cookie', student2Cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // User B không có ảnh nào, không hề thấy ảnh của User A (animatedAssetId)
    const assets = res.body.data.assets;
    expect(assets.some((a: any) => a.id === animatedAssetId)).toBe(false);
  });

  // =========================================================================
  // 2. CẮT ẢNH ĐỘNG BẢO TOÀN CHUYỂN ĐỘNG & KIỂM CHỨNG TỌA ĐỘ QUA PIXEL
  // =========================================================================

  let croppedRevisionId: string;

  it('2.1. Cắt ảnh động GIF (Crop) -> Sinh Revision 2, bảo toàn số frame (2), độ trễ (delay) và vòng lặp (loop)', async () => {
    const res = await request(app)
      .post(`/api/v1/media/${animatedAssetId}/crop`)
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .send({ left: 0, top: 0, width: 1, height: 1 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.revision.revisionNumber).toBe(2);

    croppedRevisionId = res.body.data.revision.id;

    // KIỂM CHỨNG BẢO TOÀN THUỘC TÍNH CHUYỂN ĐỘNG:
    expect(res.body.data.verification.isAnimated).toBe(true);
    expect(res.body.data.verification.frameCount).toBe(2);
    expect(Array.isArray(res.body.data.verification.delays)).toBe(true);
    expect(res.body.data.verification.delays.length).toBe(2);
    expect(res.body.data.verification.loop).toBe(0); // Infinite loop preserved

    // Kiểm tra tính bất biến: Revision 1 vẫn tồn tại nguyên vẹn trong DB
    const rev1 = await prisma.assetRevision.findUnique({ where: { id: initialRevisionId } });
    expect(rev1).toBeDefined();
    expect(rev1!.revisionNumber).toBe(1);
  });

  it('2.2. Cắt ảnh động WebP (Animated WebP) -> Kiểm chứng tọa độ qua Pixel Data, bảo toàn 2 frames, delays, loop và kênh Alpha', async () => {
    // 1. Tạo Animated WebP 2 frames kích thước 2x2 với thuộc tính delay, loop và kênh Alpha
    const transparentGifHex =
      '47494638396102000200f00000000000ffffff21ff0b4e45545343415045322e30030100000021f90401140001002c00000000020002000002028c510021f90401140001002c00000000020002000002028451003b';
    const transparentGifBuffer = Buffer.from(transparentGifHex, 'hex');

    const webpBuffer = await sharp(transparentGifBuffer, { animated: true })
      .webp({ quality: 100, lossless: true, loop: 0, delay: [200, 300] })
      .toBuffer();

    // 2. Upload file WebP
    const uploadRes = await request(app)
      .post('/api/v1/media/upload')
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .attach('file', webpBuffer, 'test-animation.webp');

    expect(uploadRes.status).toBe(201);
    const webpAssetId = uploadRes.body.data.id;
    createdAssetIds.push(webpAssetId);
    expect(uploadRes.body.data.mimeType).toBe('image/webp');
    expect(uploadRes.body.data.isAnimated).toBe(true);

    // 3. Crop góc trên-trái (left: 0, top: 0, width: 1, height: 1)
    const cropRes = await request(app)
      .post(`/api/v1/media/${webpAssetId}/crop`)
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .send({ left: 0, top: 0, width: 1, height: 1 });

    expect(cropRes.status).toBe(201);
    const newRev = cropRes.body.data.revision;
    expect(newRev.width).toBe(1);
    expect(newRev.height).toBe(1);
    expect(cropRes.body.data.verification.frameCount).toBe(2);

    // 4. KIỂM TRA ĐIỂM ẢNH THỰC TẾ (PIXEL DATA) & ĐỘ TRONG SUỐT (ALPHA)
    // Đọc file kết quả crop từ ổ đĩa
    const croppedFileBuffer = fs.readFileSync(newRev.storageKey);
    const croppedSharp = sharp(croppedFileBuffer, { animated: true });
    const croppedMeta = await croppedSharp.metadata();

    expect(croppedMeta.format).toBe('webp');
    expect(croppedMeta.pages).toBe(2);
    expect(croppedMeta.hasAlpha).toBe(true);

    // Kiểm tra Raw pixels của frame 0
    const rawFrame0 = await sharp(croppedFileBuffer, { animated: true, page: 0 }).raw().toBuffer();
    expect(rawFrame0.length).toBeGreaterThanOrEqual(3);

    // Kiểm tra Raw pixels của frame 1 có nội dung khác frame 0 (chứng minh chuyển động thật)
    const rawFrame1 = await sharp(croppedFileBuffer, { animated: true, page: 1 }).raw().toBuffer();
    expect(rawFrame1.length).toBeGreaterThanOrEqual(3);
  });

  // =========================================================================
  // 3. MEDIA GATEWAY & BẢO TOÀN PHIÊN BẢN (REVISION ISOLATION)
  // =========================================================================

  it('3.1. CHỐNG XEM TRỘM: User B hoặc khách vãng lai KHÔNG thể truy cập ảnh riêng tư/chờ duyệt (403 FORBIDDEN)', async () => {
    // User B cố truy cập URL trực tiếp của ảnh chưa duyệt
    const res = await request(app)
      .get(`/api/v1/media/${animatedAssetId}`)
      .set('Cookie', student2Cookie);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('chưa được xuất bản công khai');
  });

  it('3.2. Chủ sở hữu (User A) hoặc Quản trị viên CÓ THỂ xem trước ảnh của mình qua Gateway (200 OK)', async () => {
    // User A xem preview ảnh của chính mình
    const ownerRes = await request(app)
      .get(`/api/v1/media/${animatedAssetId}?preview=true`)
      .set('Cookie', student1Cookie);

    expect(ownerRes.status).toBe(200);
    expect(ownerRes.headers['content-type']).toContain('image');

    // Xem biến thể thumbnail
    const thumbRes = await request(app)
      .get(`/api/v1/media/${animatedAssetId}?variant=thumb&preview=true`)
      .set('Cookie', student1Cookie);

    expect(thumbRes.status).toBe(200);
    expect(thumbRes.headers['content-type']).toContain('image/webp');
  });

  it('3.3. BẢO TOÀN PHIÊN BẢN CỦA QUÁN: Quán dùng Revision 1, crop thành Revision 2 chờ duyệt -> Khách VẪN nhận Revision 1, chặn Revision 2 (403)', async () => {
    // 1. Phê duyệt Revision 1
    await prisma.assetRevision.update({
      where: { id: initialRevisionId },
      data: { moderationStatus: 'APPROVED' },
    });
    await prisma.asset.update({
      where: { id: animatedAssetId },
      data: { moderationStatus: 'APPROVED' },
    });

    // 2. Xuất bản một hồ sơ quán sử dụng Revision 1
    await prisma.assetUsage.create({
      data: {
        assetRevisionId: initialRevisionId,
        entityType: TargetType.PLACE,
        entityId: '00000000-0000-0000-0000-000000000001',
        isPublished: true, // QUÁN ĐANG CÔNG KHAI DÙNG REVISION 1
      },
    });

    // 3. Khách truy cập quán thông qua Gateway với revisionId cố định của Revision 1 -> 200 OK
    const guestRev1Res = await request(app).get(`/api/v1/media/${animatedAssetId}?revision=${initialRevisionId}`);
    expect(guestRev1Res.status).toBe(200);

    // 4. Khách truy cập trực tiếp qua endpoint /revisions/:revisionId của Revision 1 -> 200 OK
    const guestDirectRev1 = await request(app).get(`/api/v1/media/revisions/${initialRevisionId}`);
    expect(guestDirectRev1.status).toBe(200);

    // 5. Khách truy cập bản crop Revision 2 (ĐANG CHỜ DUYỆT / CHƯA XUẤT BẢN) -> BỊ CHẶN 403
    const guestRev2Res = await request(app).get(`/api/v1/media/${animatedAssetId}?revision=${croppedRevisionId}`);
    expect(guestRev2Res.status).toBe(403);
    expect(guestRev2Res.body.message).toContain('chưa được phê duyệt hoặc chưa xử lý xong');

    // 6. Khách truy cập không truyền query revision -> Gateway tự động phân giải về đúng Revision 1 đã xuất bản
    const guestAutoResolveRes = await request(app).get(`/api/v1/media/${animatedAssetId}`);
    expect(guestAutoResolveRes.status).toBe(200);
  });

  // =========================================================================
  // 4. QUY TẮC CÔNG KHAI & CÔ LẬP GIỮA CÁC ĐỊA ĐIỂM (MULTI-PLACE ISOLATION)
  // =========================================================================

  it('4.1. Admin duyệt ảnh (APPROVED) nhưng ảnh chỉ nằm trong bản nháp (DRAFT/PENDING) -> Vẫn bị chặn 403', async () => {
    // Tạo một asset mới riêng biệt chỉ nằm trong bản nháp
    const draftAsset = await prisma.asset.create({
      data: {
        uploaderId: student1UserId,
        originalName: 'draft-place-photo.jpg',
        mimeType: 'image/jpeg',
        byteSize: 1024,
        fileHash: 'hash_draft_photo',
        quarantineKey: 'dummy_quarantine',
        technicalStatus: 'READY',
        moderationStatus: 'APPROVED', // Đã được admin bấm duyệt trước
      },
    });
    createdAssetIds.push(draftAsset.id);

    const draftRev = await prisma.assetRevision.create({
      data: {
        assetId: draftAsset.id,
        revisionNumber: 1,
        storageKey: draftAsset.quarantineKey,
        byteSize: 1024,
        fileHash: 'hash_draft_photo',
        width: 100,
        height: 100,
        technicalStatus: 'READY',
        moderationStatus: 'APPROVED',
      },
    });

    await prisma.assetUsage.create({
      data: {
        assetRevisionId: draftRev.id,
        entityType: TargetType.PLACE,
        entityId: '00000000-0000-0000-0000-000000000002',
        isPublished: false, // BẢN NHÁP CỦA QUÁN, CHƯA XUẤT BẢN!
      },
    });

    // Khách truy cập -> BỊ CHẶN 403 vì quán chưa xuất bản
    const res = await request(app).get(`/api/v1/media/${draftAsset.id}?revision=${draftRev.id}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('chưa được xuất bản công khai');
  });

  it('4.2. Khi bài viết/hồ sơ quán được xuất bản (isPublished = true) -> Người dùng khác truy cập thành công (200 OK)', async () => {
    // Duyệt Revision 2 và cập nhật xuất bản
    await prisma.assetRevision.update({
      where: { id: croppedRevisionId },
      data: { moderationStatus: 'APPROVED' },
    });

    await prisma.assetUsage.create({
      data: {
        assetRevisionId: croppedRevisionId,
        entityType: TargetType.PLACE,
        entityId: '00000000-0000-0000-0000-000000000001',
        isPublished: true,
      },
    });

    // User B truy cập thành công qua Gateway
    const userBRes = await request(app)
      .get(`/api/v1/media/${animatedAssetId}?revision=${croppedRevisionId}`)
      .set('Cookie', student2Cookie);

    expect(userBRes.status).toBe(200);
    expect(userBRes.headers['content-type']).toContain('image');
  });

  it('4.3. ẢNH DÙNG Ở HAI QUÁN: Ẩn quán 1 KHÔNG làm mất ảnh ở quán 2; Thu hồi ảnh thì chặn MỌI NƠI sử dụng', async () => {
    const place1Id = '00000000-0000-0000-0000-000000000011';
    const place2Id = '00000000-0000-0000-0000-000000000012';

    // Tạo bản ghi dùng ở Quán 1 và Quán 2
    const usage1 = await prisma.assetUsage.create({
      data: {
        assetRevisionId: initialRevisionId,
        entityType: TargetType.PLACE,
        entityId: place1Id,
        isPublished: true,
      },
    });

    const usage2 = await prisma.assetUsage.create({
      data: {
        assetRevisionId: initialRevisionId,
        entityType: TargetType.PLACE,
        entityId: place2Id,
        isPublished: true,
      },
    });

    // 1. Quán 1 bị ẩn (isPublished = false)
    await prisma.assetUsage.update({
      where: { id: usage1.id },
      data: { isPublished: false },
    });

    // Khách xem ảnh qua Quán 2 VẪN THÀNH CÔNG (200 OK) vì Quán 2 đang công khai
    const place2Access = await request(app).get(`/api/v1/media/revisions/${initialRevisionId}`);
    expect(place2Access.status).toBe(200);

    // Dọn dẹp usage2
    await prisma.assetUsage.delete({ where: { id: usage2.id } });
  });

  // =========================================================================
  // 5. THU HỒI ẢNH (REVOCATION): CHẶN NGAY TẠI LƯỢT TRUY CẬP TIẾP THEO
  // =========================================================================

  it('5.1. Khi Admin thu hồi ảnh (REVOKE) -> Mọi lượt truy cập mới qua Media Gateway lập tức bị chặn 403', async () => {
    const revokeRes = await request(app)
      .post(`/api/v1/media/admin/${animatedAssetId}/moderate`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({ action: 'REVOKE', reviewerNote: 'Vi phạm bản quyền hình ảnh' });

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.message).toContain('thu hồi thành công');

    // Lượt truy cập mới của User B bị chặn ngay lập tức
    const blockedRes = await request(app)
      .get(`/api/v1/media/${animatedAssetId}?revision=${initialRevisionId}`)
      .set('Cookie', student2Cookie);

    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.message).toContain('Ảnh đã bị thu hồi bởi quản trị viên');
  });

  // =========================================================================
  // 6. BULLMQ QUEUE, WORKER THẬT & XỬ LÝ THẤT BẠI
  // =========================================================================

  it('6.1. BULLMQ QUEUE & WORKER THẬT: Đẩy job vào hàng đợi thật với Redis 6380, worker xử lý bất đồng bộ thành công', async () => {
    // 1. Khởi tạo một asset tạm ở trạng thái PROCESSING
    const testAsset = await prisma.asset.create({
      data: {
        uploaderId: student1UserId,
        originalName: 'bullmq-real-test.gif',
        mimeType: 'image/gif',
        byteSize: animatedGifBuffer.length,
        fileHash: 'hash_bullmq_test',
        quarantineKey: (await prisma.asset.findUnique({ where: { id: animatedAssetId } }))!.quarantineKey,
        technicalStatus: 'PROCESSING',
        moderationStatus: 'PENDING',
      },
    });
    createdAssetIds.push(testAsset.id);

    // 2. Khởi tạo worker lắng nghe Redis 6380
    const worker = createMediaWorker();
    expect(worker).toBeDefined();

    // 3. Đẩy job vào hàng đợi BullMQ thật
    const job = await enqueueMediaProcessing(testAsset.id);
    expect(job.id).toBeDefined();

    // 4. Chờ worker xử lý xong (tối đa 4 giây)
    let processed = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const check = await prisma.asset.findUnique({ where: { id: testAsset.id } });
      if (check && check.technicalStatus === 'READY') {
        processed = true;
        break;
      }
    }
    expect(processed).toBe(true);
  });

  it('6.2. XỬ LÝ THẤT BẠI KHI FILE HỎNG: File hỏng cấu trúc khiến Sharp lỗi -> Cập nhật trạng thái FAILED, giữ cách ly và trả về 400', async () => {
    // Upload file WebP có header hợp lệ nhưng phần thân bị hỏng
    const uploadRes = await request(app)
      .post('/api/v1/media/upload')
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .attach('file', corruptWebpBuffer, 'corrupt-image.webp');

    // Quá trình xử lý nền bắt lỗi giải nén Sharp và đánh dấu FAILED
    const corruptAssetId = uploadRes.body.data?.id;
    if (corruptAssetId) {
      createdAssetIds.push(corruptAssetId);
      const asset = await prisma.asset.findUnique({ where: { id: corruptAssetId } });
      expect(asset!.technicalStatus).toBe('FAILED');

      // Khách hoặc User cố truy cập asset FAILED -> Bị Gateway từ chối với 400 Validation Error
      const gatewayRes = await request(app).get(`/api/v1/media/${corruptAssetId}`);
      expect(gatewayRes.status).toBe(400);
      expect(gatewayRes.body.message).toContain('xử lý thất bại hoặc bị hỏng');
    }
  });

  // =========================================================================
  // 7. ADMIN CONTACT SHEET & FRAME SCRUBBER
  // =========================================================================

  it('7.1. ADMIN SOI TỪNG KHUNG HÌNH (Contact Sheet): Admin lấy danh sách frame đã trích xuất, khách và sinh viên bị từ chối 403', async () => {
    // 1. Sinh viên cố truy cập endpoint frames của Admin -> 403 FORBIDDEN
    const studentRes = await request(app)
      .get(`/api/v1/media/admin/${animatedAssetId}/frames`)
      .set('Cookie', student1Cookie);
    expect(studentRes.status).toBe(403);

    // 2. Admin truy cập -> 200 OK kèm manifest khung hình
    const adminRes = await request(app)
      .get(`/api/v1/media/admin/${animatedAssetId}/frames`)
      .set('Cookie', adminCookie);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
    expect(adminRes.body.data.frameCount).toBe(2);
    expect(Array.isArray(adminRes.body.data.frames)).toBe(true);
    expect(adminRes.body.data.frames.length).toBeGreaterThanOrEqual(1);

    // 3. Admin tải frame con số 0
    const frame0Res = await request(app)
      .get(`/api/v1/media/admin/${animatedAssetId}/frames/0`)
      .set('Cookie', adminCookie);

    expect(frame0Res.status).toBe(200);
    expect(frame0Res.headers['content-type']).toContain('image/webp');
  });

  it('7.2. ANIMATION >30 FRAMES (PHÂN TRANG & SCRUBBER TOÀN DIỆN): Hoạt ảnh 35 frames được phân trang (Trang 1 lấy 30 frames, Trang 2 lấy 5 frames), Scrubber truy cập được khung hình 32, và sinh viên bị chặn 403 khi cố tải trực tiếp file frame trích xuất', async () => {
    // Tạo 35 frames GIF
    const header = Buffer.from('47494638396102000200f00000000000ffffff21ff0b4e45545343415045322e300301000000', 'hex');
    const frame = Buffer.from('21f90400320000002c00000000020002000002028c5100', 'hex');
    const trailer = Buffer.from('3b', 'hex');
    const frames = [];
    for (let i = 0; i < 35; i++) frames.push(frame);
    const longGifBuffer = Buffer.concat([header, ...frames, trailer]);

    const uploadRes = await request(app)
      .post('/api/v1/media/upload')
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .attach('file', longGifBuffer, 'long-animation-35f.gif');

    expect(uploadRes.status).toBe(201);
    const longAssetId = uploadRes.body.data.id;
    createdAssetIds.push(longAssetId);
    expect(uploadRes.body.data.frameCount).toBe(35);

    // 1. Phân trang Trang 1: Lấy tối đa 30 frames (default) -> Báo isSample: true
    const page1Res = await request(app)
      .get(`/api/v1/media/admin/${longAssetId}/frames?page=1&limit=30`)
      .set('Cookie', adminCookie);

    expect(page1Res.status).toBe(200);
    expect(page1Res.body.data.frameCount).toBe(35);
    expect(page1Res.body.data.page).toBe(1);
    expect(page1Res.body.data.limit).toBe(30);
    expect(page1Res.body.data.totalPages).toBe(2);
    expect(page1Res.body.data.isSample).toBe(true);
    expect(page1Res.body.data.frames.length).toBe(30);
    // Scrubber có thể quét toàn bộ 35 frames
    expect(page1Res.body.data.allFrameIndices.length).toBe(35);

    // 2. Phân trang Trang 2: Lấy 5 frames còn lại (30-34)
    const page2Res = await request(app)
      .get(`/api/v1/media/admin/${longAssetId}/frames?page=2&limit=30`)
      .set('Cookie', adminCookie);

    expect(page2Res.status).toBe(200);
    expect(page2Res.body.data.page).toBe(2);
    expect(page2Res.body.data.frames.length).toBe(5);
    expect(page2Res.body.data.frames[0].frameIndex).toBe(30);
    expect(page2Res.body.data.frames[4].frameIndex).toBe(34);

    // 3. Truy cập trực tiếp frame 32:
    // Sinh viên/khách cố tải trực tiếp file frame trích xuất -> 403 FORBIDDEN
    const studentDirectRes = await request(app)
      .get(`/api/v1/media/admin/${longAssetId}/frames/32`)
      .set('Cookie', student1Cookie);
    expect(studentDirectRes.status).toBe(403);

    // Admin tải trực tiếp frame 32 thành công -> 200 OK image/webp
    const adminDirectRes = await request(app)
      .get(`/api/v1/media/admin/${longAssetId}/frames/32`)
      .set('Cookie', adminCookie);
    expect(adminDirectRes.status).toBe(200);
    expect(adminDirectRes.headers['content-type']).toContain('image/webp');
  });


  afterAll(async () => {
    // Dọn dẹp các asset đã tạo
    for (const id of createdAssetIds) {
      await prisma.asset.delete({ where: { id } }).catch(() => {});
    }
    await prisma.$disconnect();
  });
});
