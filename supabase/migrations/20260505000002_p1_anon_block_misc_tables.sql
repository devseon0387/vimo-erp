-- P1 보안 강화: 2026-05-05
-- 1. checklists: 정책 `for all using(true)` (모든 role 허용) → authenticated 한정
-- 2. app_updates: 같은 패턴. 또한 write는 admin만(read-only는 모두에게)으로 분리
-- 3. portfolio_items: 기존 `auth.role() = 'authenticated'` → 명시적 `to authenticated` 정책으로 통일
-- 4. push_subscriptions: 이미 `auth.uid() = user_id` 정책 적용됨 (이 마이그레이션에서는 손대지 않음)
--
-- DROP TABLE 금지 / IF EXISTS / 멱등성 보장.

-- ── checklists: anon 차단
do $do$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'checklists') then
    execute 'alter table public.checklists enable row level security';
    execute 'drop policy if exists "allow_all_checklists" on public.checklists';
    execute 'drop policy if exists "checklists_authenticated_all" on public.checklists';
    execute 'create policy "checklists_authenticated_all" on public.checklists for all to authenticated using (true) with check (true)';
  end if;
end
$do$;

-- ── app_updates: read는 authenticated, write는 admin만
do $do$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'app_updates') then
    execute 'alter table public.app_updates enable row level security';
    execute 'drop policy if exists "service_role_all" on public.app_updates';
    execute 'drop policy if exists "app_updates_authenticated_select" on public.app_updates';
    execute 'drop policy if exists "app_updates_admin_write" on public.app_updates';
    execute 'create policy "app_updates_authenticated_select" on public.app_updates for select to authenticated using (true)';
    -- write(insert/update/delete)는 admin role 만 (user_profiles.role = ''admin''). 이외는 service_role 통한 admin API 사용.
    execute $body$
      create policy "app_updates_admin_write" on public.app_updates
        for all to authenticated
        using (exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'admin'))
        with check (exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'admin'))
    $body$;
  end if;
end
$do$;

-- ── portfolio_items: `auth.role() = 'authenticated'`(implicit role 비교) → 명시적 `to authenticated` 통일
do $do$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'portfolio_items') then
    execute 'alter table public.portfolio_items enable row level security';
    execute 'drop policy if exists "auth_all_portfolio" on public.portfolio_items';
    execute 'drop policy if exists "authenticated_portfolio" on public.portfolio_items';
    execute 'drop policy if exists "portfolio_items_authenticated_all" on public.portfolio_items';
    execute 'create policy "portfolio_items_authenticated_all" on public.portfolio_items for all to authenticated using (true) with check (true)';
  end if;
end
$do$;
