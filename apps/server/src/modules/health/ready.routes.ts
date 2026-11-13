import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { QUARANTINE_DIR } from '../media/media.storage.js';

const router = Router();

router.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {
    db: 'unknown',
    redis: 'unknown',
    storage: 'unknown',
    worker: 'unknown',
  };

  let allReady = true;

  // 1. Kiểm tra Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch (err: any) {
    checks.db = `error: ${err.message}`;
    allReady = false;
  }

  // 2. Kiểm tra Redis
  try {
    const pong = await redis.ping();
    if (pong === 'PONG') {
      checks.redis = 'ok';
      checks.worker = 'ok'; // Redis sẵn sàng cho hàng đợi BullMQ worker
    } else {
      checks.redis = 'unexpected ping response';
      checks.worker = 'redis unavailable';
      allReady = false;
    }
  } catch (err: any) {
    checks.redis = `error: ${err.message}`;
    checks.worker = 'error: redis connection failed';
    allReady = false;
  }

  // 3. Kiểm tra Storage (Khả năng ghi vào thư mục uploads/quarantine)
  try {
    if (!fs.existsSync(QUARANTINE_DIR)) {
      fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
    }
    const testFile = path.join(QUARANTINE_DIR, `healthcheck-${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(testFile, 'ready-check', 'utf8');
    fs.unlinkSync(testFile);
    checks.storage = 'ok';
  } catch (err: any) {
    checks.storage = `error: ${err.message}`;
    allReady = false;
  }

  const statusCode = allReady ? 200 : 503;
  return res.status(statusCode).json({
    ready: allReady,
    checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;
