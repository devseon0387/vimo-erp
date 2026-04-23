-- =============================================
-- projects 테이블 컬럼 추가 마이그레이션
-- Supabase 대시보드 > SQL Editor에서 실행
-- =============================================

alter table projects
  add column if not exists partner_ids text[]  default '{}',
  add column if not exists manager_ids text[]  default '{}',
  add column if not exists category    text;

-- 기존 partner_id 값을 partner_ids 배열로 마이그레이션
update projects
set partner_ids = array[partner_id]
where partner_id is not null
  and partner_id <> ''
  and (partner_ids is null or partner_ids = '{}');
