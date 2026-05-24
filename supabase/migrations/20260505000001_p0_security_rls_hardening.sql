-- P0 보안 강화: 2026-05-05
-- 1. sent_emails: ENABLE RLS + authenticated 한정 (anon 키만으로 메일 본문 노출 방지)
-- 2. inquiries:   ENABLE RLS + authenticated 전체 + anon INSERT만 (외부 문의 폼 호환)
-- 3. expenses:    `for all using(true)` 정책을 authenticated 한정으로 좁힘
--
-- sent_emails / inquiries 테이블은 supabase 대시보드에서 수동 생성됐을 수 있어
-- do-block + pg_tables 존재 체크로 멱등 처리. 이미 RLS·정책이 켜져 있어도 안전.

do $do$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'sent_emails') then
    execute 'alter table public.sent_emails enable row level security';
    execute 'drop policy if exists "sent_emails_authenticated_all" on public.sent_emails';
    execute 'create policy "sent_emails_authenticated_all" on public.sent_emails for all to authenticated using (true) with check (true)';
  end if;
end
$do$;

do $do$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'inquiries') then
    execute 'alter table public.inquiries enable row level security';
    execute 'drop policy if exists "inquiries_authenticated_all" on public.inquiries';
    execute 'drop policy if exists "inquiries_anon_insert" on public.inquiries';
    execute 'create policy "inquiries_authenticated_all" on public.inquiries for all to authenticated using (true) with check (true)';
    -- 외부 문의 폼(비모 홈페이지 등)은 anon 키로 INSERT 만 수행. 봇 스팸 차단은 후속.
    execute 'create policy "inquiries_anon_insert" on public.inquiries for insert to anon with check (true)';
  end if;
end
$do$;

-- expenses: 이미 RLS 활성. 기존 `expenses_all`(anon 포함 ALL) 정책 교체.
drop policy if exists "expenses_all" on public.expenses;
drop policy if exists "expenses_authenticated_all" on public.expenses;
create policy "expenses_authenticated_all" on public.expenses
  for all to authenticated
  using (true) with check (true);
