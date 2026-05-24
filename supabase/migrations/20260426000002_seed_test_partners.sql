-- =============================================
-- 테스트 파트너 3명 시드 (전서현·서유진·윤현지)
-- =============================================
-- 동작:
--   1. auth.users에 직접 INSERT (메타데이터 app_source='partner_erp' 포함)
--   2. 가입 트리거 on_auth_partner_signup가 자동 발화
--      → profile(user_type='partner') + partner_meta(status='pending') + app_access(partner_erp + vibox) 생성
--   3. 비모 ERP partners 테이블에 같은 이름 있으면 legacy_partner_id 자동 매핑
--
-- 비밀번호: 모두 'Test1234!'
-- 이메일:
--   전서현: jsh@vimotest.com
--   서유진: syj@vimotest.com
--   윤현지: yhj@vimotest.com
--
-- 멱등: 같은 이메일로 재실행하면 INSERT 안 됨 (ON CONFLICT)
-- =============================================

-- 헬퍼: 새 파트너 1명 추가
do $$
declare
  v_user_id uuid;
  v_email text;
  v_name text;
  v_legacy_id uuid;
  v_password_hash text;
  partner_data record;
begin
  -- bcrypt 해시 (Test1234!)
  v_password_hash := crypt('Test1234!', gen_salt('bf'));

  for partner_data in
    select * from (values
      ('jsh@vimotest.com', '전서현', 'freelancer'),
      ('syj@vimotest.com', '서유진', 'freelancer'),
      ('yhj@vimotest.com', '윤현지', 'freelancer')
    ) as t(email, name, ptype)
  loop
    v_email := partner_data.email;
    v_name := partner_data.name;

    -- 이미 존재하면 스킵
    select id into v_user_id from auth.users where email = v_email;
    if v_user_id is not null then
      raise notice '⏭️  % (%) 이미 존재 — 스킵', v_name, v_email;
      continue;
    end if;

    -- auth.users INSERT (트리거가 자동으로 profile/partner_meta/app_access 생성)
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_email,
      v_password_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'app_source', 'partner_erp',
        'name', v_name,
        'type', partner_data.ptype
      ),
      now(),
      now(),
      '',
      '',
      '',
      ''
    )
    returning id into v_user_id;

    -- 비모 ERP partners 테이블에 같은 이름이 있으면 자동 매핑 (B안 자동 처리)
    select id into v_legacy_id
    from public.partners
    where name = v_name
    order by created_at asc
    limit 1;

    if v_legacy_id is not null then
      update public.partner_meta
      set
        legacy_partner_id = v_legacy_id,
        legacy_mapped_at = now(),
        status = 'active',
        updated_at = now()
      where profile_id = v_user_id;

      raise notice '✅ % (%) 생성 + 기존 비모 partner.% 자동 매핑',
        v_name, v_email, v_legacy_id;
    else
      raise notice '✅ % (%) 생성 (비모 partners에 같은 이름 없음 — 매핑 대기)',
        v_name, v_email;
    end if;
  end loop;
end $$;


-- =============================================
-- 검증
-- =============================================
-- select au.email, p.user_type, p.name, pm.status as 메타상태,
--        pm.legacy_partner_id as 매핑,
--        array_agg(aa.app_code || ':' || aa.status) as 권한
-- from auth.users au
-- left join public.profiles p on p.id = au.id
-- left join public.partner_meta pm on pm.profile_id = au.id
-- left join public.app_access aa on aa.user_id = au.id
-- where au.email in ('jsh@vimotest.com', 'syj@vimotest.com', 'yhj@vimotest.com')
-- group by au.email, p.user_type, p.name, pm.status, pm.legacy_partner_id
-- order by au.email;


-- =============================================
-- ROLLBACK (필요 시)
-- =============================================
-- delete from auth.users
-- where email in ('jsh@vimotest.com', 'syj@vimotest.com', 'yhj@vimotest.com');
-- -- ON DELETE CASCADE로 profile/partner_meta/app_access 자동 정리됨
