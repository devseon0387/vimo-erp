-- =============================================
-- profiles에 email 컬럼 추가 + 트리거 업데이트
-- =============================================
-- 목표:
--   profiles 쿼리 시 매번 auth.users 조인 없이 email 읽을 수 있게.
--   가입 트리거가 auth.users.email을 profiles.email로 자동 복사.
-- =============================================

-- 1. 컬럼 추가 (멱등)
alter table public.profiles
  add column if not exists email text;

create index if not exists idx_profiles_email
  on public.profiles(email);


-- 2. 기존 profile들의 email 백필 (auth.users에서 가져옴)
update public.profiles p
set email = au.email
from auth.users au
where au.id = p.id
  and (p.email is null or p.email = '');


-- 3. 가입 트리거 업데이트 — email 함께 저장
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

  if v_app_source is null or v_app_source != 'partner_erp' then
    return new;
  end if;

  v_name := coalesce(nullif(new.raw_user_meta_data->>'name', ''), new.email);
  v_type := coalesce(nullif(new.raw_user_meta_data->>'type', ''), 'freelancer');

  -- profile (email 포함)
  insert into public.profiles (id, user_type, name, email, phone, created_at)
  values (
    new.id,
    'partner',
    v_name,
    new.email,
    new.raw_user_meta_data->>'phone',
    now()
  )
  on conflict (id) do nothing;

  -- partner_meta
  insert into public.partner_meta (profile_id, type, status)
  values (new.id, v_type, 'pending')
  on conflict (profile_id) do nothing;

  -- partner_erp 권한
  insert into public.app_access (user_id, app_code, role, status)
  values (new.id, 'partner_erp', 'partner', 'active')
  on conflict (user_id, app_code) do nothing;

  -- vibox 자동 부여
  insert into public.app_access (user_id, app_code, role, status)
  values (new.id, 'vibox', 'member', 'active')
  on conflict (user_id, app_code) do nothing;

  return new;
end;
$$;
