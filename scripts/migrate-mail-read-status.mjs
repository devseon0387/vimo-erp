// 메일 읽음 상태 마이그레이션 — mail_read_status (사용자별 읽음 표시).
// DB 안전규칙: CREATE TABLE/INDEX 전부 IF NOT EXISTS(멱등), DROP 없음, 순수 추가.
// FK 없음(sent_emails 선례) — user_id는 user_profiles(id)이지만 하드 FK 미설정으로 삽입 리스크 0.
// mail_uid = 받은 메일 고유키(S3 객체키 또는 샘플 파일명, inbound.ts uid).
// 실행: node scripts/migrate-mail-read-status.mjs  (MIGRATION_DATABASE_URL = 직결 5432)
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
  await sql`
    CREATE TABLE IF NOT EXISTS mail_read_status (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      mail_uid text NOT NULL,
      read_at timestamptz DEFAULT now()
    )`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_mail_read_status_user_uid
      ON mail_read_status (user_id, mail_uid)`;

  const t = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name = 'mail_read_status'`;
  console.log('OK — 테이블:', t.map((r) => r.table_name).join(', ') || '(없음)');
  const c = await sql`SELECT count(*)::int AS n FROM mail_read_status`;
  console.log('mail_read_status 행 수:', c[0].n);
} finally {
  await sql.end();
}
