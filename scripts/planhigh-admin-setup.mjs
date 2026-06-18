/**
 * planhigh 전용 어드민 셋업 (멱등). Supabase GoTrue 어드민 계정 대체.
 *
 * 하는 일:
 *   1) planhigh_admins 테이블 보장 (CREATE TABLE IF NOT EXISTS — 추가형, 기존 무영향)
 *   2) 주어진 이메일/비밀번호로 어드민 upsert (bcrypt cost 10)
 *
 * 사용:
 *   node scripts/planhigh-admin-setup.mjs <email> <password>
 *
 * 연결: MIGRATION_DATABASE_URL(직접 5432) 우선, 없으면 DATABASE_URL. .env.local 자동 로드.
 * 주의: 이 스크립트는 라이브 Baseon vimoerp 에 쓰기(DDL+1행)를 한다. 컷오버 단계에서 의식적으로 실행할 것.
 */
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

function loadEnvLocal() {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('사용법: node scripts/planhigh-admin-setup.mjs <email> <password>');
    process.exit(1);
  }
  loadEnvLocal();
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('MIGRATION_DATABASE_URL / DATABASE_URL 미설정');
    process.exit(1);
  }

  const sql = postgres(url, { prepare: false });
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS planhigh_admins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_planhigh_admins_email_lower
        ON planhigh_admins (lower(email))
    `;

    const hash = await bcrypt.hash(password, 10);
    const normEmail = email.trim().toLowerCase();
    await sql`
      INSERT INTO planhigh_admins (email, password_hash)
      VALUES (${normEmail}, ${hash})
      ON CONFLICT (lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `;

    const [{ count }] = await sql`SELECT count(*)::int AS count FROM planhigh_admins`;
    console.log(`OK — planhigh_admins 어드민 설정 완료 (${normEmail}). 총 ${count}명.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
