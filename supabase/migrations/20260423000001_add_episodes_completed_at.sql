-- episodes 테이블에 completed_at 컬럼 추가
-- Supabase 대시보드 > SQL Editor에서 실행

alter table episodes
  add column if not exists completed_at timestamptz;
