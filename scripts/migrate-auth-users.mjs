// Phase 3 인증 슬라이스 이전: Supabase user_profiles + auth.users(bcrypt 해시) → vimoerp user_profiles.
// 멱등(id 기준 upsert). 데이터 cutover(Phase 5) 전에 5명 인증만 먼저 옮겨 Auth.js를 실계정으로 검증.
// 비번은 출력하지 않는다.
import postgres from 'postgres';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const src = postgres(env.SUPABASE_DB_URL, { prepare: false, max: 2, ssl: 'require' });
const dst = postgres(env.DIRECT_URL || env.MIGRATION_DATABASE_URL, { prepare: false, max: 2 });

try {
  // 0. 스키마 안전망 (fresh dump엔 자체 컬럼이 없음 — 멱등)
  await dst`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS password_hash text`;
  await dst`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz`;

  // Supabase: user_profiles + auth.users.encrypted_password (id 조인)
  const rows = await src`
    select p.id, p.role, p.name, p.email, p.approved, p.needs_password_change,
           p.tutorial_done, p.created_at, u.encrypted_password
    from public.user_profiles p
    join auth.users u on u.id = p.id
  `;
  console.log('Supabase user_profiles(인증가능):', rows.length, '명');

  // app_access vimo_erp 상태 확인 (게이트 단순화 안전성 검증용)
  const access = await src`
    select user_id, status from public.app_access where app_code = 'vimo_erp'
  `;
  const activeIds = new Set(access.filter((a) => a.status === 'active').map((a) => a.user_id));
  console.log('app_access vimo_erp active:', activeIds.size, '/ 전체 app_access행', access.length);

  let migrated = 0;
  for (const r of rows) {
    await dst`
      insert into user_profiles (id, role, name, email, approved, needs_password_change, tutorial_done, created_at, password_hash)
      values (${r.id}, ${r.role}, ${r.name}, ${r.email}, ${r.approved}, ${r.needs_password_change ?? false},
              ${r.tutorial_done ?? {}}, ${r.created_at}, ${r.encrypted_password})
      on conflict (id) do update set
        role = excluded.role, name = excluded.name, email = excluded.email,
        approved = excluded.approved, needs_password_change = excluded.needs_password_change,
        password_hash = excluded.password_hash
    `;
    migrated++;
  }

  const check = await dst`select count(*)::int c, count(password_hash)::int h from user_profiles`;
  console.log(`이전 완료: ${migrated}명 → vimoerp user_profiles 총 ${check[0].c}행, 해시 보유 ${check[0].h}행`);
  // 역할 분포 (비번 미출력)
  const roles = await dst`select role, count(*)::int c, count(*) filter (where approved) ac from user_profiles group by role order by role`;
  console.log('역할/승인:', JSON.stringify(roles));
  await src.end(); await dst.end();
} catch (e) {
  console.error('이전 실패:', e.message);
  await src.end(); await dst.end();
  process.exit(1);
}
