-- =============================================
-- 보안 강화 — 파트너 민감 컬럼 분리 (Sec #10)
-- =============================================
-- partners 테이블의 민감 컬럼 (계좌·연락처)은
-- 비모 admin만 조회 가능하도록 RLS 분기.
--
-- 일반 staff: 이름·소속·유형 정도만 조회
-- admin: 모든 컬럼 조회
-- 파트너 본인: 자기 row 전체 조회
--
-- 구현 방식:
--   1. 컬럼 단위 RLS는 PostgreSQL이 직접 지원 안 하므로
--      "보기용 view"를 만들고 staff는 view를 통해 조회
--   2. 또는 column-level grants — Supabase에서 까다로움
--
-- 가장 실용적: VIEW partners_safe 만들고 클라이언트 코드에서 사용
-- 하지만 비모 ERP 기존 코드는 partners 테이블 직접 사용 → 영향 큼
--
-- 차선: RLS 그대로 유지하고 알림으로만 — admin이 조회한 row를 audit_log에
--       기록하는 트리거 추가 (Sec #11과 결합)
--
-- 본 마이그레이션은 audit 강화에 집중. 컬럼 분리는 Phase 8로 연기.
-- =============================================

-- partners 변경 감사 로그 추가
drop trigger if exists audit_partners on public.partners;
create trigger audit_partners
  after insert or update or delete on public.partners
  for each row execute function public.write_audit_log();

-- profiles 변경 감사 로그 추가
drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.write_audit_log();

-- 향후 컬럼 분리 작업 메모:
--   - partners 테이블에 sensitive 컬럼: bank, bank_account, phone, email
--   - 옵션 1: SELECT 시 vimo_team이지만 admin이 아닌 경우 NULL 반환하도록 정책 분기
--   - 옵션 2: SECURITY DEFINER VIEW로 sanitized partners_basic 노출
--   - 옵션 3: 클라이언트에서 명시적으로 select(컬럼 명시) — 코드 검토 필요
