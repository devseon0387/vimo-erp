-- =============================================
-- episodes (project_id, episode_number) UNIQUE 보장
-- =============================================
-- 20260505000003_p1_episode_number_atomic.sql 의 advisory-lock 트리거는
-- new.episode_number IS NULL 일 때만 발동. UI 호출(projects/[id]/page.tsx 등)이
-- 클라이언트에서 max+1로 계산해 명시값을 보내면 race 미해결.
--
-- 수정:
--   1) 기존 중복 (project_id, episode_number) 정리 — 가장 오래된 created_at 유지,
--      나머지는 max+1로 재번호 부여 (advisory lock 안에서 처리)
--   2) UNIQUE 제약 추가 — 어떤 경로로 INSERT 되든 중복 방지
--
-- UI는 별도 커밋에서 episode_number 를 NULL 로 보내도록 수정 (트리거 활용).
-- 이 마이그레이션은 안전망 (UNIQUE) 자체로 race 의 흔적 즉시 차단.
-- =============================================

-- 1) 중복 정리
do $do$
declare
  v_row record;
  v_new_number int;
begin
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='episodes') then
    return;
  end if;

  -- 같은 project_id + episode_number 가 2개 이상인 그룹에서, 가장 오래된 것을 제외한 나머지에
  -- max+1 부여. 한 row 씩 처리해야 max 가 누적 반영됨.
  for v_row in
    select id, project_id
    from public.episodes e1
    where exists (
      select 1
      from public.episodes e2
      where e2.project_id = e1.project_id
        and e2.episode_number = e1.episode_number
        and e2.id <> e1.id
    )
      and e1.id not in (
        select min(id::text)::uuid
        from public.episodes e3
        where e3.project_id = e1.project_id
          and e3.episode_number = e1.episode_number
        group by project_id, episode_number
      )
    order by created_at asc
  loop
    perform pg_advisory_xact_lock(hashtext('episode_number:' || v_row.project_id::text));
    select coalesce(max(episode_number), 0) + 1 into v_new_number
      from public.episodes where project_id = v_row.project_id;
    update public.episodes set episode_number = v_new_number where id = v_row.id;
    raise notice '중복 회차 재번호: % → %', v_row.id, v_new_number;
  end loop;
end
$do$;

-- 2) UNIQUE 제약 (idempotent)
do $do$
begin
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='episodes') then
    return;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.episodes'::regclass
      and conname = 'episodes_project_episode_number_unique'
  ) then
    execute 'alter table public.episodes
      add constraint episodes_project_episode_number_unique
      unique (project_id, episode_number)';
  end if;
end
$do$;

-- 3) 트리거가 명시 값도 advisory lock 으로 감싸도록 강화
--    (NULL 분기 외 명시 분기에서도 같은 project 의 동시 INSERT 직렬화)
create or replace function public.set_episode_number()
returns trigger
language plpgsql
as $$
begin
  -- project_id 별 advisory lock — 명시/자동 양쪽 모두 직렬화
  perform pg_advisory_xact_lock(hashtext('episode_number:' || new.project_id::text));
  if new.episode_number is null then
    select coalesce(max(episode_number), 0) + 1
      into new.episode_number
    from public.episodes
    where project_id = new.project_id;
  end if;
  return new;
end;
$$;
