-- =============================================
-- 운영 DB에 잔존하는 테스트 파트너 계정 제거 (CRITICAL)
-- =============================================
-- 20260426000002_seed_test_partners.sql 가 vimotest.com 계정 3개를
-- auth.users에 직접 INSERT 했고, 20260426000010_remove_demo_seed.sql 는
-- 프로젝트/회차만 지웠을 뿐 auth.users는 남겨둠.
--
-- 시드 SQL의 비밀번호가 노출되면 누구든 partner ERP/Vibox에 로그인 가능.
-- "운영 DB에 데모 데이터 시드 금지" 규칙 위반 정정.
--
-- 작업 순서 (FK 안전):
--   1) 연관 app_access / partner_meta / profiles 삭제
--   2) impersonation_audit 등 감사 row는 보존 (admin_id/target_user_id NULL set)
--   3) auth.users 삭제
--
-- IF EXISTS / 멱등성 보장. 이미 지운 환경에서도 안전.
-- =============================================

do $$
declare
  v_test_emails text[] := array[
    'jsh@vimotest.com',
    'syj@vimotest.com',
    'yhj@vimotest.com'
  ];
  v_ids uuid[];
begin
  -- 대상 user id 수집
  select coalesce(array_agg(id), array[]::uuid[])
    into v_ids
  from auth.users
  where email = any(v_test_emails);

  if array_length(v_ids, 1) is null then
    raise notice 'test partner 계정이 이미 제거됨, skip';
    return;
  end if;

  raise notice '제거 대상 user id: %', v_ids;

  -- 1) impersonation_audit 의 target_user_id 참조 끊기 (감사 row는 보존)
  if exists (select 1 from pg_tables where schemaname='public' and tablename='impersonation_audit') then
    update public.impersonation_audit
      set target_user_id = null
      where target_user_id = any(v_ids);
    update public.impersonation_audit
      set admin_id = null
      where admin_id = any(v_ids);
  end if;

  -- 2) app_access 삭제
  delete from public.app_access where user_id = any(v_ids);

  -- 3) partner_meta 삭제
  if exists (select 1 from pg_tables where schemaname='public' and tablename='partner_meta') then
    delete from public.partner_meta where profile_id = any(v_ids);
  end if;

  -- 4) profiles 삭제
  delete from public.profiles where id = any(v_ids);

  -- 5) user_profiles 삭제 (혹시 백필됐을 경우)
  if exists (select 1 from pg_tables where schemaname='public' and tablename='user_profiles') then
    delete from public.user_profiles where id = any(v_ids);
  end if;

  -- 6) auth.users 삭제 (CASCADE는 일부 supabase 환경에서만 동작 — 명시 삭제)
  delete from auth.users where id = any(v_ids);

  raise notice '테스트 파트너 % 명 제거 완료', array_length(v_ids, 1);
end
$$;
