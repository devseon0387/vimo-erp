-- =============================================
-- 초대 토큰 atomic 소비 (TOCTOU 차단)
-- =============================================
-- 20260426000004_security_hardening.sql 의 handle_new_partner_signup() 는
-- SELECT id WHERE token=... AND status='pending'  → ... → UPDATE SET status='used'
-- 사이에 row lock 없음. 동시 SignUp 시 같은 토큰으로 2 계정 생성 가능.
--
-- 수정: UPDATE ... WHERE status='pending' RETURNING 로 원자화.
-- UPDATE 가 0 row 반환하면 토큰 이미 소비됨 → exception.
-- =============================================

create or replace function public.handle_new_partner_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app_source text;
  v_invite_token text;
  v_invite_id uuid;
  v_invite_email text;
  v_invite_legacy_id uuid;
  v_name text;
  v_type text;
begin
  v_app_source := new.raw_user_meta_data->>'app_source';

  if v_app_source is null or v_app_source != 'partner_erp' then
    return new;
  end if;

  -- 토큰 필수
  v_invite_token := new.raw_user_meta_data->>'invite_token';
  if v_invite_token is null or v_invite_token = '' then
    raise exception '초대 토큰이 필요합니다.';
  end if;

  -- atomic 토큰 소비: UPDATE ... WHERE status='pending' RETURNING
  -- 동시 가입 시 한쪽만 UPDATE 성공, 다른쪽은 0 row → exception.
  update public.partner_invites
    set status = 'used', used_at = now(), used_by = new.id
    where token = v_invite_token
      and status = 'pending'
      and expires_at > now()
    returning id, invited_email, legacy_hint_id
    into v_invite_id, v_invite_email, v_invite_legacy_id;

  if v_invite_id is null then
    raise exception '유효하지 않거나 이미 사용된 초대 링크입니다.';
  end if;

  -- 이메일 고정 옵션
  if v_invite_email is not null and v_invite_email != '' and lower(v_invite_email) != lower(new.email) then
    raise exception '초대된 이메일(%) 과 가입 이메일이 다릅니다.', v_invite_email;
  end if;

  v_name := coalesce(nullif(new.raw_user_meta_data->>'name', ''), new.email);
  v_type := coalesce(nullif(new.raw_user_meta_data->>'type', ''), 'freelancer');

  -- profile
  insert into public.profiles (id, user_type, name, email, phone, created_at)
  values (
    new.id, 'partner', v_name, new.email,
    new.raw_user_meta_data->>'phone',
    now()
  )
  on conflict (id) do nothing;

  -- partner_meta
  insert into public.partner_meta (profile_id, type, status, legacy_partner_id)
  values (
    new.id, v_type,
    case when v_invite_legacy_id is not null then 'active' else 'pending' end,
    v_invite_legacy_id
  )
  on conflict (profile_id) do nothing;

  -- partner_erp 권한
  insert into public.app_access (user_id, app_code, role, status)
  values (new.id, 'partner_erp', 'partner', 'active')
  on conflict (user_id, app_code) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_partner_signup() is
  '파트너 ERP 가입 트리거. invite token 을 atomic UPDATE 로 소비 (TOCTOU 차단).';
