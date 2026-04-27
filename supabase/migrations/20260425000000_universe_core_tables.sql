-- =============================================
-- 비모 유니버스 인증 코어 — Phase 1: 새 테이블 생성
-- =============================================
-- 목표:
--   비모 ERP · 파트너 ERP · Vibox · 향후 서비스 통합 인증을 위한
--   공용 테이블 6개를 생성. 기존 시스템(user_profiles, partners 등)에는
--   영향 0 — 새 테이블만 추가.
--
-- 생성되는 테이블:
--   1. apps             — 앱 카탈로그 (vimo_erp, partner_erp, vibox, ...)
--   2. profiles         — 공용 프로필 (user_type 분기)
--   3. app_access       — 사용자 × 앱 권한 매핑
--   4. vimo_staff       — 비모 팀원 메타
--   5. partner_meta     — 파트너 ERP 사용자 메타 (legacy_partner_id로 기존 partners 연결)
--   6. partner_invites  — 일회용 초대 토큰
--
-- 영향 범위:
--   - 기존 테이블 변경: 없음
--   - 기존 코드 변경: 없음 (Phase 4에서 코드 변경)
--   - 사용자 체감: 없음 (비모 ERP 정상 동작)
--
-- 멱등성:
--   모든 SQL이 IF NOT EXISTS / ON CONFLICT 처리. 재실행 안전.
--
-- 롤백 방법 (필요 시):
--   파일 하단의 -- ROLLBACK 블록 참고
-- =============================================

-- ---------------------------------------------
-- 1. apps — 앱 카탈로그
-- ---------------------------------------------
create table if not exists public.apps (
  code         text primary key,
  name         text not null,
  domain       text,
  sso_enabled  boolean not null default true,
  description  text,
  created_at   timestamptz not null default now()
);

comment on table public.apps is '비모 유니버스 앱 카탈로그 — 새 앱 추가 시 이 테이블에 등록';

-- 시드: 현재 운영 중인 3개 앱
insert into public.apps (code, name, domain, description) values
  ('vimo_erp',    '비모 ERP',     'erp.vi-mo.kr',     '비모 팀 영상 제작 프로젝트 관리'),
  ('partner_erp', '파트너 ERP',   'partner.vi-mo.kr', '파트너용 회차/정산/거래처 조회'),
  ('vibox',       'Vibox',        'vibox.cloud',      '비모 내부 파일 공유 플랫폼')
on conflict (code) do nothing;


-- ---------------------------------------------
-- 2. profiles — 공용 프로필 (auth.users 1:1 확장)
-- ---------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  user_type   text not null default 'staff'
              check (user_type in ('staff', 'partner', 'external')),
  name        text,
  avatar_url  text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is '공용 프로필 — auth.users와 1:1, user_type으로 staff/partner 분기';
comment on column public.profiles.user_type is 'staff: 비모 팀원 | partner: 외부 파트너 | external: 외부 협력사 (예약)';


-- ---------------------------------------------
-- 3. app_access — 사용자 × 앱 권한 매핑
-- ---------------------------------------------
create table if not exists public.app_access (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  app_code          text not null references public.apps(code),
  role              text not null default 'member',
  status            text not null default 'active'
                    check (status in ('active', 'suspended')),
  joined_at         timestamptz not null default now(),
  last_accessed_at  timestamptz,
  unique (user_id, app_code)
);

comment on table public.app_access is '사용자가 어떤 앱에 어떤 권한으로 접근 가능한지 정의 (N:N)';
comment on column public.app_access.role is 'admin | manager | member | partner ... 앱 내부에서 의미 부여';


-- ---------------------------------------------
-- 4. vimo_staff — 비모 팀원 메타 (staff 전용)
-- ---------------------------------------------
create table if not exists public.vimo_staff (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  department  text,
  position    text,
  hire_date   date,
  created_at  timestamptz not null default now()
);

comment on table public.vimo_staff is '비모 팀원 추가 정보 — profile.user_type=staff인 사용자만';


-- ---------------------------------------------
-- 5. partner_meta — 파트너 ERP 사용자 메타
-- ---------------------------------------------
-- 이름 충돌 회피: 비모 ERP에 이미 'partners' 테이블이 외주 인력 관리용으로 존재.
-- 새 테이블은 'partner_meta'로 명명하고, legacy_partner_id로 기존 partners.id 연결.
-- 가입 시점에 legacy_partner_id는 null. 비모 팀이 매핑 승인 시 채워짐.

create table if not exists public.partner_meta (
  profile_id          uuid primary key references public.profiles(id) on delete cascade,
  type                text not null check (type in ('freelancer', 'business')),
  tier                text,
  bank_name           text,
  bank_account        text,
  bank_holder         text,
  work_formats        text[] not null default '{}',
  status              text not null default 'pending'
                      check (status in ('pending', 'active', 'suspended')),
  started_at          date,
  legacy_partner_id   uuid,  -- 기존 비모 ERP partners.id (매핑 승인 시 채워짐)
  legacy_mapped_at    timestamptz,
  legacy_mapped_by    uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- legacy_partner_id에 대한 외래키는 기존 partners 테이블이 존재한다는 가정 하에 추가
-- (별도 단계로 분리해 안전하게 처리 — partners 테이블이 있는지 먼저 확인)
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'partners') then

    -- 외래키가 이미 있으면 스킵
    if not exists (
      select 1 from information_schema.table_constraints
      where table_schema = 'public'
        and table_name = 'partner_meta'
        and constraint_name = 'partner_meta_legacy_partner_fk'
    ) then
      alter table public.partner_meta
        add constraint partner_meta_legacy_partner_fk
        foreign key (legacy_partner_id)
        references public.partners(id)
        on delete restrict;  -- partners 삭제 막음 (Phase 5 함정 #5 대응)
    end if;
  end if;
end $$;

comment on table public.partner_meta is '파트너 ERP 사용자 추가 정보 + 기존 partners 매핑 (B안)';
comment on column public.partner_meta.legacy_partner_id is '기존 비모 ERP partners.id — admin이 매핑 승인 시 채워짐. NULL이면 회차 데이터 안 보임';
comment on column public.partner_meta.status is 'pending: 가입했지만 매핑 대기 | active: 매핑 완료 | suspended: 비활성';


-- ---------------------------------------------
-- 6. partner_invites — 일회용 초대 토큰
-- ---------------------------------------------
create table if not exists public.partner_invites (
  id              uuid primary key default gen_random_uuid(),
  token           text unique not null,
  invited_email   text,
  invited_name    text,                                -- admin 입력 (선택, prefill용)
  invited_by      uuid references public.profiles(id), -- 발송한 비모 팀원
  legacy_hint_id  uuid,                                -- (선택) 매핑할 partners.id 미리 지정
  expires_at      timestamptz not null default (now() + interval '7 days'),
  used_at         timestamptz,
  used_by         uuid references public.profiles(id), -- 이 토큰으로 가입한 사용자
  status          text not null default 'pending'
                  check (status in ('pending', 'used', 'expired', 'revoked')),
  created_at      timestamptz not null default now()
);

comment on table public.partner_invites is '파트너 가입용 일회용 초대 토큰 (7일 만료, 일회용, revoke 가능)';
comment on column public.partner_invites.legacy_hint_id is '비모 팀이 발송 시 미리 지정한 매핑 후보 partners.id (선택). 매핑은 가입 후 별도 승인.';


-- ---------------------------------------------
-- 인덱스
-- ---------------------------------------------
create index if not exists idx_app_access_user
  on public.app_access(user_id);

create index if not exists idx_app_access_app_status
  on public.app_access(app_code, status);

create index if not exists idx_partner_meta_legacy
  on public.partner_meta(legacy_partner_id)
  where legacy_partner_id is not null;

create index if not exists idx_partner_meta_status
  on public.partner_meta(status);

create index if not exists idx_partner_invites_token
  on public.partner_invites(token)
  where status = 'pending';

create index if not exists idx_partner_invites_status_expires
  on public.partner_invites(status, expires_at);


-- ---------------------------------------------
-- updated_at 자동 갱신 트리거 (profiles, partner_meta)
-- ---------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists partner_meta_updated_at on public.partner_meta;
create trigger partner_meta_updated_at
  before update on public.partner_meta
  for each row execute function public.set_updated_at();


-- =============================================
-- 검증 쿼리 (참고용 — 적용 후 별도 실행)
-- =============================================
--
-- -- 1) 6개 테이블 모두 생성됐는지
-- select table_name from information_schema.tables
-- where table_schema = 'public'
--   and table_name in ('apps','profiles','app_access','vimo_staff','partner_meta','partner_invites')
-- order by table_name;
-- -- 6 rows 반환되면 성공
--
-- -- 2) 시드 데이터 확인
-- select code, name, domain from public.apps order by code;
-- -- 3 rows: partner_erp, vibox, vimo_erp
--
-- -- 3) 외래키 등록 확인
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.partner_meta'::regclass
--   and contype = 'f';
--
-- -- 4) 기존 비모 ERP 정상 동작 확인
-- --    → 비모 ERP 로그인 후 /management, /projects, /partners 페이지 정상 로드


-- =============================================
-- ROLLBACK (필요 시 — 순서 중요: 의존성 역순)
-- =============================================
--
-- drop table if exists public.partner_invites cascade;
-- drop table if exists public.partner_meta cascade;
-- drop table if exists public.vimo_staff cascade;
-- drop table if exists public.app_access cascade;
-- drop table if exists public.profiles cascade;
-- drop table if exists public.apps cascade;
-- drop function if exists public.set_updated_at() cascade;
