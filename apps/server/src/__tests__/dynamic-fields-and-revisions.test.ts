import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { DataType } from '@ssg/shared';

const app = createApp();

describe('Phase 3 Rigorous Verification: Dynamic Fields Engine & Place Revision Snapshot Isolation', () => {
  let adminCookie: string;
  let adminCsrfToken: string;
  let categoryId: string;

  beforeAll(async () => {
    // 1. Đăng nhập Admin
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'admin@ssg.edu.vn', password: 'Admin@123456' });
    expect(loginRes.status).toBe(200);

    const cookies = (loginRes.headers['set-cookie'] as unknown as string[]) || [];
    const sessionCookie = cookies.find((c) => c.startsWith('ssg_session='));
    const csrfCookie = cookies.find((c) => c.startsWith('ssg_csrf='));

    adminCookie = sessionCookie!.split(';')[0];
    adminCsrfToken = csrfCookie ? csrfCookie.split(';')[0].replace('ssg_csrf=', '') : '';

    // Lấy một category có sẵn trong DB
    const cat = await prisma.category.findFirst();
    expect(cat).toBeDefined();
    categoryId = cat!.id;
  });

  // =========================================================================
  // 1. ĐỘNG CƠ TRƯỜNG ĐỘNG (DYNAMIC FIELDS) VÀ QUẢN LÝ PHIÊN BẢN ĐỊNH NGHĨA
  // =========================================================================

  let dynamicFieldId: string;
  const testFieldKey = `study_rooms_${Date.now()}`;

  it('1.1. Admin tạo định nghĩa trường động mới (REPEATER) -> Tự động sinh Version 1', async () => {
    const res = await request(app)
      .post('/api/v1/admin/field-definitions')
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        key: testFieldKey,
        label: 'Danh sách phòng tự học chuyên biệt',
        description: 'Thông tin phòng nhóm, sức chứa và điều hòa',
        dataType: DataType.REPEATER,
        isRequired: false,
        isFilterable: true,
        repeaterConfig: {
          maxItems: 5,
          subFields: [
            { key: 'room_name', label: 'Tên phòng', dataType: DataType.TEXT, isRequired: true },
            { key: 'capacity', label: 'Sức chứa', dataType: DataType.NUMBER, isRequired: true },
            { key: 'has_ac', label: 'Có điều hòa', dataType: DataType.BOOLEAN_TRI_STATE },
          ],
        },
        categoryIds: [categoryId],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.key).toBe(testFieldKey);
    expect(res.body.data.currentVersion).toBe(1);
    expect(res.body.data.initialVersion.version).toBe(1);

    dynamicFieldId = res.body.data.id;
  });

  it('1.2. Admin cập nhật định nghĩa trường -> Sinh Version 2, bảo toàn tính bất biến của Version 1', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/field-definitions/${dynamicFieldId}`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        label: 'Phòng học nhóm & Thuyết trình chuyên biệt (Đã nâng cấp)',
        isFilterable: true,
        repeaterConfig: {
          maxItems: 10,
          subFields: [
            { key: 'room_name', label: 'Tên phòng', dataType: DataType.TEXT, isRequired: true },
            { key: 'capacity', label: 'Sức chứa tối đa', dataType: DataType.NUMBER, isRequired: true },
            { key: 'has_ac', label: 'Máy lạnh', dataType: DataType.BOOLEAN_TRI_STATE },
            { key: 'has_projector', label: 'Máy chiếu', dataType: DataType.BOOLEAN_TRI_STATE },
          ],
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.currentVersion).toBe(2);

    // Kiểm tra trực tiếp trong DB: cả 2 version đều tồn tại độc lập
    const versions = await prisma.fieldDefinitionVersion.findMany({
      where: { fieldDefinitionId: dynamicFieldId },
      orderBy: { version: 'asc' },
    });

    expect(versions.length).toBe(2);
    expect(versions[0].version).toBe(1);
    expect(versions[0].label).toBe('Danh sách phòng tự học chuyên biệt');
    expect(versions[1].version).toBe(2);
    expect(versions[1].label).toBe('Phòng học nhóm & Thuyết trình chuyên biệt (Đã nâng cấp)');

    dynamicFieldVersion2Id = res.body.data.activeVersion.id;
  });

  // =========================================================================
  // 2. VÒNG ĐỜI QUÁN, CÔ LẬP SNAPSHOT & ĐỒNG BỘ PROJECTION TỨC THÌ
  // =========================================================================

  let dynamicFieldVersion2Id: string;
  let placeId: string;
  const placeSlug = `the-study-hub-${Date.now()}`;
  let revision1Id: string;
  let revision2Id: string;

  it('2.1. Tạo địa điểm mới kèm Revision 1 (Trạng thái APPROVED) -> Đồng bộ Projection & Public API sẵn sàng', async () => {
    const initialSnapshot = {
      name: 'The Study Hub HCMUS Cơ Sở 1',
      alternateNames: ['Study Hub KHTN'],
      slug: placeSlug,
      categoryId,
      operationalStatus: 'OPERATING',
      address: '227 Nguyễn Văn Cừ, Quận 5, TP.HCM',
      latitude: 10.7628,
      longitude: 106.6825,
      timezone: 'Asia/Ho_Chi_Minh',
      weeklySchedule: [
        {
          dayOfWeek: 1, // Thứ 2
          isClosed: false,
          is24h: false,
          shifts: [{ openTime: '07:00', closeTime: '22:00', isOvernight: false }],
        },
      ],
      priceMin: 20000,
      priceMax: 45000,
      currency: 'VND',
      menuGroups: [
        {
          name: 'Cà Phê Truyền Thống',
          items: [
            { name: 'Cà Phê Đen', basePrice: 20000, unit: 'VND', variants: [] },
            { name: 'Bạc Xỉu', basePrice: 25000, unit: 'VND', variants: [] },
          ],
        },
      ],
      dynamicFieldValues: [],
    };

    const res = await request(app)
      .post('/api/v1/admin/places')
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        slug: placeSlug,
        defaultName: 'The Study Hub HCMUS Cơ Sở 1',
        categoryId,
        snapshotData: initialSnapshot,
        initialStatus: 'APPROVED',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.slug).toBe(placeSlug);
    expect(res.body.data.currentPublishedRevisionId).toBeDefined();

    placeId = res.body.data.id;
    revision1Id = res.body.data.currentPublishedRevisionId;

    // Kiểm tra Public API đã xem được dữ liệu của Revision 1
    const publicRes = await request(app).get(`/api/v1/places/${placeSlug}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.snapshot.name).toBe('The Study Hub HCMUS Cơ Sở 1');
    expect(publicRes.body.data.snapshot.menuGroups[0].items.length).toBe(2);
  });

  it('2.2. NGUYÊN TẮC CÔ LẬP: Tạo Revision 2 mới (PENDING) -> Public API & AI VẪN chỉ thấy Version 1', async () => {
    // Revision 2 thay đổi:
    // - Đổi tên thành "The Study Hub HCMUS 24/7"
    // - Chuyển lịch thành 24/24 (is24h: true)
    // - Bổ sung món menu mới "Trà Đào Cam Sả 35k"
    // - Bổ sung dữ liệu trường động phòng học nhóm
    const updatedSnapshot = {
      name: 'The Study Hub HCMUS 24/7',
      alternateNames: ['Study Hub KHTN 247'],
      slug: placeSlug,
      categoryId,
      operationalStatus: 'OPERATING',
      address: '227 Nguyễn Văn Cừ, Quận 5, TP.HCM',
      latitude: 10.7628,
      longitude: 106.6825,
      timezone: 'Asia/Ho_Chi_Minh',
      weeklySchedule: [
        {
          dayOfWeek: 1,
          isClosed: false,
          is24h: true, // NÂNG CẤP 24/24
          shifts: [],
        },
      ],
      priceMin: 20000,
      priceMax: 50000,
      currency: 'VND',
      menuGroups: [
        {
          name: 'Cà Phê Truyền Thống',
          items: [
            { name: 'Cà Phê Đen', basePrice: 20000, unit: 'VND', variants: [] },
            { name: 'Bạc Xỉu', basePrice: 25000, unit: 'VND', variants: [] },
            { name: 'Trà Đào Cam Sả', basePrice: 35000, unit: 'VND', variants: [] }, // MÓN MỚI
          ],
        },
      ],
      dynamicFieldValues: [
        {
          fieldDefinitionId: dynamicFieldId,
          fieldDefinitionVersionId: dynamicFieldVersion2Id,
          fieldKey: testFieldKey,
          dataType: DataType.REPEATER,
          value: [
            { room_name: 'Phòng Einstein', capacity: 8, has_ac: true },
            { room_name: 'Phòng Turing', capacity: 12, has_ac: true },
          ],
        },
      ],
    };

    const rev2Res = await request(app)
      .post(`/api/v1/admin/places/${placeId}/revisions`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        baseRevisionId: revision1Id,
        snapshotData: updatedSnapshot,
        reasonForChange: 'Nâng cấp phục vụ 24/24 và bổ sung menu trà',
      });

    expect(rev2Res.status).toBe(201);
    expect(rev2Res.body.success).toBe(true);
    expect(rev2Res.body.data.revision.moderationStatus).toBe('PENDING');
    expect(rev2Res.body.data.revision.revisionNumber).toBe(2);

    revision2Id = rev2Res.body.data.revision.id;

    // KIỂM THỬ CÔ LẬP TUYỆT ĐỐI:
    // Mặc dù Revision 2 đã được lưu trong DB, nhưng vì chưa được duyệt (APPROVED),
    // Public API và người dùng bình thường PHẢI VẪN NHÌN THẤY REVISION 1!
    const publicRes = await request(app).get(`/api/v1/places/${placeSlug}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.snapshot.name).toBe('The Study Hub HCMUS Cơ Sở 1'); // Vẫn là tên cũ
    expect(publicRes.body.data.snapshot.weeklySchedule[0].is24h).toBe(false); // Vẫn chưa mở 24/24
    expect(publicRes.body.data.snapshot.menuGroups[0].items.length).toBe(2); // Vẫn chỉ có 2 món cũ, chưa có Trà Đào
    expect(publicRes.body.data.snapshot.dynamicFieldValues.length).toBe(0); // Chưa có dynamic field mới

    // Bản chiếu Projection cũng vẫn chỉ trỏ về Revision 1
    const projection = await prisma.placePublishedProjection.findUnique({
      where: { placeId },
    });
    expect(projection!.publishedRevisionId).toBe(revision1Id);
    expect(projection!.name).toBe('The Study Hub HCMUS Cơ Sở 1');
  });

  it('2.3. KIỂM THỬ XUNG ĐỘT 3-WAY: Báo cảnh báo xung đột nếu biên tập viên tạo revision dựa trên baseRevisionId đã cũ', async () => {
    // Giả lập một Editor khác đang mở màn hình sửa dựa trên Revision 1 (trong khi Revision 2 đã tồn tại)
    const conflictRes = await request(app)
      .post(`/api/v1/admin/places/${placeId}/revisions`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        baseRevisionId: '00000000-0000-0000-0000-000000000000', // Khác với currentPublishedRevisionId
        snapshotData: {
          name: 'The Study Hub HCMUS Bản Cũ',
          slug: placeSlug,
          categoryId,
          address: '227 Nguyễn Văn Cừ, Quận 5',
          latitude: 10.7628,
          longitude: 106.6825,
          weeklySchedule: [],
          menuGroups: [],
          dynamicFieldValues: [],
        },
      });

    expect(conflictRes.status).toBe(201);
    expect(conflictRes.body.data.hasConflict).toBe(true);
    expect(conflictRes.body.data.conflictMessage).toContain('Địa điểm đã có phiên bản được xuất bản mới hơn');
    staleRevisionId = conflictRes.body.data.revision.id;
  });

  let staleRevisionId: string;

  it('2.4. Admin phê duyệt Revision 2 -> Public API lập tức kích hoạt dữ liệu mới mà không cần sửa code hay DB schema', async () => {
    const approveRes = await request(app)
      .post(`/api/v1/admin/places/${placeId}/revisions/${revision2Id}/moderate`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        action: 'APPROVE',
        reviewerNote: 'Đã xác minh quán mở 24/24 và có phòng học nhóm mới',
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);
    expect(approveRes.body.data.revision.moderationStatus).toBe('APPROVED');

    // Kiểm tra Public API: LẬP TỨC HIỂN THỊ DỮ LIỆU CỦA REVISION 2
    const publicRes = await request(app).get(`/api/v1/places/${placeSlug}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.snapshot.name).toBe('The Study Hub HCMUS 24/7');
    expect(publicRes.body.data.snapshot.weeklySchedule[0].is24h).toBe(true);
    expect(publicRes.body.data.snapshot.menuGroups[0].items.length).toBe(3); // Đã có 3 món
    expect(publicRes.body.data.snapshot.menuGroups[0].items[2].name).toBe('Trà Đào Cam Sả');

    // Kiểm tra dynamic fields đã xuất hiện trong snapshot công khai
    expect(publicRes.body.data.snapshot.dynamicFieldValues.length).toBe(1);
    expect(publicRes.body.data.snapshot.dynamicFieldValues[0].fieldKey).toBe(testFieldKey);
    expect(publicRes.body.data.snapshot.dynamicFieldValues[0].value.length).toBe(2);
    expect(publicRes.body.data.snapshot.dynamicFieldValues[0].value[0].room_name).toBe('Phòng Einstein');

    // Kiểm tra bản chiếu Projection đã tự động cập nhật
    const projection = await prisma.placePublishedProjection.findUnique({
      where: { placeId },
    });
    expect(projection!.publishedRevisionId).toBe(revision2Id);
    expect(projection!.name).toBe('The Study Hub HCMUS 24/7');
  });

  it('2.5. CHẶN PHÊ DUYỆT XUNG ĐỘT: Thử phê duyệt revision dựa trên phiên bản cũ -> Bị chặn với 409 Conflict', async () => {
    // Lúc này place đã có currentPublishedRevisionId = revision2Id
    // staleRevision có baseRevisionId cũ (khác revision2Id)
    const blockRes = await request(app)
      .post(`/api/v1/admin/places/${placeId}/revisions/${staleRevisionId}/moderate`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        action: 'APPROVE',
        reviewerNote: 'Cố tình duyệt bản xung đột mà không giải quyết',
      });

    expect(blockRes.status).toBe(409);
    expect(blockRes.body.success).toBe(false);
    expect(blockRes.body.errorCode).toBe('CONFLICT');
    expect(blockRes.body.message).toContain('XUNG ĐỘT PHIÊN BẢN');
  });

  it('2.6. PHÊ DUYỆT CÓ KIỂM SOÁT (FORCE OVERRIDE): Cho phép ghi đè có chủ đích khi admin bật cờ forceOverride', async () => {
    const overrideRes = await request(app)
      .post(`/api/v1/admin/places/${placeId}/revisions/${staleRevisionId}/moderate`)
      .set('Cookie', `${adminCookie}; ssg_csrf=${adminCsrfToken}`)
      .set('x-csrf-token', adminCsrfToken)
      .send({
        action: 'APPROVE',
        forceOverride: true,
        reviewerNote: 'Admin đã giải quyết xung đột thủ công và xác nhận ghi đè',
      });

    expect(overrideRes.status).toBe(200);
    expect(overrideRes.body.success).toBe(true);
    expect(overrideRes.body.data.revision.moderationStatus).toBe('APPROVED');
  });

  afterAll(async () => {
    // Dọn dẹp dữ liệu test
    if (placeId) {
      await prisma.place.delete({ where: { id: placeId } }).catch(() => {});
    }
    if (dynamicFieldId) {
      await prisma.fieldDefinition.delete({ where: { id: dynamicFieldId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });
});
