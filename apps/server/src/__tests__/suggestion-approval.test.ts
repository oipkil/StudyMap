import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

const app = createApp();

async function login(identifier: string, password: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ identifier, password });
  expect(res.status).toBe(200);
  const cookies = (res.headers['set-cookie'] as unknown as string[]) || [];
  const cookie = cookies.find((c) => c.startsWith('ssg_session='))!.split(';')[0];
  const csrf = (cookies.find((c) => c.startsWith('ssg_csrf=')) || '').split(';')[0].replace('ssg_csrf=', '');
  return { cookie: `${cookie}; ssg_csrf=${csrf}`, csrf, userId: res.body.data.user.id as string };
}

describe('Đề xuất quán đầy đủ của sinh viên -> admin duyệt thành quán đúng dữ liệu (không bịa mặc định)', () => {
  let student: { cookie: string; csrf: string; userId: string };
  let admin: { cookie: string; csrf: string; userId: string };
  let categoryId: string;
  let campusId: string;
  const createdPlaceIds: string[] = [];
  const createdSuggestionIds: string[] = [];
  const createdAssetIds: string[] = [];
  const TAG = `sugg-test-${Date.now().toString().slice(-6)}`;
  let createdFieldKey: string | null = null; // trường động tạo riêng cho test nếu DB test chưa seed

  beforeAll(async () => {
    student = await login('sinhvien1@hcmus.edu.vn', 'Student@123456');
    admin = await login('admin@ssg.edu.vn', 'Admin@123456');
    categoryId = (await prisma.category.findFirst({ where: { isActive: true } }))!.id;
    campusId = (await prisma.campus.findFirst())!.id;
    // DB test không chạy seed trường động -> tạo trường wifi_speed_mbps nếu chưa có
    if (!(await prisma.fieldDefinition.findUnique({ where: { key: 'wifi_speed_mbps' } }))) {
      const r = await request(app)
        .post('/api/v1/admin/field-definitions')
        .set('Cookie', admin.cookie)
        .set('x-csrf-token', admin.csrf)
        .send({ key: 'wifi_speed_mbps', label: 'Tốc độ Wi-Fi', dataType: 'NUMBER_WITH_UNIT', unit: 'Mbps', fieldGroupKey: 'study_test_sugg', fieldGroupLabel: 'Học tập (test)' });
      expect(r.status).toBe(201);
      createdFieldKey = 'wifi_speed_mbps';
    }
  });

  afterAll(async () => {
    await prisma.place.deleteMany({ where: { id: { in: createdPlaceIds } } });
    await prisma.placeSuggestion.deleteMany({ where: { id: { in: createdSuggestionIds } } });
    await prisma.assetUsage.deleteMany({ where: { assetRevision: { assetId: { in: createdAssetIds } } } });
    await prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
    if (createdFieldKey) {
      await prisma.fieldDefinition.deleteMany({ where: { key: createdFieldKey } });
      await prisma.fieldGroup.deleteMany({ where: { key: 'study_test_sugg' } });
    }
  });

  it('1. Duyệt đề xuất đầy đủ: giờ, giá (kể cả gửi dạng chuỗi), tiện ích, trường động, ảnh, ghi chú đều vào quán; ảnh công khai', async () => {
    const up = await request(app)
      .post('/api/v1/media/upload')
      .set('Cookie', student.cookie)
      .set('x-csrf-token', student.csrf)
      .attach('file', await sharp({ create: { width: 48, height: 48, channels: 3, background: { r: 47, g: 107, b: 79 } } }).png().toBuffer(), 'quan.png');
    expect(up.status).toBe(201);
    createdAssetIds.push(up.body.data.id);

    const created = await request(app)
      .post('/api/v1/places/suggestions')
      .set('Cookie', student.cookie)
      .set('x-csrf-token', student.csrf)
      .send({
        proposedName: `Quán ${TAG}`,
        categoryId,
        addressDescription: '12 Nguyễn Văn Cừ, Quận 5',
        campusId,
        initialData: {
          latitude: 10.7628,
          longitude: 106.6825,
          priceMin: '20000', // form cũ gửi chuỗi -> trước đây làm projection 500
          priceMax: 45000,
          schedule: { is24h: false, openTime: '07:00', closeTime: '22:00', isOvernight: false },
          amenities: { wifiQuality: 'STRONG', airConditioned: true }, // các ô còn lại KHÔNG điền
          dyn: { wifi_speed_mbps: 88 },
          galleryAssetIds: [up.body.data.id],
          otherNotes: 'Sân sau yên tĩnh',
        },
      });
    expect(created.status).toBe(201);
    createdSuggestionIds.push(created.body.data.id);

    // Xem trước cho admin
    const preview = await request(app).get(`/api/v1/admin/community/suggestions/${created.body.data.id}/preview`).set('Cookie', admin.cookie);
    expect(preview.status).toBe(200);
    expect(preview.body.data.valid).toBe(true);
    expect(preview.body.data.snapshot.priceMin).toBe(20000);

    const ok = await request(app)
      .post(`/api/v1/admin/community/suggestions/${created.body.data.id}/moderate`)
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ action: 'APPROVE', reviewerNote: 'ok' });
    expect(ok.status).toBe(200);
    createdPlaceIds.push(ok.body.data.placeId);

    const pub = await request(app).get(`/api/v1/places/${ok.body.data.slug}`);
    expect(pub.status).toBe(200);
    const snap = pub.body.data.snapshot;
    expect(snap.priceMin).toBe(20000);
    expect(snap.priceMax).toBe(45000);
    expect(snap.weeklySchedule).toHaveLength(7);
    expect(snap.weeklySchedule[0].shifts[0].openTime).toBe('07:00');
    // Không bịa: ô sinh viên không điền phải là UNKNOWN / null / trống
    expect(snap.amenities.wifiQuality).toBe('STRONG');
    expect(snap.amenities.airConditioned).toBe(true);
    expect(snap.amenities.noiseLevel).toBe('UNKNOWN');
    expect(snap.amenities.socketDensity).toBe('UNKNOWN');
    expect(snap.amenities.groupStudyAllowed).toBeNull();
    expect(snap.studentDiscountDetails ?? '').toBe('');
    expect(snap.dynamicFieldValues.find((d: any) => d.fieldKey === 'wifi_speed_mbps')?.value).toBe(88);
    expect(snap.fullDescription).toContain('Sân sau yên tĩnh');
    expect(snap.gallery).toHaveLength(1);
    // Ảnh sinh viên gửi được công khai theo quán
    const img = await request(app).get(`/api/v1/media/${up.body.data.id}?variant=thumb`);
    expect(img.status).toBe(200);
    // Projection: điểm 0 / 0 đánh giá (không phải 5.0 giả), campus theo đề xuất
    const proj = await prisma.placePublishedProjection.findUnique({ where: { placeId: ok.body.data.placeId } });
    expect(proj?.ratingOverall).toBe(0);
    expect(proj?.reviewCount).toBe(0);
    expect(proj?.campusId).toBe(campusId);
    expect(proj?.priceMin).toBe(20000);
    // Duyệt lần 2 -> 409
    const again = await request(app)
      .post(`/api/v1/admin/community/suggestions/${created.body.data.id}/moderate`)
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ action: 'APPROVE', reviewerNote: 'ok' });
    expect(again.status).toBe(409);
  });

  it('2. Đề xuất thiếu vị trí: xem trước báo thiếu, phê duyệt trả 422 (không tạo quán với toạ độ giả), yêu cầu bổ sung vẫn được', async () => {
    const created = await request(app)
      .post('/api/v1/places/suggestions')
      .set('Cookie', student.cookie)
      .set('x-csrf-token', student.csrf)
      .send({ proposedName: `Quán thiếu vị trí ${TAG}`, categoryId, addressDescription: 'Đâu đó gần trường', initialData: { priceMin: 10000 } });
    expect(created.status).toBe(201);
    createdSuggestionIds.push(created.body.data.id);

    const preview = await request(app).get(`/api/v1/admin/community/suggestions/${created.body.data.id}/preview`).set('Cookie', admin.cookie);
    expect(preview.body.data.valid).toBe(false);
    expect(preview.body.data.issues.join(' ')).toMatch(/vị trí/i);

    const approve = await request(app)
      .post(`/api/v1/admin/community/suggestions/${created.body.data.id}/moderate`)
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ action: 'APPROVE', reviewerNote: 'ok' });
    expect(approve.status).toBe(422);
    expect(await prisma.place.count({ where: { defaultName: `Quán thiếu vị trí ${TAG}` } })).toBe(0);

    const changes = await request(app)
      .post(`/api/v1/admin/community/suggestions/${created.body.data.id}/moderate`)
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ action: 'CHANGES_REQUESTED', reviewerNote: 'Thiếu vị trí trên bản đồ' });
    expect(changes.status).toBe(200);
    expect(changes.body.data.status).toBe('CHANGES_REQUESTED');

    // Sinh viên sửa & gửi lại kèm vị trí -> duyệt được
    const resubmit = await request(app)
      .put(`/api/v1/me/contributions/suggestions/${created.body.data.id}`)
      .set('Cookie', student.cookie)
      .set('x-csrf-token', student.csrf)
      .send({ initialData: { priceMin: 10000, latitude: 10.77, longitude: 106.68 } });
    expect(resubmit.status).toBe(200);
    const ok = await request(app)
      .post(`/api/v1/admin/community/suggestions/${created.body.data.id}/moderate`)
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ action: 'APPROVE', reviewerNote: 'ok' });
    expect(ok.status).toBe(200);
    createdPlaceIds.push(ok.body.data.placeId);
  });
});
