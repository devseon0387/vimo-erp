-- P1 partners 민감 컬럼 가드: 2026-05-06
-- partners.email / phone / bank / bank_account 는 admin role 만 조회 가능.
-- 일반 staff/매니저는 view 를 통해 NULL 마스킹된 데이터를 받음.
-- 클라 코드(getPartners) 는 partners_safe view 로 SELECT 하도록 변경.

-- is_admin() — user_profiles.role = 'admin' 인 사용자만 true. SECURITY DEFINER 로
-- user_profiles RLS 우회 (단, role=admin 체크만 노출되므로 정보 누출 X).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select role = 'admin' from public.user_profiles where id = auth.uid()),
    false
  );
$fn$;

grant execute on function public.is_admin() to authenticated;

-- partners_safe view: 민감 컬럼은 admin 만 노출. security_invoker=true 로 호출자 RLS 적용.
create or replace view public.partners_safe
with (security_invoker = true) as
  select
    p.id,
    p.name,
    p.company,
    p.partner_type,
    p.role,
    p.position,
    p.job_title,
    p.job_rank,
    p.status,
    p.generation,
    p.profile_image,
    p.created_at,
    -- 민감 컬럼: admin 만 노출, 그 외는 NULL
    case when public.is_admin() then p.email        else null end as email,
    case when public.is_admin() then p.phone        else null end as phone,
    case when public.is_admin() then p.bank         else null end as bank,
    case when public.is_admin() then p.bank_account else null end as bank_account
  from public.partners p;

grant select on public.partners_safe to authenticated;

comment on view public.partners_safe is
  'partners 의 민감 컬럼(email/phone/bank/bank_account)을 admin 외에는 NULL 마스킹한 view. 일반 클라 SELECT 는 이 view 를 사용. admin 전용 뷰가 필요하면 partners 테이블을 직접 SELECT(RLS 통과 시).';
