-- =============================================
-- Phase 5'-A: 테스트 파트너 1명 수동 생성
-- =============================================
-- 사전 작업:
--   1. Supabase Dashboard → Authentication → Users → "Add user" 클릭
--   2. 이메일·비번 입력 (예: partner-test@vi-mo.kr / Test1234!)
--   3. 아래 v_email 변수에 그 이메일 입력
--   4. 실행
--
-- 이 SQL이 하는 일:
--   1. profiles 생성 (user_type='partner')
--   2. partner_meta 생성 (status='pending', legacy_partner_id=NULL)
--   3. app_access(partner_erp, active) 부여
--   4. app_access(vibox, active) 자동 부여 (Q1=A)
--
-- 결과:
--   파트너 ERP에 그 이메일로 로그인 가능. 5개 페이지 보이지만
--   데이터는 mock (legacy_partner_id 매핑 안 됐으니 진짜 데이터는 빈 상태)
-- =============================================

do $$
declare
  v_user_id uuid;
  v_email text := 'partner-test@vi-mo.kr';  -- ⚠️ 본인이 만든 테스트 이메일로 교체!
begin
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    raise exception '⚠️ auth.users에 이메일 %이 없음. Dashboard에서 먼저 추가하세요.', v_email;
  end if;

  -- 1. profiles
  insert into public.profiles (id, user_type, name)
  values (v_user_id, 'partner', '테스트 파트너')
  on conflict (id) do nothing;

  -- 2. partner_meta (매핑 대기 상태)
  insert into public.partner_meta (profile_id, type, status)
  values (v_user_id, 'freelancer', 'pending')
  on conflict (profile_id) do nothing;

  -- 3. partner_erp 권한
  insert into public.app_access (user_id, app_code, role, status)
  values (v_user_id, 'partner_erp', 'partner', 'active')
  on conflict (user_id, app_code) do nothing;

  -- 4. vibox 자동 부여 (Q1=A)
  insert into public.app_access (user_id, app_code, role, status)
  values (v_user_id, 'vibox', 'member', 'active')
  on conflict (user_id, app_code) do nothing;

  raise notice '✅ 테스트 파트너 % 생성 완료 (user_id: %)', v_email, v_user_id;
end $$;


-- 검증 쿼리
-- select p.user_type, p.name, aa.app_code, aa.status, pm.status as partner_status
-- from public.profiles p
-- left join public.app_access aa on aa.user_id = p.id
-- left join public.partner_meta pm on pm.profile_id = p.id
-- where p.id = (select id from auth.users where email = 'partner-test@vi-mo.kr')
-- order by aa.app_code;


-- 롤백 (테스트 끝나면)
-- delete from public.app_access where user_id = (select id from auth.users where email = 'partner-test@vi-mo.kr');
-- delete from public.partner_meta where profile_id = (select id from auth.users where email = 'partner-test@vi-mo.kr');
-- delete from public.profiles where id = (select id from auth.users where email = 'partner-test@vi-mo.kr');
-- -- auth.users는 Dashboard에서 직접 삭제
