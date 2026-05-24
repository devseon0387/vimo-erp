-- =============================================
-- 데모 시드 추가분 삭제 (사용자 명시 요청, 2026-04-26)
-- =============================================
-- 시드 SQL(20260426000007_seed_demo_episodes.sql)이 운영 DB에
-- 직접 INSERT한 6개 프로젝트 + 그 안 19개 회차를 모두 제거.
--
-- 작업 순서:
--   1. 해당 프로젝트의 episodes 삭제
--   2. 프로젝트 자체 삭제
--
-- audit_log는 보존 (변경 이력 기록 유지)
-- =============================================

-- 1. 회차 먼저 삭제 (FK 보호) — episodes.project_id는 text, projects.id는 uuid라 ::text 캐스트
delete from public.episodes
where project_id::text in (
  select id::text from public.projects
  where title in (
    '마리아쥬 봄 시리즈',
    '플레이브 4월 숏폼',
    '디지털원 4월 브랜딩',
    '뉴스레터 자막 5월',
    '카페 봄 광고',
    '교육 시리즈 4월'
  )
);

-- 2. 프로젝트 삭제
delete from public.projects
where title in (
  '마리아쥬 봄 시리즈',
  '플레이브 4월 숏폼',
  '디지털원 4월 브랜딩',
  '뉴스레터 자막 5월',
  '카페 봄 광고',
  '교육 시리즈 4월'
);

-- 검증
do $$
declare
  v_remaining int;
begin
  select count(*) into v_remaining from public.projects
  where title in (
    '마리아쥬 봄 시리즈', '플레이브 4월 숏폼', '디지털원 4월 브랜딩',
    '뉴스레터 자막 5월', '카페 봄 광고', '교육 시리즈 4월'
  );
  if v_remaining = 0 then
    raise notice '✓ 시드 데이터 6개 프로젝트 모두 삭제됨';
  else
    raise notice '⚠ % 개 프로젝트가 남아있음 — 수동 확인 필요', v_remaining;
  end if;
end $$;
