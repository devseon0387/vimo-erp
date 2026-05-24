-- =============================================
-- checklists per-user 격리 복원 (CRITICAL)
-- =============================================
-- 20260426000008_checklists_partner_rls.sql 가 깐 per-user 정책
-- (checklists_self_select/insert/update/delete + checklists_admin_all) 위에
-- 20260505000002_p1_anon_block_misc_tables.sql 가 broad permissive 정책
-- (checklists_authenticated_all FOR ALL USING(true)) 을 추가하면서
-- Postgres permissive OR 동작 때문에 per-user 격리가 무력화됨.
--
-- 수정: broad 정책 DROP. per-user + admin 정책만 유지.
-- (anon 차단은 enable rls + to authenticated 만으로 충분)
--
-- IF EXISTS / 멱등성 보장.
-- =============================================

do $do$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'checklists') then
    raise notice 'checklists 테이블 없음, skip';
    return;
  end if;

  -- 핵심: broad 정책 제거
  execute 'drop policy if exists "checklists_authenticated_all" on public.checklists';

  -- per-user 정책이 혹시 사라졌으면 재설치 (idempotent)
  -- user_id 는 text 타입이라 auth.uid()::text 캐스트
  execute 'alter table public.checklists enable row level security';

  execute 'drop policy if exists "checklists_self_select" on public.checklists';
  execute 'create policy "checklists_self_select" on public.checklists
    for select to authenticated
    using (user_id = auth.uid()::text)';

  execute 'drop policy if exists "checklists_self_insert" on public.checklists';
  execute 'create policy "checklists_self_insert" on public.checklists
    for insert to authenticated
    with check (user_id = auth.uid()::text)';

  execute 'drop policy if exists "checklists_self_update" on public.checklists';
  execute 'create policy "checklists_self_update" on public.checklists
    for update to authenticated
    using (user_id = auth.uid()::text)
    with check (user_id = auth.uid()::text)';

  execute 'drop policy if exists "checklists_self_delete" on public.checklists';
  execute 'create policy "checklists_self_delete" on public.checklists
    for delete to authenticated
    using (user_id = auth.uid()::text)';

  -- admin 전체 접근 (디버깅·정리용) — is_vimo_admin() 헬퍼 존재 시
  if exists (select 1 from pg_proc where proname = 'is_vimo_admin' and pronamespace = 'public'::regnamespace) then
    execute 'drop policy if exists "checklists_admin_all" on public.checklists';
    execute 'create policy "checklists_admin_all" on public.checklists
      for all to authenticated
      using (public.is_vimo_admin())
      with check (public.is_vimo_admin())';
  end if;
end
$do$;

-- 검증
-- select polname from pg_policy where polrelid = 'public.checklists'::regclass;
--   → checklists_self_(select|insert|update|delete) + checklists_admin_all
--   → "checklists_authenticated_all" 없어야 함
