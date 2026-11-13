import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { TargetType, ModerationStatus, ContentState } from '@ssg/shared';

const app = createApp();

describe('Phase 5 Rigorous Verification: Discovery, Map, Student Contributions, Reviews, Stickers & Collections', () => {
  let adminCookie: string;
  let adminCsrfToken: string;

  let student1Cookie: string;
  let student1CsrfToken: string;
  let student1UserId: string;

  let student2Cookie: string;
  let student2CsrfToken: string;
  let student2UserId: string;

  let testCategoryId: string;
  let testPlaceId: string;
  let testPlaceSlug: string;

  beforeAll(async () => {
    // Dọn quán do lần chạy trước tạo từ đề xuất (tránh tích lũy làm lệch kết quả tìm kiếm phân trang)
    await prisma.place.deleteMany({ where: { slug: { startsWith: 'quan-tra-sua-hoc-bai-lang-dai-hoc' } } }).catch(() => {});
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

    // 4. Chuẩn bị Category và Place mẫu phục vụ kiểm thử
    const cat = await prisma.category.findFirst();
    testCategoryId = cat!.id;

    testPlaceSlug = `cafe-hoc-bai-test-${Date.now().toString().slice(-4)}`;
    const newPlace = await prisma.place.create({
      data: {
        slug: testPlaceSlug,
        defaultName: 'Cà Phê Sách Tân Định',
        categoryId: testCategoryId,
        operationalStatus: 'OPERATING',
        publicationStatus: 'PUBLISHED',
      },
    });
    testPlaceId = newPlace.id;

    const rev = await prisma.placeRevision.create({
      data: {
        placeId: testPlaceId,
        revisionNumber: 1,
        authorUserId: student1UserId,
        moderationStatus: 'APPROVED',
        approvedAt: new Date(),
        snapshotData: {
          name: 'Cà Phê Sách Tân Định',
          alternateNames: ['Tan Dinh Book Cafe', 'Cafe Sach TD'],
          address: '300 Hai Bà Trưng, Phường Tân Định, Quận 1',
          latitude: 10.7905,
          longitude: 106.6912,
          priceMin: 30000,
          priceMax: 65000,
          currency: 'VND',
          studentDiscountDetails: 'Giảm 15% khi mang thẻ sinh viên KHTN',
          amenities: {
            wifiQuality: 'EXCELLENT',
            hasPowerSockets: true,
            noiseLevel: 'QUIET',
            airConditioner: true,
          },
          weeklySchedule: [
            {
              dayOfWeek: 1, // Thứ Hai
              isClosed: false,
              is24h: false,
              shifts: [{ shiftName: 'Cả ngày', openTime: '06:30', closeTime: '23:00', isOvernight: false }],
            },
            {
              dayOfWeek: 2, // Thứ Ba
              isClosed: false,
              is24h: false,
              shifts: [{ shiftName: 'Cả ngày', openTime: '06:30', closeTime: '23:00', isOvernight: false }],
            },
          ],
          scheduleExceptions: [],
          gallery: [],
          menuGroups: [],
          dynamicFieldValues: [],
        },
      },
    });

    await prisma.place.update({
      where: { id: testPlaceId },
      data: { currentPublishedRevisionId: rev.id },
    });

    await prisma.placePublishedProjection.create({
      data: {
        placeId: testPlaceId,
        publishedRevisionId: rev.id,
        name: 'Cà Phê Sách Tân Định',
        alternateNames: ['Tan Dinh Book Cafe', 'Cafe Sach TD'],
        slug: testPlaceSlug,
        categoryId: testCategoryId,
        latitude: 10.7905,
        longitude: 106.6912,
        priceMin: 30000,
        priceMax: 65000,
        is24h: false,
        ratingOverall: 5.0,
        reviewCount: 0,
        studyAmenities: { wifiQuality: 'EXCELLENT', hasPowerSockets: true, noiseLevel: 'QUIET' },
        filterableAttributes: {},
      },
    });
  });

  // =========================================================================
  // 1. TÌM KIẾM VÀ BỘ LỌC (SEARCH, DIACRITICS, BOUNDS & FILTERS)
  // =========================================================================

  it('1.1. TÌM KIẾM TIẾNG VIỆT CÓ / KHÔNG DẤU: Tìm kiếm "ca phe sach" hoặc "tan dinh" khớp chính xác quán "Cà Phê Sách Tân Định"', async () => {
    // 1. Tìm không dấu
    const unaccentedRes = await request(app).get('/api/v1/places?q=ca phe sach');
    expect(unaccentedRes.status).toBe(200);
    expect(unaccentedRes.body.success).toBe(true);
    expect(unaccentedRes.body.data.some((p: any) => p.slug === testPlaceSlug)).toBe(true);

    // 2. Tìm có dấu
    const accentedRes = await request(app).get('/api/v1/places').query({ q: 'Cà Phê Sách' });
    expect(accentedRes.status).toBe(200);

    expect(accentedRes.body.data.some((p: any) => p.slug === testPlaceSlug)).toBe(true);

    // 3. Tìm theo tên viết tắt (alternate names)
    const altRes = await request(app).get('/api/v1/places?q=book cafe');
    expect(altRes.status).toBe(200);
    expect(altRes.body.data.some((p: any) => p.slug === testPlaceSlug)).toBe(true);
  });

  it('1.2. BẢN ĐỒ & BOUNDING BOX: Lọc theo khung nhìn (bounds=swLng,swLat,neLng,neLat) trả về quán trong vùng, loại bỏ quán ngoài vùng', async () => {
    // Vùng bao quanh Tân Định (10.78 -> 10.80, 106.68 -> 106.70)
    const insideRes = await request(app).get('/api/v1/places?bounds=106.68,10.78,106.70,10.80');
    expect(insideRes.status).toBe(200);
    expect(insideRes.body.data.some((p: any) => p.slug === testPlaceSlug)).toBe(true);

    // Vùng ở Thủ Đức (10.85 -> 10.90, 106.75 -> 106.80) -> Không có quán Tân Định
    const outsideRes = await request(app).get('/api/v1/places?bounds=106.75,10.85,106.80,10.90');
    expect(outsideRes.status).toBe(200);
    expect(outsideRes.body.data.some((p: any) => p.slug === testPlaceSlug)).toBe(false);
  });

  it('1.3. LỌC TIỆN ÍCH & KHUNG GIÁ: Khớp khi tìm quán có Wi-Fi, ổ cắm và khung giá phù hợp', async () => {
    const filterRes = await request(app).get('/api/v1/places?wifi=true&socket=true&priceMin=20000&priceMax=70000');
    expect(filterRes.status).toBe(200);
    expect(filterRes.body.data.some((p: any) => p.slug === testPlaceSlug)).toBe(true);

    // Lọc khung giá không khớp (quán giá 30k-65k, tìm quán giá max 25k)
    const noMatchRes = await request(app).get('/api/v1/places?priceMax=25000');
    expect(noMatchRes.status).toBe(200);
    expect(noMatchRes.body.data.some((p: any) => p.slug === testPlaceSlug)).toBe(false);
  });

  // =========================================================================
  // 2. ĐÓNG GÓP CỦA SINH VIÊN (SUGGESTIONS, DUPLICATES, SURVEYS & CHANGES)
  // =========================================================================

  it('2.1. GỢI Ý QUÁN TRÙNG: Khi sinh viên gõ tên quán gần giống -> API cảnh báo các quán trùng đã tồn tại', async () => {
    const dupRes = await request(app).get('/api/v1/places/suggestions/check-duplicate?name=ca phe sach tan dinh');
    expect(dupRes.status).toBe(200);
    expect(dupRes.body.success).toBe(true);
    expect(Array.isArray(dupRes.body.data)).toBe(true);
    expect(dupRes.body.data.some((d: any) => d.id === testPlaceId)).toBe(true);
  });

  let createdSuggestionId: string;

  it('2.2. ĐỀ XUẤT QUÁN MỚI: Sinh viên gửi đề xuất quán mới -> Lưu trạng thái PENDING chờ ban quản trị duyệt', async () => {
    const res = await request(app)
      .post('/api/v1/places/suggestions')
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .send({
        proposedName: 'Quán Trà Sữa Học Bài Làng Đại Học',
        categoryId: testCategoryId,
        addressDescription: 'Đường A1, KTX Khu B ĐHQG-HCM',
        initialData: {
          // Vị trí là bắt buộc để admin duyệt thành quán (thiếu -> 422, xem suggestion-approval.test.ts)
          latitude: 10.8834,
          longitude: 106.8079,
          priceMin: 20000,
          priceMax: 45000,
          studentDiscountDetails: 'Giảm 20% khung giờ 13h - 17h',
        },
        isDraft: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PENDING');
    createdSuggestionId = res.body.data.id;
  });

  it('2.3. THEO DÕI ĐÓNG GÓP: Sinh viên xem danh sách đề xuất của mình tại /api/v1/me/contributions', async () => {
    const res = await request(app)
      .get('/api/v1/me/contributions')
      .set('Cookie', student1Cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.suggestions.some((s: any) => s.id === createdSuggestionId)).toBe(true);
  });

  it('2.4. ADMIN DUYỆT ĐỀ XUẤT: Admin APPROVE đề xuất -> Tự động sinh Quán, Revision 1 và Projection hiển thị ngay trên tìm kiếm', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/community/suggestions/${createdSuggestionId}/moderate`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        action: 'APPROVE',
        reviewerNote: 'Thông tin hợp lệ, địa điểm hữu ích cho sinh viên KTX B',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');
    const createdPlaceId = res.body.data.placeId;
    expect(createdPlaceId).toBeDefined();

    // Xác nhận quán mới lập tức xuất hiện trên API tìm kiếm công khai
    const searchRes = await request(app).get('/api/v1/places?q=tra sua hoc bai&limit=100');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.some((p: any) => p.placeId === createdPlaceId)).toBe(true);
  });

  it('2.5. YÊU CẦU KHẢO SÁT & ĐỀ XUẤT SỬA QUÁN: Sinh viên gửi yêu cầu khảo sát ổ cắm và đề xuất sửa đổi giá', async () => {
    // 1. Yêu cầu khảo sát
    const surveyRes = await request(app)
      .post(`/api/v1/places/${testPlaceId}/survey-requests`)
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .send({
        reason: 'Quán mới cải tạo thêm tầng 2, cần khảo sát số lượng ổ cắm',
        targetAspects: ['power_sockets', 'wifi_speed'],
      });
    expect(surveyRes.status).toBe(201);
    expect(surveyRes.body.data.status).toBe('PENDING');

    // 2. Đề xuất cập nhật quán
    const changeRes = await request(app)
      .post(`/api/v1/places/${testPlaceId}/change-requests`)
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .send({
        baseRevisionId: (await prisma.place.findUnique({ where: { id: testPlaceId } }))!.currentPublishedRevisionId,
        requestedChanges: { priceMax: 75000, note: 'Menu mới tăng giá từ tháng 9' },
      });
    expect(changeRes.status).toBe(201);
    expect(changeRes.body.data.status).toBe('PENDING');
  });

  // =========================================================================
  // 3. REVIEWS & ĐIỂM TỔNG HỢP CỦA QUÁN (AGGREGATE RATING RECALCULATION)
  // =========================================================================

  let reviewRevisionId: string;
  let reviewId: string;

  it('3.1. SINH VIÊN VIẾT ĐÁNH GIÁ: Tạo review mới -> Sinh Revision 1 PENDING, điểm quán KHÔNG THAY ĐỔI khi chưa duyệt', async () => {
    // Sinh viên 1 đánh giá 1 sao (để kiểm tra xem điểm quán có bị sụt giảm ngay không)
    const res = await request(app)
      .post(`/api/v1/places/${testPlaceId}/reviews`)
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .send({
        ratingOverall: 1,
        content: 'Quán bật nhạc hơi to vào buổi tối, không tập trung ôn thi được.',
        criteriaScores: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.moderationStatus).toBe('PENDING');
    reviewRevisionId = res.body.data.revisionId;
    reviewId = res.body.data.reviewId;

    // QUY TẮC BẢO VỆ: Điểm tổng hợp của quán VẪN GIỮ NGUYÊN (5.0, 0 reviews) vì review đang PENDING
    const placeProj = await prisma.placePublishedProjection.findUnique({ where: { placeId: testPlaceId } });
    expect(placeProj!.ratingOverall).toBe(5.0);
    expect(placeProj!.reviewCount).toBe(0);

    // Khách vãng lai xem chi tiết quán KHÔNG THẤY review pending này
    const publicPlaceRes = await request(app).get(`/api/v1/places/${testPlaceSlug}`);
    expect(publicPlaceRes.status).toBe(200);
    expect(publicPlaceRes.body.data.reviews.length).toBe(0);
  });

  it('3.2. ADMIN DUYỆT REVIEW: Phê duyệt đánh giá -> Điểm quán lập tức được cập nhật chuẩn xác theo review đã duyệt', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/community/reviews/${reviewRevisionId}/moderate`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        action: 'APPROVE',
        reviewerNote: 'Nội dung phản ánh chân thực, duyệt công khai',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');

    // Sau khi duyệt, điểm của quán lập tức tính lại: 1 review 1 sao -> ratingOverall = 1.0, reviewCount = 1
    const placeProj = await prisma.placePublishedProjection.findUnique({ where: { placeId: testPlaceId } });
    expect(placeProj!.ratingOverall).toBe(1.0);
    expect(placeProj!.reviewCount).toBe(1);

    // Khách vãng lai xem chi tiết quán đã thấy review hiển thị
    const publicPlaceRes = await request(app).get(`/api/v1/places/${testPlaceSlug}`);
    expect(publicPlaceRes.status).toBe(200);
    expect(publicPlaceRes.body.data.reviews.length).toBe(1);
    expect(publicPlaceRes.body.data.reviews[0].ratingOverall).toBe(1);
  });

  it('3.3. 1 USER 1 REVIEW HIỆU LỰC: Sinh viên 1 sửa review thành 5 sao -> Sinh Revision 2 PENDING, điểm quán VẪN GIỮ theo Revision 1 cũ', async () => {
    const res = await request(app)
      .post(`/api/v1/places/${testPlaceId}/reviews`)
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .send({
        ratingOverall: 5,
        content: 'Quán đã khắc phục, đổi nhạc nhẹ nhàng hơn rất nhiều. Rất ủng hộ!',
        criteriaScores: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.revisionNumber).toBe(2);
    expect(res.body.data.moderationStatus).toBe('PENDING');

    // Điểm quán VẪN LÀ 1.0 (theo Revision 1 đã xuất bản), chưa chuyển thành 5.0
    const placeProj = await prisma.placePublishedProjection.findUnique({ where: { placeId: testPlaceId } });
    expect(placeProj!.ratingOverall).toBe(1.0);

    // Admin duyệt Revision 2 mới
    const rev2Id = res.body.data.revisionId;
    await request(app)
      .post(`/api/v1/admin/community/reviews/${rev2Id}/moderate`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({ action: 'APPROVE', reviewerNote: 'Cập nhật đánh giá tích cực' });

    // Điểm quán chuyển sang 5.0
    const updatedProj = await prisma.placePublishedProjection.findUnique({ where: { placeId: testPlaceId } });
    expect(updatedProj!.ratingOverall).toBe(5.0);
  });

  it('3.4. ẨN REVIEW & TÍNH LẠI ĐIỂM: Admin ẩn review (state = HIDDEN) -> Điểm quán lập tức tính lại không còn review này', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/community/reviews/${reviewId}/state`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({ state: 'HIDDEN' });

    expect(res.status).toBe(200);
    expect(res.body.data.state).toBe('HIDDEN');

    // Điểm quán trở về mặc định (0 reviews)
    const placeProj = await prisma.placePublishedProjection.findUnique({ where: { placeId: testPlaceId } });
    expect(placeProj!.reviewCount).toBe(0);

    // Khôi phục lại PUBLISHED để kiểm thử Helpful Vote
    await request(app)
      .post(`/api/v1/admin/community/reviews/${reviewId}/state`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({ state: 'PUBLISHED' });
  });

  it('3.5. BÌNH CHỌN HỮU ÍCH (HELPFUL VOTE): User B bấm vote hữu ích -> Tăng 1; bấm lại -> Hủy vote', async () => {
    // 1. User B vote review của User A
    const voteRes1 = await request(app)
      .post(`/api/v1/places/reviews/${reviewId}/vote-helpful`)
      .set('Cookie', `${student2Cookie}; ssg_csrf=${student2CsrfToken}`)
      .set('x-csrf-token', student2CsrfToken);

    expect(voteRes1.status).toBe(200);
    expect(voteRes1.body.voted).toBe(true);

    const rev1 = await prisma.review.findUnique({ where: { id: reviewId } });
    expect(rev1!.helpfulVotesCount).toBe(1);

    // 2. User B bấm lần 2 -> Hủy vote
    const voteRes2 = await request(app)
      .post(`/api/v1/places/reviews/${reviewId}/vote-helpful`)
      .set('Cookie', `${student2Cookie}; ssg_csrf=${student2CsrfToken}`)
      .set('x-csrf-token', student2CsrfToken);

    expect(voteRes2.status).toBe(200);
    expect(voteRes2.body.voted).toBe(false);

    const rev2 = await prisma.review.findUnique({ where: { id: reviewId } });
    expect(rev2!.helpfulVotesCount).toBe(0);
  });

  // =========================================================================
  // 4. STICKERS, BÀI TRẢI NGHIỆM & BÁO CÁO VI PHẠM
  // =========================================================================

  let createdStickerPackId: string;

  it('4.1. BỘ STICKER CHƯA DUYỆT KHÔNG XUẤT HIỆN: Sinh viên tạo bộ sticker -> Chưa duyệt thì bộ chọn công khai không thấy', async () => {
    // Lấy 1 asset ID mẫu
    // Tự tạo asset nếu DB test chưa có (không phụ thuộc thứ tự chạy file test)
    // Luôn tạo asset riêng: asset của file test khác có thể bị xoá song song (các file test chạy đồng thời)
    const asset =
      (await prisma.asset.create({
        data: {
          uploaderId: student1UserId,
          originalName: 'sticker-test.png',
          mimeType: 'image/png',
          byteSize: 128,
          fileHash: 'test-sticker-hash-' + Date.now(),
          quarantineKey: 'quarantine/test-sticker.png',
        },
      }));
    const assetId = asset.id;

    const createRes = await request(app)
      .post('/api/v1/community/stickers/packs')
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .send({
        name: 'Mèo Học Bài',
        slug: `meo-hoc-bai-${Date.now().toString().slice(-4)}`,
        items: [
          { shortcode: ':study_cat_tired:', assetId, altText: 'Mèo mệt mỏi vì ôn thi' },
          { shortcode: ':study_cat_passed:', assetId, altText: 'Mèo vui vì qua môn' },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.moderationStatus).toBe('PENDING');
    createdStickerPackId = createRes.body.data.id;

    // Kho sticker công khai cho sinh viên KHÔNG hiển thị bộ sticker này
    const publicRes = await request(app).get('/api/v1/community/stickers/packs/public');
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.some((sp: any) => sp.id === createdStickerPackId)).toBe(false);

    // Admin duyệt bộ sticker
    const modRes = await request(app)
      .post(`/api/v1/admin/community/stickers/${createdStickerPackId}/moderate`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({ action: 'APPROVE' });
    expect(modRes.status).toBe(200);

    // Sau khi duyệt -> Xuất hiện trong bộ chọn công khai
    const afterRes = await request(app).get('/api/v1/community/stickers/packs/public');
    expect(afterRes.body.data.some((sp: any) => sp.id === createdStickerPackId)).toBe(true);
  });

  it('4.2. BÁO CÁO VI PHẠM (REPORT QUEUE): Sinh viên gửi báo cáo -> Xuất hiện trong hàng đợi admin, admin xử lý RESOLVED', async () => {
    const reportRes = await request(app)
      .post('/api/v1/community/reports')
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken)
      .send({
        targetType: TargetType.PLACE,
        targetId: testPlaceId,
        reasonCode: 'WRONG_INFORMATION',
        description: 'Quán đã đóng cửa sửa chữa nhưng trên app vẫn ghi đang mở',
        evidenceUrls: ['https://example.com/evidence-photo.jpg'],
      });

    expect(reportRes.status).toBe(201);
    expect(reportRes.body.data.status).toBe('OPEN');
    const reportId = reportRes.body.data.id;

    // Admin xem hàng đợi báo cáo
    const adminQueueRes = await request(app)
      .get('/api/v1/admin/community/reports?status=OPEN')
      .set('Cookie', adminCookie);
    expect(adminQueueRes.status).toBe(200);
    expect(adminQueueRes.body.data.some((r: any) => r.id === reportId)).toBe(true);

    // Admin xử lý báo cáo
    const resolveRes = await request(app)
      .patch(`/api/v1/admin/community/reports/${reportId}`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        status: 'RESOLVED',
        actionTaken: 'CẬP_NHẬT_LỊCH_NGOẠI_LỆ_ĐÓNG_CỬA',
        resolutionNote: 'Đã bổ sung lịch ngoại lệ sửa chữa cho quán',
      });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.status).toBe('RESOLVED');
  });

  // =========================================================================
  // 5. YÊU THÍCH, BỘ SƯU TẬP & SO SÁNH QUÁN
  // =========================================================================

  it('5.1. YÊU THÍCH QUÁN (FAVORITES): Toggle yêu thích quán và xem danh sách tại /api/v1/me/favorites', async () => {
    // 1. Thêm vào yêu thích
    const favRes1 = await request(app)
      .post(`/api/v1/me/favorites/${testPlaceId}`)
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken);
    expect(favRes1.status).toBe(200);
    expect(favRes1.body.isFavorited).toBe(true);

    // Xem danh sách yêu thích
    const listRes = await request(app)
      .get('/api/v1/me/favorites')
      .set('Cookie', student1Cookie);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((f: any) => f.placeId === testPlaceId)).toBe(true);

    // 2. Bấm lại -> Xóa khỏi yêu thích
    const favRes2 = await request(app)
      .post(`/api/v1/me/favorites/${testPlaceId}`)
      .set('Cookie', `${student1Cookie}; ssg_csrf=${student1CsrfToken}`)
      .set('x-csrf-token', student1CsrfToken);
    expect(favRes2.status).toBe(200);
    expect(favRes2.body.isFavorited).toBe(false);
  });

  it('5.2. SO SÁNH QUÁN (/compare): So sánh tối đa 4 quán, trường thiếu dữ liệu hiển thị rõ "Chưa có thông tin"', async () => {
    // Tạo thêm 1 quán thứ hai để so sánh
    const place2Slug = `quan-an-test-${Date.now().toString().slice(-4)}`;
    const place2 = await prisma.place.create({
      data: {
        slug: place2Slug,
        defaultName: 'Cơm Tấm KHTN',
        categoryId: testCategoryId,
        operationalStatus: 'OPERATING',
        publicationStatus: 'PUBLISHED',
      },
    });

    const rev2 = await prisma.placeRevision.create({
      data: {
        placeId: place2.id,
        revisionNumber: 1,
        authorUserId: student1UserId,
        moderationStatus: 'APPROVED',
        snapshotData: {
          name: 'Cơm Tấm KHTN',
          address: '227 Nguyễn Văn Cừ, Quận 5',
          priceMin: 35000,
          priceMax: 50000,
          // Thiếu wifi, thiếu ổ cắm -> Phải trả về "Chưa có thông tin"
        },
      },
    });

    await prisma.place.update({
      where: { id: place2.id },
      data: { currentPublishedRevisionId: rev2.id },
    });

    const compareRes = await request(app)
      .post('/api/v1/places/compare')
      .send({ placeIds: [testPlaceId, place2.id] });

    expect(compareRes.status).toBe(200);
    expect(compareRes.body.success).toBe(true);
    expect(compareRes.body.data.length).toBe(2);

    const item2 = compareRes.body.data.find((p: any) => p.id === place2.id);
    expect(item2).toBeDefined();
    // Kiểm chứng các trường thiếu hiển thị "Chưa có thông tin"
    expect(item2.amenities.wifiQuality).toBe('Chưa có thông tin');
    expect(item2.studentDiscount).toBe('Chưa có thông tin');

    // Dọn dẹp quán phụ
    await prisma.place.delete({ where: { id: place2.id } }).catch(() => {});
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu kiểm thử
    await prisma.place.delete({ where: { id: testPlaceId } }).catch(() => {});
    await prisma.place.deleteMany({ where: { slug: { startsWith: 'quan-tra-sua-hoc-bai-lang-dai-hoc' } } }).catch(() => {});
    if (createdStickerPackId) {
      await prisma.stickerPack.delete({ where: { id: createdStickerPackId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });
});

