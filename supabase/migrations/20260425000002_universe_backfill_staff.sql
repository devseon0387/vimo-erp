-- =============================================
-- 비모 유니버스 인증 코어 — Phase 3: 기존 staff 백필
-- =============================================
-- 목표:
--   기존 비모 ERP의 user_profiles 사용자들을 새 시스템에 자동 등록:
--   1. user_profiles → profiles (user_type='staff' 일괄)
--   2. profiles → vimo_staff (빈 메타 row, 추후 부서/직책 채움)
--   3. user_profiles → app_access(vimo_erp, status 기반 active/suspended)
--
-- 전제:
--   "비모 팀원은 운영자만" — 기존 user_profiles 사용자는 모두 staff로 처리
--   파트너는 백필 안 함 (가입 시점에 동적 생성)
--
-- 안전장치:
--   - 백필 전 user_profiles 스냅샷 자동 생성 (롤백용)
--   - auth.users에 실제로 존재하는 user만 백필 (FK 위반 방지)
--   - 멱등성: 재실행해도 안전 (ON CONFLICT)
-- =============================================

-- ---------------------------------------------
-- 0. 안전 스냅샷 (롤백 대비)
-- ---------------------------------------------
create table if not exists public.user_profiles_snapshot_20260425 as
  select * from public.user_profiles;

comment on table public.user_profiles_snapshot_20260425 is
  '2026-04-25 universe 마이그레이션 전 user_profiles 스냅샷 — 안정 운영 후 drop';


-- ---------------------------------------------
-- 1. profiles 백필 — 모든 기존 사용자를 staff로
-- ---------------------------------------------
insert into public.profiles (id, user_type, name, created_at)
select
  up.id,
  'staff' as user_type,
  coalesce(
    nullif(au.raw_user_meta_data->>'name', ''),
    au.email,
    'Unknown'
  ) as name,
  now() as created_at
from public.user_profiles up
join auth.users au on au.id = up.id
on conflict (id) do nothing;


-- ---------------------------------------------
-- 2. vimo_staff 백필 — 빈 메타 row (부서/직책은 추후 admin이 채움)
-- ---------------------------------------------
insert into public.vimo_staff (profile_id)
select p.id
from public.profiles p
where p.user_type = 'staff'
  and exists (select 1 from public.user_profiles where id = p.id)
on conflict (profile_id) do nothing;


-- ---------------------------------------------
-- 3. app_access(vimo_erp) 백필
-- ---------------------------------------------
-- 활성 기준:
--   - approved = true → status='active'
--   - role = 'admin' → status='active' (approved와 무관하게)
--   - 그 외 → status='suspended' (Phase 4에서 새 검증 통과 못하므로 사실상 차단)
--
-- role 매핑:
--   - user_profiles.role 값을 그대로 옮김 (admin, manager, member 등)
--   - role이 null/비어있으면 'member'

insert into public.app_access (user_id, app_code, role, status)
select
  up.id,
  'vimo_erp',
  coalesce(nullif(up.role, ''), 'member') as role,
  case
    when up.approved = true or up.role = 'admin' then 'active'
    else 'suspended'
  end as status
from public.user_profiles up
where exists (select 1 from public.profiles where id = up.id)
on conflict (user_id, app_code) do nothing;


-- =============================================
-- 검증 쿼리 (참고용 — 적용 후 별도 실행)
-- =============================================
--
-- -- 1) row count 비교 — 모두 같아야 함
-- select
--   (select count(*) from public.user_profiles) as user_profiles_count,
--   (select count(*) from public.profiles) as profiles_count,
--   (select count(*) from public.vimo_staff) as vimo_staff_count,
--   (select count(*) from public.app_access where app_code = 'vimo_erp') as vimo_access_count;
--
-- -- 2) 누락된 user 확인 (0 rows이면 완벽)
-- select up.id, up.role, up.approved
-- from public.user_profiles up
-- left join public.app_access aa
--   on aa.user_id = up.id and aa.app_code = 'vimo_erp'
-- where aa.id is null;
--
-- -- 3) status 분포 확인
-- select status, count(*) from public.app_access
-- where app_code = 'vimo_erp'
-- group by status;
--
-- -- 4) 본인 계정 정상 백필됐는지 확인
-- --    (Supabase SQL Editor는 service_role로 실행되므로 RLS 우회됨 — 모든 row 보임)
-- select p.id, p.user_type, p.name, aa.role, aa.status
-- from public.profiles p
-- join public.app_access aa on aa.user_id = p.id
-- where aa.app_code = 'vimo_erp'
-- order by aa.status, p.name;


-- =============================================
-- ROLLBACK (필요 시)
-- =============================================
--
-- -- 백필한 row만 정확히 제거 (user_profiles 기반)
-- delete from public.app_access
-- where app_code = 'vimo_erp'
--   and user_id in (select id from public.user_profiles_snapshot_20260425);
--
-- delete from public.vimo_staff
-- where profile_id in (select id from public.user_profiles_snapshot_20260425);
--
-- delete from public.profiles
-- where id in (select id from public.user_profiles_snapshot_20260425);
--
-- -- 스냅샷 정리 (Phase 4 안정 후)
-- -- drop table public.user_profiles_snapshot_20260425;
