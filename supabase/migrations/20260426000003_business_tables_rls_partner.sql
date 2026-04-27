-- =============================================
-- Phase 5'-B: 비즈니스 테이블 RLS 확장 (파트너 접근)
-- =============================================
-- 모든 ID 비교는 ::text 캐스트로 통일 (text vs uuid 충돌 방지)
-- =============================================

-- ---------------------------------------------
-- 1. 헬퍼 함수
-- ---------------------------------------------
create or replace function public.is_vimo_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_access
    where user_id = auth.uid()
      and app_code = 'vimo_erp'
      and status = 'active'
  );
$$;

comment on function public.is_vimo_team() is
  '비모 팀 멤버 여부 (admin/manager/member 모두 포함)';


-- 현재 사용자의 매핑된 partners.id를 text로 반환
create or replace function public.my_legacy_partner_id_text()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select legacy_partner_id::text
  from public.partner_meta
  where profile_id = auth.uid()
  limit 1;
$$;

comment on function public.my_legacy_partner_id_text() is
  '현재 로그인 사용자의 매핑된 partners.id (text). 미매핑 시 NULL';


-- ---------------------------------------------
-- 2. 기존 정책 → 비모 팀만 접근하도록 교체
-- ---------------------------------------------

-- partners
drop policy if exists "authenticated_partners" on public.partners;
drop policy if exists "vimo_team_partners" on public.partners;
create policy "vimo_team_partners" on public.partners
  for all to authenticated
  using (public.is_vimo_team())
  with check (public.is_vimo_team());

-- clients
drop policy if exists "authenticated_clients" on public.clients;
drop policy if exists "vimo_team_clients" on public.clients;
create policy "vimo_team_clients" on public.clients
  for all to authenticated
  using (public.is_vimo_team())
  with check (public.is_vimo_team());

-- projects
drop policy if exists "authenticated_projects" on public.projects;
drop policy if exists "vimo_team_projects" on public.projects;
create policy "vimo_team_projects" on public.projects
  for all to authenticated
  using (public.is_vimo_team())
  with check (public.is_vimo_team());

-- episodes
drop policy if exists "authenticated_episodes" on public.episodes;
drop policy if exists "vimo_team_episodes" on public.episodes;
create policy "vimo_team_episodes" on public.episodes
  for all to authenticated
  using (public.is_vimo_team())
  with check (public.is_vimo_team());


-- ---------------------------------------------
-- 3. 파트너 SELECT 정책 (모든 비교는 ::text 통일)
-- ---------------------------------------------

-- partners: 본인 row만
drop policy if exists "partner_self_partners_select" on public.partners;
create policy "partner_self_partners_select" on public.partners
  for select to authenticated
  using (
    public.my_legacy_partner_id_text() is not null
    and public.partners.id::text = public.my_legacy_partner_id_text()
  );

-- episodes: 본인이 assignee인 회차
drop policy if exists "partner_self_episodes_select" on public.episodes;
create policy "partner_self_episodes_select" on public.episodes
  for select to authenticated
  using (
    public.my_legacy_partner_id_text() is not null
    and coalesce(public.episodes.assignee::text, '') = public.my_legacy_partner_id_text()
  );

-- projects: 본인이 partner_id이거나 회차 assignee인 프로젝트
drop policy if exists "partner_self_projects_select" on public.projects;
create policy "partner_self_projects_select" on public.projects
  for select to authenticated
  using (
    public.my_legacy_partner_id_text() is not null
    and (
      coalesce(public.projects.partner_id::text, '') = public.my_legacy_partner_id_text()
      or exists (
        select 1 from public.episodes e
        where e.project_id::text = public.projects.id::text
          and coalesce(e.assignee::text, '') = public.my_legacy_partner_id_text()
      )
    )
  );

-- clients: 매핑된 파트너는 모든 client 조회 가능 (당분간)
drop policy if exists "partner_self_clients_select" on public.clients;
create policy "partner_self_clients_select" on public.clients
  for select to authenticated
  using (public.my_legacy_partner_id_text() is not null);


-- =============================================
-- 검증
-- =============================================
--
-- -- 정책 확인
-- select tablename, policyname
-- from pg_policies
-- where tablename in ('partners', 'clients', 'projects', 'episodes')
-- order by tablename, policyname;
--
-- -- 컬럼 타입 확인 (참고용)
-- select table_name, column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('partners', 'projects', 'episodes')
--   and column_name in ('id', 'partner_id', 'project_id', 'assignee')
-- order by table_name, column_name;


-- =============================================
-- ROLLBACK
-- =============================================
--
-- drop policy if exists "partner_self_partners_select" on public.partners;
-- drop policy if exists "partner_self_episodes_select" on public.episodes;
-- drop policy if exists "partner_self_projects_select" on public.projects;
-- drop policy if exists "partner_self_clients_select" on public.clients;
--
-- drop policy if exists "vimo_team_partners" on public.partners;
-- drop policy if exists "vimo_team_clients" on public.clients;
-- drop policy if exists "vimo_team_projects" on public.projects;
-- drop policy if exists "vimo_team_episodes" on public.episodes;
--
-- create policy "authenticated_partners" on public.partners for all to authenticated using (true);
-- create policy "authenticated_clients" on public.clients for all to authenticated using (true);
-- create policy "authenticated_projects" on public.projects for all to authenticated using (true);
-- create policy "authenticated_episodes" on public.episodes for all to authenticated using (true);
--
-- drop function if exists public.is_vimo_team();
-- drop function if exists public.my_legacy_partner_id_text();
-- drop function if exists public.my_legacy_partner_id();
