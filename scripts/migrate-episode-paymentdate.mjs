// 회차 입금일(payment_date) 컬럼 추가 — 입금 관리에서 실제 입금일 기록(invoice_date 선례 미러).
// DB 안전규칙: ALTER TABLE ADD COLUMN IF NOT EXISTS(멱등), 순수 추가, DROP 없음.
// 실행: node scripts/migrate-episode-paymentdate.mjs  (MIGRATION_DATABASE_URL = 직결 5432)
import fs from 'node:fs';
import postgres from 'postgres';

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const url = env.MIGRATION_DATABASE_URL || env.DATABASE_URL;
if (!url) { console.error('MIGRATION_DATABASE_URL 없음'); process.exit(1); }

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await sql`ALTER TABLE episodes ADD COLUMN IF NOT EXISTS payment_date text`;
  const got = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'episodes' AND column_name = 'payment_date'`;
  console.log('OK — episodes.payment_date:', got.length ? '존재' : '(없음)');
} finally {
  await sql.end();
}
