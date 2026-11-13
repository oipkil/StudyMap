import { createMediaWorker } from './media.queue.js';

console.log('====================================================');
console.log('🚀 SSG Standalone Media Worker (BullMQ + Sharp)');
console.log('Connected to Redis port: ' + (process.env.REDIS_PORT || '6380'));
console.log('====================================================');

const worker = createMediaWorker();

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, gracefully closing media worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down media worker...');
  await worker.close();
  process.exit(0);
});
