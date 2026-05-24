-- P1 episodes 동시성 차단: 2026-05-05
-- 같은 project_id에 두 사용자가 동시에 회차를 추가하면 read-then-insert race로
-- 같은 episode_number가 발급될 수 있음 (bibot/exec, bibot/tools 라우트).
--
-- 해결: BEFORE INSERT 트리거에서 advisory_xact_lock 으로 같은 project_id 의
-- 동시 INSERT 를 직렬화한 후 max+1 할당. 클라가 episode_number 를 명시 보내면
-- 그 값 그대로 사용 (수동 번호 부여 가능).

create or replace function public.set_episode_number()
returns trigger
language plpgsql
as $$
begin
  if new.episode_number is null then
    -- project_id 별 advisory lock — 다른 project 의 INSERT 는 영향 받지 않음
    perform pg_advisory_xact_lock(hashtext('episode_number:' || new.project_id::text));
    select coalesce(max(episode_number), 0) + 1
      into new.episode_number
    from public.episodes
    where project_id = new.project_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_episode_number on public.episodes;
create trigger trg_set_episode_number
  before insert on public.episodes
  for each row
  execute function public.set_episode_number();
