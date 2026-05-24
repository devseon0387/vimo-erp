-- =============================================
-- profiles.user_type='staff' 백필 + 자동 동기 트리거
-- =============================================
-- 20260506000001_p1_partners_safe_view.sql + 20260506000002_p2_partners_vimo_staff_only.sql
-- 가 partners 접근을 is_vimo_staff() (profiles.user_type='staff') 로 좁힘.
-- 그러나 user_profiles.role IN ('admin','manager','staff') 인 사람의
-- profiles.user_type 백필이 누락된 경우 partners 목록이 빈 채로 보임.
--
-- 수정:
--   1) user_profiles.role IN ('admin','manager','staff') → profiles.user_type='staff' 백필
--   2) user_profiles INSERT/UPDATE 시 profiles.user_type 자동 동기 트리거 추가
--      (admin/manager/staff 역할로 새 사용자 생성 시 누락 방지)
--
-- IF EXISTS / 멱등.
-- =============================================

-- 1) 백필
do $do$
begin
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='user_profiles') then
    return;
  end if;
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='profiles') then
    return;
  end if;

  -- profiles 가 없는 staff 가입자에 대해 user_type='staff' 로 추가
  insert into public.profiles (id, user_type, name, email, created_at)
  select up.id, 'staff', coalesce(up.name, up.email), up.email, coalesce(up.created_at, now())
  from public.user_profiles up
  where up.role in ('admin','manager','staff')
    and not exists (select 1 from public.profiles p where p.id = up.id)
  on conflict (id) do nothing;

  -- 이미 profile 이 있는데 user_type 이 staff 가 아닌 경우 갱신
  -- (partner 였다가 staff 로 전환된 케이스는 흔치 않으나 안전망)
  update public.profiles p
    set user_type = 'staff'
    from public.user_profiles up
    where p.id = up.id
      and up.role in ('admin','manager','staff')
      and (p.user_type is null or p.user_type = '');

  raise notice 'user_type=staff 백필 완료';
end
$do$;

-- 2) user_profiles → profiles.user_type 자동 동기 트리거
create or replace function public.sync_user_type_from_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('admin','manager','staff') then
    insert into public.profiles (id, user_type, name, email, created_at)
    values (new.id, 'staff', coalesce(new.name, new.email), new.email, now())
    on conflict (id) do update set user_type = 'staff'
      where public.profiles.user_type is null or public.profiles.user_type = '' or public.profiles.user_type = 'staff';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_user_type on public.user_profiles;
create trigger trg_sync_user_type
  after insert or update of role on public.user_profiles
  for each row execute function public.sync_user_type_from_role();

comment on function public.sync_user_type_from_role() is
  'user_profiles.role 가 admin/manager/staff 면 profiles.user_type=staff 자동 동기 — partners RLS (is_vimo_staff) 통과 보장';
