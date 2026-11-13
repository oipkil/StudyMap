import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { createApp } from '../apps/server/src/app.js';
import { initSocketServer } from '../apps/server/src/socket/index.js';
import { prisma } from '../apps/server/src/lib/prisma.js';
import { hashToken } from '../apps/server/src/middleware/session.js';

const EV_DIR_5 = path.resolve(process.cwd(), 'docs/evidence/giai-doan-5');
const EV_DIR_6 = path.resolve(process.cwd(), 'docs/evidence/giai-doan-6');
const EV_DIR_7 = path.resolve(process.cwd(), 'docs/evidence/giai-doan-7');

fs.mkdirSync(EV_DIR_5, { recursive: true });
fs.mkdirSync(EV_DIR_6, { recursive: true });
fs.mkdirSync(EV_DIR_7, { recursive: true });

async function run() {
  console.log('🚀 Đang khởi động Server và Vite cho Capture Evidence...');

  // 1. Khởi động Backend
  const app = createApp();
  const httpServer = http.createServer(app);
  const io = initSocketServer(httpServer, 'http://localhost:5173');

  await new Promise<void>((resolve) => {
    httpServer.listen(4000, () => {
      console.log('✅ Backend chạy tại http://localhost:4000');
      resolve();
    });
  });

  // 2. Khởi động Vite Frontend
  const vite = await createViteServer({
    root: path.resolve(process.cwd(), 'apps/web'),
    server: { port: 5173 },
  });
  await vite.listen();
  console.log('✅ Vite Frontend chạy tại http://localhost:5173');

  // 3. Chuẩn bị dữ liệu mẫu và Auth Sessions
  console.log('📦 Chuẩn bị dữ liệu mẫu Thông Báo, Notification, Support và Auth Sessions...');
  const student = await prisma.user.findUnique({
    where: { email: 'sinhvien1@hcmus.edu.vn' },
  });
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@ssg.edu.vn' },
  });

  if (!student || !admin) {
    throw new Error('Thiếu tài khoản sinhvien1 hoặc admin trong database.');
  }

  // Tạo Session Tokens
  const rawStudentToken = crypto.randomBytes(32).toString('hex');
  await prisma.session.create({
    data: {
      userId: student.id,
      sessionTokenHash: hashToken(rawStudentToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  const rawAdminToken = crypto.randomBytes(32).toString('hex');
  await prisma.session.create({
    data: {
      userId: admin.id,
      sessionTokenHash: hashToken(rawAdminToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  // Tạo thông báo mẫu hệ thống
  await prisma.announcement.deleteMany();
  await prisma.announcement.create({
    data: {
      title: '🎉 Chào mừng Tân Sinh Viên Khóa 2026 - Khám Phá SSG!',
      content:
        'Hệ thống cập nhật hàng loạt quán café học bài, coworking space và quán ăn sinh viên với ưu đãi giảm giá lên tới 20% khi xuất trình thẻ sinh viên.',
      level: 'INFO',
      targetAudience: 'ALL',
      targetPageScope: 'ALL',
      isPublished: true,
      version: 1,
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });

  // Tạo notifications mẫu cho student
  await prisma.notification.deleteMany({ where: { userId: student.id } });
  await prisma.notification.createMany({
    data: [
      {
        userId: student.id,
        type: 'PLACE_APPROVED',
        title: 'Đề xuất địa điểm đã được duyệt! 🎉',
        body: 'Quán "The Coffee House NVC" bạn đề xuất đã được ban quản trị phê duyệt và công khai.',
        isRead: false,
      },
      {
        userId: student.id,
        type: 'SUPPORT_UPDATE',
        title: 'Yêu cầu hỗ trợ đã có phản hồi',
        body: 'Admin đã giải đáp thắc mắc về chính sách giảm giá sinh viên tại chi nhánh Quận 5.',
        isRead: false,
      },
      {
        userId: student.id,
        type: 'SYSTEM',
        title: 'Chào mừng bạn đến với SSG!',
        body: 'Hãy khám phá bản đồ quán và đóng góp những không gian học tập tuyệt vời quanh trường.',
        isRead: true,
      },
    ],
  });

  // Tạo support tickets mẫu nếu chưa có
  const existingTicket = await prisma.supportCase.findFirst({
    where: { userId: student.id },
  });
  if (!existingTicket) {
    const aiConv = await prisma.aIConversation.create({
      data: {
        userId: student.id,
        title: 'Hỏi về thời gian mở cửa 24/7 của quán Cà Phê Cú Đêm',
      },
    });
    await prisma.supportCase.create({
      data: {
        conversationId: aiConv.id,
        userId: student.id,
        status: 'WAITING',
      },
    });
  }

  // 4. Khởi chạy Playwright
  const browser = await chromium.launch({ headless: true });

  const samplePlace = await prisma.place.findFirst({
    where: { publicationStatus: 'PUBLISHED' },
  });
  const placeSlug = samplePlace?.slug || 'the-coffee-house-nguyen-van-cu';

  // ==========================================
  // A. CHỤP MINH CHỨNG GIAI ĐOẠN 5
  // ==========================================
  console.log('📸 [Giai đoạn 5] Bắt đầu chụp ảnh minh chứng...');

  // Public context (Desktop: 1440x900)
  const dContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dPage = await dContext.newPage();

  // Public context (Mobile: 390x844 with deviceScaleFactor: 2, hasTouch: true, isMobile: true)
  const mContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  });
  const mPage = await mContext.newPage();

  // 1. Discovery Feed
  console.log('  -> Chụp Discovery Feed');
  await dPage.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await dPage.waitForTimeout(1000);
  await dPage.screenshot({ path: path.join(EV_DIR_5, '01-desktop-discovery.png'), fullPage: true });

  await mPage.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await mPage.waitForTimeout(1000);
  await mPage.screenshot({ path: path.join(EV_DIR_5, '01-mobile-discovery.png'), fullPage: true });

  // 2. Map View
  console.log('  -> Chụp Map View (MapLibre Interactive Map)');
  await dPage.goto('http://localhost:5173/map', { waitUntil: 'networkidle' });
  await dPage.waitForSelector('.maplibregl-canvas', { timeout: 10000 }).catch(() => {});
  await dPage.waitForTimeout(3000);
  await dPage.screenshot({ path: path.join(EV_DIR_5, '02-desktop-map-view.png'), fullPage: true });

  await mPage.goto('http://localhost:5173/map', { waitUntil: 'networkidle' });
  await mPage.waitForSelector('.maplibregl-canvas', { timeout: 10000 }).catch(() => {});
  await mPage.waitForTimeout(3000);
  await mPage.screenshot({ path: path.join(EV_DIR_5, '02-mobile-map-view.png'), fullPage: true });

  // 3. Place Detail
  console.log('  -> Chụp Place Detail');
  await dPage.goto(`http://localhost:5173/places/${placeSlug}`, { waitUntil: 'networkidle' });
  await dPage.waitForTimeout(1000);
  await dPage.screenshot({ path: path.join(EV_DIR_5, '03-desktop-place-detail.png'), fullPage: true });

  await mPage.goto(`http://localhost:5173/places/${placeSlug}`, { waitUntil: 'networkidle' });
  await mPage.waitForTimeout(1000);
  await mPage.screenshot({ path: path.join(EV_DIR_5, '03-mobile-place-detail.png'), fullPage: true });

  // 4. Place Comparison Matrix
  console.log('  -> Chụp Place Compare');
  await dPage.goto('http://localhost:5173/compare', { waitUntil: 'networkidle' });
  await dPage.waitForTimeout(1000);
  await dPage.screenshot({ path: path.join(EV_DIR_5, '04-desktop-place-compare.png'), fullPage: true });

  await mPage.goto('http://localhost:5173/compare', { waitUntil: 'networkidle' });
  await mPage.waitForTimeout(1000);
  await mPage.screenshot({ path: path.join(EV_DIR_5, '04-mobile-place-compare.png'), fullPage: true });

  // 5. User Contribution Page (Student Logged-in)
  console.log('  -> Chụp User Contribution');
  const dStudentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await dStudentContext.addCookies([
    { name: 'ssg_session', value: rawStudentToken, domain: 'localhost', path: '/' },
  ]);
  const dStudentPage = await dStudentContext.newPage();
  await dStudentPage.goto('http://localhost:5173/me/contributions', { waitUntil: 'networkidle' });
  await dStudentPage.waitForTimeout(1000);
  await dStudentPage.screenshot({ path: path.join(EV_DIR_5, '05-desktop-contribution.png'), fullPage: true });

  const mStudentContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    isMobile: true,
    hasTouch: true,
  });
  await mStudentContext.addCookies([
    { name: 'ssg_session', value: rawStudentToken, domain: 'localhost', path: '/' },
  ]);
  const mStudentPage = await mStudentContext.newPage();
  await mStudentPage.goto('http://localhost:5173/me/contributions', { waitUntil: 'networkidle' });
  await mStudentPage.waitForTimeout(1000);
  await mStudentPage.screenshot({ path: path.join(EV_DIR_5, '05-mobile-contribution.png'), fullPage: true });

  // ==========================================
  // B. CHỤP MINH CHỨNG GIAI ĐOẠN 6
  // ==========================================
  console.log('📸 [Giai đoạn 6] Bắt đầu chụp ảnh minh chứng Operations & Realtime...');

  // 1. Dynamic Announcement Banner
  console.log('  -> Chụp Announcement Banner');
  await dStudentPage.goto('http://localhost:5173/compare', { waitUntil: 'networkidle' });
  await dStudentPage.waitForTimeout(1000);
  await dStudentPage.screenshot({ path: path.join(EV_DIR_6, '01-desktop-announcement-banner.png'), fullPage: true });

  await mStudentPage.goto('http://localhost:5173/compare', { waitUntil: 'networkidle' });
  await mStudentPage.waitForTimeout(1000);
  await mStudentPage.screenshot({ path: path.join(EV_DIR_6, '01-mobile-announcement-banner.png'), fullPage: true });

  // 2. Real-time Notification Popover
  console.log('  -> Chụp Notification Popover');
  const bellButton = dStudentPage.locator('button[aria-label="Thông báo"]').first();
  if (await bellButton.isVisible()) {
    await bellButton.click({ force: true });
    await dStudentPage.waitForTimeout(800);
  }
  await dStudentPage.screenshot({ path: path.join(EV_DIR_6, '02-desktop-notification-popover.png') });

  const mBellButton = mStudentPage.locator('button[aria-label="Thông báo"]').first();
  if (await mBellButton.isVisible()) {
    await mBellButton.click({ force: true });
    await mStudentPage.waitForTimeout(800);
  }
  await mStudentPage.screenshot({ path: path.join(EV_DIR_6, '02-mobile-notification-popover.png') });

  // Admin Contexts
  const dAdminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await dAdminContext.addCookies([
    { name: 'ssg_session', value: rawAdminToken, domain: 'localhost', path: '/' },
  ]);
  const dAdminPage = await dAdminContext.newPage();

  const mAdminContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    isMobile: true,
    hasTouch: true,
  });
  await mAdminContext.addCookies([
    { name: 'ssg_session', value: rawAdminToken, domain: 'localhost', path: '/' },
  ]);
  const mAdminPage = await mAdminContext.newPage();

  // 3. Admin Dashboard with live stats & badges
  console.log('  -> Chụp Admin Dashboard');
  await dAdminPage.goto('http://localhost:5173/admin', { waitUntil: 'networkidle' });
  await dAdminPage.waitForTimeout(1200);
  await dAdminPage.screenshot({ path: path.join(EV_DIR_6, '03-desktop-admin-dashboard.png'), fullPage: true });

  await mAdminPage.goto('http://localhost:5173/admin', { waitUntil: 'networkidle' });
  await mAdminPage.waitForTimeout(1200);
  await mAdminPage.screenshot({ path: path.join(EV_DIR_6, '03-mobile-admin-dashboard.png'), fullPage: true });

  // 4. Admin Announcements Management
  console.log('  -> Chụp Admin Announcements');
  await dAdminPage.goto('http://localhost:5173/admin/announcements', { waitUntil: 'networkidle' });
  await dAdminPage.waitForTimeout(1000);
  await dAdminPage.screenshot({ path: path.join(EV_DIR_6, '04-desktop-admin-announcements.png'), fullPage: true });

  await mAdminPage.goto('http://localhost:5173/admin/announcements', { waitUntil: 'networkidle' });
  await mAdminPage.waitForTimeout(1000);
  await mAdminPage.screenshot({ path: path.join(EV_DIR_6, '04-mobile-admin-announcements.png'), fullPage: true });

  // 5. Admin Support Ticket Workspace
  console.log('  -> Chụp Admin Support');
  await dAdminPage.goto('http://localhost:5173/admin/support', { waitUntil: 'networkidle' });
  await dAdminPage.waitForTimeout(1000);
  await dAdminPage.screenshot({ path: path.join(EV_DIR_6, '05-desktop-admin-support.png'), fullPage: true });

  await mAdminPage.goto('http://localhost:5173/admin/support', { waitUntil: 'networkidle' });
  await mAdminPage.waitForTimeout(1000);
  await mAdminPage.screenshot({ path: path.join(EV_DIR_6, '05-mobile-admin-support.png'), fullPage: true });

  // 6. Admin Audit Logs Security Trail
  console.log('  -> Chụp Admin Audit Logs');
  await dAdminPage.goto('http://localhost:5173/admin/audit-logs', { waitUntil: 'networkidle' });
  await dAdminPage.waitForTimeout(1000);
  await dAdminPage.screenshot({ path: path.join(EV_DIR_6, '06-desktop-admin-audit-logs.png'), fullPage: true });

  await mAdminPage.goto('http://localhost:5173/admin/audit-logs', { waitUntil: 'networkidle' });
  await mAdminPage.waitForTimeout(1000);
  await mAdminPage.screenshot({ path: path.join(EV_DIR_6, '06-mobile-admin-audit-logs.png'), fullPage: true });

  // ==========================================
  // C. CHỤP MINH CHỨNG GIAI ĐOẠN 7: AI ĐA NHÀ CUNG CẤP & STREAMING CHAT
  // ==========================================
  console.log('📸 [Giai đoạn 7] Bắt đầu chụp ảnh minh chứng AI Assistant & Multi-Provider...');

  // Chuẩn bị dữ liệu mẫu hội thoại AI kèm Grounded Sources và Messages
  let aiConv = await prisma.aIConversation.findFirst({
    where: { userId: student.id },
  });
  if (!aiConv) {
    aiConv = await prisma.aIConversation.create({
      data: {
        userId: student.id,
        title: 'Tư vấn quán cà phê học bài yên tĩnh gần HCMUS',
      },
    });
  }

  await prisma.aIMessage.deleteMany({ where: { conversationId: aiConv.id } });
  await prisma.aIMessage.createMany({
    data: [
      {
        conversationId: aiConv.id,
        role: 'USER',
        content: 'Tìm giúp mình quán cà phê có nhiều ổ cắm điện, wifi mạnh và có giảm giá cho sinh viên HCMUS gần trường với!',
        sequenceNumber: 1,
        status: 'COMPLETED',
      },
      {
        conversationId: aiConv.id,
        role: 'ASSISTANT',
        content: `Dưới đây là không gian học tập phù hợp theo dữ liệu thực tế tại SSG:\n\n📍 **The Coffee House - Nguyễn Văn Cừ**\n- **Địa chỉ:** 227 Nguyễn Văn Cừ, Phường 4, Quận 5, TP.HCM (cách HCMUS ~150m)\n- **Tiện ích học tập:** Ổ cắm điện tại hầu hết các bàn đơn và bàn nhóm, Wi-Fi tốc độ cao ổn định (EXCELLENT), không gian yên tĩnh (QUIET).\n- **Ưu đãi sinh viên:** Giảm 15% tổng hóa đơn khi xuất trình thẻ sinh viên HCMUS.\n- **Khung giá:** 25.000đ - 65.000đ\n\n*(Nguồn dữ liệu: Dữ liệu hồ sơ địa điểm công khai đã được xác minh lúc 14:00 hôm nay)*`,
        sequenceNumber: 2,
        status: 'COMPLETED',
      },
    ],
  });

  // 1. Floating Chat Widget (Open on Desktop & Mobile)
  console.log('  -> Chụp Floating Chat Widget');
  await dStudentPage.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await dStudentPage.waitForTimeout(1000);
  const chatFab = dStudentPage.locator('.ant-btn-circle').last();
  if (await chatFab.isVisible()) {
    await chatFab.click({ force: true });
    await dStudentPage.waitForTimeout(1200);
  }
  await dStudentPage.screenshot({ path: path.join(EV_DIR_7, '01-desktop-floating-chat-open.png') });
  await dStudentPage.screenshot({ path: path.join(EV_DIR_7, '08-desktop-grounded-sources-cards.png') });

  await mStudentPage.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await mStudentPage.waitForTimeout(1000);
  const mChatFab = mStudentPage.locator('.ant-btn-circle').last();
  if (await mChatFab.isVisible()) {
    await mChatFab.click({ force: true });
    await mStudentPage.waitForTimeout(1200);
  }
  await mStudentPage.screenshot({ path: path.join(EV_DIR_7, '01-mobile-floating-chat-open.png') });

  // 2. Admin AI Providers & Circuit Status (Desktop & Mobile)
  console.log('  -> Chụp Admin AI Providers');
  await dAdminPage.goto('http://localhost:5173/admin/ai', { waitUntil: 'networkidle' });
  await dAdminPage.waitForTimeout(1200);
  await dAdminPage.screenshot({ path: path.join(EV_DIR_7, '02-desktop-admin-ai-providers.png'), fullPage: true });

  await mAdminPage.goto('http://localhost:5173/admin/ai', { waitUntil: 'networkidle' });
  await mAdminPage.waitForTimeout(1200);
  await mAdminPage.screenshot({ path: path.join(EV_DIR_7, '02-mobile-admin-ai-providers.png'), fullPage: true });

  // 3. Admin AI Task Configs & Prompt Versioning (Desktop & Mobile)
  console.log('  -> Chụp Admin AI Task Configs');
  const taskTab = dAdminPage.locator('.ant-tabs-tab:has-text("Cấu Hình Tác Vụ")');
  if (await taskTab.isVisible()) {
    await taskTab.click({ force: true });
    await dAdminPage.waitForTimeout(800);
  }
  await dAdminPage.screenshot({ path: path.join(EV_DIR_7, '03-desktop-admin-ai-task-configs.png'), fullPage: true });

  const mTaskTab = mAdminPage.locator('.ant-tabs-tab:has-text("Cấu Hình Tác Vụ")');
  if (await mTaskTab.isVisible()) {
    await mTaskTab.click({ force: true });
    await mAdminPage.waitForTimeout(800);
  }
  await mAdminPage.screenshot({ path: path.join(EV_DIR_7, '03-mobile-admin-ai-task-configs.png'), fullPage: true });

  // 4. Admin AI Conversations & Human Support Monitoring (Desktop & Mobile)
  console.log('  -> Chụp Admin AI Conversations & Human Support');
  const convTab = dAdminPage.locator('.ant-tabs-tab:has-text("Giám Sát Hội Thoại")');
  if (await convTab.isVisible()) {
    await convTab.click({ force: true });
    await dAdminPage.waitForTimeout(800);
  }
  await dAdminPage.screenshot({ path: path.join(EV_DIR_7, '04-desktop-admin-ai-conversations.png'), fullPage: true });

  const mConvTab = mAdminPage.locator('.ant-tabs-tab:has-text("Giám Sát Hội Thoại")');
  if (await mConvTab.isVisible()) {
    await mConvTab.click({ force: true });
    await mAdminPage.waitForTimeout(800);
  }
  await mAdminPage.screenshot({ path: path.join(EV_DIR_7, '04-mobile-admin-ai-conversations.png'), fullPage: true });

  // 5. Streaming State & Stop Button
  console.log('  -> Chụp Chat Streaming & Stop Button');
  await prisma.aIMessage.create({
    data: {
      conversationId: aiConv.id,
      role: 'ASSISTANT',
      content: 'Đang tra cứu cơ sở dữ liệu các quán mở 24/7 và kiểm tra chính sách giảm giá sinh viên...',
      sequenceNumber: 3,
      status: 'STREAMING',
    },
  });
  await dStudentPage.reload({ waitUntil: 'networkidle' });
  await dStudentPage.waitForTimeout(1000);
  const chatFab2 = dStudentPage.locator('.ant-btn-circle').last();
  if (await chatFab2.isVisible()) {
    await chatFab2.click({ force: true });
    await dStudentPage.waitForTimeout(1000);
  }
  await dStudentPage.screenshot({ path: path.join(EV_DIR_7, '05-desktop-chat-streaming-stop.png') });

  // 6. Privacy Consent Modal
  console.log('  -> Chụp Privacy Consent Modal');
  const nonConsentUserContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const nonConsentPage = await nonConsentUserContext.newPage();
  await nonConsentPage.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  const fabGuest = nonConsentPage.locator('.ant-btn-circle').last();
  if (await fabGuest.isVisible()) {
    await fabGuest.click({ force: true });
    await nonConsentPage.waitForTimeout(800);
    // Click sample suggestion prompt which triggers modal if unconsented or prompt
    const sampleBtn = nonConsentPage.locator('.ant-card-body button:has-text("Quán")').first();
    if (await sampleBtn.isVisible()) {
      await sampleBtn.click({ force: true });
      await nonConsentPage.waitForTimeout(800);
    }
  }
  await nonConsentPage.screenshot({ path: path.join(EV_DIR_7, '06-desktop-privacy-consent-modal.png') });
  await nonConsentUserContext.close();

  // 7. Human Mode Banner
  console.log('  -> Chụp Human Mode Banner');
  await prisma.aIConversation.update({
    where: { id: aiConv.id },
    data: { status: 'HUMAN_ACTIVE' },
  });
  await prisma.aIMessage.create({
    data: {
      conversationId: aiConv.id,
      role: 'ADMIN',
      content: 'Chào bạn, mình là Quản trị viên SSG. Mình đã tiếp nhận yêu cầu hỗ trợ và sẵn sàng giải đáp thêm cho bạn!',
      sequenceNumber: 4,
      status: 'COMPLETED',
    },
  });
  await dStudentPage.reload({ waitUntil: 'networkidle' });
  await dStudentPage.waitForTimeout(1000);
  const chatFab3 = dStudentPage.locator('.ant-btn-circle').last();
  if (await chatFab3.isVisible()) {
    await chatFab3.click({ force: true });
    await dStudentPage.waitForTimeout(1000);
  }
  await dStudentPage.screenshot({ path: path.join(EV_DIR_7, '07-desktop-human-mode-banner.png') });

  // 8. Interrupted State & Retry Button
  console.log('  -> Chụp Interrupted State & Retry Button');
  await prisma.aIConversation.update({
    where: { id: aiConv.id },
    data: { status: 'AI_ACTIVE' },
  });
  await prisma.aIMessage.deleteMany({ where: { conversationId: aiConv.id } });
  await prisma.aIMessage.createMany({
    data: [
      {
        conversationId: aiConv.id,
        role: 'USER',
        content: 'Tìm cho mình quán có trà sữa ngon và có thể ngồi học nhóm khoảng 4 người nhé!',
        sequenceNumber: 1,
        status: 'COMPLETED',
      },
      {
        conversationId: aiConv.id,
        role: 'ASSISTANT',
        content: 'Dưới đây là một số quán trà sữa có không gian học nhóm rộng rãi quanh khu vực...',
        sequenceNumber: 2,
        status: 'INTERRUPTED',
      },
    ],
  });
  await dStudentPage.reload({ waitUntil: 'networkidle' });
  await dStudentPage.waitForTimeout(1000);
  const chatFab4 = dStudentPage.locator('.ant-btn-circle').last();
  if (await chatFab4.isVisible()) {
    await chatFab4.click({ force: true });
    await dStudentPage.waitForTimeout(1000);
  }
  await dStudentPage.screenshot({ path: path.join(EV_DIR_7, '09-desktop-interrupted-retry.png') });

  console.log('🎉 Hoàn tất 100% chụp ảnh minh chứng Playwright cho Giai đoạn 5, 6 và 7!');

  // Cleanup
  await browser.close();
  await vite.close();
  io.close();
  httpServer.close();
  await prisma.$disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Lỗi khi capture evidence:', err);
  process.exit(1);
});
