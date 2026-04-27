-- =============================================
-- 파트너가 자기 회차의 작업 단계 상태를 직접 토글
-- =============================================
-- episodes.work_steps (jsonb) 의 부분 수정.
-- 구조:
--   {
--     "롱폼": [{ id, label, status, startDate, dueDate, completedAt, assigneeId }, ...],
--     "숏폼": [...]
--   }
--
-- 보안:
--   - SECURITY DEFINER (RLS 통과 후 함수 내부에서 본인 검증)
--   - 호출자의 my_legacy_partner_id_text() = episodes.assignee::text 일 때만 허용
--   - admin (is_vimo_admin) 도 허용 (임퍼소네이션 시)
--   - 변경되는 컬럼은 work_steps 만 (금액·assignee 등 다른 컬럼 보호)
-- =============================================

create or replace function public.partner_set_work_step_status(
  p_episode_id uuid,
  p_step_id text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignee text;
  v_my_id text;
  v_is_admin boolean;
  v_work_steps jsonb;
  v_new_steps jsonb;
  v_key text;
  v_arr jsonb;
  v_step jsonb;
  v_updated_arr jsonb;
  v_now timestamptz := now();
begin
  if p_status not in ('waiting', 'in_progress', 'completed') then
    raise exception '유효하지 않은 상태: %', p_status;
  end if;

  select assignee::text, work_steps
    into v_assignee, v_work_steps
  from public.episodes
  where id = p_episode_id;

  if v_assignee is null then
    raise exception '회차를 찾을 수 없거나 담당자가 지정되지 않았습니다.';
  end if;

  v_is_admin := public.is_vimo_admin();
  v_my_id := public.my_legacy_partner_id_text();

  if not v_is_admin and (v_my_id is null or v_my_id != v_assignee) then
    raise exception '본인이 담당하는 회차만 수정할 수 있습니다.';
  end if;

  if v_work_steps is null or jsonb_typeof(v_work_steps) != 'object' then
    raise exception '작업 단계가 등록되어 있지 않습니다.';
  end if;

  -- 모든 work type 키를 순회하며 step.id == p_step_id 찾기
  v_new_steps := '{}'::jsonb;
  for v_key in select jsonb_object_keys(v_work_steps)
  loop
    v_arr := v_work_steps -> v_key;
    if jsonb_typeof(v_arr) = 'array' then
      v_updated_arr := '[]'::jsonb;
      for v_step in select * from jsonb_array_elements(v_arr)
      loop
        if (v_step ->> 'id') = p_step_id then
          v_step := v_step
            || jsonb_build_object('status', p_status)
            || (case when p_status = 'completed'
                     then jsonb_build_object('completedAt', to_char(v_now, 'YYYY-MM-DD'))
                     else jsonb_build_object('completedAt', null)
                end);
        end if;
        v_updated_arr := v_updated_arr || jsonb_build_array(v_step);
      end loop;
      v_new_steps := v_new_steps || jsonb_build_object(v_key, v_updated_arr);
    else
      v_new_steps := v_new_steps || jsonb_build_object(v_key, v_arr);
    end if;
  end loop;

  update public.episodes
  set work_steps = v_new_steps,
      updated_at = v_now
  where id = p_episode_id;

  return v_new_steps;
end;
$$;

revoke all on function public.partner_set_work_step_status(uuid, text, text) from public;
grant execute on function public.partner_set_work_step_status(uuid, text, text) to authenticated;
