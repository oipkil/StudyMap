import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

async function main() {
  const devDbUrl = process.env.DATABASE_URL || 'postgresql://ssg_admin:ssg_secret_password_2026@localhost:5434/ssg_db?schema=public';
  const testDbUrl = process.env.DATABASE_URL_TEST || devDbUrl.replace('/ssg_db', '/ssg_test');

  console.log('🔧 Setting up test database:', testDbUrl);

  // Connect to postgres or ssg_db to create ssg_test if it does not exist
  const adminPrisma = new PrismaClient({
    datasources: {
      db: { url: devDbUrl },
    },
  });

  try {
    const exists: any = await adminPrisma.$queryRawUnsafe(
      "SELECT 1 FROM pg_database WHERE datname = 'ssg_test'"
    );
    if (!exists || exists.length === 0) {
      await adminPrisma.$executeRawUnsafe('CREATE DATABASE ssg_test');
      console.log('✅ Created database ssg_test');
    } else {
      console.log('ℹ️ Database ssg_test already exists');
    }
  } catch (err) {
    console.error('Warning while checking/creating test DB:', err);
  } finally {
    await adminPrisma.$disconnect();
  }

  // Deploy migrations to ssg_test
  console.log('🚀 Running prisma migrate deploy on test database...');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDbUrl },
  });

  // Run seed on test database so standard users and category definitions exist
  console.log('🌱 Seeding test database...');
  execSync('npx tsx prisma/seed.ts', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDbUrl },
  });

  console.log('🎉 Test database ssg_test ready!');
}

main().catch((err) => {
  console.error('❌ Failed to setup test database:', err);
  process.exit(1);
});
