-- =============================================
-- checklists RLS — 본인 행만 접근
-- =============================================
-- 기존: allow_all_checklists (모든 인증 사용자가 모든 행 접근) — 너무 열림
-- 변경: user_id = auth.uid()::text 인 행만
--
-- user_id 가 text 타입이라 ::text 캐스트 필요.
-- 'local' (게스트) 행은 admin만 정리 가능하게 별도 정책.
-- =============================================

drop policy if exists "allow_all_checklists" on public.checklists;

drop policy if exists "checklists_self_select" on public.checklists;
create policy "checklists_self_select" on public.checklists
  for select to authenticated
  using (user_id = auth.uid()::text);

drop policy if exists "checklists_self_insert" on public.checklists;
create policy "checklists_self_insert" on public.checklists
  for insert to authenticated
  with check (user_id = auth.uid()::text);

drop policy if exists "checklists_self_update" on public.checklists;
create policy "checklists_self_update" on public.checklists
  for update to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

drop policy if exists "checklists_self_delete" on public.checklists;
create policy "checklists_self_delete" on public.checklists
  for delete to authenticated
  using (user_id = auth.uid()::text);

-- admin은 모든 행 접근 (디버깅·정리용)
drop policy if exists "checklists_admin_all" on public.checklists;
create policy "checklists_admin_all" on public.checklists
  for all to authenticated
  using (public.is_vimo_admin())
  with check (public.is_vimo_admin());
