import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const devDbUrl = process.env.DATABASE_URL || 'postgresql://ssg_admin:ssg_secret_password_2026@localhost:5434/ssg_db?schema=public';
const prisma = new PrismaClient({
  datasources: { db: { url: devDbUrl } },
});

async function main() {
  console.log('🧹 Cleaning test garbage from dev DB (ssg_db)...');

  // 1. Delete test places (patterns: 'quan-tra-sua-hoc-bai-lang-dai-hoc-%', 'test-%')
  const testPlaces = await prisma.place.findMany({
    where: {
      OR: [
        { slug: { startsWith: 'quan-tra-sua-hoc-bai-lang-dai-hoc-' } },
        { slug: { startsWith: 'test-' } },
        { slug: { contains: 'realtime' } },
      ],
      NOT: [
        { slug: 'the-coffee-house-nguyen-van-cu' },
        { slug: 'ca-phe-hoc-bai-cu-dem-24-7' },
      ],
    },
  });

  const testPlaceIds = testPlaces.map((p) => p.id);
  console.log(`Found ${testPlaceIds.length} test places to remove`);

  if (testPlaceIds.length > 0) {
    await prisma.placePublishedProjection.deleteMany({ where: { placeId: { in: testPlaceIds } } });
    await prisma.reviewRevision.deleteMany({ where: { review: { placeId: { in: testPlaceIds } } } });
    await prisma.review.deleteMany({ where: { placeId: { in: testPlaceIds } } });
    await prisma.placeFavorite.deleteMany({ where: { placeId: { in: testPlaceIds } } });
    await prisma.collectionItem.deleteMany({ where: { placeId: { in: testPlaceIds } } });
    await prisma.place.updateMany({
      where: { id: { in: testPlaceIds } },
      data: { currentPublishedRevisionId: null },
    });
    await prisma.placeRevision.deleteMany({ where: { placeId: { in: testPlaceIds } } });
    await prisma.place.deleteMany({ where: { id: { in: testPlaceIds } } });
  }

  // 2. Delete test users (keep admin@ssg.edu.vn, sinhvien1@hcmus.edu.vn, sinhvien2@hcmus.edu.vn)
  const testUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { startsWith: 'student_lifecycle_' } },
        { email: { startsWith: 'verify_test_' } },
        { email: { startsWith: 'expired_test_' } },
        { email: { startsWith: 'reset_pwd_user_' } },
        { email: { contains: '@test.' } },
        { username: { startsWith: 'lifecycle_' } },
        { username: { startsWith: 'verify_' } },
        { username: { startsWith: 'expired_' } },
        { username: { startsWith: 'pwd_user_' } },
      ],
      NOT: [
        { email: 'admin@ssg.edu.vn' },
        { email: 'sinhvien1@hcmus.edu.vn' },
        { email: 'sinhvien2@hcmus.edu.vn' },
      ],
    },
  });

  const testUserIds = testUsers.map((u) => u.id);
  console.log(`Found ${testUserIds.length} test users to remove`);

  if (testUserIds.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.authToken.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.supportCase.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.userProfileRevision.deleteMany({ where: { userProfile: { userId: { in: testUserIds } } } });
    await prisma.userProfile.deleteMany({ where: { userId: { in: testUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
  }

  console.log('✅ Cleaned up test garbage from ssg_db successfully!');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
