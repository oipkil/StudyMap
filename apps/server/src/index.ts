import http from 'node:http';
import { createApp } from './app.js';
import { initSocketServer } from './socket/index.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const app = createApp();
const httpServer = http.createServer(app);

// Khởi tạo WebSocket Realtime
initSocketServer(httpServer, CLIENT_URL);

httpServer.listen(PORT, () => {
  console.log(`🚀 SSG Server đang chạy tại http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server sẵn sàng cho client: ${CLIENT_URL}`);
});

async function shutdown() {
  console.log('\n🛑 Đang tắt ứng dụng SSG an toàn...');
  await prisma.$disconnect();
  redis.disconnect();
  httpServer.close(() => {
    console.log('✅ Đã đóng toàn bộ kết nối server');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
