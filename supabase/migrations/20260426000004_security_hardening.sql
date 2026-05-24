-- =============================================
-- 보안 강화 (Sec #1, #3, #11, #12)
-- =============================================
-- #1 Invite-only 가입: signup 트리거가 토큰 검증
-- #3 clients RLS 좁히기: 본인 프로젝트의 client만
-- #11 Audit log: app_access·partner_meta 변경 자동 기록
-- #12 vibox 권한: 가입 시 → 매핑 승인 시점으로 이동
-- =============================================

-- ---------------------------------------------
-- A. signup 트리거: invite token 필수 + vibox 부여 제거
-- ---------------------------------------------
create or replace function public.handle_new_partner_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app_source text;
  v_invite_token text;
  v_invite_id uuid;
  v_invite_email text;
  v_invite_legacy_id uuid;
  v_name text;
  v_type text;
begin
  v_app_source := new.raw_user_meta_data->>'app_source';

  if v_app_source is null or v_app_source != 'partner_erp' then
    return new;
  end if;

  -- 토큰 필수 (Sec #1)
  v_invite_token := new.raw_user_meta_data->>'invite_token';
  if v_invite_token is null or v_invite_token = '' then
    raise exception '초대 토큰이 필요합니다.';
  end if;

  -- 토큰 검증
  select id, invited_email, legacy_hint_id
    into v_invite_id, v_invite_email, v_invite_legacy_id
  from public.partner_invites
  where token = v_invite_token
    and status = 'pending'
    and expires_at > now()
  limit 1;

  if v_invite_id is null then
    raise exception '유효하지 않거나 만료된 초대 링크입니다.';
  end if;

  -- 이메일 고정 옵션 — invited_email이 있으면 그 이메일로만 가입 허용
  if v_invite_email is not null and v_invite_email != '' and lower(v_invite_email) != lower(new.email) then
    raise exception '초대된 이메일(%) 과 가입 이메일이 다릅니다.', v_invite_email;
  end if;

  v_name := coalesce(nullif(new.raw_user_meta_data->>'name', ''), new.email);
  v_type := coalesce(nullif(new.raw_user_meta_data->>'type', ''), 'freelancer');

  -- profile
  insert into public.profiles (id, user_type, name, email, phone, created_at)
  values (
    new.id, 'partner', v_name, new.email,
    new.raw_user_meta_data->>'phone',
    now()
  )
  on conflict (id) do nothing;

  -- partner_meta — invite의 legacy_hint_id가 있으면 자동 매핑 시도
  insert into public.partner_meta (profile_id, type, status, legacy_partner_id)
  values (
    new.id, v_type,
    case when v_invite_legacy_id is not null then 'active' else 'pending' end,
    v_invite_legacy_id
  )
  on conflict (profile_id) do nothing;

  -- partner_erp 권한
  insert into public.app_access (user_id, app_code, role, status)
  values (new.id, 'partner_erp', 'partner', 'active')
  on conflict (user_id, app_code) do nothing;

  -- vibox는 가입 시 부여하지 않음 (Sec #12) — 매핑 승인 시 부여

  -- 토큰 사용 처리
  update public.partner_invites
  set status = 'used', used_at = now(), used_by = new.id
  where id = v_invite_id;

  return new;
end;
$$;


-- ---------------------------------------------
-- B. 매핑 승인 시 vibox 자동 부여 (Sec #12)
-- ---------------------------------------------
-- partner_meta.legacy_partner_id가 NULL → 값으로 변경 시 자동으로 vibox 부여
create or replace function public.grant_vibox_on_mapping()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- legacy_partner_id가 새로 채워졌을 때만 (NULL → not NULL)
  if new.legacy_partner_id is not null and (old.legacy_partner_id is null or old.legacy_partner_id != new.legacy_partner_id) then
    insert into public.app_access (user_id, app_code, role, status)
    values (new.profile_id, 'vibox', 'member', 'active')
    on conflict (user_id, app_code) do update set status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists on_partner_mapped_grant_vibox on public.partner_meta;
create trigger on_partner_mapped_grant_vibox
  after update on public.partner_meta
  for each row execute function public.grant_vibox_on_mapping();


-- ---------------------------------------------
-- C. clients RLS 좁히기 (Sec #3)
-- ---------------------------------------------
-- projects 테이블에는 client_id FK가 없고 client(text) 이름만 저장됨
-- → clients.name과 projects.client 텍스트 매칭으로 좁히기
drop policy if exists "partner_self_clients_select" on public.clients;
create policy "partner_self_clients_select" on public.clients
  for select to authenticated
  using (
    public.my_legacy_partner_id_text() is not null
    and exists (
      select 1 from public.projects p
      where p.client = public.clients.name
        and (
          p.partner_id::text = public.my_legacy_partner_id_text()
          or exists (
            select 1 from public.episodes e
            where e.project_id::text = p.id::text
              and e.assignee::text = public.my_legacy_partner_id_text()
          )
        )
    )
  );


-- ---------------------------------------------
-- D. Audit log (Sec #11)
-- ---------------------------------------------
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  row_id      uuid,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id    uuid,                        -- auth.uid() 시점
  diff        jsonb,                       -- 변경 전/후
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_log_table_row on public.audit_log(table_name, row_id, created_at desc);
create index if not exists idx_audit_log_actor on public.audit_log(actor_id, created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log
  for select using (public.is_vimo_admin());


-- 공통 audit 트리거 함수
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_id uuid;
  v_diff jsonb;
begin
  v_row_id := coalesce(
    case tg_op when 'DELETE' then (to_jsonb(old)->>'id')::uuid else (to_jsonb(new)->>'id')::uuid end,
    case tg_op when 'DELETE' then (to_jsonb(old)->>'profile_id')::uuid else (to_jsonb(new)->>'profile_id')::uuid end,
    case tg_op when 'DELETE' then (to_jsonb(old)->>'user_id')::uuid else (to_jsonb(new)->>'user_id')::uuid end
  );

  if tg_op = 'INSERT' then
    v_diff := jsonb_build_object('new', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    v_diff := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  else
    v_diff := jsonb_build_object('old', to_jsonb(old));
  end if;

  insert into public.audit_log (table_name, row_id, action, actor_id, diff)
  values (tg_table_name, v_row_id, tg_op, auth.uid(), v_diff);

  return coalesce(new, old);
end;
$$;

-- app_access 변경 감사
drop trigger if exists audit_app_access on public.app_access;
create trigger audit_app_access
  after insert or update or delete on public.app_access
  for each row execute function public.write_audit_log();

-- partner_meta 변경 감사
drop trigger if exists audit_partner_meta on public.partner_meta;
create trigger audit_partner_meta
  after insert or update or delete on public.partner_meta
  for each row execute function public.write_audit_log();
