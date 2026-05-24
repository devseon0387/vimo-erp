-- =============================================
-- app_access(vimo_erp) 자동 시드 + 백필 (HIGH)
-- =============================================
-- 새 proxy 가 user_profiles.approved/admin 통과 외에도
-- app_access.vimo_erp.status='active' 를 추가 요구.
-- admin/create-user 는 user_profiles 만 채우고 app_access 는 시드 안 함 →
-- 신규 매니저가 로그인 시 무한 signOut + /login 리디렉트.
--
-- 수정:
--   1) 기존 user_profiles 의 approved=true 또는 role='admin' 사용자 백필
--   2) user_profiles INSERT 트리거: role IN (admin/manager/staff) 면
--      app_access(vimo_erp, active, role) 자동 시드
--
-- (create-user route 도 별도 커밋에서 명시 upsert)
-- =============================================

-- 1) 백필
do $do$
begin
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='user_profiles') then
    return;
  end if;
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='app_access') then
    return;
  end if;

  insert into public.app_access (user_id, app_code, role, status)
  select up.id,
         'vimo_erp',
         case when up.role = 'admin' then 'admin' else 'staff' end,
         'active'
  from public.user_profiles up
  where up.role in ('admin','manager','staff')
    and (up.approved = true or up.role = 'admin')
    and not exists (
      select 1 from public.app_access aa
      where aa.user_id = up.id and aa.app_code = 'vimo_erp'
    );

  raise notice 'app_access vimo_erp 백필 완료';
end
$do$;

-- 2) user_profiles INSERT/UPDATE 트리거 → app_access 자동 시드
create or replace function public.seed_vimo_erp_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
begin
  -- 대상 role 만 처리. partner/외부 계정은 skip.
  if new.role not in ('admin','manager','staff') then
    return new;
  end if;

  -- approved=true 또는 admin 일 때만 active. 그 외는 pending status 로 시드.
  v_target_role := case when new.role = 'admin' then 'admin' else 'staff' end;

  insert into public.app_access (user_id, app_code, role, status)
  values (
    new.id,
    'vimo_erp',
    v_target_role,
    case when new.approved = true or new.role = 'admin' then 'active' else 'pending' end
  )
  on conflict (user_id, app_code) do update
    set role = excluded.role,
        status = case
          when public.app_access.status = 'suspended' then 'suspended'  -- 보안: 명시 suspend 는 유지
          else excluded.status
        end;

  return new;
end;
$$;

drop trigger if exists trg_seed_vimo_erp_access on public.user_profiles;
create trigger trg_seed_vimo_erp_access
  after insert or update of role, approved on public.user_profiles
  for each row execute function public.seed_vimo_erp_access();

comment on function public.seed_vimo_erp_access() is
  'user_profiles 생성/승인 시 app_access(vimo_erp) 자동 시드. proxy 의 무한 로그아웃 방지. suspended 상태는 보존.';
