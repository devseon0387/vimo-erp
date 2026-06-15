-- 파트너 활동 기수 이력 + 파트너 이슈/메모 테이블 신설: 2026-05-28
-- 기존엔 브라우저 localStorage 에 `partner_history_<id>` / `partner_issues_<id>` 키로
-- 저장. 디바이스 격리되어 다른 PC 에서 못 보고 백업도 안 됨. DB 로 이전.
--
-- 안전 규칙:
--   - CREATE TABLE 은 IF NOT EXISTS (멱등성)
--   - RLS 는 is_vimo_staff() 헬퍼로 vimo_staff 한정 (partners 테이블과 동일 정책 라인)
--   - 외래키 ON DELETE CASCADE: 파트너 삭제 시 히스토리/이슈도 같이 사라짐

-- ─── partner_history ────────────────────────────────────────────
create table if not exists public.partner_history (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners(id) on delete cascade,
  generation  int  not null,
  start_date  date not null,
  end_date    date,
  created_at  timestamptz not null default now()
);

create index if not exists partner_history_partner_id_idx
  on public.partner_history(partner_id);

alter table public.partner_history enable row level security;

drop policy if exists "partner_history_vimo_staff_all" on public.partner_history;
create policy "partner_history_vimo_staff_all" on public.partner_history
  for all to authenticated
  using (public.is_vimo_staff())
  with check (public.is_vimo_staff());

-- ─── partner_issues ─────────────────────────────────────────────
create table if not exists public.partner_issues (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists partner_issues_partner_id_idx
  on public.partner_issues(partner_id);

alter table public.partner_issues enable row level security;

drop policy if exists "partner_issues_vimo_staff_all" on public.partner_issues;
create policy "partner_issues_vimo_staff_all" on public.partner_issues
  for all to authenticated
  using (public.is_vimo_staff())
  with check (public.is_vimo_staff());

-- realtime 구독 가능하게 publication 에 추가 (이미 있으면 무시)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('partner_history', 'partner_issues')
  ) then
    alter publication supabase_realtime add table public.partner_history;
    alter publication supabase_realtime add table public.partner_issues;
  end if;
exception when others then
  -- publication 없거나 권한 없으면 무시 (개발 환경)
  null;
end$$;
