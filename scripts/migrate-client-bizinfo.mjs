// 거래처 사업자정보 컬럼 추가 — 세금계산서(홈택스) 발행 도우미가 복사해줄 재료.
// DB 안전규칙: ALTER TABLE ADD COLUMN IF NOT EXISTS(멱등), 순수 추가, DROP 없음.
// 컬럼: business_number(사업자등록번호)·corp_name(상호/법인명)·ceo_name(대표자)
//       ·biz_type(업태)·biz_item(종목)·tax_email(세금계산서 수신 이메일). address는 기존 컬럼 재사용.
// 실행: node scripts/migrate-client-bizinfo.mjs  (MIGRATION_DATABASE_URL = 직결 5432)
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
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_number text`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS corp_name text`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS ceo_name text`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS biz_type text`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS biz_item text`;
  await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_email text`;

  const got = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients'
      AND column_name IN ('business_number','corp_name','ceo_name','biz_type','biz_item','tax_email')
    ORDER BY column_name`;
  console.log('OK — clients 사업자정보 컬럼:', got.map((r) => r.column_name).join(', ') || '(없음)');
} finally {
  await sql.end();
}
