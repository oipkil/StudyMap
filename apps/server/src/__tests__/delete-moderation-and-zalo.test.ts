import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
  const csrfRaw = cookies.find((c) => c.startsWith('ssg_csrf='));
  const csrf = csrfRaw ? csrfRaw.split(';')[0].replace('ssg_csrf=', '') : '';
  return { cookie: `${cookie}; ssg_csrf=${csrf}`, csrf, userId: res.body.data.user.id as string };
}

const png = () => sharp({ create: { width: 48, height: 48, channels: 3, background: { r: 184, g: 134, b: 11 } } }).png().toBuffer();

/**
 * Đợt 22/09: người dùng tự xoá / thu hồi nội dung của mình, ảnh phải qua duyệt mới công khai,
 * ảnh nhãn dán tách khỏi hàng đợi ảnh nội dung, và kênh thông báo Zalo (cấu hình động, token mã hoá).
 */
describe('Xoá & thu hồi nội dung, duyệt ảnh, thông báo Zalo', () => {
  let s1: { cookie: string; csrf: string; userId: string };
  let s2: { cookie: string; csrf: string; userId: string };
  let admin: { cookie: string; csrf: string; userId: string };
  let placeId: string;
  const createdAssetIds: string[] = [];
  const createdChannelIds: string[] = [];

  beforeAll(async () => {
    s1 = await login('sinhvien1@hcmus.edu.vn', 'Student@123456');
    s2 = await login('sinhvien2@hcmus.edu.vn', 'Student@123456');
    admin = await login('admin@ssg.edu.vn', 'Admin@123456');
    const place = await prisma.place.findFirst({ where: { currentPublishedRevisionId: { not: null } }, select: { id: true } });
    placeId = place!.id;
  });

  afterAll(async () => {
    await prisma.assetUsage.deleteMany({ where: { assetRevision: { assetId: { in: createdAssetIds } } } });
    await prisma.asset.deleteMany({ where: { id: { in: createdAssetIds } } });
    await prisma.notificationChannel.deleteMany({ where: { id: { in: createdChannelIds } } });
    vi.unstubAllGlobals();
  });

  it('1. Sinh viên xoá đánh giá của mình; người khác không xoá được', async () => {
    const create = await request(app)
      .post(`/api/v1/places/${placeId}/reviews`)
      .set('Cookie', s2.cookie)
      .set('x-csrf-token', s2.csrf)
      .send({ ratingOverall: 4, criteriaScores: [], content: 'Đánh giá để kiểm tra chức năng xoá của chính chủ (test tự động).', attachedAssetIds: [] });
    expect(create.status).toBe(201);
    const reviewId = create.body.data.reviewId as string;

    const stranger = await request(app).delete(`/api/v1/places/reviews/${reviewId}`).set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf);
    expect(stranger.status).toBe(404);

    const own = await request(app).delete(`/api/v1/places/reviews/${reviewId}`).set('Cookie', s2.cookie).set('x-csrf-token', s2.csrf);
    expect(own.status).toBe(200);
    expect(await prisma.review.findUnique({ where: { id: reviewId } })).toBeNull();
  });

  it('2. Xoá bình luận: giữ chỗ "đã bị xoá" khi còn câu trả lời, xoá hẳn khỏi danh sách khi không còn', async () => {
    const root = await request(app).post('/api/v1/community/comments').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).send({ targetType: 'PLACE', targetId: placeId, content: 'Bình luận gốc (test xoá)' });
    const reply = await request(app)
      .post('/api/v1/community/comments')
      .set('Cookie', s2.cookie)
      .set('x-csrf-token', s2.csrf)
      .send({ targetType: 'PLACE', targetId: placeId, parentCommentId: root.body.data.id, content: 'Trả lời (test xoá)' });
    expect(root.status).toBe(201);
    expect(reply.status).toBe(201);

    // Duyệt cả hai để mọi người cùng thấy (bình luận chờ duyệt chỉ tác giả thấy)
    for (const c of [root, reply]) {
      const rev = await prisma.commentRevision.findFirst({ where: { commentId: c.body.data.id }, orderBy: { revisionNumber: 'desc' } });
      const mod = await request(app).post(`/api/v1/admin/community/comments/${rev!.id}/moderate`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ action: 'APPROVE' });
      expect(mod.status).toBe(200);
    }

    // Người khác không xoá được bình luận của mình
    const stranger = await request(app).delete(`/api/v1/community/comments/${root.body.data.id}`).set('Cookie', s2.cookie).set('x-csrf-token', s2.csrf);
    expect(stranger.status).toBe(403);

    const del = await request(app).delete(`/api/v1/community/comments/${root.body.data.id}`).set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf);
    expect(del.status).toBe(200);

    // Khách cũng thấy chỗ "đã bị xoá" vì bên dưới còn câu trả lời đã duyệt
    const list = await request(app).get(`/api/v1/community/comments?targetType=PLACE&targetId=${placeId}`);
    const shownRoot = (list.body.data as any[]).find((c) => c.id === root.body.data.id);
    expect(shownRoot?.isDeleted).toBe(true);
    expect(shownRoot?.content).toBe('Bình luận đã bị xoá');

    // Xoá nốt câu trả lời -> bình luận gốc biến mất khỏi danh sách
    await request(app).delete(`/api/v1/community/comments/${reply.body.data.id}`).set('Cookie', s2.cookie).set('x-csrf-token', s2.csrf);
    const list2 = await request(app).get(`/api/v1/community/comments?targetType=PLACE&targetId=${placeId}`);
    expect((list2.body.data as any[]).some((c) => c.id === root.body.data.id)).toBe(false);
  });

  it('3. Thu hồi bài viết chờ duyệt, thu hồi đề xuất quán; đề xuất đã duyệt thì không thu hồi được', async () => {
    const post = await request(app)
      .post('/api/v1/community/posts')
      .set('Cookie', s1.cookie)
      .set('x-csrf-token', s1.csrf)
      .send({ title: 'Bài kiểm tra thu hồi', summary: 'tóm tắt', contentBlocks: [{ type: 'text', text: 'Nội dung bài kiểm tra chức năng thu hồi.' }], placeIds: [placeId] });
    expect(post.status).toBe(201);
    const withdraw = await request(app).post(`/api/v1/community/posts/${post.body.data.id}/withdraw`).set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf);
    expect(withdraw.status).toBe(200);
    expect(withdraw.body.data.deleted).toBe(true);
    expect(await prisma.post.findUnique({ where: { id: post.body.data.id } })).toBeNull();

    const category = await prisma.category.findFirst({ select: { id: true } });
    const sug = await request(app)
      .post('/api/v1/places/suggestions')
      .set('Cookie', s1.cookie)
      .set('x-csrf-token', s1.csrf)
      .send({ proposedName: 'Quán kiểm tra thu hồi', categoryId: category!.id, addressDescription: '1 Đường Test, Quận 5', initialData: { latitude: 10.76, longitude: 106.68 } });
    expect(sug.status).toBe(201);
    const wd = await request(app).delete(`/api/v1/me/contributions/suggestions/${sug.body.data.id}`).set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf);
    expect(wd.status).toBe(200);

    const approved = await prisma.placeSuggestion.create({
      data: { userId: s1.userId, proposedName: 'Quán đã duyệt (test)', categoryId: category!.id, addressDescription: 'x', status: 'APPROVED', initialData: {} },
    });
    const blocked = await request(app).delete(`/api/v1/me/contributions/suggestions/${approved.id}`).set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf);
    expect(blocked.status).toBe(409);
    await prisma.placeSuggestion.delete({ where: { id: approved.id } });
  });

  it('4. Ảnh đại diện phải được duyệt mới công khai; chính chủ vẫn xem được bản chờ duyệt', async () => {
    const up = await request(app).post('/api/v1/media/upload').set('Cookie', s2.cookie).set('x-csrf-token', s2.csrf).attach('file', await png(), 'avatar-pending.png');
    expect(up.status).toBe(201);
    const assetId = up.body.data.id as string;
    createdAssetIds.push(assetId);
    expect(up.body.data.moderationStatus).toBe('PENDING');

    const put = await request(app).put('/api/v1/me/profile').set('Cookie', s2.cookie).set('x-csrf-token', s2.csrf).send({ avatarAssetId: assetId });
    expect(put.status).toBe(200);

    // Khách chưa xem được, hồ sơ công khai chưa hiện ảnh
    expect((await request(app).get(`/api/v1/media/${assetId}?variant=thumb`)).status).toBe(403);
    expect((await request(app).get(`/api/v1/users/${s2.userId}`)).body.data.avatarUrl).toBeNull();
    // Chính chủ xem được (preview)
    expect((await request(app).get(`/api/v1/media/${assetId}?variant=thumb&preview=true`).set('Cookie', s2.cookie)).status).toBe(200);

    // Admin duyệt (không bắt buộc ghi chú) -> công khai
    const mod = await request(app).post(`/api/v1/media/admin/${assetId}/moderate`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ action: 'APPROVE' });
    expect(mod.status).toBe(200);
    expect((await request(app).get(`/api/v1/media/${assetId}?variant=thumb`)).status).toBe(200);
    expect((await request(app).get(`/api/v1/users/${s2.userId}`)).body.data.avatarUrl).toContain(assetId);

    // Trả hồ sơ về như cũ
    await request(app).put('/api/v1/me/profile').set('Cookie', s2.cookie).set('x-csrf-token', s2.csrf).send({ avatarAssetId: null });
  });

  it('5. Ảnh admin tải lên được duyệt sẵn; hàng đợi ảnh nội dung không lẫn ảnh nhãn dán; xoá ảnh', async () => {
    const adminUp = await request(app).post('/api/v1/media/upload').set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).attach('file', await png(), 'admin-auto.png');
    expect(adminUp.status).toBe(201);
    createdAssetIds.push(adminUp.body.data.id);
    expect(adminUp.body.data.moderationStatus).toBe('APPROVED');

    const stickerUp = await request(app).post('/api/v1/media/upload').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).attach('file', await png(), 'sticker-src.png');
    const stickerAssetId = stickerUp.body.data.id as string;
    createdAssetIds.push(stickerAssetId);
    const suffix = Date.now().toString().slice(-6);
    const pack = await request(app)
      .post('/api/v1/community/stickers/packs')
      .set('Cookie', s1.cookie)
      .set('x-csrf-token', s1.csrf)
      .send({ name: `Bộ test ${suffix}`, slug: `bo-test-${suffix}`, items: [{ shortcode: `:t${suffix}:`, assetId: stickerAssetId, altText: 'test' }] });
    expect(pack.status).toBe(201);

    const contentQueue = await request(app).get('/api/v1/media/admin/list?status=PENDING&limit=50&source=content').set('Cookie', admin.cookie);
    expect((contentQueue.body.data.assets as any[]).some((a) => a.id === stickerAssetId)).toBe(false);
    const stickerQueue = await request(app).get('/api/v1/media/admin/list?limit=50&source=sticker').set('Cookie', admin.cookie);
    expect((stickerQueue.body.data.assets as any[]).some((a) => a.id === stickerAssetId)).toBe(true);

    // Duyệt bộ nhãn dán -> ảnh công khai luôn, không cần duyệt lại ở thư viện ảnh
    const approve = await request(app).post(`/api/v1/admin/community/stickers/${pack.body.data.id}/moderate`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ action: 'APPROVE' });
    expect(approve.status).toBe(200);
    expect((await request(app).get(`/api/v1/media/${stickerAssetId}?variant=thumb`)).status).toBe(200);
    expect((await prisma.asset.findUnique({ where: { id: stickerAssetId } }))?.moderationStatus).toBe('APPROVED');

    await prisma.stickerPack.delete({ where: { id: pack.body.data.id } });

    // Chủ ảnh xoá ảnh của mình
    const own = await request(app).post('/api/v1/media/upload').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).attach('file', await png(), 'to-delete.png');
    const delOther = await request(app).delete(`/api/v1/media/${own.body.data.id}`).set('Cookie', s2.cookie).set('x-csrf-token', s2.csrf);
    expect(delOther.status).toBe(403);
    const del = await request(app).delete(`/api/v1/media/${own.body.data.id}`).set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf);
    expect(del.status).toBe(200);
    expect(await prisma.asset.findUnique({ where: { id: own.body.data.id } })).toBeNull();
  });

  it('6. Duyệt hàng loạt ảnh (một lượt cho cả trang)', async () => {
    const a1 = await request(app).post('/api/v1/media/upload').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).attach('file', await png(), 'bulk-1.png');
    const a2 = await request(app).post('/api/v1/media/upload').set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).attach('file', await png(), 'bulk-2.png');
    createdAssetIds.push(a1.body.data.id, a2.body.data.id);
    const bulk = await request(app)
      .post('/api/v1/media/admin/moderate-bulk')
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ assetIds: [a1.body.data.id, a2.body.data.id], action: 'APPROVE' });
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.count).toBe(2);
    expect((await prisma.asset.findUnique({ where: { id: a2.body.data.id } }))?.moderationStatus).toBe('APPROVED');
  });

  it('6b. Admin ẩn / hiện lại quán và xoá quán trùng (phải xác nhận bằng slug)', async () => {
    const place = await prisma.place.findFirst({ where: { projection: { isNot: null } }, include: { currentPublishedRevision: true } });
    expect(place).toBeTruthy();

    // Ẩn -> biến mất khỏi danh sách và trang chi tiết công khai
    const hide = await request(app).post(`/api/v1/admin/places/${place!.id}/visibility`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ hidden: true });
    expect(hide.status).toBe(200);
    expect((await request(app).get(`/api/v1/places/${place!.slug}`)).status).toBe(404);
    const listHidden = await request(app).get('/api/v1/places?limit=100');
    expect((listHidden.body.data as any[]).some((p) => p.slug === place!.slug)).toBe(false);

    // Hiện lại -> có lại
    const show = await request(app).post(`/api/v1/admin/places/${place!.id}/visibility`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ hidden: false });
    expect(show.status).toBe(200);
    expect((await request(app).get(`/api/v1/places/${place!.slug}`)).status).toBe(200);

    // Tạo bản sao trùng tên -> rà quán trùng phát hiện
    const dupSlug = `${place!.slug}-ban-sao-test`;
    const created = await request(app)
      .post('/api/v1/admin/places')
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({
        defaultName: place!.defaultName,
        slug: dupSlug,
        categoryId: place!.categoryId,
        initialStatus: 'APPROVED',
        snapshotData: {
          name: place!.defaultName,
          slug: dupSlug,
          categoryId: place!.categoryId,
          operationalStatus: 'OPERATING',
          address: 'Bản sao để kiểm tra rà quán trùng',
          latitude: 10.7628,
          longitude: 106.6825,
          timezone: 'Asia/Ho_Chi_Minh',
          weeklySchedule: [{ dayOfWeek: 1, isClosed: false, is24h: false, shifts: [{ openTime: '07:00', closeTime: '22:00', isOvernight: false }] }],
          currency: 'VND',
          menuGroups: [],
          dynamicFieldValues: [],
        },
      });
    expect(created.status).toBe(201);

    const dups = await request(app).get('/api/v1/admin/places/duplicates').set('Cookie', admin.cookie);
    expect(dups.status).toBe(200);
    expect((dups.body.data.groups as any[]).some((g) => g.places.some((p: any) => p.slug === dupSlug))).toBe(true);

    // Xoá: thiếu xác nhận -> 422; đúng slug -> xoá được
    const noConfirm = await request(app).delete(`/api/v1/admin/places/${created.body.data.id}`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf);
    expect(noConfirm.status).toBe(422);
    const del = await request(app).delete(`/api/v1/admin/places/${created.body.data.id}?confirm=${dupSlug}`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf);
    expect(del.status).toBe(200);
    expect(await prisma.place.findUnique({ where: { id: created.body.data.id } })).toBeNull();

    // Sinh viên không được ẩn / xoá quán
    expect((await request(app).post(`/api/v1/admin/places/${place!.id}/visibility`).set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).send({ hidden: true })).status).toBe(403);
  });

  it('6c. "Quán còn bàn không": báo cáo thật, gộp theo 2 giờ, mỗi người 15 phút một lần', async () => {
    const place = await prisma.place.findFirst({ where: { projection: { isNot: null } }, select: { id: true } });
    await prisma.placeSeatReport.deleteMany({ where: { placeId: place!.id } });

    // Chưa ai báo -> rỗng, không bịa trạng thái
    const empty = await request(app).get(`/api/v1/places/${place!.id}/seat-status`);
    expect(empty.status).toBe(200);
    expect(empty.body.data.total).toBe(0);
    expect(empty.body.data.status).toBeNull();

    // Khách chưa đăng nhập không báo được
    expect((await request(app).post(`/api/v1/places/${place!.id}/seat-status`).send({ status: 'FEW' })).status).toBe(401);

    const first = await request(app).post(`/api/v1/places/${place!.id}/seat-status`).set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).send({ status: 'FEW' });
    expect(first.status).toBe(201);
    expect(first.body.data.total).toBe(1);
    expect(first.body.data.status).toBe('FEW');

    // Cùng một người bấm lại ngay -> bị chặn để không làm lệch số liệu
    const again = await request(app).post(`/api/v1/places/${place!.id}/seat-status`).set('Cookie', s1.cookie).set('x-csrf-token', s1.csrf).send({ status: 'FULL' });
    expect(again.status).toBe(429);

    const second = await request(app).post(`/api/v1/places/${place!.id}/seat-status`).set('Cookie', s2.cookie).set('x-csrf-token', s2.csrf).send({ status: 'FEW' });
    expect(second.status).toBe(201);
    expect(second.body.data.total).toBe(2);

    // Báo cáo cũ hơn 2 giờ không được tính
    await prisma.placeSeatReport.create({ data: { placeId: place!.id, userId: admin.userId, status: 'FULL', createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) } });
    const summary = await request(app).get(`/api/v1/places/${place!.id}/seat-status`);
    expect(summary.body.data.total).toBe(2);
    expect(summary.body.data.counts.FULL).toBe(0);

    await prisma.placeSeatReport.deleteMany({ where: { placeId: place!.id } });
  });

  it('7. Kênh Zalo: tạo (token mã hoá, chỉ trả về dạng che), gửi thử và kiểm tra token qua API giả lập', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal('fetch', async (url: any, init: any) => {
      const u = String(url);
      calls.push({ url: u, body: init?.body ? JSON.parse(init.body) : null });
      if (u.endsWith('/getMe')) return new Response(JSON.stringify({ ok: true, result: { id: 'bot1', display_name: 'Bot Test' } }), { status: 200 });
      if (u.endsWith('/sendMessage')) return new Response(JSON.stringify({ ok: true, result: { message_id: 'm1', date: Date.now() } }), { status: 200 });
      if (u.endsWith('/getUpdates')) return new Response(JSON.stringify({ ok: true, result: { message: { chat: { id: 'chat-abc', chat_type: 'GROUP' }, from: { display_name: 'An' }, text: 'hi' } } }), { status: 200 });
      return new Response('{}', { status: 404 });
    });

    const created = await request(app)
      .post('/api/v1/admin/integrations/channels')
      .set('Cookie', admin.cookie)
      .set('x-csrf-token', admin.csrf)
      .send({ name: 'Nhóm test', chatId: 'chat-abc', token: '1234567890:abcdefghijklmnopqrstuvwxyz', events: ['SUGGESTION_PENDING'] });
    expect(created.status).toBe(201);
    createdChannelIds.push(created.body.data.id);
    expect(created.body.data.tokenMasked).not.toContain('abcdefghijklmnopqrstuvwxyz');
    const row = await prisma.notificationChannel.findUnique({ where: { id: created.body.data.id } });
    expect(row?.encryptedToken).not.toContain('abcdefghijklmnopqrstuvwxyz');

    const check = await request(app).post('/api/v1/admin/integrations/zalo/check').set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ channelId: created.body.data.id });
    expect(check.status).toBe(200);
    expect(check.body.data.display_name).toBe('Bot Test');

    const test = await request(app).post(`/api/v1/admin/integrations/channels/${created.body.data.id}/test`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({});
    expect(test.status).toBe(200);
    const sent = calls.find((c) => c.url.endsWith('/sendMessage'));
    expect(sent?.body.chat_id).toBe('chat-abc');

    const updates = await request(app).post('/api/v1/admin/integrations/zalo/updates').set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({ channelId: created.body.data.id });
    expect(updates.status).toBe(200);
    expect(updates.body.data.chats[0].chatId).toBe('chat-abc');

    // Bắn thử một sự kiện -> kênh có đăng ký sự kiện đó nhận tin
    const evt = await request(app).post('/api/v1/admin/integrations/events/SUGGESTION_PENDING/test').set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf).send({});
    expect(evt.status).toBe(200);
    expect(evt.body.data.sent).toBe(1);

    // Sinh viên không được xem cấu hình kênh
    expect((await request(app).get('/api/v1/admin/integrations/channels').set('Cookie', s1.cookie)).status).toBe(403);

    const del = await request(app).delete(`/api/v1/admin/integrations/channels/${created.body.data.id}`).set('Cookie', admin.cookie).set('x-csrf-token', admin.csrf);
    expect(del.status).toBe(200);
    vi.unstubAllGlobals();
  });
});
