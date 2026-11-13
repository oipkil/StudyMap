// Tạo 5 tài khoản quản trị cho thành viên nhóm (idempotent: đã có thì chỉ đặt lại mật khẩu + vai trò ADMIN).
// Cách chạy:  pnpm exec tsx scripts/create-team-admins.ts            -> in ra bảng tài khoản/mật khẩu
//             DATABASE_URL=... pnpm exec tsx scripts/create-team-admins.ts  (trên VPS)
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

// Mật khẩu cố định để cả nhóm dùng chung được ngay; đổi bằng biến TEAM_ADMIN_PASSWORD nếu muốn.
// Nếu không đặt, mỗi tài khoản nhận một mật khẩu ngẫu nhiên và được in ra màn hình.
const fixedPassword = process.env.TEAM_ADMIN_PASSWORD || '';

const members = [1, 2, 3, 4, 5].map((i) => ({
  email: `admin${i}@studymap.online`,
  username: `admin${i}`,
  displayName: `Thành viên nhóm ${i}`,
}));

function genPassword() {
  // 12 ký tự dễ gõ, có chữ hoa, thường, số
  const raw = randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
  return `Ssg${raw}9`;
}

async function main() {
  const rows: Array<{ email: string; username: string; password: string; status: string }> = [];
  for (const m of members) {
    const password = fixedPassword || genPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findUnique({ where: { email: m.email } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, role: Role.ADMIN, isEmailVerified: true, isLocked: false },
      });
      rows.push({ email: m.email, username: existing.username, password, status: 'đã có → đặt lại mật khẩu' });
      continue;
    }
    await prisma.user.create({
      data: {
        email: m.email,
        username: m.username,
        passwordHash,
        role: Role.ADMIN,
        isEmailVerified: true,
        profile: { create: { displayName: m.displayName, isUniversityPublic: true } },
      },
    });
    rows.push({ email: m.email, username: m.username, password, status: 'tạo mới' });
  }
  console.table(rows);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
