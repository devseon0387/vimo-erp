-- checklists 테이블 제약 강화 (user_id FK 제약 없이)
--
-- 변경 이력:
--   - 원본 버전(20260423000004)은 user_id default 'default' · completed/notified nullable
--   - 이 마이그레이션은 user_id default 'local'로 통일 + completed/notified NOT NULL 보강
--
-- DROP TABLE 금지 규칙에 따라 CREATE IF NOT EXISTS + ALTER로 멱등하게 처리.

create table if not exists checklists (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null default 'local',
  text            text not null,
  completed       boolean not null default false,
  reminder_time   text,
  notified        boolean not null default false,
  repeat_type     text,
  repeat_days     int[],
  linked_episode_id     text,
  linked_episode_title  text,
  linked_episode_number int,
  linked_project_id     text,
  linked_project_title  text,
  linked_client_name    text,
  linked_partner_id     text,
  linked_partner_name   text,
  created_at      timestamptz default now()
);

-- 기존 테이블이 이미 존재하는 경우 제약 보강 (멱등)
alter table checklists alter column user_id set default 'local';

-- NOT NULL 제약 보강 (기존 NULL 행이 있으면 먼저 채움)
update checklists set completed = false where completed is null;
update checklists set notified  = false where notified  is null;

alter table checklists alter column completed set not null;
alter table checklists alter column notified  set not null;

-- RLS 활성화 (IF NOT EXISTS 효과는 자동)
alter table checklists enable row level security;

-- 정책 (drop 후 재생성 — RLS 정책은 테이블 DROP과 달리 데이터 유실 없음)
drop policy if exists "allow_all_checklists" on checklists;
create policy "allow_all_checklists" on checklists for all using (true) with check (true);
