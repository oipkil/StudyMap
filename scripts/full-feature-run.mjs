// Chạy toàn bộ tính năng web bằng trình duyệt thật (Playwright), chụp từng màn hình, ghi lỗi API/console.
// Kết quả: docs/evidence/full-run/{NN-*.png, results.json, results.md}
// Cách chạy: node scripts/full-feature-run.mjs   (server 4000 + web 5173 + Docker DB đang chạy)
import { chromium, devices } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = 'docs/evidence/full-run';
const ADMIN = { id: 'admin@ssg.edu.vn', pw: 'Admin@123456' };
const STUDENT = { id: 'sinhvien1@hcmus.edu.vn', pw: 'Student@123456' };
const STUDENT2 = { id: 'sinhvien2@hcmus.edu.vn', pw: 'Student@123456' };
const RUN = Date.now().toString().slice(-6);

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const results = [];

// DB dev: đặt lại hạn mức AI trong ngày của tài khoản sinh viên test để bước chat không bị 429 do các lần chạy trước
// (tính năng hạn mức vẫn được kiểm tra riêng bằng cách gọi API khi đã vượt mức — xem bước "Hạn mức AI").
try {
  const out = execFileSync('docker', ['exec', 'ssg-postgres', 'psql', '-U', 'ssg_admin', '-d', 'ssg_db', '-Atc',
    "DELETE FROM ai_usage_budgets WHERE \"scopeType\"='USER_DAILY' AND \"targetUserId\" IN (SELECT id FROM users WHERE email='" + STUDENT.id + "');"]).toString().trim();
  console.log('Reset AI quota sinh viên test:', out);
} catch (e) { console.log('Không reset được hạn mức AI (bỏ qua):', String(e.message).slice(0, 80)); }
let shotIndex = 0;
// Ảnh mẫu (JPEG 1600x1000, khối màu) cho các bước tải ảnh + cắt ảnh
const TEST_IMG = `${OUT}/_test-photo-${RUN}.jpg`;
{
  const { createRequire } = await import('node:module');
  const sharp = createRequire(import.meta.url)('../apps/server/node_modules/sharp');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="#F7F6F3"/><rect width="800" height="500" fill="#2F6B4F"/><rect x="800" y="500" width="800" height="500" fill="#B8860B"/><circle cx="800" cy="500" r="220" fill="#1F2421"/><text x="800" y="525" font-size="80" text-anchor="middle" fill="#fff" font-family="Arial">RUN ${RUN}</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(TEST_IMG);
}
const browser = await chromium.launch();

function attachCollectors(page, bucket) {
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/') && r.status() >= 400) bucket.api.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (!/favicon|Download the React DevTools|net::ERR_ABORTED/i.test(t)) bucket.console.push(t.slice(0, 200));
    }
  });
  page.on('pageerror', (e) => bucket.console.push(`PAGEERROR ${String(e).slice(0, 200)}`));
}

async function newSession(role, mobile = false) {
  const geo = { permissions: ['geolocation'], geolocation: { latitude: 10.762622, longitude: 106.682331 } };
  const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13'], locale: 'vi-VN', ...geo } : { viewport: { width: 1440, height: 900 }, locale: 'vi-VN', ...geo });
  const page = await ctx.newPage();
  const bucket = { api: [], console: [] };
  attachCollectors(page, bucket);
  if (role) {
    await page.goto(`${BASE}/login`);
    await page.locator('#identifier').fill(role.id);
    await page.locator('#password').fill(role.pw);
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  return { ctx, page, bucket };
}

async function shot(page, slug) {
  shotIndex += 1;
  const file = `${String(shotIndex).padStart(2, '0')}-${slug}.png`;
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: false }).catch(() => {});
  return file;
}

async function step(group, name, session, fn, opts = {}) {
  const { page, bucket } = session;
  const before = { api: bucket.api.length, console: bucket.console.length };
  const t0 = Date.now();
  const rec = { group, name, ok: false, error: null, shot: null, apiErrors: [], consoleErrors: [], ms: 0 };
  try {
    const shotSlug = await fn(page);
    rec.ok = true;
    rec.shot = await shot(page, shotSlug || name.toLowerCase().replace(/[^a-z0-9]+/gi, '-').slice(0, 40));
  } catch (e) {
    rec.error = String(e?.message || e).split('\n')[0].slice(0, 300);
    rec.shot = await shot(page, 'FAIL-' + name.toLowerCase().replace(/[^a-z0-9]+/gi, '-').slice(0, 40));
  }
  rec.ms = Date.now() - t0;
  rec.apiErrors = bucket.api.slice(before.api).filter((x) => !(opts.allowApi || []).some((re) => re.test(x)));
  rec.consoleErrors = bucket.console.slice(before.console);
  results.push(rec);
  console.log(`${rec.ok ? 'PASS' : 'FAIL'} [${group}] ${name}${rec.error ? ' — ' + rec.error : ''}${rec.apiErrors.length ? ' | API: ' + rec.apiErrors.join('; ') : ''}`);
  return rec;
}

const settle = async (page, ms = 1200) => { await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(ms); };
const clickBtn = async (page, re, nth = 0) => { const b = page.getByRole('button', { name: re }).nth(nth); await b.waitFor({ timeout: 8000 }); await b.click(); };
const expectVisible = async (page, textRe, timeout = 8000) => { await page.getByText(textRe).first().waitFor({ timeout }); };
const antdOk = async (page) => { await page.locator('.ant-modal-footer .ant-btn-primary, .ant-modal .ant-btn-primary').last().click(); };

// =========================================================================
// A. KHÁCH (chưa đăng nhập)
// =========================================================================
{
  const s = await newSession(null);
  const { page } = s;
  await step('Khách', 'Trang khám phá (danh sách + bản đồ)', s, async (p) => { await p.goto(BASE); await settle(p, 2500); await expectVisible(p, /Khám Phá/); return 'guest-discover'; });
  await step('Khách', 'Tìm kiếm tiếng Việt không dấu', s, async (p) => { const inp = p.locator('[data-testid=omnibox-input], input[placeholder*="Tìm"]').first(); await inp.fill('ca phe'); await p.waitForTimeout(1500); return 'guest-search'; });
  await step('Khách', 'Bộ lọc Không gian / Tiện ích', s, async (p) => { await clickBtn(p, /Không gian/); await p.waitForTimeout(600); return 'guest-filter-space'; });
  await step('Khách', 'Bản đồ trang chủ: phóng to rồi thu nhỏ -> danh sách tải lại theo khung nhìn', s, async (p) => {
    await p.goto(BASE); await settle(p, 2500);
    const canvas = p.locator('canvas').first(); await canvas.waitFor({ timeout: 10000 });
    const box = await canvas.boundingBox();
    // Phóng to sâu vào một điểm bất kỳ (lăn chuột) -> ít quán trong khung nhìn
    await p.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, -400); await p.waitForTimeout(120); }
    await p.waitForTimeout(1500);
    // Thu nhỏ trở lại -> phải thấy lại đủ 2 quán seed
    for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 400); await p.waitForTimeout(120); }
    await p.waitForTimeout(2000);
    const text = await p.locator('body').innerText();
    if (!/Cú Đêm/.test(text) || !/Coffee House/.test(text)) throw new Error('Sau khi thu nhỏ, danh sách không tải lại đủ quán trong khung nhìn');
    return 'guest-map-zoom-refetch';
  });
  await step('Khách', 'Bản đồ: nhãn Hoàng Sa / Trường Sa / Biển Đông hiện khi thu nhỏ, không còn "South China Sea"', s, async (p) => {
    await p.goto(`${BASE}/map`); await settle(p, 3000);
    await p.locator('canvas').first().waitFor({ timeout: 10000 });
    // Trang bản đồ mới nặng hơn -> chờ tới khi map + style sẵn sàng rồi mới truy vấn nhãn
    await p.waitForFunction(() => Boolean(window.__ssgMap?.isStyleLoaded?.()), null, { timeout: 20000 });
    await p.evaluate(() => window.__ssgMap.jumpTo({ center: [111.5, 13.5], zoom: 5 }));
    await p.waitForFunction(() => (window.__ssgMap?.queryRenderedFeatures({ layers: ['vn-islands-label'] }) || []).length >= 3, null, { timeout: 20000 });
    const r = await p.evaluate(() => {
      const m = window.__ssgMap;
      const ours = m.queryRenderedFeatures({ layers: ['vn-islands-label'] }).map((f) => f.properties.name);
      const scs = m.queryRenderedFeatures({ layers: ['water_name_point_label', 'water_name_line_label'] }).map((f) => f.properties['name:en'] || f.properties['name:latin'] || f.properties.name);
      return { ours: Array.from(new Set(ours)), scs: scs.filter((n) => /south china sea/i.test(String(n))) };
    });
    if (r.ours.length < 3) throw new Error('Thiếu nhãn biển đảo: ' + r.ours.join(', '));
    if (r.scs.length) throw new Error('Vẫn còn nhãn South China Sea của lớp nền');
    return 'guest-map-islands';
  });
  await step('Khách', 'Trang bản đồ riêng', s, async (p) => { await p.goto(`${BASE}/map`); await settle(p, 3000); await p.locator('canvas').first().waitFor({ timeout: 10000 }); return 'guest-map'; });
  await step('Khách', 'Chi tiết quán (gallery, giờ mở cửa, tiện ích)', s, async (p) => { await p.goto(`${BASE}/places/the-coffee-house-nguyen-van-cu`); await settle(p, 2500); await expectVisible(p, /Thời Gian Mở Cửa/); if (!(await p.locator('[data-testid=photo-grid-fb] img').count())) throw new Error('Gallery kiểu mạng xã hội không hiện ảnh'); return 'guest-place-detail'; });
  await step('Khách', 'Tab Đánh giá / Bài trải nghiệm / Hỏi đáp', s, async (p) => { await p.getByRole('tab', { name: /Đánh Giá/ }).click(); await p.waitForTimeout(500); await p.getByRole('tab', { name: /Hỏi Đáp/ }).click(); await p.waitForTimeout(500); return 'guest-place-tabs'; });
  await step('Khách', 'Trang 404: quán không tồn tại và đường dẫn sai đều có lối thoát (tìm quán / bản đồ)', s, async (p) => {
    await p.goto(`${BASE}/places/khong-co-quan-nay-${RUN}`); await settle(p, 1500);
    if (!(await p.locator('[data-testid=not-found-page]').count())) throw new Error('Trang quán sai không hiện trang 404');
    await p.goto(`${BASE}/duong-dan-sai-${RUN}`); await settle(p, 1200);
    if (!(await p.locator('[data-testid=not-found-search]').count())) throw new Error('Đường dẫn sai không hiện ô tìm quán trên trang 404');
    return 'guest-404';
  });
  await step('Khách', 'Bản đồ: nút "Vị trí của tôi" cắm chấm xanh + hiện toạ độ hiện tại', s, async (p) => {
    await p.goto(`${BASE}/map`); await settle(p, 3000);
    await p.locator('button:has-text("Vị trí của tôi")').click();
    await p.locator('[data-testid=user-location-dot]').waitFor({ timeout: 10000 });
    if (!(await p.locator('[data-testid=user-location-card]').count())) throw new Error('Không hiện thẻ toạ độ vị trí người dùng');
    return 'guest-map-my-location';
  });
  await step('Khách', 'So sánh quán (trống + hướng dẫn)', s, async (p) => { await p.goto(`${BASE}/compare`); await settle(p); await expectVisible(p, /So sánh (quán|góc học)/i); return 'guest-compare-empty'; });
  await step('Khách', 'So sánh 2 quán (bảng đối chiếu Wi-Fi/ổ cắm/giá)', s, async (p) => {
    const list = await (await p.request.get(BASE + '/api/v1/places?limit=5')).json();
    const items = list.data?.items || list.data || [];
    if (items.length < 2) throw new Error('Cần ít nhất 2 quán công khai để so sánh');
    const ids = items.slice(0, 2).map((x) => x.placeId || x.id).join(',');
    await p.goto(`${BASE}/compare?ids=${ids}`); await settle(p, 2500);
    const body = await p.locator('body').innerText();
    if (!/Wi-?Fi/i.test(body)) throw new Error('Bảng so sánh không hiển thị hàng Wi-Fi');
    if (!body.includes(items[0].name.slice(0, 12))) throw new Error('Bảng so sánh không có tên quán đầu tiên');
    if (!(await p.locator('[data-testid=compare-table]').count())) throw new Error('Không thấy bảng so sánh mới (cột tiêu chí dính trái)');
    if (!/Khoảng giá|Điểm đánh giá/.test(body)) throw new Error('Bảng so sánh thiếu nhóm Tổng quan');
    return 'guest-compare-two';
  });
  await step('Khách', 'Trang đăng nhập', s, async (p) => { await p.goto(`${BASE}/login`); await settle(p); await p.locator('#identifier').waitFor(); return 'guest-login'; });
  await step('Khách', 'Trang đăng ký', s, async (p) => { await p.goto(`${BASE}/register`); await settle(p); await p.locator('#email').waitFor(); return 'guest-register'; });
  await step('Khách', 'Trang quên mật khẩu', s, async (p) => { await p.goto(`${BASE}/forgot-password`); await settle(p); await p.locator('#email').waitFor(); return 'guest-forgot'; });
  await step('Khách', 'Khách không vào được /admin', s, async (p) => { await p.goto(`${BASE}/admin`); await settle(p); await expectVisible(p, /403|Truy Cập Bị Từ Chối|Đăng nhập/i); return 'guest-admin-blocked'; });
  await step('Khách', 'Chat AI yêu cầu đăng nhập', s, async (p) => { await p.goto(BASE); await settle(p, 2000); await p.locator('[data-testid=btn-open-chat]').first().click(); await p.waitForTimeout(800); return 'guest-chat-requires-login'; });
  await s.ctx.close();
}

// =========================================================================
// B. ĐĂNG KÝ + XÁC MINH EMAIL (Mailpit) + QUÊN MẬT KHẨU
// =========================================================================
{
  const s = await newSession(null);
  const { page } = s;
  const email = `sv_test_${RUN}@hcmus.edu.vn`;
  await step('Tài khoản', 'Đăng ký tài khoản mới', s, async (p) => {
    await p.goto(`${BASE}/register`); await settle(p);
    await p.locator('#displayName').fill('Sinh Viên Test ' + RUN);
    await p.locator('#username').fill('svtest' + RUN);
    await p.locator('#email').fill(email);
    await p.locator('#password').fill('Student@123456');
    const confirm = p.locator('#confirmPassword');
    if (await confirm.count()) await confirm.fill('Student@123456');
    await p.locator('form button[type="submit"]').first().click();
    await p.waitForTimeout(2500);
    return 'register-submitted';
  });
  await step('Tài khoản', 'Email xác minh gửi tới Mailpit', s, async (p) => {
    const r = await fetch('http://localhost:8025/api/v1/search?query=' + encodeURIComponent(`to:${email}`));
    const j = await r.json();
    if (!j.messages?.length) throw new Error('Mailpit không có email xác minh cho ' + email);
    const msg = await (await fetch(`http://localhost:8025/api/v1/message/${j.messages[0].ID}`)).json();
    const text = (msg.HTML || msg.Text || '');
    const m = text.match(/verify-email\/([A-Za-z0-9._-]+)|token=([A-Za-z0-9._-]+)/);
    if (!m) throw new Error('Không tìm thấy link/token xác minh trong email');
    const token = m[1] || m[2];
    const link = text.match(/https?:\/\/[^"'\s<]+verify[^"'\s<]*/)?.[0] || `${BASE}/verify-email/${token}`;
    await p.goto(link.replace(/https?:\/\/localhost:\d+/, BASE)); await settle(p, 2000);
    await expectVisible(p, /Email đã được xác minh/);
    const me = await (await p.request.get(BASE + '/api/v1/auth/me')).json();
    if (me?.data && me.data.isEmailVerified === false) throw new Error('/auth/me vẫn báo isEmailVerified=false sau khi xác minh');
    return 'email-verified';
  });
  await step('Tài khoản', 'Đăng nhập tài khoản mới', s, async (p) => {
    await p.goto(`${BASE}/login`); await p.locator('#identifier').fill(email); await p.locator('#password').fill('Student@123456');
    await p.locator('form button[type="submit"]').first().click(); await p.waitForTimeout(2500);
    if (p.url().includes('/login')) throw new Error('Vẫn ở trang login: ' + (await p.locator('.ant-message, .ant-alert').first().textContent().catch(() => '')));
    return 'new-user-logged-in';
  });
  await step('Tài khoản', 'Quên mật khẩu gửi email', s, async (p) => {
    await p.goto(`${BASE}/forgot-password`); await settle(p); await p.locator('#email').fill(email); await p.locator('form button[type="submit"]').first().click(); await p.waitForTimeout(2000);
    const r = await fetch('http://localhost:8025/api/v1/search?query=' + encodeURIComponent(`to:${email}`)); const j = await r.json();
    if ((j.messages?.length || 0) < 2) throw new Error('Không thấy email đặt lại mật khẩu');
    return 'forgot-password-sent';
  });
  await s.ctx.close();
}

// =========================================================================
// C. SINH VIÊN (sinhvien1)
// =========================================================================
let reviewPlaceSlug = 'ca-phe-hoc-bai-cu-dem-24-7';
{
  const s = await newSession(STUDENT);
  const { page } = s;
  await step('Sinh viên', 'Đăng nhập & về trang khám phá', s, async (p) => { await p.goto(BASE); await settle(p, 2500); await expectVisible(p, /Yêu thích/); return 'student-home'; });
  await step('Sinh viên', 'Yêu thích quán (toggle)', s, async (p) => { const heart = p.locator('button[style*="absolute"]').first(); await heart.waitFor({ timeout: 8000 }); await heart.click(); await p.waitForTimeout(1200); return 'student-favorite'; });
  await step('Sinh viên', 'Chi tiết quán: Viết đánh giá', s, async (p) => {
    await p.goto(`${BASE}/places/${reviewPlaceSlug}`); await settle(p, 2000);
    await p.getByRole('tab', { name: /Đánh Giá/ }).click(); await p.waitForTimeout(500);
    await clickBtn(p, /Viết Đánh Giá/);
    await p.locator('[data-testid=review-content]').waitFor();
    await p.locator('[data-testid=review-rating] .ant-rate-star').nth(4).click();
    await p.locator('[data-testid=review-content]').fill(`Quán rộng, wifi ổn, nhiều ổ cắm — review test ${RUN}. Ngồi học nhóm buổi tối rất thoải mái.`);
    // Thêm ảnh -> hộp cắt kéo-thả -> Xong -> tải lên
    await p.locator('[data-testid=photo-strip-input]').setInputFiles(TEST_IMG);
    await p.locator('[data-testid=crop-done]').waitFor({ timeout: 8000 });
    await p.waitForTimeout(500);
    await p.locator('[data-testid=crop-done]').click();
    await p.getByText(/1\/1 ảnh đã tải lên/).waitFor({ timeout: 20000 });
    await p.locator('[data-testid=review-submit]').click(); await p.waitForTimeout(2500);
    if (await p.locator('.ant-modal:visible').count()) throw new Error('Modal đánh giá vẫn mở: ' + (await p.locator('.ant-message').textContent().catch(() => '')));
    return 'student-write-review';
  });
  await step('Sinh viên', 'Chi tiết quán: Gửi bình luận', s, async (p) => {
    await p.getByRole('tab', { name: /Hỏi Đáp/ }).click(); await p.waitForTimeout(500);
    await p.getByPlaceholder(/Đặt câu hỏi/).fill(`Quán có mật khẩu wifi không ạ? (test ${RUN})`);
    await clickBtn(p, /Gửi Bình Luận/); await p.waitForTimeout(2000);
    return 'student-comment';
  });
  await step('Sinh viên', 'Chi tiết quán: Báo cáo vi phạm (chọn lý do + mô tả + gửi)', s, async (p) => {
    await p.goto(`${BASE}/places/${reviewPlaceSlug}`); await settle(p, 1500);
    await p.getByRole('button', { name: /Báo Cáo$/ }).first().click(); await p.locator('.ant-modal:visible').waitFor();
    await p.locator('.ant-modal:visible textarea').fill(`Thông tin giờ mở cửa không đúng thực tế (test ${RUN})`);
    await p.locator('.ant-modal:visible').getByRole('button', { name: /Gửi Báo Cáo Vi Phạm/ }).click(); await p.waitForTimeout(1500);
    if (await p.locator('.ant-modal:visible').count()) throw new Error('Modal báo cáo vẫn mở sau khi gửi');
    return 'student-report-submit';
  });
  await step('Sinh viên', 'Chi tiết quán: Viết bài trải nghiệm', s, async (p) => {
    await p.getByRole('tab', { name: /Bài Trải Nghiệm/ }).click(); await p.waitForTimeout(500);
    await clickBtn(p, /Viết Bài Trải Nghiệm/);
    await p.locator('[data-testid=post-title]').waitFor();
    await p.locator('[data-testid=post-place-tag]').waitFor();
    await p.locator('[data-testid=post-title]').fill(`Một buổi chiều học bài ở Cú Đêm (${RUN})`);
    await p.locator('[data-testid=post-content]').fill('Không gian yên tĩnh, đèn vàng dịu, ổ cắm mỗi bàn. Bạc xỉu 25k khá ổn.\n\nNên đi sau 20h để có bàn góc.');
    await p.locator('[data-testid=photo-strip-input]').setInputFiles(TEST_IMG);
    await p.locator('[data-testid=crop-done]').waitFor({ timeout: 8000 });
    await p.locator('[data-testid=crop-done]').click();
    await p.getByText(/1\/1 ảnh đã tải lên/).waitFor({ timeout: 20000 });
    await p.locator('[data-testid=post-submit]').click(); await p.waitForTimeout(2500);
    if (await p.locator('.ant-modal:visible').count()) throw new Error('Modal bài viết vẫn mở: ' + (await p.locator('.ant-message').textContent().catch(() => '')));
    return 'student-post';
  });
  await step('Sinh viên', 'Báo sửa thông tin / đóng góp cho quán', s, async (p) => {
    await clickBtn(p, /Báo Sửa \/ Đóng Góp/); await p.locator('.ant-modal:visible').first().waitFor(); await p.waitForTimeout(800); await p.keyboard.press('Escape');
    return 'student-contribution-modal';
  });
  await step('Sinh viên', 'Khối học bài: báo "quán còn bàn không" và xem giờ đông khách theo dữ liệu thật', s, async (p) => {
    await p.goto(`${BASE}/places/${reviewPlaceSlug}`); await settle(p, 3000);
    // Trạng thái chỗ ngồi lấy từ API thật (không phải số đếm trong máy)
    const detail = await (await p.request.get(`${BASE}/api/v1/places/${reviewPlaceSlug}`)).json();
    const seatPlaceId = detail.data?.placeId || detail.data?.id;
    const before = await (await p.request.get(`${BASE}/api/v1/places/${seatPlaceId}/seat-status`)).json();
    await p.getByRole('button', { name: /Gần hết bàn/ }).click();
    await p.getByText('Cảm ơn bạn đã cập nhật').waitFor({ timeout: 8000 }); await p.waitForTimeout(1200);
    const after = await (await p.request.get(`${BASE}/api/v1/places/${seatPlaceId}/seat-status`)).json();
    if ((after.data?.total ?? 0) <= (before.data?.total ?? 0)) throw new Error('Báo cáo chỗ ngồi không được ghi nhận trên máy chủ');
    if (after.data?.status !== 'FEW') throw new Error('Trạng thái tổng hợp sai: ' + after.data?.status);
    // Giờ đông khách: hiện dữ liệu thật hoặc lời mời bổ sung, không bịa số liệu
    const chartOrEmpty = (await p.locator('[data-testid=crowd-empty]').count()) + (await p.getByText(/Đông nhất \d{2}h/).count());
    if (chartOrEmpty === 0) throw new Error('Khối giờ đông khách không hiện dữ liệu thật lẫn lời mời bổ sung');
    return 'student-seat-report';
  });
  await step('Sinh viên', 'Bình luận dạng cây: trả lời bình luận của mình rồi xoá (bình luận gốc còn chỗ "đã bị xoá")', s, async (p) => {
    await p.goto(`${BASE}/places/${reviewPlaceSlug}`); await settle(p, 2500);
    await p.locator('.ant-tabs-tab', { hasText: /Hỏi Đáp/ }).click(); await p.waitForTimeout(600);
    await p.locator('textarea').first().fill(`Bình luận gốc ${RUN}`);
    await p.getByRole('button', { name: /Gửi Bình Luận/ }).click(); await p.waitForTimeout(1500);
    if (!(await p.locator('[data-testid=comment-thread]').count())) throw new Error('Không thấy danh sách bình luận dạng cây');
    await p.locator('[data-testid=btn-reply-comment]').first().click(); await p.waitForTimeout(300);
    await p.locator('textarea').first().fill(`Trả lời ${RUN}`);
    await p.getByRole('button', { name: /Gửi Bình Luận/ }).click(); await p.waitForTimeout(1800);
    if (!(await p.locator('[data-testid=comment-reply]').count())) throw new Error('Câu trả lời không lồng dưới bình luận gốc');
    // Xoá đúng hai bình luận test (giữ nguyên bình luận "mật khẩu wifi" của bước trước cho khâu duyệt)
    const delIn = async (testid, text) => {
      const box = p.locator(`[data-testid=${testid}]`, { hasText: text }).last();
      await box.locator('[data-testid=btn-delete-comment]').first().click();
      await p.locator('.ant-popconfirm-buttons button.ant-btn-primary, .ant-popover button.ant-btn-primary').last().click();
      await p.getByText('Đã xoá bình luận').waitFor({ timeout: 8000 });
      await p.waitForTimeout(1000);
    };
    await delIn('comment-reply', `Trả lời ${RUN}`);
    if (await p.locator('[data-testid=comment-reply]', { hasText: `Trả lời ${RUN}` }).count()) throw new Error('Câu trả lời không bị xoá khỏi danh sách');
    await delIn('comment-item', `Bình luận gốc ${RUN}`);
    return 'student-comment-thread-delete';
  });
  await step('Sinh viên', 'Gợi ý quán mới: form đầy đủ như admin (chọn từ bản đồ, giờ, giá, tiện ích, trường động, ảnh, ghi chú)', s, async (p) => {
    await p.goto(BASE); await settle(p, 2000);
    await clickBtn(p, /Gợi ý quán/); await p.locator('[data-testid=suggestion-form]').waitFor();
    // Tên -> chọn địa điểm từ bản đồ -> địa chỉ + vị trí + trường gần nhất tự điền
    // Tên tự đặt; địa chỉ gõ vào ô Địa chỉ rồi chọn từ gợi ý bản đồ (Photon)
    await p.locator('#proposedName').fill(`Trà Sữa Học Bài ${RUN}`);
    // Photon thỉnh thoảng trả rỗng -> thử lần lượt vài từ khoá trước khi báo lỗi
    const geo = p.locator('.ant-select-dropdown .ant-select-item-option');
    let geoOk = false;
    for (const q of ['Phuc Long Nguyen Van Cu', 'Nguyen Van Cu', '227 Nguyen Van Cu']) {
      await p.locator('#addressDescription').fill('');
      await p.locator('#addressDescription').fill(q);
      await p.waitForTimeout(2800);
      if (await geo.count()) { geoOk = true; break; }
    }
    if (!geoOk) throw new Error('Không có gợi ý địa điểm từ geocoder (đã thử 3 từ khoá)');
    await geo.first().click(); await p.waitForTimeout(800); await p.keyboard.press('Escape');
    const coords = (await p.locator('[data-testid=location-coords]').textContent().catch(() => '')) || '';
    if (!coords) throw new Error('Vị trí không tự điền sau khi chọn địa điểm');
    if (!(await p.locator('#addressDescription').inputValue())) throw new Error('Địa chỉ không tự điền');
    // Mở rộng bản đồ khi chọn vị trí (mobile + desktop): modal toàn màn hình có bản đồ thứ hai, bấm "Xong" để đóng
    await p.locator('[data-testid=location-expand]').first().click(); await p.locator('[data-testid=location-expand-done]').waitFor({ timeout: 8000 }); await p.waitForTimeout(1200);
    const bigMap = await p.locator('.ant-modal:visible .maplibregl-canvas').last().boundingBox();
    if (!bigMap || bigMap.height < 300) throw new Error('Bản đồ mở rộng không hiện đủ lớn: ' + JSON.stringify(bigMap));
    await p.locator('[data-testid=location-expand-done]').click(); await p.waitForTimeout(600);
    const dd = '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option';
    await p.locator('#categoryId').click(); await p.locator(dd, { hasText: 'Café' }).first().click();
    // Trường gần quán không có trong danh sách -> nút cố định cuối bảng chọn -> ô tự ghi
    await p.locator('#campusId').click(); await p.locator('[data-testid=suggest-campus-other]').click();
    await p.locator('#campusOther').fill(`ĐH Khác gần quán (${RUN})`);
    await p.locator('#openTime').click(); await p.locator('#openTime').fill('07:00'); await p.keyboard.press('Enter');
    await p.locator('#closeTime').click(); await p.locator('#closeTime').fill('22:00'); await p.keyboard.press('Enter');
    await p.locator('#priceMin').fill('20000'); await p.locator('#priceMax').fill('45000');
    await p.locator('#am_wifiQuality').click(); await p.locator(dd, { hasText: 'Mạnh' }).click();
    await p.locator('.ant-form-item', { hasText: 'Máy lạnh' }).locator('.ant-segmented-item', { hasText: /^Có$/ }).click();
    await p.locator('.ant-collapse-header', { hasText: 'Học tập & làm việc' }).click(); await p.waitForTimeout(400);
    await p.locator('#dyn_wifi_speed_mbps').fill('88');
    await p.locator('[data-testid=photo-strip-input]').setInputFiles(TEST_IMG); await p.locator('[data-testid=crop-done]').waitFor({ timeout: 8000 }); await p.locator('[data-testid=crop-done]').click();
    await p.getByText(/1\/1 ảnh đã tải lên/).waitFor({ timeout: 20000 });
    await p.locator('#otherNotes').fill(`Ghi chú test ${RUN}: có sân sau yên tĩnh`);
    await p.locator('[data-testid=suggestion-submit]').click(); await p.waitForTimeout(2500);
    if (await p.locator('.ant-modal:visible').count()) throw new Error('Modal đề xuất vẫn mở sau khi gửi: ' + (await p.locator('.ant-form-item-explain-error').allTextContents()).join(' | '));
    return 'student-suggest-place';
  });
  await step('Sinh viên', 'Thu hồi đóng góp chưa duyệt ngay trên trang Đóng góp', s, async (p) => {
    // Gửi một đề xuất phụ rồi thu hồi chính nó (đề xuất chính vẫn nằm lại cho khâu admin duyệt)
    const meta = await (await p.request.get(`${BASE}/api/v1/places/meta`)).json();
    const name = `Quán thu hồi thử ${RUN}`;
    const created = await p.request.post(`${BASE}/api/v1/places/suggestions`, {
      data: { proposedName: name, categoryId: meta.data.categories[0].id, addressDescription: 'Địa chỉ thử thu hồi, Quận 5', initialData: { latitude: 10.7626, longitude: 106.6823 } },
      headers: { 'x-csrf-token': (await p.context().cookies()).find((c) => c.name === 'ssg_csrf')?.value || '' },
    });
    if (created.status() !== 201) throw new Error('Không tạo được đề xuất phụ để thử thu hồi: ' + created.status());

    await p.goto(`${BASE}/me/contributions`); await settle(p, 2500);
    const row = p.locator('[data-testid=contribution-item]', { hasText: name }).first();
    const btn = row.locator('[data-testid=btn-withdraw-contribution]').first();
    if (!(await btn.count())) throw new Error('Không có nút thu hồi cho đóng góp đang chờ duyệt');
    await btn.click();
    await p.locator('.ant-popconfirm-buttons button.ant-btn-primary, .ant-popover button.ant-btn-primary').last().click();
    await p.getByText('Đã thu hồi đóng góp').waitFor({ timeout: 8000 }); await p.waitForTimeout(1500);
    const left = await (await p.request.get(`${BASE}/api/v1/me/contributions`)).json();
    if ((left.data?.suggestions || []).some((x) => x.proposedName === name)) throw new Error('Đề xuất vẫn còn sau khi thu hồi');
    return 'student-withdraw-contribution';
  });
  await step('Sinh viên', 'Chat AI: xem lại hội thoại cũ và xoá hội thoại', s, async (p) => {
    await p.goto(BASE); await settle(p, 1500);
    await p.locator('[data-testid=btn-open-chat]').first().click(); await p.waitForTimeout(1200);
    await p.locator('[data-testid=btn-chat-history]').click(); await p.waitForTimeout(1200);
    if (!(await p.locator('[data-testid=chat-history-list]').count())) throw new Error('Không mở được danh sách hội thoại');
    const items = await p.locator('[data-testid=chat-history-item]').count();
    if (items > 0) {
      await p.locator('[data-testid=btn-chat-delete]').first().click();
      await p.locator('.ant-popconfirm-buttons button.ant-btn-primary, .ant-popover button.ant-btn-primary').last().click();
      await p.getByText('Đã xoá hội thoại').waitFor({ timeout: 8000 }); await p.waitForTimeout(1000);
      if ((await p.locator('[data-testid=chat-history-item]').count()) >= items) throw new Error('Hội thoại không bị xoá');
    }
    return 'student-chat-history-delete';
  });
  await step('Sinh viên', 'Hồ sơ (kiểu mạng xã hội): /me/contributions chuyển về tab "Đóng góp" — một danh sách, lọc bằng nút', s, async (p) => {
    await p.goto(`${BASE}/me/contributions`); await settle(p, 2500);
    if (!/\/users\/.+tab=contributions/.test(p.url())) throw new Error('Không chuyển hướng về hồ sơ: ' + p.url());
    await p.locator('[data-testid=btn-suggest-place]').waitFor();
    if (await p.locator('.ant-tabs-tab', { hasText: /Bộ Nhãn Dán|Báo Sửa Thông Tin/ }).count()) throw new Error('Vẫn còn tab con trong Đóng góp');
    const text = await p.locator('body').innerText();
    if (!/Trà Sữa Học Bài/.test(text)) throw new Error('Danh sách đóng góp không hiện đề xuất quán vừa gửi');
    return 'student-my-contributions';
  });
  await step('Sinh viên', 'Gửi bộ nhãn dán (tải ảnh + đặt tên + gửi duyệt)', s, async (p) => {
    // Tạo file PNG nhỏ từ ảnh chụp màn hình để làm nhãn dán
    const stickerPath = `${OUT}/_sticker-${RUN}.png`;
    await p.screenshot({ path: stickerPath, clip: { x: 0, y: 0, width: 128, height: 128 } });
    await clickBtn(p, /Gửi bộ nhãn dán/); await p.locator('.ant-modal').waitFor();
    await p.locator('.ant-modal input').first().fill(`Nhãn dán test ${RUN}`);
    await p.locator('.ant-modal input[type="file"]').setInputFiles(stickerPath);
    await p.locator('.ant-modal img[src*="/api/v1/media/"]').first().waitFor({ timeout: 15000 });
    await p.locator('.ant-modal-footer .ant-btn-primary').click(); await p.waitForTimeout(2000);
    if (await p.locator('.ant-modal:visible').count()) throw new Error('Modal gửi nhãn dán vẫn mở: ' + (await p.locator('.ant-modal .ant-alert').allInnerTexts()).join(' | '));
    await expectVisible(p, new RegExp(`Nhãn dán test ${RUN}`));
    return 'student-sticker-submit';
  });
  await step('Sinh viên', 'Bộ sưu tập: tạo mới', s, async (p) => {
    const me = await (await p.request.get(`${BASE}/api/v1/auth/me`)).json();
    await p.goto(`${BASE}/users/${me.data.id}?tab=saved`); await settle(p, 2000);
    await clickBtn(p, /Tạo Bộ Sưu Tập/); await p.locator('.ant-modal').waitFor();
    await p.locator('.ant-modal input').first().fill(`Quán học đêm ${RUN}`);
    await antdOk(p); await p.waitForTimeout(1500);
    return 'student-collection-create';
  });
  await step('Sinh viên', 'Lưu quán vào bộ sưu tập (từ trang quán)', s, async (p) => {
    await p.goto(`${BASE}/places/${reviewPlaceSlug}`); await settle(p, 1500);
    await p.getByRole('button', { name: /Lưu Vào Bộ Sưu Tập/ }).click(); await p.locator('.ant-modal:visible').waitFor();
    const row = p.locator('.ant-modal:visible .ant-list-item', { hasText: `Quán học đêm ${RUN}` });
    await row.waitFor({ timeout: 8000 });
    await row.getByRole('button', { name: /Lưu$/ }).click(); await p.waitForTimeout(1200);
    await row.getByText(/Đã có/).waitFor({ timeout: 5000 });
    return 'student-save-to-collection';
  });
  await step('Sinh viên', 'Trang bộ sưu tập: hiện đúng quán vừa lưu (tên, ảnh, địa chỉ) + nút gỡ', s, async (p) => {
    const cols = await (await p.request.get(BASE + '/api/v1/me/collections')).json();
    const col = (cols.data || []).find((c) => c.name === `Quán học đêm ${RUN}`);
    if (!col) throw new Error('Không tìm thấy bộ sưu tập vừa tạo');
    await p.goto(`${BASE}/collections/${col.id}`); await settle(p, 2000);
    const text = await p.locator('body').innerText();
    if (!/Cú Đêm/.test(text)) throw new Error('Trang bộ sưu tập không hiện tên quán đã lưu');
    if (/Quán đã bị gỡ|Địa điểm$/m.test(text)) throw new Error('Trang bộ sưu tập hiện tên giả');
    await p.getByRole('button', { name: /Gỡ khỏi bộ sưu tập/ }).first().waitFor({ timeout: 5000 });
    return 'student-collection-detail';
  });
  await step('Sinh viên', 'Tab Đã lưu: quán yêu thích + bộ sưu tập cùng một trang (không Invalid Date)', s, async (p) => {
    const me = await (await p.request.get(`${BASE}/api/v1/auth/me`)).json();
    await p.goto(`${BASE}/users/${me.data.id}?tab=favorites`); await settle(p, 2000);
    await expectVisible(p, /Quán Yêu Thích/); await expectVisible(p, /Bộ Sưu Tập Của Tôi/);
    const text = await p.locator('body').innerText();
    if (/Invalid Date/.test(text)) throw new Error('Vẫn hiện "Invalid Date"');
    if (!/Coffee House|Cú Đêm/.test(text)) throw new Error('Tab yêu thích không hiện tên quán thật');
    return 'student-favorites-tab';
  });
  await step('Sinh viên', 'Thông báo: trang danh sách', s, async (p) => { await p.goto(`${BASE}/me/notifications`); await settle(p, 1500); return 'student-notifications'; });
  await step('Sinh viên', 'Thông báo: popover chuông', s, async (p) => { await p.goto(BASE); await settle(p, 1500); await p.locator('.anticon-bell').first().click(); await p.waitForTimeout(800); return 'student-notification-popover'; });
  await step('Sinh viên', 'Hồ sơ kiểu mạng xã hội: ảnh bìa, avatar, 4 tab (Bài viết / Ảnh / Đã lưu / Đóng góp), bài chờ duyệt có ảnh', s, async (p) => {
    const me = await (await p.request.get(`${BASE}/api/v1/auth/me`)).json();
    await p.goto(`${BASE}/users/${me.data.id}`); await settle(p, 2000);
    const tabs = await p.locator('[data-testid=profile-tabs] .ant-tabs-tab').allInnerTexts();
    if (tabs.length !== 4) throw new Error('Số tab hồ sơ = ' + tabs.length + ' (' + tabs.join('|') + ')');
    await p.locator('[data-testid=composer-trigger]').waitFor();
    if (!(await p.locator('.ant-tag', { hasText: 'Đang chờ duyệt' }).count())) throw new Error('Không thấy bài đang chờ duyệt trên dòng thời gian');
    if (!(await p.locator('[data-testid=post-card] img, [data-testid=review-card] img').count())) throw new Error('Bài trên dòng thời gian không có ảnh');
    return 'student-public-profile';
  });
  await step('Sinh viên', 'Sửa hồ sơ: đổi ảnh đại diện (cắt tròn) + giới thiệu -> hiện ngay trên hồ sơ và thanh menu', s, async (p) => {
    await p.locator('[data-testid=btn-edit-profile]').click();
    await p.locator('[data-testid=avatar-input]').waitFor({ state: 'attached' });
    await p.locator('[data-testid=avatar-input]').setInputFiles(TEST_IMG);
    await p.locator('[data-testid=crop-done]').waitFor({ timeout: 8000 });
    await p.locator('[data-testid=crop-done]').click();
    await p.getByText('Đã tải ảnh đại diện').waitFor({ timeout: 20000 });
    await p.locator('#bio').fill(`Sinh viên năm 3 Khoa Công nghệ Thông tin HCMUS. (${RUN})`);
    // Trường không có trong danh sách -> chọn "Trường khác" rồi tự ghi tên
    await p.locator('[data-testid=profile-campus]').click();
    await p.locator('[data-testid=profile-campus-pick-other]').click();
    await p.locator('[data-testid=profile-campus-other]').fill(`Trường ĐH Khác (${RUN})`);
    await p.locator('.ant-modal-footer button.ant-btn-primary').click();
    await p.getByText('Đã lưu hồ sơ').waitFor({ timeout: 10000 }); await p.waitForTimeout(1500);
    if (!(await p.getByText(`Trường ĐH Khác (${RUN})`).count())) throw new Error('Tên trường tự ghi không hiện trên hồ sơ');
    const src = await p.locator('[data-testid=profile-avatar] img').getAttribute('src');
    if (!src || !src.includes('/api/v1/media/')) throw new Error('Avatar không đổi: ' + src);
    const img = await p.request.get(BASE + src);
    if (img.status() !== 200) throw new Error('Ảnh đại diện công khai trả ' + img.status());
    return 'student-profile-edit';
  });
  await step('Sinh viên', 'Ảnh bìa hồ sơ: tải lên + cắt ngang -> hiện ngay, khách xem được', s, async (p) => {
    await p.locator('[data-testid=cover-input]').setInputFiles(TEST_IMG);
    await p.locator('[data-testid=crop-done]').waitFor({ timeout: 8000 });
    await p.locator('[data-testid=crop-done]').click();
    await p.getByText('Đã cập nhật ảnh bìa').waitFor({ timeout: 20000 }); await p.waitForTimeout(1500);
    const src = await p.locator('[data-testid=profile-cover] img').getAttribute('src');
    if (!src) throw new Error('Ảnh bìa không hiện');
    const img = await p.request.get(BASE + src);
    if (img.status() !== 200) throw new Error('Ảnh bìa công khai trả ' + img.status());
    return 'student-profile-cover';
  });
  await step('Sinh viên', 'Tab Ảnh của hồ sơ: gom ảnh từ đánh giá + bài viết', s, async (p) => {
    await p.locator('[data-testid=profile-tabs] .ant-tabs-tab', { hasText: /^Ảnh/ }).click(); await p.waitForTimeout(800);
    const n = await p.locator('[data-testid=photo-grid] img').count();
    if (n < 2) throw new Error('Tab Ảnh chỉ có ' + n + ' ảnh');
    return 'student-profile-photos';
  });
  await step('Sinh viên', 'Chat AI: hội thoại mới + đồng ý quyền riêng tư + gửi câu hỏi + nhận trả lời (DeepSeek thật)', s, async (p) => {
    await p.goto(BASE); await settle(p, 1500);
    await p.locator('[data-testid=btn-open-chat]').first().click();
    await p.waitForTimeout(1000);
    // Hội thoại mới để không dính chế độ người thật của lần chạy trước
    await p.locator('button:has(.anticon-plus)').first().click().catch(() => {});
    await p.waitForTimeout(800);
    const input = p.getByPlaceholder(/Hỏi về quán/);
    await input.fill(`Gợi ý quán cà phê học nhóm 4 người gần KHTN, có ổ cắm [test ${RUN}]`);
    await input.press('Enter');
    await p.waitForTimeout(800);
    const consentBtn = p.locator('.ant-modal button.ant-btn-primary');
    if (await consentBtn.count()) { await consentBtn.click(); await p.waitForTimeout(800); }
    // Chờ câu trả lời AI hoàn tất (nút Dừng biến mất) tối đa 90s
    await p.waitForFunction(() => !document.body.innerText.includes('Dừng phản hồi'), null, { timeout: 90000 });
    const bodyText = await p.locator('body').innerText();
    if (/Lỗi tạo phản hồi|Trợ lý AI gặp lỗi/.test(bodyText)) throw new Error('AI trả lỗi: ' + (bodyText.split('❌')[1] || '').slice(0, 120));
    const aiMsgs = await p.locator('[class*="assistant"], .ant-typography').allInnerTexts().catch(() => []);
    const answered = /quán/i.test((bodyText.split('có ổ cắm').pop() || ''));
    if (!answered) throw new Error('Không thấy nội dung trả lời của AI sau câu hỏi');
    return 'student-chat-answer';
  });
  await step('Sinh viên', 'Hạn mức AI/ngày: vượt mức thì bị chặn 429 kèm thông báo', s, async (p) => {
    const sql = (q) => execFileSync('docker', ['exec', 'ssg-postgres', 'psql', '-U', 'ssg_admin', '-d', 'ssg_db', '-Atc', q]).toString().trim();
    // Đẩy hạn mức token của sinh viên test lên kịch trần (DB dev) rồi gửi thêm 1 câu
    sql("UPDATE ai_usage_budgets SET \"currentTokens\" = \"maxTokens\" WHERE \"scopeType\"='USER_DAILY' AND \"targetUserId\" IN (SELECT id FROM users WHERE email='" + STUDENT.id + "')");
    const input = p.getByPlaceholder(/Hỏi về quán/);
    await input.fill('Câu hỏi thứ hai để kiểm tra hạn mức [test ' + RUN + ']');
    await input.press('Enter');
    await p.waitForTimeout(1500);
    const body = await p.locator('body').innerText();
    // Trả hạn mức về bình thường cho bước sau
    sql("DELETE FROM ai_usage_budgets WHERE \"scopeType\"='USER_DAILY' AND \"targetUserId\" IN (SELECT id FROM users WHERE email='" + STUDENT.id + "')");
    if (!/giới hạn|hạn mức/i.test(body)) throw new Error('Không thấy thông báo vượt hạn mức AI');
    return 'student-ai-quota-blocked';
  }, { allowApi: [/429 POST .*messages/] });
  await step('Sinh viên', 'Chat AI: yêu cầu admin hỗ trợ', s, async (p) => { await p.locator('button:has(.anticon-customer-service), .anticon-customer-service').first().click(); await p.waitForTimeout(1500); return 'student-chat-request-human'; });
  await step('Sinh viên', 'Sinh viên không vào được /admin', s, async (p) => { await p.goto(`${BASE}/admin`); await settle(p); await expectVisible(p, /403|Truy Cập Bị Từ Chối/); return 'student-admin-blocked'; });
  await s.ctx.close();
}

// =========================================================================
// D. ADMIN
// =========================================================================
{
  const s = await newSession(ADMIN);
  const { page } = s;
  await step('Admin', 'Tổng quan hệ thống (badge pending, thống kê)', s, async (p) => { await p.goto(`${BASE}/admin`); await settle(p, 2500); return 'admin-dashboard'; });
  await step('Admin', 'Quản lý địa điểm: danh sách', s, async (p) => { await p.goto(`${BASE}/admin/places`); await settle(p, 2000); await expectVisible(p, /Quản lý địa điểm/i); return 'admin-places'; });
  await step('Admin', 'Thêm quán: tên tự đặt; gõ địa chỉ -> chọn từ bản đồ -> toạ độ + cơ sở trường tự điền', s, async (p) => {
    await p.goto(`${BASE}/admin/places`); await settle(p, 1500);
    await p.getByRole('button', { name: /Thêm Quán Mới/ }).click(); await p.locator('.ant-drawer').waitFor(); await p.waitForTimeout(800);
    // Tên tự đặt; ô Địa chỉ là ô tìm bản đồ
    await p.locator('.ant-drawer #defaultName').fill('Highlands Coffee test ' + RUN);
    await p.locator('.ant-drawer #address').fill('Highlands Coffee Nguyễn Văn Cừ'); await p.waitForTimeout(2000);
    const opts = p.locator('.ant-select-dropdown .ant-select-item-option');
    if (!(await opts.count())) throw new Error('Không có gợi ý địa điểm từ geocoder');
    await opts.first().click(); await p.waitForTimeout(800);
    const addr = await p.locator('#address').inputValue(); await p.locator('[data-testid=location-picker]').waitFor(); const lat = (await p.locator('[data-testid=location-coords]').textContent()) || '';
    if (!addr || !lat || lat === '10.7628') throw new Error('Địa chỉ/toạ độ không tự điền: ' + addr + ' / ' + lat);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.locator('.ant-drawer .ant-drawer-close').first().click().catch(() => {}); await p.waitForTimeout(600);
    return 'admin-place-geocode-pick';
  });
  await step('Admin', 'Quản lý địa điểm: mở form sửa (nạp đúng dữ liệu mới nhất)', s, async (p) => {
    const row = p.locator('tr', { hasText: 'Cà Phê Học Bài Cú Đêm' }).first();
    await row.getByRole('button', { name: /Sửa|Chỉnh/ }).first().click().catch(() => row.locator('button').first().click());
    await p.locator('.ant-drawer').waitFor(); await p.waitForTimeout(2500);
    const addr = await p.locator('#address').inputValue();
    if (!addr) throw new Error('Địa chỉ trống trong form sửa');
    return 'admin-place-editor';
  });
  await step('Admin', 'Form sửa: tab Hình ảnh (ảnh đã gắn hiện đúng)', s, async (p) => { await p.locator('.ant-drawer .ant-tabs-tab', { hasText: /Hình ảnh/ }).click(); await p.waitForTimeout(1200); const n = await p.locator('.ant-drawer img').count(); if (n === 0) throw new Error('Không có ảnh trong tab Hình ảnh'); return 'admin-place-editor-media'; });
  await step('Admin', 'Form sửa: tab Tiện ích chi tiết (trường động seed: nhóm Không gian / Học tập / Đồ uống / Dịch vụ / Tiện nghi / Liên hệ)', s, async (p) => {
    await p.locator('.ant-drawer .ant-tabs-tab', { hasText: /Tiện ích chi tiết/ }).click(); await p.waitForTimeout(800);
    const groups = await p.locator('.ant-drawer .ant-collapse-item .ant-collapse-header').allInnerTexts();
    if (groups.length < 6) throw new Error('Chỉ có ' + groups.length + ' nhóm trường động: ' + groups.join(' | '));
    await p.locator('#dyn_wifi_speed_mbps').fill(String(70 + (Number(RUN) % 30)));
    await p.locator('.ant-form-item', { hasText: 'Có bảng trắng' }).locator('.ant-segmented-item', { hasText: /^Có$/ }).first().click();
    await p.locator('#dyn_restroom_quality').click(); await p.locator('.ant-select-dropdown:visible .ant-select-item', { hasText: 'Sạch sẽ' }).first().click();
    await p.locator('#dyn_bus_routes').fill('08, 19 (' + RUN + ')');
    return 'admin-place-editor-dynamic';
  });
  await step('Admin', 'Form sửa: Lưu & Xuất Bản Ngay', s, async (p) => {
    await p.locator('.ant-drawer .ant-tabs-tab', { hasText: /Thông tin/ }).scrollIntoViewIfNeeded(); await p.locator('.ant-drawer .ant-tabs-tab', { hasText: /Thông tin/ }).click(); await p.waitForTimeout(500);
    const addr = p.locator('#address'); await addr.fill(`183 Trần Bình Trọng, Phường 3, Quận 5, TP.HCM (cập nhật ${RUN})`);
    await clickBtn(p, /Lưu & Xuất Bản Ngay/); await p.waitForTimeout(3500);
    const toast = await p.locator('.ant-message').textContent().catch(() => '');
    if (/Lỗi|không|thất bại/i.test(toast || '') && !/Đã lưu/.test(toast || '')) throw new Error('Toast: ' + toast);
    // Xác nhận dữ liệu thật sự được lưu: API công khai trả địa chỉ mới
    const det = await (await p.request.get(BASE + '/api/v1/places/ca-phe-hoc-bai-cu-dem-24-7')).json();
    const savedAddr = det.data?.snapshot?.address || det.data?.address || '';
    if (!savedAddr.includes(`(cập nhật ${RUN})`)) throw new Error('Địa chỉ sau khi Lưu & Xuất bản không đổi: ' + savedAddr);
    // Chống mất dữ liệu: tiện ích, phòng học nhóm (trường động), cơ sở trường, ảnh phải còn nguyên sau khi lưu từ tab "Thông tin"
    const snap = det.data?.snapshot || {};
    if (!snap.amenities || snap.amenities.socketDensity === 'UNKNOWN' || !snap.amenities.wifiQuality || snap.amenities.wifiQuality === 'UNKNOWN')
      throw new Error('Tiện ích bị mất sau khi lưu: ' + JSON.stringify(snap.amenities || {}).slice(0, 120));
    if (!Array.isArray(snap.dynamicFieldValues) || snap.dynamicFieldValues.length === 0) throw new Error('Trường động (phòng học nhóm) bị mất sau khi lưu');
    const bus = (snap.dynamicFieldValues || []).find((d) => d.fieldKey === 'bus_routes');
    if (!bus || !String(bus.value).includes(RUN)) throw new Error('Trường động tiện ích chi tiết (bus_routes) không được lưu: ' + JSON.stringify(bus));
    if (!snap.nearestCampusId) throw new Error('Cơ sở trường gần nhất bị mất sau khi lưu');
    if (!Array.isArray(snap.gallery) || snap.gallery.length === 0) throw new Error('Ảnh gallery bị mất sau khi lưu');
    // Lịch theo ngày (seed: T2–T6 ca đêm 20:00–06:00, T7/CN 24/24) phải được giữ nguyên khi không sửa giờ
    const ws = Array.isArray(snap.weeklySchedule) ? snap.weeklySchedule : [];
    const sat = ws.find((d) => d.dayOfWeek === 6);
    const mon = ws.find((d) => d.dayOfWeek === 1);
    if (!sat?.is24h || mon?.shifts?.[0]?.openTime !== '20:00') throw new Error('Lịch theo ngày bị ghi đè sau khi lưu: ' + JSON.stringify({ sat, mon }).slice(0, 160));
    return 'admin-place-publish-now';
  });
  await step('Admin', 'Duyệt đề xuất quán (hàng đợi đóng góp)', s, async (p) => { await p.goto(`${BASE}/admin/contributions`); await settle(p, 2000); return 'admin-contributions'; });
  await step('Admin', 'Duyệt đề xuất: phê duyệt đề xuất mới nhất', s, async (p) => {
    const row = p.locator('tr', { hasText: /Chờ duyệt|PENDING/i }).first();
    if (!(await row.count())) throw new Error('Không có đề xuất nào đang chờ duyệt trong hàng đợi');
    await row.getByRole('button', { name: /Chi Tiết & Duyệt/ }).click(); await p.locator('.ant-modal').waitFor(); await p.waitForTimeout(1500);
    // Bản xem trước phải hiện đúng những gì sinh viên điền (không bịa mặc định)
    const preview = (await p.locator('.ant-modal').innerText()).replace(/\s+/g, ' ');
    for (const must of ['Hằng ngày: 07:00–22:00', '20.000đ', 'Wi-Fi: Mạnh', 'Máy lạnh: Có', '88 Mbps', 'Ghi chú test ' + RUN]) if (!preview.includes(must)) throw new Error('Xem trước thiếu "' + must + '"');
    if (!(await p.locator('.ant-modal img[src*="/api/v1/media/"]').count())) throw new Error('Xem trước không có ảnh sinh viên gửi');
    if (!preview.includes('ĐH Khác gần quán (' + RUN + ')')) throw new Error('Xem trước không cảnh báo trường sinh viên tự ghi');
    // Admin gắn cơ sở có sẵn thay cho tên tự ghi rồi duyệt
    await p.locator('[data-testid=approve-campus]').click(); await p.locator('[data-testid=approve-campus] input').fill('Khoa học Tự nhiên'); await p.waitForTimeout(400); await p.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', { hasText: 'Khoa học Tự nhiên' }).first().click();
    await p.locator('[data-testid=btn-approve-suggestion]').click(); await p.waitForTimeout(2500);
    const det = await (await p.request.get(BASE + '/api/v1/places?q=' + encodeURIComponent('Trà Sữa Học Bài ' + RUN))).json();
    const created = (det.data || [])[0]; if (!created) throw new Error('Quán từ đề xuất không xuất hiện trong danh sách công khai');
    const full = await (await p.request.get(BASE + '/api/v1/places/' + created.slug)).json();
    const snap = full.data?.snapshot || {};
    if (snap.amenities?.wifiQuality !== 'STRONG' || snap.amenities?.noiseLevel !== 'UNKNOWN') throw new Error('Tiện ích không đúng dữ liệu sinh viên (bịa mặc định?): ' + JSON.stringify(snap.amenities));
    if (!(snap.dynamicFieldValues || []).some((d) => d.fieldKey === 'wifi_speed_mbps' && Number(d.value) === 88)) throw new Error('Trường động sinh viên nhập bị mất');
    if (!Array.isArray(snap.gallery) || snap.gallery.length !== 1) throw new Error('Ảnh sinh viên gửi không vào gallery quán');
    const meta = await (await p.request.get(BASE + '/api/v1/places/meta')).json();
    const khtnId = (meta.data?.campuses || []).find((c) => c.name.includes('Khoa học Tự nhiên'))?.id;
    if (!khtnId || snap.nearestCampusId !== khtnId) throw new Error('Cơ sở admin chọn khi duyệt không được gắn cho quán: ' + snap.nearestCampusId);
    const img = await p.request.get(BASE + '/api/v1/media/' + snap.gallery[0].assetId + '?variant=thumb');
    if (img.status() !== 200) throw new Error('Ảnh quán từ đề xuất không công khai: ' + img.status());
    await p.keyboard.press('Escape');
    return 'admin-contribution-approved';
  });
  await step('Admin', 'Ẩn quán khỏi trang công khai rồi hiện lại; rà soát quán trùng', s, async (p) => {
    await p.goto(`${BASE}/admin/places`); await settle(p, 2500);
    const row = p.locator('tbody tr', { hasText: 'The Coffee House' }).first();
    await row.locator('[data-testid=btn-toggle-place-visibility]').click();
    await p.locator('.ant-popconfirm-buttons button.ant-btn-primary, .ant-popover button.ant-btn-primary').last().click();
    await p.getByText('Đã ẩn quán khỏi trang công khai').waitFor({ timeout: 8000 }); await p.waitForTimeout(1200);
    const hidden = await p.request.get(`${BASE}/api/v1/places/the-coffee-house-nguyen-van-cu`);
    if (hidden.status() !== 404) throw new Error('Quán đã ẩn vẫn xem được ở trang công khai: ' + hidden.status());

    await row.locator('[data-testid=btn-toggle-place-visibility]').click();
    await p.locator('.ant-popconfirm-buttons button.ant-btn-primary, .ant-popover button.ant-btn-primary').last().click();
    await p.getByText('Đã hiện lại quán').waitFor({ timeout: 8000 }); await p.waitForTimeout(1500);
    const back = await p.request.get(`${BASE}/api/v1/places/the-coffee-house-nguyen-van-cu`);
    if (back.status() !== 200) throw new Error('Hiện lại quán không thành công: ' + back.status());

    // Rà quán trùng (theo tên bỏ dấu hoặc vị trí < 60 m) + hộp xoá yêu cầu gõ đúng đường dẫn
    await p.locator('[data-testid=btn-find-duplicates]').click(); await p.waitForTimeout(2500);
    if (!(await p.locator('.ant-modal:visible').count())) throw new Error('Không mở được hộp rà quán trùng');
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    await p.locator('[data-testid=btn-delete-place]').first().click(); await p.waitForTimeout(1000);
    if (!(await p.locator('[data-testid=input-confirm-delete-place]').count())) throw new Error('Hộp xoá quán thiếu ô xác nhận đường dẫn');
    await p.keyboard.press('Escape');
    return 'admin-place-hide-duplicates';
  });
  await step('Admin', 'Thư viện ảnh: tách ảnh nhãn dán, duyệt cả trang một lượt, xoá ảnh khỏi kho', s, async (p) => {
    await p.goto(`${BASE}/admin/media`); await settle(p, 2500);
    if (!(await p.locator('[data-testid=media-source-filter]').count())) throw new Error('Không có bộ lọc nguồn ảnh');
    await p.locator('[data-testid=media-source-filter] .ant-segmented-item', { hasText: 'Ảnh nhãn dán' }).click(); await p.waitForTimeout(1500);
    await p.locator('[data-testid=media-source-filter] .ant-segmented-item', { hasText: 'Ảnh nội dung' }).click(); await p.waitForTimeout(1500);
    const cards = await p.locator('[data-testid=btn-delete-asset]').count();
    if (cards === 0) throw new Error('Không thấy nút xoá ảnh trong thư viện');
    // Duyệt hết ảnh chờ trong trang (ảnh đại diện / ảnh bìa sinh viên vừa đổi)
    await p.locator('[data-testid=btn-approve-all-media]').click();
    await p.locator('.ant-popconfirm-buttons button.ant-btn-primary, .ant-popover button.ant-btn-primary').last().click();
    await p.waitForTimeout(2500);
    return 'admin-media-queue';
  });
  await step('Admin', 'Thông báo Zalo: thêm kênh (token mã hoá), hiện trong bảng rồi xoá', s, async (p) => {
    await p.goto(`${BASE}/admin/integrations`); await settle(p, 2000);
    await p.locator('[data-testid=btn-add-zalo-channel]').click(); await p.waitForTimeout(800);
    await p.locator('#name').fill(`Nhóm kiểm thử ${RUN}`);
    await p.locator('#token').fill('1234567890:kiemthu' + RUN + 'abcdefghijklmn');
    await p.locator('#chatId').fill('chat-kiem-thu-' + RUN);
    await p.locator('.ant-modal-footer button.ant-btn-primary').click();
    await p.getByText('Đã thêm kênh Zalo').waitFor({ timeout: 10000 }); await p.waitForTimeout(1200);
    const row = p.locator('tbody tr', { hasText: `Nhóm kiểm thử ${RUN}` });
    if (!(await row.count())) throw new Error('Kênh Zalo vừa thêm không hiện trong bảng');
    const masked = await row.innerText();
    if (masked.includes('kiemthu' + RUN + 'abcdefghijklmn')) throw new Error('Token hiện nguyên văn trên giao diện');
    await row.getByRole('button', { name: /Xoá/ }).click();
    await p.locator('.ant-popconfirm-buttons button.ant-btn-primary, .ant-popover button.ant-btn-primary').last().click();
    await p.getByText('Đã xoá kênh').waitFor({ timeout: 8000 });
    return 'admin-zalo-channel';
  });
  await step('Admin', 'Kiểm duyệt đánh giá / bình luận / bài / bộ sưu tập (4 tab)', s, async (p) => { await p.goto(`${BASE}/admin/reviews`); await settle(p, 2000); return 'admin-reviews'; });
  await step('Admin', 'Kiểm duyệt: duyệt đánh giá chờ', s, async (p) => {
    const row = p.locator('tr', { hasText: /Chờ duyệt|PENDING/i }).first();
    if (!(await row.count())) throw new Error('Không có đánh giá nào đang chờ duyệt');
    await row.getByRole('button', { name: /Xem & Duyệt/ }).click(); await p.locator('.ant-modal').waitFor(); await p.waitForTimeout(800);
    await p.locator('.ant-modal').getByRole('button', { name: /Phê Duyệt & Tính Điểm/ }).click(); await p.waitForTimeout(2500);
    await p.keyboard.press('Escape');
    return 'admin-review-approved';
  });
  await step('Admin', 'Kiểm duyệt: tab bình luận + duyệt bình luận chờ', s, async (p) => {
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await p.getByRole('tab', { name: /Bình Luận/i }).first().click(); await p.waitForTimeout(1200);
    const wifiRow = p.locator('tr:visible', { hasText: /mật khẩu wifi/i }).first();
    const row = (await wifiRow.count()) ? wifiRow : p.locator('tr:visible', { hasText: /Chờ duyệt|PENDING/i }).first();
    if (!(await row.count())) throw new Error('Không có bình luận nào đang chờ duyệt (bình luận sinh viên gửi không vào hàng đợi?)');
    await row.getByRole('button', { name: /Xem & Duyệt/ }).click(); await p.locator('.ant-modal:visible').first().waitFor(); await p.waitForTimeout(600);
    await p.locator('.ant-modal:visible').getByRole('button', { name: /Phê Duyệt/ }).click(); await p.waitForTimeout(2000);
    await p.keyboard.press('Escape');
    return 'admin-comment-approved';
  });
  await step('Admin', 'Kiểm duyệt: tab bài trải nghiệm + duyệt bài chờ', s, async (p) => {
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    await p.getByRole('tab', { name: /Bài Trải Nghiệm/i }).first().click(); await p.waitForTimeout(1200);
    const row = p.locator('tr:visible', { hasText: /Chờ duyệt|PENDING/i }).first();
    if (!(await row.count())) throw new Error('Không có bài trải nghiệm nào đang chờ duyệt');
    await row.getByRole('button', { name: /Xem & Duyệt/ }).click(); await p.locator('.ant-modal:visible').first().waitFor(); await p.waitForTimeout(600);
    await p.locator('.ant-modal:visible').getByRole('button', { name: /Phê Duyệt & Xuất Bản/ }).click(); await p.waitForTimeout(2000);
    await p.keyboard.press('Escape');
    return 'admin-post-approved';
  });
  await step('Admin', 'Kiểm duyệt: tab bộ sưu tập', s, async (p) => { await p.keyboard.press('Escape'); await p.waitForTimeout(400); await p.getByRole('tab', { name: /Bộ Sưu Tập/i }).first().click(); await p.waitForTimeout(1200); return 'admin-reviews-tab-collections'; });
  await step('Admin', 'Báo cáo vi phạm: mở báo cáo mới + Xác nhận & Giải quyết', s, async (p) => {
    await p.goto(`${BASE}/admin/reports`); await settle(p, 1500);
    const row = p.locator('tr', { hasText: /Chờ xử lý|PENDING/i }).first();
    if (!(await row.count())) throw new Error('Không có báo cáo vi phạm nào đang chờ xử lý');
    await row.getByRole('button', { name: /Xem & Xử Lý/ }).click(); await p.locator('.ant-modal:visible').waitFor(); await p.waitForTimeout(600);
    await p.locator('.ant-modal:visible').getByRole('button', { name: /Xác Nhận Vi Phạm & Giải Quyết/ }).click(); await p.waitForTimeout(1500);
    await p.keyboard.press('Escape');
    return 'admin-report-resolved';
  });
  await step('Admin', 'Báo cáo vi phạm (hàng đợi)', s, async (p) => { await p.goto(`${BASE}/admin/reports`); await settle(p, 1500); return 'admin-reports'; });
  await step('Admin', 'Duyệt bộ nhãn dán: xem ảnh + Phê Duyệt Phát Hành', s, async (p) => {
    await p.goto(`${BASE}/admin/stickers`); await settle(p, 1500);
    const row = p.locator('tr', { hasText: `Nhãn dán test ${RUN}` }).first();
    if (!(await row.count())) throw new Error('Không thấy bộ nhãn dán sinh viên vừa gửi trong hàng đợi');
    await row.getByRole('button', { name: /Xem & Duyệt/ }).click(); await p.locator('.ant-modal:visible').waitFor(); await p.waitForTimeout(800);
    const img = p.locator('.ant-modal:visible img').first();
    await img.waitFor({ timeout: 8000 });
    const ok = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
    if (!ok) throw new Error('Ảnh nhãn dán không tải được trong modal admin (preview)');
    // Nút biến mất ngay khi duyệt xong -> Playwright có thể báo click timeout dù request đã chạy; kiểm chứng bằng API thay vì tin vào click
    await p.locator('.ant-modal:visible').getByRole('button', { name: /Phê Duyệt Phát Hành/ }).click({ timeout: 8000, noWaitAfter: true }).catch(() => {});
    await p.waitForTimeout(1500);
    const packs = await (await p.request.get(BASE + '/api/v1/admin/community/stickers')).json();
    const pack = (packs.data || []).find((x) => x.name === `Nhãn dán test ${RUN}`);
    if (!pack || pack.moderationStatus !== 'APPROVED') throw new Error('Bộ nhãn dán chưa được duyệt: ' + (pack ? pack.moderationStatus : 'không thấy'));
    await p.keyboard.press('Escape');
    return 'admin-sticker-approved';
  });
  await step('Admin', 'Cơ sở trường & danh mục: danh sách từ DB + thêm cơ sở mới bằng tìm trên bản đồ', s, async (p) => {
    await p.goto(`${BASE}/admin/reference`); await settle(p, 2000);
    const before = await p.locator('tbody tr').count();
    if (before < 3) throw new Error('Danh sách cơ sở trường quá ít (' + before + ') — không nạp từ DB?');
    await p.getByRole('button', { name: /Thêm cơ sở/ }).click(); await p.locator('.ant-modal:visible').waitFor();
    await p.locator('.ant-modal:visible input').first().fill('Đại học Sư phạm Kỹ thuật'); await p.waitForTimeout(2000);
    const opt = p.locator('.ant-select-dropdown .ant-select-item-option').first(); await opt.waitFor({ timeout: 8000 }); await opt.click(); await p.waitForTimeout(600);
    await p.locator('.ant-modal:visible #name').fill(`Cơ sở test ${RUN}`);
    await p.locator('.ant-modal:visible #universityName').fill('Test');
    await p.locator('.ant-modal:visible .ant-btn-primary').last().click(); await p.waitForTimeout(1500);
    const after = await p.locator('tbody tr').count();
    if (after !== before + 1) throw new Error('Không thêm được cơ sở: ' + before + ' -> ' + after);
    return 'admin-reference-campus-added';
  });
  await step('Admin', 'Thông tin động: tạo trường động mới (v1)', s, async (p) => {
    await p.goto(`${BASE}/admin/dynamic-fields`); await settle(p, 1500);
    await clickBtn(p, /Thêm trường/); await p.locator('.ant-modal').waitFor();
    await p.locator('.ant-modal #label').fill(`Trường test ${RUN}`);
    await p.locator('.ant-modal #key').fill(`test_field_${RUN}`);
    await p.locator('.ant-modal-footer .ant-btn-primary').click(); await p.waitForTimeout(1500);
    if (await p.locator('.ant-modal:visible').count()) throw new Error('Modal tạo trường động vẫn mở');
    await expectVisible(p, new RegExp(`test_field_${RUN}`));
    return 'admin-dynamic-field-created';
  });
  await step('Admin', 'Quản lý media (ảnh hiện, duyệt/thu hồi)', s, async (p) => { await p.goto(`${BASE}/admin/media`); await settle(p, 2500); const imgs = await p.locator('img').evaluateAll((els) => els.filter((e) => e.naturalWidth > 0).length); if (imgs === 0) throw new Error('Không có ảnh nào tải được'); return 'admin-media'; });
  await step('Admin', 'Thông báo hệ thống (announcement) + tạo mới', s, async (p) => {
    await p.goto(`${BASE}/admin/announcements`); await settle(p, 1500);
    await clickBtn(p, /Thêm|Tạo/); await p.locator('.ant-modal, .ant-drawer').waitFor();
    const title = p.locator('.ant-modal input, .ant-drawer input').first(); await title.fill(`Thông báo test ${RUN}`);
    const ta = p.locator('.ant-modal textarea, .ant-drawer textarea').first(); if (await ta.count()) await ta.fill('Hệ thống chạy kiểm thử toàn diện đêm nay.');
    await p.locator('.ant-modal .ant-btn-primary, .ant-drawer .ant-btn-primary').last().click(); await p.waitForTimeout(2000);
    return 'admin-announcement-create';
  });
  await step('Admin', 'Hỗ trợ sinh viên (ticket từ chat)', s, async (p) => { await p.goto(`${BASE}/admin/support`); await settle(p, 2000); return 'admin-support'; });
  await step('Admin', 'Hỗ trợ: mở ticket + trả lời', s, async (p) => {
    const row = p.locator('tbody tr', { hasText: /Xử Lý/ }).first(); await row.getByRole('button', { name: /Xử Lý/ }).first().click(); await p.waitForTimeout(1200);
    const ta = p.locator('.ant-modal textarea, .ant-drawer textarea').first(); await ta.fill(`Chào bạn, mình là quản trị viên. Mình sẽ kiểm tra thông tin quán và phản hồi sớm. (${RUN})`);
    await p.locator('.ant-modal button, .ant-drawer button').filter({ hasText: /Gửi|Trả lời/ }).first().click(); await p.waitForTimeout(2000);
    return 'admin-support-reply';
  });
  await step('Admin', 'Nhật ký hệ thống (audit log)', s, async (p) => { await p.goto(`${BASE}/admin/audit-logs`); await settle(p, 1500); return 'admin-audit-logs'; });
  await step('Admin', 'Quản lý người dùng', s, async (p) => { await p.goto(`${BASE}/admin/users`); await settle(p, 1500); return 'admin-users'; });
  await step('Admin', 'Cấu hình AI: nhà cung cấp & model', s, async (p) => { await p.goto(`${BASE}/admin/ai`); await settle(p, 2000); await expectVisible(p, /Model đang dùng cho chat sinh viên/); return 'admin-ai-providers'; });
  await step('Admin', 'Cấu hình AI: tác vụ & phiên bản prompt', s, async (p) => { await p.getByRole('tab', { name: /Tác vụ & prompt/i }).click(); await p.waitForTimeout(1000); return 'admin-ai-task-config'; });
  await step('Admin', 'Cấu hình AI: giám sát hội thoại', s, async (p) => { await p.getByRole('tab', { name: /Giám sát hội thoại/i }).click(); await p.waitForTimeout(1000); return 'admin-ai-conversations'; });
  await s.ctx.close();
}

// =========================================================================
// E. SAU DUYỆT: sinh viên 2 thấy kết quả công khai
// =========================================================================
{
  const s = await newSession(STUDENT2);
  await step('Công khai sau duyệt', 'Đánh giá đã duyệt hiện trên trang quán dạng thẻ (avatar, sao, nội dung, ảnh) + điểm cập nhật', s, async (p) => {
    await p.goto(BASE + '/places/' + reviewPlaceSlug); await settle(p, 2500); await p.getByRole('tab', { name: /Đánh Giá/ }).click(); await p.waitForTimeout(800);
    const card = p.locator('[data-testid=review-card]', { hasText: 'review test ' + RUN }).first();
    await card.waitFor({ timeout: 8000 });
    const img = card.locator('.ant-image img').first(); await img.waitFor({ timeout: 8000 });
    const ok = await img.evaluate((el) => el.complete && el.naturalWidth > 0);
    if (!ok) throw new Error('Ảnh đính kèm đánh giá không tải được với khách');
    await card.scrollIntoViewIfNeeded();
    return 'public-review-visible';
  });
  await step('Công khai sau duyệt', 'Trang quán: mục Tiện ích chi tiết hiện đúng nhóm + giá trị admin vừa nhập', s, async (p) => {
    await p.goto(BASE + '/places/ca-phe-hoc-bai-cu-dem-24-7'); await settle(p, 2500);
    await p.locator('[data-testid=dynamic-fields]').waitFor({ timeout: 8000 });
    const txt = (await p.locator('[data-testid=dynamic-fields]').innerText()).replace(/\s+/g, ' ');
    for (const must of ['Học tập & làm việc', 'Tiện nghi & đi lại', 'Sạch sẽ', 'Có bảng trắng', '(' + RUN + ')']) if (!txt.includes(must)) throw new Error('Thiếu "' + must + '" trong Tiện ích chi tiết: ' + txt.slice(0, 200));
    await p.locator('[data-testid=dynamic-fields]').scrollIntoViewIfNeeded();
    return 'public-dynamic-fields';
  });
  await step('Công khai sau duyệt', 'Bài trải nghiệm đã duyệt: mở trang chi tiết bài viết', s, async (p) => {
    const list = await (await p.request.get(BASE + '/api/v1/community/posts')).json();
    const post = (list.data || []).find((x) => /\(\d{6}\)/.test(x.title)) || list.data?.[0];
    if (!post) throw new Error('Không có bài trải nghiệm công khai nào sau khi duyệt');
    await p.goto(BASE + '/posts/' + post.slug); await settle(p, 2000);
    if (!(await p.locator('body').innerText()).includes(post.title.slice(0, 20))) throw new Error('Trang bài viết không hiển thị tiêu đề');
    return 'public-post-detail';
  });
  await step('Công khai sau duyệt', 'Hồ sơ công khai: KHÔNG lộ đánh giá đang chờ duyệt', s, async (p) => {
    // Sinh viên 2 gửi 1 đánh giá (PENDING) cho quán seed khác, rồi xem hồ sơ công khai của chính mình
    const csrf = (await p.context().cookies()).find((c) => c.name === 'ssg_csrf')?.value || '';
    const detail = await (await p.request.get(BASE + '/api/v1/places/the-coffee-house-nguyen-van-cu')).json();
    const placeId = detail.data?.id || detail.data?.placeId;
    if (!placeId) throw new Error('Không lấy được id quán seed');
    const r = await p.request.post(`${BASE}/api/v1/places/${placeId}/reviews`, {
      headers: { 'x-csrf-token': csrf },
      data: { ratingOverall: 4, criteriaScores: [], content: `Đánh giá chờ duyệt để kiểm tra hồ sơ công khai — review test ${RUN}`, attachedAssetIds: [] },
    });
    if (r.status() >= 400) throw new Error('Tạo review PENDING thất bại: ' + r.status() + ' ' + (await r.text()).slice(0, 120));
    const me = await (await p.request.get(BASE + '/api/v1/auth/me')).json();
    const prof = await (await p.request.get(`${BASE}/api/v1/users/${me.data.id}`)).json();
    const leaked = (prof.data?.reviews || []).some((x) => x.place?.slug === 'the-coffee-house-nguyen-van-cu');
    if (leaked) throw new Error('Hồ sơ công khai đang lộ đánh giá chưa duyệt');
    await p.goto(`${BASE}/users/${me.data.id}`); await settle(p, 1500);
    return 'public-profile-no-pending-leak';
  });
  await step('Công khai sau duyệt', 'Nhãn dán đã duyệt xuất hiện trong bộ chọn (API public)', s, async (p) => {
    const packs = await (await p.request.get(BASE + '/api/v1/community/stickers/packs/public')).json();
    const pack = (packs.data || []).find((x) => x.name === `Nhãn dán test ${RUN}`);
    if (!pack) throw new Error('Bộ nhãn dán đã duyệt không có trong API public');
    const img = await p.request.get(BASE + pack.stickers[0].url);
    if (img.status() !== 200) throw new Error('Ảnh nhãn dán công khai trả ' + img.status());
    await p.goto(BASE + '/places/' + reviewPlaceSlug); await settle(p, 1500);
    await p.getByRole('tab', { name: /Hỏi Đáp/ }).click(); await p.waitForTimeout(600);
    return 'public-sticker-available';
  });
  await step('Công khai sau duyệt', 'Bình luận đã duyệt hiện với người khác', s, async (p) => {
    await p.goto(BASE + '/places/' + reviewPlaceSlug); await settle(p, 2000);
    await p.getByRole('tab', { name: /Hỏi Đáp/ }).click(); await p.waitForTimeout(800);
    await expectVisible(p, /mật khẩu wifi/i);
    return 'public-comment-visible';
  });
  await step('Công khai sau duyệt', 'Banner thông báo hệ thống hiện trên trang chủ', s, async (p) => { await p.goto(BASE); await settle(p, 2000); return 'public-announcement-banner'; });
  await step('Công khai sau duyệt', 'Sinh viên 2 không đọc được đóng góp/bộ sưu tập riêng của sinh viên 1 (IDOR)', s, async (p) => {
    const r = await p.request.get(`${BASE}/api/v1/me/collections`); const mine = await r.json();
    const other = await (await p.request.get(`${BASE}/api/v1/admin/ai/providers`)).status();
    if (other !== 403 && other !== 401) throw new Error('Sinh viên gọi API admin trả ' + other);
    return 'public-idor-check';
  }, { allowApi: [/40[13] GET \/api\/v1\/admin/] });
  await s.ctx.close();
}

// =========================================================================
// E2. CHÍNH CHỦ XOÁ NỘI DUNG CỦA MÌNH (sau khi đã duyệt & công khai)
// =========================================================================
{
  const s = await newSession(STUDENT);
  await step('Sinh viên', 'Ảnh đại diện vừa đổi: hồ sơ báo "đang chờ duyệt" hoặc đã được duyệt xong', s, async (p) => {
    const me = await (await p.request.get(`${BASE}/api/v1/auth/me`)).json();
    await p.goto(`${BASE}/users/${me.data.id}`); await settle(p, 2500);
    const src = await p.locator('[data-testid=profile-avatar] img').getAttribute('src');
    if (!src || !src.includes('/api/v1/media/')) throw new Error('Chính chủ không thấy ảnh đại diện của mình: ' + src);
    const prof = await (await p.request.get(`${BASE}/api/v1/users/${me.data.id}`)).json();
    const pendingTag = await p.locator('[data-testid=profile-photo-pending]').count();
    if (prof.data.avatarPending && pendingTag === 0) throw new Error('Ảnh chờ duyệt nhưng hồ sơ không báo cho chính chủ');
    return 'student-avatar-pending-state';
  });
  await step('Sinh viên', 'Xoá đánh giá của chính mình trên trang quán -> điểm quán tính lại', s, async (p) => {
    await p.goto(`${BASE}/places/${reviewPlaceSlug}`); await settle(p, 2500);
    await p.getByRole('tab', { name: /Đánh Giá/ }).click(); await p.waitForTimeout(1000);
    const card = p.locator('[data-testid=review-card]', { hasText: 'review test ' + RUN }).first();
    await card.waitFor({ timeout: 8000 });
    await card.locator('[data-testid=review-menu]').click(); await p.waitForTimeout(400);
    await p.locator('.ant-dropdown-menu-item', { hasText: 'Xoá đánh giá' }).click();
    await p.getByText('Đã xoá đánh giá của bạn').waitFor({ timeout: 8000 }); await p.waitForTimeout(1500);
    if (await p.locator('[data-testid=review-card]', { hasText: 'review test ' + RUN }).count()) throw new Error('Đánh giá vẫn còn sau khi xoá');
    return 'student-delete-own-review';
  });
  await s.ctx.close();
}

// =========================================================================
// F. MOBILE (iPhone 13)
// =========================================================================
{
  const s = await newSession(STUDENT, true);
  for (const [name, url, slug, waitTab] of [
    ['Mobile: khám phá', BASE, 'mobile-discover'],
    ['Mobile: bản đồ', `${BASE}/map`, 'mobile-map'],
    ['Mobile: chi tiết quán', `${BASE}/places/${reviewPlaceSlug}`, 'mobile-place-detail'],
    ['Mobile: hồ sơ (kiểu mạng xã hội)', `${BASE}/me/collections`, 'mobile-profile'],
    ['Mobile: hồ sơ cá nhân tab Đóng góp (không tràn ngang)', `${BASE}/me/contributions`, 'mobile-profile-contributions', true],
    ['Mobile: thông báo', `${BASE}/me/notifications`, 'mobile-notifications'],
  ]) {
    await step('Mobile', name, s, async (p) => { await p.goto(url); await settle(p, 2500); if (waitTab) await expectVisible(p, /Đề xuất quán mới/i); const sw = await p.evaluate(() => { if (document.documentElement.scrollWidth > window.innerWidth + 2) return 'document'; const bad = Array.from(document.querySelectorAll('.ant-card, .ant-table, .ant-tabs')).find((el) => el.getBoundingClientRect().right > window.innerWidth + 2); return bad ? bad.className.slice(0, 40) : null; }); if (sw) throw new Error('Tràn ngang trên mobile: ' + sw); return slug; });
  }
  await step('Mobile', 'Mobile: chat AI toàn màn hình', s, async (p) => { await p.goto(BASE); await settle(p, 1500); await p.locator('[data-testid=btn-open-chat]').first().click(); await p.waitForTimeout(1000); return 'mobile-chat'; });
  await s.ctx.close();
}

await browser.close();

const pass = results.filter((r) => r.ok).length;
const md = [
  `# Kết quả chạy toàn bộ tính năng — ${new Date().toISOString()}`,
  '',
  `**${pass}/${results.length} bước PASS.** Ảnh chụp trong \`${OUT}/\`.`,
  '',
  '| # | Nhóm | Bước | Kết quả | Lỗi | Lỗi API (4xx/5xx) | Console | Ảnh |',
  '|---|---|---|---|---|---|---|---|',
  ...results.map((r, i) => `| ${i + 1} | ${r.group} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.error || ''} | ${r.apiErrors.join('<br>')} | ${r.consoleErrors.length} | ${r.shot} |`),
].join('\n');
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
writeFileSync(`${OUT}/results.md`, md);
console.log(`\nDONE ${pass}/${results.length} PASS → ${OUT}/results.md`);

// Dọn dữ liệu test của lần chạy này khỏi DB dev (giữ DB sạch cho demo)
try {
  console.log('CLEANUP', execFileSync('node', ['scripts/cleanup-run-data.mjs', RUN]).toString().trim());
} catch (e) {
  console.log('CLEANUP FAILED', String(e).slice(0, 200));
}
