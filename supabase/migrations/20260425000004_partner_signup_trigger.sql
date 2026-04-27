-- =============================================
-- Phase 5'-D: 파트너 가입 자동 트리거
-- =============================================
-- 목표:
--   파트너 ERP에서 회원가입(supabase.auth.signUp) 시 자동으로:
--   1. profiles 생성 (user_type='partner')
--   2. partner_meta 생성 (status='pending', legacy_partner_id=NULL)
--   3. app_access(partner_erp, active) 부여
--   4. app_access(vibox, active) 자동 부여 (Q1=A)
--
-- 안전 분기:
--   - raw_user_meta_data->>'app_source' = 'partner_erp' 인 경우만 처리
--   - 다른 앱(비모 ERP staff Dashboard 추가 등)은 영향 없음
--
-- atomic 보장 (함정 #3):
--   트리거 안에서 모든 INSERT 처리 → auth.users INSERT 트랜잭션과 함께 commit
--   중간 실패 시 auth.users도 롤백됨 (Supabase가 처리)
--
-- SECURITY DEFINER:
--   함수가 RLS 우회로 INSERT 가능 (가입자는 아직 권한 없으니 필수)
-- =============================================

create or replace function public.handle_new_partner_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app_source text;
  v_name text;
  v_type text;
begin
  v_app_source := new.raw_user_meta_data->>'app_source';

  -- partner_erp 가입만 자동 처리. 다른 경로는 무시.
  if v_app_source is null or v_app_source != 'partner_erp' then
    return new;
  end if;

  v_name := coalesce(nullif(new.raw_user_meta_data->>'name', ''), new.email);
  v_type := coalesce(nullif(new.raw_user_meta_data->>'type', ''), 'freelancer');

  -- 1. profile (user_type='partner' 필수 — check_app_access_type 트리거가 검증)
  insert into public.profiles (id, user_type, name, phone, created_at)
  values (
    new.id,
    'partner',
    v_name,
    new.raw_user_meta_data->>'phone',
    now()
  )
  on conflict (id) do nothing;

  -- 2. partner_meta (매핑 대기 상태)
  insert into public.partner_meta (profile_id, type, status)
  values (new.id, v_type, 'pending')
  on conflict (profile_id) do nothing;

  -- 3. partner_erp 권한
  insert into public.app_access (user_id, app_code, role, status)
  values (new.id, 'partner_erp', 'partner', 'active')
  on conflict (user_id, app_code) do nothing;

  -- 4. vibox 자동 부여 (Q1=A)
  insert into public.app_access (user_id, app_code, role, status)
  values (new.id, 'vibox', 'member', 'active')
  on conflict (user_id, app_code) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_partner_signup() is
  '파트너 ERP 가입 시 자동으로 profile + partner_meta + app_access 생성';


-- 트리거 등록 (auth.users INSERT 후)
drop trigger if exists on_auth_partner_signup on auth.users;
create trigger on_auth_partner_signup
  after insert on auth.users
  for each row execute function public.handle_new_partner_signup();


-- =============================================
-- 검증
-- =============================================
--
-- -- 트리거 등록 확인
-- select tgname, tgrelid::regclass, tgfoid::regprocedure
-- from pg_trigger
-- where tgname = 'on_auth_partner_signup';
--
-- -- 가입 후 자동 생성 확인 (가입 후 본인 이메일로)
-- select p.user_type, pm.status, aa.app_code, aa.status
-- from public.profiles p
-- left join public.partner_meta pm on pm.profile_id = p.id
-- left join public.app_access aa on aa.user_id = p.id
-- where p.id = (select id from auth.users where email = '본인 이메일');
--   -- partner_erp + vibox 2개 row, 둘 다 status='active'


-- =============================================
-- ROLLBACK
-- =============================================
--
-- drop trigger if exists on_auth_partner_signup on auth.users;
-- drop function if exists public.handle_new_partner_signup();
