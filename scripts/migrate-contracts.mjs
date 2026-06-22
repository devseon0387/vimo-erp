// 계약(contracts) 테이블 신규 생성 + projects.contract_id FK 추가 (영업 퍼널 문의→계약→프로젝트).
// DB 안전규칙: CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS(멱등), DROP 없음.
//
// 모델 결정:
//   - 상태 6단계: draft·sent·signed·active·completed·cancelled
//   - 계약:프로젝트 = 1:N (projects.contract_id 가 계약을 가리킴)
//   - contract_type: single(단건)·annual(연간)·retainer(리테이너)
//   - 금액(numeric)·날짜(date)는 MVP 슬림 컬럼만
//
// 순서 주의: projects ↔ contracts 가 서로 참조(contracts.inquiry/client, projects.contract_id)이므로
//   contracts 를 먼저 생성한 뒤 projects 에 contract_id 컬럼을 ALTER 로 붙인다.
//
// 실행: node scripts/migrate-contracts.mjs  (MIGRATION_DATABASE_URL = 직결 5432)
// ⚠️ drizzle-kit push 금지 — schema.ts 는 introspect 산물(운영과 1:1 손편집). 마이그레이션은 이 스크립트로만.
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
  // 1) contracts 테이블 (먼저 생성 — projects.contract_id 가 이 테이블을 참조)
  await sql`
    CREATE TABLE IF NOT EXISTS contracts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id uuid NOT NULL REFERENCES clients(id),
      inquiry_id uuid REFERENCES inquiries(id),
      title text NOT NULL,
      contract_type text NOT NULL DEFAULT 'single',
      supply_amount numeric DEFAULT '0',
      vat_amount numeric DEFAULT '0',
      total_amount numeric DEFAULT '0',
      partner_payment numeric DEFAULT '0',
      management_fee numeric DEFAULT '0',
      margin_rate numeric DEFAULT '0',
      start_date date,
      end_date date,
      status text NOT NULL DEFAULT 'draft',
      contract_date date DEFAULT CURRENT_DATE,
      signed_date date,
      payment_terms text,
      manager_id uuid,
      memo text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      CONSTRAINT contracts_status_check CHECK (status IN ('draft','sent','signed','active','completed','cancelled')),
      CONSTRAINT contracts_contract_type_check CHECK (contract_type IN ('single','annual','retainer'))
    )`;

  // 2) projects.contract_id (1:N — 여러 프로젝트가 한 계약을 가리킴). contracts 생성 후 ALTER.
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES contracts(id)`;

  // 3) 인덱스 4종
  await sql`CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON contracts (client_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts (status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts (end_date)`;

  // 검증 출력 — contracts 컬럼
  const cols = await sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts'
    ORDER BY ordinal_position`;
  console.log('OK — contracts 컬럼:');
  for (const c of cols) console.log(`  - ${c.column_name} (${c.data_type})${c.column_default ? ' default ' + c.column_default : ''}`);

  // 검증 출력 — projects.contract_id 존재 여부
  const pcol = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'contract_id'`;
  console.log('OK — projects.contract_id:', pcol.length ? '존재' : '(없음)');

  // 검증 출력 — contracts 인덱스
  const idx = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'contracts'
    ORDER BY indexname`;
  console.log('OK — contracts 인덱스:', idx.map((r) => r.indexname).join(', ') || '(없음)');
} finally {
  await sql.end();
}
