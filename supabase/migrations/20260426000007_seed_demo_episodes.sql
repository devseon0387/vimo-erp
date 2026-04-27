-- =============================================
-- 데모 에피소드 시드 (전서현·서유진·윤현지)
-- =============================================
-- 목적: 파트너 ERP 화면 데모 데이터 풍부화
--   - 마감일·status·payment_status 다양화
--   - 4월·5월·6월 분산
--   - work_steps 구조 포함
--
-- 멱등: project.title 기준으로 이미 있으면 스킵
-- =============================================

do $$
declare
  v_seohyun uuid;
  v_yujin uuid;
  v_hyunji uuid;
  v_proj uuid;
begin
  select id into v_seohyun from public.partners where name = '전서현' limit 1;
  select id into v_yujin   from public.partners where name = '서유진' limit 1;
  select id into v_hyunji  from public.partners where name = '윤현지' limit 1;

  if v_seohyun is null or v_yujin is null or v_hyunji is null then
    raise notice 'partners 테이블에 전서현/서유진/윤현지 중 일부 없음 — 시드 중단';
    return;
  end if;

  -- ─────────────────────────────────────────────
  -- 전서현 — 마리아쥬 필름 봄 시리즈
  -- ─────────────────────────────────────────────
  if not exists (select 1 from projects where title = '마리아쥬 봄 시리즈') then
    insert into projects (id, title, client, partner_id, partner_ids, status, total_amount, partner_payment, completed_at, category)
    values (gen_random_uuid(), '마리아쥬 봄 시리즈', '마리아쥬 필름', v_seohyun, array[v_seohyun::text], 'in_progress', 6000000, 3600000, null, '롱폼')
    returning id into v_proj;

    insert into episodes (id, project_id, episode_number, title, status, assignee, start_date, due_date, completed_at, budget_partner, budget_total, work_content, work_steps, payment_status, payment_due_date, invoice_status, manager) values
    (gen_random_uuid(), v_proj, 1, '23화 — 봄의 시작', 'completed', v_seohyun::text, '2026-03-20', '2026-04-10', '2026-04-08', 600000, 1000000, array['롱폼']::text[],
      '{"롱폼":[{"id":"l1","label":"원본 전달","status":"completed","completedAt":"2026-03-25"},{"id":"l2","label":"1차 종편","status":"completed","completedAt":"2026-04-02"},{"id":"l3","label":"자막","status":"completed","completedAt":"2026-04-06"},{"id":"l4","label":"최종 시안","status":"completed","completedAt":"2026-04-08"}]}'::jsonb,
      'completed', '2026-04-15', 'completed', v_seohyun::text),
    (gen_random_uuid(), v_proj, 2, '24화 — 벚꽃엔딩', 'completed', v_seohyun::text, '2026-04-01', '2026-04-25', '2026-04-22', 600000, 1000000, array['롱폼']::text[],
      '{"롱폼":[{"id":"l1","label":"원본 전달","status":"completed","completedAt":"2026-04-05"},{"id":"l2","label":"1차 종편","status":"completed","completedAt":"2026-04-15"},{"id":"l3","label":"자막","status":"completed","completedAt":"2026-04-20"},{"id":"l4","label":"최종 시안","status":"completed","completedAt":"2026-04-22"}]}'::jsonb,
      'pending', '2026-05-05', 'completed', v_seohyun::text),
    (gen_random_uuid(), v_proj, 3, '25화 — 5월의 신부', 'in_progress', v_seohyun::text, '2026-04-15', '2026-05-10', null, 600000, 1000000, array['롱폼']::text[],
      '{"롱폼":[{"id":"l1","label":"원본 전달","status":"completed","completedAt":"2026-04-20"},{"id":"l2","label":"1차 종편","status":"in_progress"},{"id":"l3","label":"자막","status":"waiting"},{"id":"l4","label":"최종 시안","status":"waiting"}]}'::jsonb,
      'pending', '2026-05-20', 'pending', v_seohyun::text),
    (gen_random_uuid(), v_proj, 4, '26화 — 한여름의 약속', 'waiting', v_seohyun::text, '2026-05-01', '2026-05-28', null, 600000, 1000000, array['롱폼']::text[],
      '{"롱폼":[{"id":"l1","label":"원본 전달","status":"waiting"},{"id":"l2","label":"1차 종편","status":"waiting"},{"id":"l3","label":"자막","status":"waiting"},{"id":"l4","label":"최종 시안","status":"waiting"}]}'::jsonb,
      'pending', null, 'pending', v_seohyun::text);
    raise notice '✓ 전서현 마리아쥬 봄 시리즈 4편 추가';
  end if;

  if not exists (select 1 from projects where title = '플레이브 4월 숏폼') then
    insert into projects (id, title, client, partner_id, partner_ids, status, total_amount, partner_payment, completed_at, category)
    values (gen_random_uuid(), '플레이브 4월 숏폼', '플레이브', v_seohyun, array[v_seohyun::text], 'in_progress', 1200000, 600000, null, '본편 숏폼')
    returning id into v_proj;

    insert into episodes (id, project_id, episode_number, title, status, assignee, start_date, due_date, completed_at, budget_partner, budget_total, work_content, work_steps, payment_status, payment_due_date, invoice_status, manager) values
    (gen_random_uuid(), v_proj, 1, '4월 1주 숏폼', 'completed', v_seohyun::text, '2026-04-03', '2026-04-12', '2026-04-11', 200000, 400000, array['숏폼']::text[],
      '{"숏폼":[{"id":"s1","label":"기획안","status":"completed","completedAt":"2026-04-05"},{"id":"s2","label":"편집","status":"completed","completedAt":"2026-04-09"},{"id":"s3","label":"썸네일","status":"completed","completedAt":"2026-04-11"}]}'::jsonb,
      'completed', '2026-04-25', 'completed', v_seohyun::text),
    (gen_random_uuid(), v_proj, 2, '4월 2주 숏폼', 'completed', v_seohyun::text, '2026-04-10', '2026-04-19', '2026-04-18', 200000, 400000, array['숏폼']::text[],
      '{"숏폼":[{"id":"s1","label":"기획안","status":"completed","completedAt":"2026-04-12"},{"id":"s2","label":"편집","status":"completed","completedAt":"2026-04-16"},{"id":"s3","label":"썸네일","status":"completed","completedAt":"2026-04-18"}]}'::jsonb,
      'completed', '2026-05-02', 'completed', v_seohyun::text),
    (gen_random_uuid(), v_proj, 3, '4월 3주 숏폼', 'in_progress', v_seohyun::text, '2026-04-17', '2026-04-30', null, 200000, 400000, array['숏폼']::text[],
      '{"숏폼":[{"id":"s1","label":"기획안","status":"completed","completedAt":"2026-04-19"},{"id":"s2","label":"편집","status":"in_progress"},{"id":"s3","label":"썸네일","status":"waiting"}]}'::jsonb,
      'pending', '2026-05-10', 'pending', v_seohyun::text),
    (gen_random_uuid(), v_proj, 4, '4월 4주 숏폼', 'waiting', v_seohyun::text, '2026-04-24', '2026-05-07', null, 200000, 400000, array['숏폼']::text[],
      '{"숏폼":[{"id":"s1","label":"기획안","status":"waiting"},{"id":"s2","label":"편집","status":"waiting"},{"id":"s3","label":"썸네일","status":"waiting"}]}'::jsonb,
      'pending', null, 'pending', v_seohyun::text);
    raise notice '✓ 전서현 플레이브 4월 숏폼 4편 추가';
  end if;

  -- ─────────────────────────────────────────────
  -- 서유진 — 디지털원 브랜딩
  -- ─────────────────────────────────────────────
  if not exists (select 1 from projects where title = '디지털원 4월 브랜딩') then
    insert into projects (id, title, client, partner_id, partner_ids, status, total_amount, partner_payment, completed_at, category)
    values (gen_random_uuid(), '디지털원 4월 브랜딩', '디지털원', v_yujin, array[v_yujin::text], 'in_progress', 4500000, 2700000, null, '롱폼')
    returning id into v_proj;

    insert into episodes (id, project_id, episode_number, title, status, assignee, start_date, due_date, completed_at, budget_partner, budget_total, work_content, work_steps, payment_status, payment_due_date, invoice_status, manager) values
    (gen_random_uuid(), v_proj, 1, '브랜딩 인트로', 'completed', v_yujin::text, '2026-04-01', '2026-04-15', '2026-04-13', 900000, 1500000, array['롱폼']::text[],
      '{"롱폼":[{"id":"l1","label":"원본 전달","status":"completed","completedAt":"2026-04-04"},{"id":"l2","label":"1차 종편","status":"completed","completedAt":"2026-04-09"},{"id":"l3","label":"최종","status":"completed","completedAt":"2026-04-13"}]}'::jsonb,
      'completed', '2026-04-25', 'completed', v_yujin::text),
    (gen_random_uuid(), v_proj, 2, 'CEO 인터뷰', 'in_progress', v_yujin::text, '2026-04-10', '2026-05-05', null, 900000, 1500000, array['롱폼']::text[],
      '{"롱폼":[{"id":"l1","label":"원본 전달","status":"completed","completedAt":"2026-04-15"},{"id":"l2","label":"1차 종편","status":"in_progress"},{"id":"l3","label":"최종","status":"waiting"}]}'::jsonb,
      'pending', '2026-05-15', 'pending', v_yujin::text),
    (gen_random_uuid(), v_proj, 3, '직원 스토리', 'waiting', v_yujin::text, '2026-04-25', '2026-05-20', null, 900000, 1500000, array['롱폼']::text[],
      '{"롱폼":[{"id":"l1","label":"원본 전달","status":"waiting"},{"id":"l2","label":"1차 종편","status":"waiting"},{"id":"l3","label":"최종","status":"waiting"}]}'::jsonb,
      'pending', null, 'pending', v_yujin::text);
    raise notice '✓ 서유진 디지털원 4월 브랜딩 3편 추가';
  end if;

  if not exists (select 1 from projects where title = '뉴스레터 자막 5월') then
    insert into projects (id, title, client, partner_id, partner_ids, status, total_amount, partner_payment, completed_at, category)
    values (gen_random_uuid(), '뉴스레터 자막 5월', '고객사 A', v_yujin, array[v_yujin::text], 'in_progress', 1500000, 900000, null, '본편 숏폼')
    returning id into v_proj;

    insert into episodes (id, project_id, episode_number, title, status, assignee, start_date, due_date, completed_at, budget_partner, budget_total, work_content, work_steps, payment_status, payment_due_date, invoice_status, manager) values
    (gen_random_uuid(), v_proj, 1, '5월 1호', 'in_progress', v_yujin::text, '2026-04-25', '2026-05-08', null, 300000, 500000, array['숏폼','자막']::text[],
      '{"숏폼":[{"id":"s1","label":"편집","status":"in_progress"},{"id":"s2","label":"썸네일","status":"waiting"}],"자막":[{"id":"c1","label":"자막 작성","status":"waiting"},{"id":"c2","label":"검수","status":"waiting"}]}'::jsonb,
      'pending', '2026-05-20', 'pending', v_yujin::text),
    (gen_random_uuid(), v_proj, 2, '5월 2호', 'waiting', v_yujin::text, '2026-05-05', '2026-05-18', null, 300000, 500000, array['숏폼','자막']::text[],
      '{"숏폼":[{"id":"s1","label":"편집","status":"waiting"},{"id":"s2","label":"썸네일","status":"waiting"}],"자막":[{"id":"c1","label":"자막 작성","status":"waiting"},{"id":"c2","label":"검수","status":"waiting"}]}'::jsonb,
      'pending', null, 'pending', v_yujin::text),
    (gen_random_uuid(), v_proj, 3, '5월 3호', 'waiting', v_yujin::text, '2026-05-15', '2026-05-28', null, 300000, 500000, array['숏폼','자막']::text[],
      '{"숏폼":[{"id":"s1","label":"편집","status":"waiting"},{"id":"s2","label":"썸네일","status":"waiting"}],"자막":[{"id":"c1","label":"자막 작성","status":"waiting"},{"id":"c2","label":"검수","status":"waiting"}]}'::jsonb,
      'pending', null, 'pending', v_yujin::text);
    raise notice '✓ 서유진 뉴스레터 자막 5월 3편 추가';
  end if;

  -- ─────────────────────────────────────────────
  -- 윤현지 — 광고영상
  -- ─────────────────────────────────────────────
  if not exists (select 1 from projects where title = '카페 봄 광고') then
    insert into projects (id, title, client, partner_id, partner_ids, status, total_amount, partner_payment, completed_at, category)
    values (gen_random_uuid(), '카페 봄 광고', '카페브랜드', v_hyunji, array[v_hyunji::text], 'in_progress', 3000000, 1800000, null, '롱폼')
    returning id into v_proj;

    insert into episodes (id, project_id, episode_number, title, status, assignee, start_date, due_date, completed_at, budget_partner, budget_total, work_content, work_steps, payment_status, payment_due_date, invoice_status, manager) values
    (gen_random_uuid(), v_proj, 1, '15초 메인 컷', 'completed', v_hyunji::text, '2026-03-25', '2026-04-12', '2026-04-10', 600000, 1000000, array['롱폼']::text[],
      '{"롱폼":[{"id":"l1","label":"콘셉트","status":"completed","completedAt":"2026-03-28"},{"id":"l2","label":"편집","status":"completed","completedAt":"2026-04-05"},{"id":"l3","label":"색보정","status":"completed","completedAt":"2026-04-10"}]}'::jsonb,
      'completed', '2026-04-22', 'completed', v_hyunji::text),
    (gen_random_uuid(), v_proj, 2, '30초 풀버전', 'in_progress', v_hyunji::text, '2026-04-05', '2026-04-30', null, 600000, 1000000, array['롱폼']::text[],
      '{"롱폼":[{"id":"l1","label":"콘셉트","status":"completed","completedAt":"2026-04-08"},{"id":"l2","label":"편집","status":"in_progress"},{"id":"l3","label":"색보정","status":"waiting"}]}'::jsonb,
      'pending', '2026-05-10', 'pending', v_hyunji::text),
    (gen_random_uuid(), v_proj, 3, '소셜용 9:16', 'waiting', v_hyunji::text, '2026-04-20', '2026-05-15', null, 600000, 1000000, array['롱폼','숏폼']::text[],
      '{"롱폼":[{"id":"l1","label":"콘셉트","status":"waiting"},{"id":"l2","label":"편집","status":"waiting"}],"숏폼":[{"id":"s1","label":"세로컷 변환","status":"waiting"}]}'::jsonb,
      'pending', null, 'pending', v_hyunji::text);
    raise notice '✓ 윤현지 카페 봄 광고 3편 추가';
  end if;

  if not exists (select 1 from projects where title = '교육 시리즈 4월') then
    insert into projects (id, title, client, partner_id, partner_ids, status, total_amount, partner_payment, completed_at, category)
    values (gen_random_uuid(), '교육 시리즈 4월', '에듀스타', v_hyunji, array[v_hyunji::text], 'in_progress', 2400000, 1200000, null, '롱폼')
    returning id into v_proj;

    insert into episodes (id, project_id, episode_number, title, status, assignee, start_date, due_date, completed_at, budget_partner, budget_total, work_content, work_steps, payment_status, payment_due_date, invoice_status, manager) values
    (gen_random_uuid(), v_proj, 1, '1강 — 입문', 'completed', v_hyunji::text, '2026-04-03', '2026-04-20', '2026-04-19', 400000, 800000, array['롱폼']::text[],
      '{"롱폼":[{"id":"l1","label":"녹화 검수","status":"completed","completedAt":"2026-04-08"},{"id":"l2","label":"편집","status":"completed","completedAt":"2026-04-15"},{"id":"l3","label":"자막","status":"completed","completedAt":"2026-04-19"}]}'::jsonb,
      'pending', '2026-05-02', 'completed', v_hyunji::text),
    (gen_random_uuid(), v_proj, 2, '2강 — 기초', 'in_progress', v_hyunji::text, '2026-04-15', '2026-05-05', null, 400000, 800000, array['롱폼']::text[],
      '{"롱폼":[{"id":"l1","label":"녹화 검수","status":"completed","completedAt":"2026-04-18"},{"id":"l2","label":"편집","status":"in_progress"},{"id":"l3","label":"자막","status":"waiting"}]}'::jsonb,
      'pending', '2026-05-15', 'pending', v_hyunji::text);
    raise notice '✓ 윤현지 교육 시리즈 4월 2편 추가';
  end if;

end $$;
