import fs from 'node:fs';
import path from 'node:path';

// Native env loader without external dependency (Ponytail principle)
try {
  const envPath = path.resolve(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {
  // Ignore
}

const testDbUrl =
  process.env.DATABASE_URL_TEST ||
  (process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace('/ssg_db', '/ssg_test')
    : 'postgresql://ssg_admin:ssg_secret_password_2026@localhost:5434/ssg_test?schema=public');

process.env.DATABASE_URL = testDbUrl;
process.env.NODE_ENV = 'test';
