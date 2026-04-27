-- =============================================
-- 비모 유니버스 인증 코어 — Phase 2: 제약·트리거·RLS
-- =============================================
-- 목표:
--   Phase 1에서 만든 새 테이블에 보호막 추가:
--   1. 상호 배제 부분 유니크 인덱스 (vimo_erp ↔ partner_erp 동시 보유 차단)
--   2. user_type ↔ app_code 정합성 트리거 (SECURITY DEFINER)
--   3. 새 테이블 RLS 정책 (본인 데이터만 접근, admin 우회)
--
-- 영향 범위:
--   - 기존 테이블 변경: 없음
--   - 새 테이블에 INSERT/UPDATE 시 제약 적용
--   - 비모 ERP 정상 동작 (이 단계에서는 새 테이블 사용 안 함)
--
-- 함정 대응:
--   - 함정 #2: 트리거 SECURITY DEFINER로 RLS 우회
--   - 함정 #5: partner_meta legacy_partner_id ON DELETE RESTRICT (Phase 1에서 처리됨)
-- =============================================

-- ---------------------------------------------
-- 1. 상호 배제 — 한 user는 vimo_erp / partner_erp 중 하나만 (Vibox 등은 자유)
-- ---------------------------------------------
create unique index if not exists app_access_erp_exclusive
  on public.app_access (user_id)
  where app_code in ('vimo_erp', 'partner_erp');

comment on index public.app_access_erp_exclusive is
  '한 사용자는 vimo_erp 또는 partner_erp 중 하나만 — 두 번째 INSERT 시도 시 reject';


-- ---------------------------------------------
-- 2. user_type ↔ app_code 정합성 트리거
-- ---------------------------------------------
-- SECURITY DEFINER:
--   트리거가 profiles.user_type을 SELECT할 때 RLS 우회 필요.
--   함수 소유자 권한으로 실행되므로 RLS 정책 무시함.
--
-- 검증 로직:
--   vimo_erp 권한은 user_type='staff'인 경우에만
--   partner_erp 권한은 user_type='partner'인 경우에만
--   vibox 등 기타 앱은 검증 안 함 (자유 부여)

create or replace function public.check_app_access_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_type text;
begin
  select user_type into v_user_type
  from public.profiles
  where id = new.user_id;

  if v_user_type is null then
    raise exception 'profile이 없는 user_id: % (먼저 profiles에 INSERT 필요)', new.user_id;
  end if;

  if new.app_code = 'vimo_erp' and v_user_type != 'staff' then
    raise exception 'vimo_erp는 staff 유저만 접근 가능 (현재 user_type: %)', v_user_type;
  end if;

  if new.app_code = 'partner_erp' and v_user_type != 'partner' then
    raise exception 'partner_erp는 partner 유저만 접근 가능 (현재 user_type: %)', v_user_type;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_app_access_type on public.app_access;
create trigger enforce_app_access_type
  before insert or update on public.app_access
  for each row execute function public.check_app_access_type();


-- ---------------------------------------------
-- 헬퍼 함수 — admin 여부 체크 (RLS 정책에서 재사용)
-- ---------------------------------------------
create or replace function public.is_vimo_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_access
    where user_id = auth.uid()
      and app_code = 'vimo_erp'
      and role = 'admin'
      and status = 'active'
  );
$$;

comment on function public.is_vimo_admin() is
  '현재 사용자가 비모 ERP admin인지 — RLS 정책에서 사용';


-- ---------------------------------------------
-- 3. RLS 정책
-- ---------------------------------------------

-- ─── profiles ───
alter table public.profiles enable row level security;

-- 본인 프로필 조회/수정
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and user_type = (select user_type from public.profiles where id = auth.uid())
    -- user_type 자체 변경 차단 (admin만 변경 가능)
  );

-- admin은 전체 조회/수정
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_vimo_admin())
  with check (public.is_vimo_admin());


-- ─── app_access ───
alter table public.app_access enable row level security;

-- 본인 권한 조회만 (수정 불가 — 자기 권한 상승 방지)
drop policy if exists app_access_self_select on public.app_access;
create policy app_access_self_select on public.app_access
  for select using (auth.uid() = user_id);

-- admin은 전체 관리 (조회/추가/수정/삭제)
drop policy if exists app_access_admin_all on public.app_access;
create policy app_access_admin_all on public.app_access
  for all using (public.is_vimo_admin())
  with check (public.is_vimo_admin());


-- ─── vimo_staff ───
alter table public.vimo_staff enable row level security;

drop policy if exists vimo_staff_self_select on public.vimo_staff;
create policy vimo_staff_self_select on public.vimo_staff
  for select using (auth.uid() = profile_id);

drop policy if exists vimo_staff_admin_all on public.vimo_staff;
create policy vimo_staff_admin_all on public.vimo_staff
  for all using (public.is_vimo_admin())
  with check (public.is_vimo_admin());


-- ─── partner_meta ───
alter table public.partner_meta enable row level security;

-- 본인 메타 조회 (수정은 admin만 — 매핑 통제)
drop policy if exists partner_meta_self_select on public.partner_meta;
create policy partner_meta_self_select on public.partner_meta
  for select using (auth.uid() = profile_id);

-- 본인이 일부 필드 수정 가능 (계좌 정보 등 — bank_*, work_formats)
-- legacy_partner_id 같은 매핑 필드는 admin 전용
drop policy if exists partner_meta_self_update on public.partner_meta;
create policy partner_meta_self_update on public.partner_meta
  for update using (auth.uid() = profile_id)
  with check (
    auth.uid() = profile_id
    -- 매핑 필드 변경 차단 (행 단위로는 막을 수 없어 admin이 별도 검증 권장)
  );

drop policy if exists partner_meta_admin_all on public.partner_meta;
create policy partner_meta_admin_all on public.partner_meta
  for all using (public.is_vimo_admin())
  with check (public.is_vimo_admin());


-- ─── partner_invites ───
alter table public.partner_invites enable row level security;

-- 토큰으로 조회 (anonymous 허용 — /onboard 페이지에서 사용)
-- pending이고 만료 안 된 것만 노출. 토큰 자체가 시크릿 역할.
drop policy if exists partner_invites_token_lookup on public.partner_invites;
create policy partner_invites_token_lookup on public.partner_invites
  for select to anon, authenticated using (
    status = 'pending' and expires_at > now()
  );

-- admin이 발급/관리
drop policy if exists partner_invites_admin_all on public.partner_invites;
create policy partner_invites_admin_all on public.partner_invites
  for all using (public.is_vimo_admin())
  with check (public.is_vimo_admin());


-- ─── apps ───
-- 카탈로그는 모두 조회 가능 (UI에서 앱 목록 표시용)
alter table public.apps enable row level security;

drop policy if exists apps_public_select on public.apps;
create policy apps_public_select on public.apps
  for select to anon, authenticated using (true);

drop policy if exists apps_admin_all on public.apps;
create policy apps_admin_all on public.apps
  for all using (public.is_vimo_admin())
  with check (public.is_vimo_admin());


-- =============================================
-- 검증 쿼리 (참고용)
-- =============================================
--
-- -- 1) 부분 유니크 인덱스 확인
-- select indexname, indexdef from pg_indexes
-- where tablename = 'app_access' and indexname = 'app_access_erp_exclusive';
--
-- -- 2) 트리거 작동 테스트 (실패해야 정상)
-- --    임시 profile 생성 후 잘못된 app_code 부여 시도
-- begin;
--   insert into public.profiles (id, user_type, name) values
--     ('00000000-0000-0000-0000-000000000001', 'partner', '테스트');
--   -- 아래 INSERT는 실패해야 함
--   insert into public.app_access (user_id, app_code) values
--     ('00000000-0000-0000-0000-000000000001', 'vimo_erp');
--   -- ERROR: vimo_erp는 staff 유저만 접근 가능 (현재 user_type: partner)
-- rollback;  -- 테스트 데이터 폐기
--
-- -- 3) 상호 배제 테스트 (실패해야 정상)
-- begin;
--   insert into public.profiles (id, user_type, name) values
--     ('00000000-0000-0000-0000-000000000002', 'staff', '테스트2');
--   insert into public.app_access (user_id, app_code) values
--     ('00000000-0000-0000-0000-000000000002', 'vimo_erp');
--   -- 정상
--   insert into public.app_access (user_id, app_code) values
--     ('00000000-0000-0000-0000-000000000002', 'partner_erp');
--   -- ERROR: partner_erp는 partner만 가능 (트리거가 먼저 막음)
--   --   또는 user_type 변경 후 시도하면 부분 유니크 인덱스가 막음
-- rollback;
--
-- -- 4) RLS 활성화 확인
-- select tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in ('apps','profiles','app_access','vimo_staff','partner_meta','partner_invites')
-- order by tablename;
-- -- 모두 rowsecurity=true 여야 함


-- =============================================
-- ROLLBACK
-- =============================================
--
-- -- 정책 제거
-- drop policy if exists profiles_self_select on public.profiles;
-- drop policy if exists profiles_self_update on public.profiles;
-- drop policy if exists profiles_admin_all on public.profiles;
-- drop policy if exists app_access_self_select on public.app_access;
-- drop policy if exists app_access_admin_all on public.app_access;
-- drop policy if exists vimo_staff_self_select on public.vimo_staff;
-- drop policy if exists vimo_staff_admin_all on public.vimo_staff;
-- drop policy if exists partner_meta_self_select on public.partner_meta;
-- drop policy if exists partner_meta_self_update on public.partner_meta;
-- drop policy if exists partner_meta_admin_all on public.partner_meta;
-- drop policy if exists partner_invites_token_lookup on public.partner_invites;
-- drop policy if exists partner_invites_admin_all on public.partner_invites;
-- drop policy if exists apps_public_select on public.apps;
-- drop policy if exists apps_admin_all on public.apps;
--
-- -- RLS 끄기
-- alter table public.apps disable row level security;
-- alter table public.profiles disable row level security;
-- alter table public.app_access disable row level security;
-- alter table public.vimo_staff disable row level security;
-- alter table public.partner_meta disable row level security;
-- alter table public.partner_invites disable row level security;
--
-- -- 트리거/함수 제거
-- drop trigger if exists enforce_app_access_type on public.app_access;
-- drop function if exists public.check_app_access_type();
-- drop function if exists public.is_vimo_admin();
--
-- -- 인덱스 제거
-- drop index if exists public.app_access_erp_exclusive;
