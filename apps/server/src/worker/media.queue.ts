import { Queue, Worker, Job } from 'bullmq';
import { processAsset } from '../modules/media/media.processor.js';

// Ưu tiên REDIS_URL (prod: redis://ssg-redis:6379) — trước đây chỉ đọc REDIS_HOST/PORT nên trên VPS queue cứ nối 127.0.0.1:6380 và spam ECONNREFUSED
const redisUrl = process.env.REDIS_URL ? new URL(process.env.REDIS_URL) : null;
const connection = {
  host: process.env.REDIS_HOST || redisUrl?.hostname || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || redisUrl?.port || '6380', 10),
  ...(redisUrl?.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
  maxRetriesPerRequest: null,
};

export const mediaQueue = new Queue('media-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export async function enqueueMediaProcessing(assetId: string) {
  return mediaQueue.add('process-asset', { assetId });
}

// Khởi tạo Background Worker lắng nghe xử lý ảnh nền
let workerInstance: Worker | null = null;

export function createMediaWorker() {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker(
    'media-processing',
    async (job: Job<{ assetId: string }>) => {
      const { assetId } = job.data;
      console.log(`[MediaWorker] Đang xử lý biến thể và tối ưu cho asset: ${assetId}`);
      const result = await processAsset(assetId);
      console.log(`[MediaWorker] Đã xử lý thành công asset: ${assetId}`);
      return result;
    },
    { connection, concurrency: 4 }
  );

  workerInstance.on('failed', (job, err) => {
    console.error(`[MediaWorker] Job thất bại cho asset ${job?.data?.assetId}:`, err);
  });

  return workerInstance;
}

// Nếu được cấu hình ENABLE_EMBEDDED_WORKER=true thì tự động khởi chạy worker embedded
if (process.env.ENABLE_EMBEDDED_WORKER === 'true') {
  createMediaWorker();
}
