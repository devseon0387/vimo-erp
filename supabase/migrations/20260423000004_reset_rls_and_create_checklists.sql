-- =============================================
-- RLS 정책 수정 + checklists 테이블 생성
-- Supabase 대시보드 > SQL Editor에서 실행
-- =============================================

-- ─── 기존 RLS 정책 교체 (인증 불필요 → 전체 허용) ────────────

drop policy if exists "auth_all_partners"   on partners;
drop policy if exists "auth_all_clients"    on clients;
drop policy if exists "auth_all_projects"   on projects;
drop policy if exists "auth_all_episodes"   on episodes;
drop policy if exists "auth_all_trash"      on trash;
drop policy if exists "auth_all_portfolio"  on portfolio_items;

create policy "allow_all_partners"   on partners        for all using (true) with check (true);
create policy "allow_all_clients"    on clients         for all using (true) with check (true);
create policy "allow_all_projects"   on projects        for all using (true) with check (true);
create policy "allow_all_episodes"   on episodes        for all using (true) with check (true);
create policy "allow_all_trash"      on trash           for all using (true) with check (true);
create policy "allow_all_portfolio"  on portfolio_items for all using (true) with check (true);

-- ─── checklists 테이블 생성 ────────────────────────────────────

create table if not exists checklists (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null default 'default',
  text            text not null,
  completed       boolean default false,
  reminder_time   text,
  notified        boolean default false,
  repeat_type     text,
  repeat_days     int[],
  linked_episode_id     text,
  linked_episode_title  text,
  linked_episode_number int,
  linked_project_id     text,
  linked_project_title  text,
  linked_client_name    text,
  linked_partner_id     text,
  linked_partner_name   text,
  created_at      timestamptz default now()
);

alter table checklists enable row level security;
create policy "allow_all_checklists" on checklists for all using (true) with check (true);
