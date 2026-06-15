// Phase 3 정체성 통합 이전: Supabase universe(apps/profiles/partner_meta/app_access) + 비번해시 → vimoerp.
// FK 순서: apps → profiles → partner_meta → app_access. 멱등(upsert). 비번 미출력.
// legacy_partner_id 는 partners(Phase5 미이전) FK 때문에 NULL 로 두고 cutover 때 재링크.
import postgres from 'postgres';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const src = postgres(env.SUPABASE_DB_URL, { prepare: false, max: 2, ssl: 'require' });
const dst = postgres(env.DIRECT_URL || env.MIGRATION_DATABASE_URL, { prepare: false, max: 2 });

try {
  // 0. 스키마 적용 (멱등)
  await dst`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text`;
  await dst`CREATE TABLE IF NOT EXISTS impersonation_audit (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid not null,
    target_profile_id uuid not null,
    target_email text,
    reason text,
    ip_address text,
    user_agent text,
    created_at timestamptz not null default now()
  )`;

  // 1. apps
  const apps = await src`select code, name, domain, sso_enabled, description, created_at from public.apps`;
  for (const a of apps) {
    await dst`insert into apps (code, name, domain, sso_enabled, description, created_at)
      values (${a.code}, ${a.name}, ${a.domain}, ${a.sso_enabled}, ${a.description}, ${a.created_at})
      on conflict (code) do update set name=excluded.name, domain=excluded.domain, sso_enabled=excluded.sso_enabled, description=excluded.description`;
  }

  // 2. profiles (+ password_hash from auth.users)
  const profs = await src`
    select p.id, p.user_type, p.name, p.avatar_url, p.phone, p.email, p.created_at, p.updated_at, u.encrypted_password
    from public.profiles p left join auth.users u on u.id = p.id`;
  for (const p of profs) {
    await dst`insert into profiles (id, user_type, name, avatar_url, phone, email, created_at, updated_at, password_hash)
      values (${p.id}, ${p.user_type}, ${p.name}, ${p.avatar_url}, ${p.phone}, ${p.email}, ${p.created_at}, ${p.updated_at}, ${p.encrypted_password})
      on conflict (id) do update set user_type=excluded.user_type, name=excluded.name, avatar_url=excluded.avatar_url,
        phone=excluded.phone, email=excluded.email, password_hash=excluded.password_hash`;
  }

  // 3. partner_meta (legacy_partner_id → null: partners 미이전)
  const pms = await src`select * from public.partner_meta`;
  for (const m of pms) {
    await dst`insert into partner_meta (profile_id, type, tier, bank_name, bank_account, bank_holder, work_formats,
        status, started_at, legacy_partner_id, legacy_mapped_at, legacy_mapped_by, created_at, updated_at)
      values (${m.profile_id}, ${m.type}, ${m.tier}, ${m.bank_name}, ${m.bank_account}, ${m.bank_holder},
        ${m.work_formats}, ${m.status}, ${m.started_at}, ${null}, ${m.legacy_mapped_at}, ${m.legacy_mapped_by},
        ${m.created_at}, ${m.updated_at})
      on conflict (profile_id) do update set type=excluded.type, tier=excluded.tier, status=excluded.status,
        bank_name=excluded.bank_name, bank_account=excluded.bank_account, bank_holder=excluded.bank_holder,
        work_formats=excluded.work_formats`;
  }

  // 4. app_access
  const aas = await src`select id, user_id, app_code, role, status, joined_at, last_accessed_at from public.app_access`;
  for (const a of aas) {
    await dst`insert into app_access (id, user_id, app_code, role, status, joined_at, last_accessed_at)
      values (${a.id}, ${a.user_id}, ${a.app_code}, ${a.role}, ${a.status}, ${a.joined_at}, ${a.last_accessed_at})
      on conflict (id) do update set role=excluded.role, status=excluded.status, last_accessed_at=excluded.last_accessed_at`;
  }

  // 검증
  const c = await dst`select
    (select count(*)::int from apps) apps,
    (select count(*)::int from profiles) profiles,
    (select count(*) filter (where password_hash is not null)::int from profiles) prof_hash,
    (select count(*)::int from partner_meta) partner_meta,
    (select count(*)::int from app_access) app_access`;
  console.log('이전 완료:', JSON.stringify(c[0]));
  const byType = await dst`select user_type, count(*)::int c from profiles group by 1 order by 1`;
  console.log('profiles user_type:', JSON.stringify(byType));
  await src.end(); await dst.end();
} catch (e) {
  console.error('이전 실패:', e.message);
  await src.end(); await dst.end();
  process.exit(1);
}
