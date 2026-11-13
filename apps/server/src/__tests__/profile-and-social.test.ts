import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

const app = createApp();

/** Đăng nhập -> cookie phiên + CSRF (đúng cách các test khác đang dùng). */
async function login(identifier: string, password: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ identifier, password });
  expect(res.status).toBe(200);
  const cookies = (res.headers['set-cookie'] as unknown as string[]) || [];
  const cookie = cookies.find((c) => c.startsWith('ssg_session='))!.split(';')[0];
  const csrfRaw = cookies.find((c) => c.startsWith('ssg_csrf='));
  const csrf = csrfRaw ? csrfRaw.split(';')[0].replace('ssg_csrf=', '') : '';
  return { cookie: `${cookie}; ssg_csrf=${csrf}`, csrf, userId: res.body.data.user.id as string };
}

describe('Hồ sơ kiểu mạng xã hội: ảnh đại diện, dòng thời gian, ảnh đính kèm & trường động công khai', () => {
  let s1: { cookie: string; csrf: string; userId: string };
  let s2: { cookie: string; csrf: string; userId: string };
  let admin: { cookie: string; csrf: string; userId: string };
  let avatarAssetId: string;
  let reviewPhotoAssetId: string;
  let placeId: string;
  const createdAssetIds: string[] = [];
  let originalProfile: { displayName: string; bio: string | null; avatar: string | null } | null = null;

  const pngBuffer = () => sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 47, g: 107, b: 79 } } }).png().toBuffer();

  beforeAll(async () => {
    s1 = await login('sinhvien1@hcmus.edu.vn', 'Student@123456');
    s2 = await login('sinhvien2@hcmus.edu.vn', 'Student@123456');
    admin = await login('admin@ssg.edu.vn', 'Admin@123456');
    const prof = await prisma.userProfile.findUnique({ where: { userId: s1.userId } });
    originalProfile = { displayName: prof?.displayName ?? 'Sinh viên', bio: prof?.currentPublishedBio ?? null, avatar: prof?.currentPublishedAvatarAssetId ?? null };
    const place = await prisma.place.findFirst({ where: { currentPublishedRevisionId: { not: null } }, select: { id: true } });
    placeId = place!.id;
  });

  afterAll(async () => {
    // Trả hồ sơ về như cũ để không ảnh hưởng test khác
    if (originalProfile) {
      await prisma.userProfile.update({
        where: { userId: s1.userId },
        data: { displayName: originalProfile.displayName, currentPublishedBio: originalProfile.bio, currentPublishedAvatarAssetId: originalProfile.avatar, currentPublishedCoverAssetId: null },
      });
    }
    await prisma.userProfileRevision.deleteMany({ where: { userProfile: { userId: s1.userId }, pendingAvatarAssetId: { in: createdAssetIds } } });
    await prisma.assetUsage.deleteMany({ where: { assetRevision: { assetId: { in: createdAssetIds } } } });
    await prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
  });

  it('1. GET /me/profile trả hồ sơ của chính mình (tên, giới thiệu, trường, ảnh)', async () => {
    const res = await request(app).get('/api/v1/me/profile').set('Cookie', s1.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('displayName');
    expect(res.body.data).toHaveProperty('universityCampusId');
    expect(res.body.data).toHaveProperty('isUniversityPublic');
  });

  it('2. PUT /me/profile: tải ảnh -> đặt làm avatar -> chờ duyệt, admin duyệt xong mới công khai (AssetUsage USER isPublished)', async () => {
    const up = await request(app).post('/api/v1/media/upload').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).attach('file', await pngBuffer(), 'avatar.png');
    expect(up.status).toBe(201);
    avatarAssetId = up.body.data.id;
    createdAssetIds.push(avatarAssetId);

    const put = await request(app)
      .put('/api/v1/me/profile')
      .set('Cookie', s1.cookie)
      .set('x-csrf-token', s1.csrf)
      .send({ displayName: 'An Nguyễn (test)', bio: 'Bio test', avatarAssetId });
    expect(put.status).toBe(200);
    expect(put.body.data.avatarAssetId).toBe(avatarAssetId);
    expect(put.body.data.avatarUrl).toContain(`/api/v1/media/${avatarAssetId}`);

    // Ảnh mới phải qua kiểm duyệt: khách chưa xem được, chính chủ xem được bản chờ duyệt
    expect((await request(app).get(`/api/v1/media/${avatarAssetId}?variant=thumb`)).status).toBe(403);
    expect((await request(app).get(`/api/v1/media/${avatarAssetId}?variant=thumb&preview=true`).set('Cookie', s1.cookie)).status).toBe(200);
    expect((await request(app).get(`/api/v1/users/${s1.userId}`)).body.data.avatarUrl).toBeNull();

    // Admin duyệt -> khách xem được ngay
    const modAvatar = await request(app).post(`/api/v1/media/admin/${avatarAssetId}/moderate`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ action: 'APPROVE' });
    expect(modAvatar.status).toBe(200);
    const img = await request(app).get(`/api/v1/media/${avatarAssetId}?variant=thumb`);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toMatch(/image/);

    // Hồ sơ công khai phản ánh thay đổi
    const pub = await request(app).get(`/api/v1/users/${s1.userId}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.displayName).toBe('An Nguyễn (test)');
    expect(pub.body.data.bio).toBe('Bio test');
    expect(pub.body.data.avatarUrl).toContain(avatarAssetId);

    // Ảnh bìa: đặt thêm -> cả avatar và bìa cùng công khai (publish theo thực thể USER không gỡ ảnh kia)
    const upCover = await request(app).post('/api/v1/media/upload').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).attach('file', await pngBuffer(), 'cover.png');
    expect(upCover.status).toBe(201);
    const coverAssetId = upCover.body.data.id as string;
    createdAssetIds.push(coverAssetId);
    const putCover = await request(app).put('/api/v1/me/profile').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).send({ coverAssetId });
    expect(putCover.status).toBe(200);
    expect(putCover.body.data.coverUrl).toContain(coverAssetId);
    // Ảnh bìa cũng phải được duyệt mới công khai
    expect((await request(app).get(`/api/v1/media/${coverAssetId}?variant=optimized`)).status).toBe(403);
    await request(app).post(`/api/v1/media/admin/${coverAssetId}/moderate`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ action: 'APPROVE' });
    expect((await request(app).get(`/api/v1/media/${coverAssetId}?variant=optimized`)).status).toBe(200);
    expect((await request(app).get(`/api/v1/media/${avatarAssetId}?variant=thumb`)).status).toBe(200);
    const pubCover = await request(app).get(`/api/v1/users/${s1.userId}`);
    expect(pubCover.body.data.coverUrl).toContain(coverAssetId);
    // Gỡ bìa -> coverUrl null, avatar vẫn công khai
    const rm = await request(app).put('/api/v1/me/profile').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).send({ coverAssetId: null });
    expect(rm.status).toBe(200);
    expect(rm.body.data.coverUrl).toBeNull();
    expect((await request(app).get(`/api/v1/media/${avatarAssetId}?variant=thumb`)).status).toBe(200);
  });

  it('2b. PUT /me/profile: "Trường khác" tự ghi -> hồ sơ công khai hiện tên trường; chọn trường trong danh sách sẽ xoá tên tự ghi', async () => {
    const other = await request(app).put('/api/v1/me/profile').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).send({ universityCampusId: null, customUniversityName: 'Trường ĐH Test (tự ghi)', isUniversityPublic: true });
    expect(other.status).toBe(200);
    expect(other.body.data.customUniversityName).toBe('Trường ĐH Test (tự ghi)');
    expect(other.body.data.universityCampusId).toBeNull();
    const pub = await request(app).get(`/api/v1/users/${s1.userId}`);
    expect(pub.body.data.campusName).toBe('Trường ĐH Test (tự ghi)');

    // Ẩn trường -> hồ sơ công khai không lộ tên tự ghi
    await request(app).put('/api/v1/me/profile').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).send({ isUniversityPublic: false });
    expect((await request(app).get(`/api/v1/users/${s1.userId}`)).body.data.campusName).toBeNull();

    // Chọn lại trường trong danh sách -> tên tự ghi bị xoá
    const campus = await prisma.campus.findFirst({ select: { id: true, name: true } });
    if (campus) {
      const pick = await request(app).put('/api/v1/me/profile').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).send({ universityCampusId: campus.id, isUniversityPublic: true });
      expect(pick.status).toBe(200);
      expect(pick.body.data.customUniversityName).toBeNull();
      expect((await request(app).get(`/api/v1/users/${s1.userId}`)).body.data.campusName).toBe(campus.name);
    }
    await request(app).put('/api/v1/me/profile').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).send({ universityCampusId: null, customUniversityName: null });
  });

  it('3. PUT /me/profile từ chối ảnh của người khác (404) và tên quá ngắn (422)', async () => {
    const steal = await request(app).put('/api/v1/me/profile').set('Cookie', s2.cookie).set('x-csrf-token', s2.csrf).send({ avatarAssetId });
    expect(steal.status).toBe(404);
    const short = await request(app).put('/api/v1/me/profile').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).send({ displayName: 'A' });
    expect([400, 422]).toContain(short.status);
  });

  it('4. Đánh giá kèm ảnh: chính chủ thấy trên /me/timeline (chờ duyệt, có ảnh); người khác KHÔNG thấy cho tới khi duyệt', async () => {
    const up = await request(app).post('/api/v1/media/upload').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).attach('file', await pngBuffer(), 'review.png');
    expect(up.status).toBe(201);
    reviewPhotoAssetId = up.body.data.id;
    createdAssetIds.push(reviewPhotoAssetId);

    const rv = await request(app)
      .post(`/api/v1/places/${placeId}/reviews`)
      .set('Cookie', s1.cookie)
      .set('x-csrf-token', s1.csrf)
      .send({ ratingOverall: 4, criteriaScores: [], content: 'Đánh giá kèm ảnh để kiểm tra dòng thời gian hồ sơ (test).', attachedAssetIds: [reviewPhotoAssetId] });
    expect(rv.status).toBe(201);

    const tl = await request(app).get('/api/v1/me/timeline').set('Cookie', s1.cookie);
    expect(tl.status).toBe(200);
    const mine = tl.body.data.find((x: any) => x.kind === 'review' && x.photos?.some((p: any) => p.assetId === reviewPhotoAssetId));
    expect(mine).toBeTruthy();
    expect(mine.status).toBe('PENDING');
    expect(mine.place).toBeTruthy();

    // Ảnh chờ duyệt: khách bị chặn
    const guest = await request(app).get(`/api/v1/media/${reviewPhotoAssetId}?variant=thumb`);
    expect(guest.status).toBe(403);

    // Hồ sơ công khai không lộ bản chờ duyệt
    const pub = await request(app).get(`/api/v1/users/${s1.userId}`);
    const leaked = (pub.body.data.photos || []).some((p: any) => p.assetId === reviewPhotoAssetId);
    expect(leaked).toBe(false);

    // Admin duyệt -> ảnh công khai + xuất hiện ở tab Ảnh của hồ sơ
    const revision = await prisma.reviewRevision.findFirst({ where: { review: { placeId, userId: s1.userId } }, orderBy: { revisionNumber: 'desc' } });
    const ok = await request(app)
      .post(`/api/v1/admin/community/reviews/${revision!.id}/moderate`)
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ action: 'APPROVE', reviewerNote: 'ok' });
    expect(ok.status).toBe(200);
    const pubImg = await request(app).get(`/api/v1/media/${reviewPhotoAssetId}?variant=thumb`);
    expect(pubImg.status).toBe(200);
    const pub2 = await request(app).get(`/api/v1/users/${s1.userId}`);
    expect((pub2.body.data.photos || []).some((p: any) => p.assetId === reviewPhotoAssetId)).toBe(true);
    expect(pub2.body.data.timeline.length).toBeGreaterThan(0);
    const reviews = await request(app).get(`/api/v1/places/${placeId}/reviews`);
    const shown = reviews.body.data.find((r: any) => r.author?.id === s1.userId);
    expect(shown.photos.map((p: any) => p.assetId)).toContain(reviewPhotoAssetId);
    expect(shown.author.avatarUrl).toContain(avatarAssetId);
  });

  it('5. GET /places/field-definitions (công khai): có nhãn/đơn vị/nhóm, KHÔNG lộ trường nội bộ (isPublic=false)', async () => {
    const key = `test_internal_${Date.now().toString().slice(-6)}`;
    const created = await request(app)
      .post('/api/v1/admin/field-definitions')
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ key, label: 'Ghi chú nội bộ test', dataType: 'TEXT', isPublic: false, fieldGroupKey: 'survey_meta_test', fieldGroupLabel: 'Khảo sát nội bộ (test)' });
    expect(created.status).toBe(201);
    const pubKey = `test_public_${Date.now().toString().slice(-6)}`;
    const created2 = await request(app)
      .post('/api/v1/admin/field-definitions')
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ key: pubKey, label: 'Tốc độ Wi-Fi test', dataType: 'NUMBER_WITH_UNIT', unit: 'Mbps', fieldGroupKey: 'study_test', fieldGroupLabel: 'Học tập (test)', fieldGroupSortOrder: 2 });
    expect(created2.status).toBe(201);

    const res = await request(app).get('/api/v1/places/field-definitions');
    expect(res.status).toBe(200);
    const keys = res.body.data.map((d: any) => d.key);
    expect(keys).not.toContain(key);
    expect(keys).toContain(pubKey);
    const def = res.body.data.find((d: any) => d.key === pubKey);
    expect(def.unit).toBe('Mbps');
    expect(def.group?.label).toBe('Học tập (test)');
    expect(def.versionId).toBeTruthy();

    // Dọn
    await prisma.fieldDefinition.deleteMany({ where: { key: { in: [key, pubKey] } } });
    await prisma.fieldGroup.deleteMany({ where: { key: { in: ['survey_meta_test', 'study_test'] } } });
  });
});
