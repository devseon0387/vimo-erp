-- P2 partners 테이블 RLS 좁히기 (Phase 2): 2026-05-06
-- 기존 정책 `authenticated_partners` 는 모든 인증 사용자(파트너 ERP 가입자 포함)에게
-- partners 테이블 R/W 를 허용. proxy.ts 가 partner role 의 비모 ERP 접근을 차단하지만
-- 방어 심화 차원에서 RLS 로도 vimo_staff(profiles.user_type='staff') 한정으로 좁힘.
--
-- 영향 범위:
--   - SELECT: partners_safe view 가 security_invoker 라 vimo_staff 만 통과
--     일반 staff/매니저는 view 통해 NULL 마스킹된 데이터 받음 (4f6cd04 에서 적용된 가드 그대로 동작)
--   - INSERT/UPDATE/DELETE: dashboard, partners/*, operations/* 페이지에서 호출. 모두 비모 staff 만 사용
--   - createAndMapNewPartner: admin 이 호출 (profiles.user_type='staff') → 통과

-- profiles.user_type='staff' 검사 헬퍼. SECURITY DEFINER 로 profiles RLS 우회.
create or replace function public.is_vimo_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select user_type = 'staff' from public.profiles where id = auth.uid()),
    false
  );
$fn$;

grant execute on function public.is_vimo_staff() to authenticated;

-- 기존 광범위 정책 제거 후 vimo_staff 한정 정책으로 교체
drop policy if exists "authenticated_partners" on public.partners;
drop policy if exists "partners_vimo_staff_all" on public.partners;

create policy "partners_vimo_staff_all" on public.partners
  for all to authenticated
  using (public.is_vimo_staff())
  with check (public.is_vimo_staff());
