-- =============================================
-- RLS 정책 강화: 전체 허용 → 인증 사용자만 허용
-- =============================================
-- 배경:
--   20260423000004에서 모든 테이블이 `for all using (true)` 상태로
--   anon 키만 있으면 DB 직접 접근이 가능. 앱 미들웨어 인증을 우회하는
--   키 유출 시 위험이 큼.
--
-- 변경:
--   모든 정책을 `authenticated` role로 제한.
--   anon 역할은 정책이 없으므로 자동으로 차단됨.
--
-- ⚠️ 실행 전 확인 사항:
--   1. 앱이 반드시 Supabase auth로 로그인된 상태에서만 쿼리하는지
--      (server side: createServerClient + getUser, client side: createBrowserClient)
--   2. public 페이지(로그인 전 접근)가 DB에 의존하지 않는지
--   3. 이 파일을 실행하면 비로그인 anon 쿼리는 모두 실패함
--
-- 롤백 방법:
--   drop policy "authenticated_*" + 원래 "allow_all_*" 정책 재생성
-- =============================================

drop policy if exists "allow_all_partners"    on partners;
drop policy if exists "allow_all_clients"     on clients;
drop policy if exists "allow_all_projects"    on projects;
drop policy if exists "allow_all_episodes"    on episodes;
drop policy if exists "allow_all_trash"       on trash;
drop policy if exists "allow_all_portfolio"   on portfolio_items;
drop policy if exists "allow_all_checklists"  on checklists;

-- authenticated role만 허용 (anon은 자동 차단)
create policy "authenticated_partners"
  on partners       for all to authenticated using (true) with check (true);

create policy "authenticated_clients"
  on clients        for all to authenticated using (true) with check (true);

create policy "authenticated_projects"
  on projects       for all to authenticated using (true) with check (true);

create policy "authenticated_episodes"
  on episodes       for all to authenticated using (true) with check (true);

create policy "authenticated_trash"
  on trash          for all to authenticated using (true) with check (true);

create policy "authenticated_portfolio"
  on portfolio_items for all to authenticated using (true) with check (true);

create policy "authenticated_checklists"
  on checklists     for all to authenticated using (true) with check (true);

-- 향후 유저별 row 격리(auth.uid() 기반 필터)까지 가야 한다면
-- 각 테이블의 owner/created_by 컬럼 추가 + using (owner_id = auth.uid()) 로
-- 추가 강화 가능.
