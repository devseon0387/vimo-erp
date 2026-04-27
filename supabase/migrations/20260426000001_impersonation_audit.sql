-- =============================================
-- 임퍼소네이션 감사 로그
-- =============================================
-- 비모 admin이 파트너 ERP를 임시로 그 파트너 시점으로 보는 기능.
-- 누가 누구로 언제 들어갔는지 기록.
-- =============================================

create table if not exists public.impersonation_audit (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references public.profiles(id) on delete restrict,
  target_user_id  uuid not null references public.profiles(id) on delete restrict,
  target_email    text not null,
  reason          text,                              -- (선택) 임퍼소네이션 이유
  ip_address      inet,                              -- (선택) admin의 IP
  user_agent      text,                              -- (선택) admin의 브라우저
  created_at      timestamptz not null default now()
);

create index if not exists idx_impersonation_audit_admin
  on public.impersonation_audit(admin_id, created_at desc);

create index if not exists idx_impersonation_audit_target
  on public.impersonation_audit(target_user_id, created_at desc);

comment on table public.impersonation_audit is
  '임퍼소네이션 감사 로그 — admin이 다른 user로 로그인할 때마다 기록';


-- RLS: admin만 조회 가능
alter table public.impersonation_audit enable row level security;

drop policy if exists impersonation_audit_admin_select on public.impersonation_audit;
create policy impersonation_audit_admin_select on public.impersonation_audit
  for select using (public.is_vimo_admin());

-- INSERT는 service role만 (API 라우트에서)
-- 별도 정책 없음 → authenticated 차단됨
