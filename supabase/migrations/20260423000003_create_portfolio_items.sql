-- =============================================
-- portfolio_items 테이블 생성 마이그레이션
-- Supabase 대시보드 > SQL Editor에서 실행
-- =============================================

create table if not exists portfolio_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  client text,
  partner_id text,
  completed_at text,
  tags text[] default '{}',
  youtube_url text,
  is_published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table portfolio_items enable row level security;

create policy "auth_all_portfolio" on portfolio_items
  for all using (auth.role() = 'authenticated');
