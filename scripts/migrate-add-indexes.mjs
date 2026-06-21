// episodes/clients/expenses/inquiries 인덱스 추가 — 정산·관리·정렬 쿼리 가속.
// DB 안전규칙: CREATE INDEX IF NOT EXISTS(멱등), 순수 추가, DROP 없음.
// ★ 운영(Baseon) 적용은 이 스크립트로만. drizzle-kit push 절대 금지(introspect 산물과 어긋난 객체 다수).
// 실행: node scripts/migrate-add-indexes.mjs  (MIGRATION_DATABASE_URL = 직결 5432, 한가한 시간대 권장 — 봇 upsert 락 대기 방지)
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
  // episodes — getAllEpisodes(ORDER BY created_at DESC), 파트너 분기(assignee), 정산 분기(manager), 회차(project_id,episode_number), 청구월(payment_due_date)
  await sql`CREATE INDEX IF NOT EXISTS idx_episodes_created_at ON episodes (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_episodes_assignee ON episodes (assignee)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_episodes_project_epnum ON episodes (project_id, episode_number DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_episodes_payment_due_date ON episodes (payment_due_date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_episodes_manager ON episodes (manager)`;
  // clients / expenses / inquiries — 정렬·필터 컬럼
  await sql`CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses (expense_date DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries (status)`;

  const idx = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('episodes','clients','expenses','inquiries')
      AND indexname LIKE 'idx_%'
    ORDER BY indexname`;
  console.log(`OK — 추가/확인된 idx_ 인덱스 ${idx.length}개:`);
  idx.forEach(r => console.log('  -', r.indexname));
} finally {
  await sql.end();
}
