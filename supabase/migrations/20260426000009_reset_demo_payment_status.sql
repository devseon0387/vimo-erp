-- =============================================
-- 데모 시드 정정: payment_status 모두 pending으로
-- =============================================
-- 시드 SQL(20260426000007)에서 일부 회차의 payment_status를
-- 'completed'로 잘못 박았음. 비모 ERP에서 실제 정산은 안 했으므로
-- 모두 pending으로 되돌림.
--
-- 영향 범위: 데모 시드로 추가된 프로젝트들 한정
--   (마리아쥬 봄 시리즈, 플레이브 4월 숏폼, 디지털원 4월 브랜딩,
--    뉴스레터 자막 5월, 카페 봄 광고, 교육 시리즈 4월)
-- =============================================

update public.episodes
set payment_status = 'pending', invoice_status = 'pending'
where project_id in (
  select id from public.projects
  where title in (
    '마리아쥬 봄 시리즈',
    '플레이브 4월 숏폼',
    '디지털원 4월 브랜딩',
    '뉴스레터 자막 5월',
    '카페 봄 광고',
    '교육 시리즈 4월'
  )
);
