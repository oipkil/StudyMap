// Triển khai SSG lên VPS studymap.online từ máy dev.
//   node scripts/deploy-vps.mjs                 # đồng bộ mã + web build, build lại server image, restart
//   node scripts/deploy-vps.mjs --init          # lần đầu: cài nginx/certbot, tạo .env.prod, TLS
//   node scripts/deploy-vps.mjs --with-db       # kèm dump DB dev + ảnh upload (ghi đè dữ liệu prod!)
//   node scripts/deploy-vps.mjs --skip-build    # không build web lại
// Yêu cầu: ssh/scp có sẵn (Git Bash), key ~/.ssh/tke_staging_ed25519 đăng nhập được ubuntu@VPS.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const HOST = process.env.VPS_HOST || '180.93.100.36';
const USER = process.env.VPS_USER || 'ubuntu';
const KEY = process.env.VPS_KEY || `${process.env.HOME || process.env.USERPROFILE}/.ssh/tke_staging_ed25519`;
const DOMAIN = 'studymap.online';
const REMOTE_DIR = '/opt/ssg';
const args = new Set(process.argv.slice(2));
const OUT = 'scratch/deploy';
mkdirSync(OUT, { recursive: true });

const sshBase = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-i', KEY, '-o', 'IdentitiesOnly=yes'];
const ssh = (cmd, opts = {}) => {
  const out = execFileSync('ssh', [...sshBase, `${USER}@${HOST}`, cmd], { stdio: opts.quiet ? 'pipe' : 'inherit', maxBuffer: 64 * 1024 * 1024 });
  return out ? out.toString() : '';
};
const scp = (local, remote) => execFileSync('scp', [...sshBase, local, `${USER}@${HOST}:${remote}`], { stdio: 'inherit' });
const local = (cmd) => execSync(cmd, { stdio: 'inherit' });
const log = (m) => console.log(`\n=== ${m}`);

// 1) Build web ở máy dev (VPS 2 vCPU, build ở đây nhanh hơn)
if (!args.has('--skip-build')) {
  log('Build shared + web (local)');
  local('pnpm --filter @ssg/shared build');
  local('pnpm --filter @ssg/web build');
}

// 2) Đóng gói mã nguồn server (không node_modules/dist/uploads) + web dist
log('Đóng gói mã nguồn');
local(`tar -czf ${OUT}/ssg-src.tgz --exclude=node_modules --exclude=dist --exclude=uploads --exclude=.env --exclude=coverage ` +
  `package.json pnpm-lock.yaml pnpm-workspace.yaml prisma packages/shared apps/server apps/web/package.json scripts deploy`);
local(`tar -czf ${OUT}/ssg-web.tgz -C apps/web/dist .`);

// 3) Chuẩn bị thư mục trên VPS + tải lên
log('Tải lên VPS');
ssh(`sudo mkdir -p ${REMOTE_DIR} /var/www/studymap /var/www/certbot && sudo chown -R ${USER}:${USER} ${REMOTE_DIR} /var/www/studymap`);
scp(`${OUT}/ssg-src.tgz`, `${REMOTE_DIR}/ssg-src.tgz`);
scp(`${OUT}/ssg-web.tgz`, `${REMOTE_DIR}/ssg-web.tgz`);
ssh(`cd ${REMOTE_DIR} && tar -xzf ssg-src.tgz && rm ssg-src.tgz && rm -rf /var/www/studymap/* && tar -xzf ssg-web.tgz -C /var/www/studymap && rm ssg-web.tgz && ls`);

// 4) Lần đầu: .env.prod, nginx, certbot
if (args.has('--init')) {
  log('Khởi tạo lần đầu: .env.prod');
  const devEnv = Object.fromEntries(
    readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
  );
  // ENCRYPTION_MASTER_KEY phải giữ nguyên để giải mã API key AI đã lưu trong DB dev; các bí mật khác sinh mới.
  const envProd = [
    `POSTGRES_PASSWORD=${randomBytes(18).toString('base64url')}`,
    `CLIENT_URL=https://${DOMAIN}`,
    `SESSION_SECRET=${randomBytes(48).toString('base64url')}`,
    `ENCRYPTION_MASTER_KEY=${devEnv.ENCRYPTION_MASTER_KEY}`,
    `COOKIE_DOMAIN=${DOMAIN}`,
    `COOKIE_SECURE=true`,
    `SMTP_USER=`,
    `SMTP_PASS=`,
    `EMAIL_FROM="SSG Sinh Viên <no-reply@${DOMAIN}>"`,
    `STORAGE_DRIVER=local`,
    `STORAGE_LOCAL_PATH=./uploads`,
    `STORAGE_QUARANTINE_PATH=./uploads/quarantine`,
    `STORAGE_PUBLIC_PATH=./uploads/public`,
    `MAP_TILE_URL=${devEnv.MAP_TILE_URL || ''}`,
    `GEOCODING_ENDPOINT=${devEnv.GEOCODING_ENDPOINT || ''}`,
  ].join('\n') + '\n';
  writeFileSync(`${OUT}/.env.prod`, envProd);
  ssh(`test -f ${REMOTE_DIR}/deploy/.env.prod && echo "(.env.prod đã có, giữ nguyên)" || true`);
  const hasEnv = ssh(`test -f ${REMOTE_DIR}/deploy/.env.prod && echo yes || echo no`, { quiet: true }).trim();
  if (hasEnv === 'no') scp(`${OUT}/.env.prod`, `${REMOTE_DIR}/deploy/.env.prod`);

  log('Cài nginx + certbot, cấu hình site');
  const mailpitPass = randomBytes(9).toString('base64url');
  writeFileSync(`${OUT}/mailpit-credentials.txt`, `user: ssgteam\npass: ${mailpitPass}\nurl: https://${DOMAIN}/mailpit/\n`);
  ssh([
    'sudo apt-get update -qq',
    'sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx certbot python3-certbot-nginx apache2-utils',
    `sudo htpasswd -bc /etc/nginx/.htpasswd-mailpit ssgteam '${mailpitPass}'`,
    `sudo cp ${REMOTE_DIR}/deploy/nginx-studymap.conf /etc/nginx/sites-available/${DOMAIN}`,
    `sudo ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}`,
    'sudo rm -f /etc/nginx/sites-enabled/default',
    'sudo nginx -t && sudo systemctl reload nginx',
  ].join(' && '));
}

// 5) Docker: build image server + lên dịch vụ
log('Docker compose up --build (server, postgres, redis, mailpit)');
ssh(`cd ${REMOTE_DIR} && sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build --remove-orphans`);

// 6) Dữ liệu: dump DB dev + ảnh upload (tuỳ chọn)
if (args.has('--with-db')) {
  log('Dump DB dev + ảnh upload -> VPS');
  local(`docker exec ssg-postgres pg_dump -U ssg_admin -d ssg_db -Fc > ${OUT}/ssg.dump`);
  local(`tar -czf ${OUT}/ssg-uploads.tgz -C apps/server/uploads .`);
  scp(`${OUT}/ssg.dump`, `${REMOTE_DIR}/ssg.dump`);
  scp(`${OUT}/ssg-uploads.tgz`, `${REMOTE_DIR}/ssg-uploads.tgz`);
  ssh([
    `cd ${REMOTE_DIR}`,
    'sudo docker cp ssg.dump ssg-postgres:/tmp/ssg.dump',
    // Khôi phục vào DB trống: xoá schema public rồi restore (dump đã chứa bảng _prisma_migrations)
    `sudo docker exec ssg-postgres psql -U ssg_admin -d ssg_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`,
    'sudo docker exec ssg-postgres pg_restore -U ssg_admin -d ssg_db --no-owner --no-privileges /tmp/ssg.dump',
    'sudo docker cp ssg-uploads.tgz ssg-server:/tmp/ssg-uploads.tgz',
    'sudo docker exec ssg-server sh -c "cd /app/apps/server/uploads && tar -xzf /tmp/ssg-uploads.tgz && rm /tmp/ssg-uploads.tgz"',
    'rm -f ssg.dump ssg-uploads.tgz',
    `sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod restart ssg-server`,
  ].join(' && '));
} else {
  // Chạy migration nếu có bản mới (không đụng dữ liệu)
  log('Prisma migrate deploy');
  ssh(`cd ${REMOTE_DIR} && sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec -T ssg-server sh -c "cd /app && pnpm exec prisma migrate deploy"`);
}

// 7) TLS lần đầu
if (args.has('--init')) {
  log('Let\'s Encrypt');
  ssh(`sudo certbot --nginx -n --agree-tos --redirect -m admin@${DOMAIN} -d ${DOMAIN} -d www.${DOMAIN} || echo "certbot thất bại — kiểm tra DNS đã trỏ về VPS chưa"`);
}

// 8) Kiểm tra sức khỏe
log('Kiểm tra');
ssh(`cd ${REMOTE_DIR} && sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod ps && curl -s -m 10 http://127.0.0.1:4000/health && echo && curl -s -m 10 -o /dev/null -w "nginx local: %{http_code}\\n" http://127.0.0.1/`);
console.log(`\nXong. Web: https://${DOMAIN}  |  Mailpit: https://${DOMAIN}/mailpit/`);
