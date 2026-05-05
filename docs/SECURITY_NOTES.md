# 보안 점검 메모 (2026-05-02 기준)

## 🔴 즉시 검토 필요

### bibot Claude CLI `--dangerously-skip-permissions`
**위치**: `src/app/api/bibot/route.ts:111`

현재 인증된 사용자가 보낸 메시지로 `claude` CLI를 풀권한 (`--dangerously-skip-permissions`)으로 실행 중. 세션 탈취 시:

- Bash 도구로 서버에서 임의 명령 실행
- 서버 파일 읽기/쓰기
- 네트워크 호출

**완화책 (우선순위)**:

1. **권한 화이트리스트 적용** — `--dangerously-skip-permissions` 제거하고 `--allowedTools "Bash(curl:*),Read,Write"` 같이 필요한 도구만
2. **별도 컨테이너/사용자로 격리** — bibot 전용 OS 사용자에서 spawn, 디스크 접근 제한
3. **Rate limit** — 사용자당 분당 요청 수 제한 (현재 없음)
4. **Allowed tool list whitelisting** Claude Code의 `--strict-mcp-config` 또는 `permissionMode`로 read-only 제한
5. **격리 호스트로 분리** — bibot이 ERP 서버와 같은 호스트에서 spawn하지 말고 별도 마이크로서비스로

## 🟡 RLS 검증 필요

### `partners`, `clients`, `projects`, `episodes`, `trash` 등 핵심 비즈니스 테이블
이 테이블들은 마이그레이션에서 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`가 명시적으로 안 보이지만, 정책(`CREATE POLICY`)은 등록되어 있음. Supabase는 정책만으로 RLS 활성화하지 않으므로 **실제 RLS가 켜져있는지 dashboard에서 검증 필요**.

확인 방법:
```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```
`rowsecurity = true` 인지 확인. `false`면 정책이 무력화되어 인증되지 않은 anon 키로도 접근 가능.

복구 마이그레이션 (필요 시):
```sql
alter table partners enable row level security;
alter table clients enable row level security;
alter table projects enable row level security;
alter table episodes enable row level security;
alter table trash enable row level security;
alter table portfolio_items enable row level security;
alter table sent_emails enable row level security;
alter table inquiries enable row level security;
-- ... 모든 비즈니스 테이블
```

## 🟢 잘 되어 있는 것

- DOMPurify 메일 본문 sanitize ✓
- Service role 키 사용은 admin 가드 통과 시에만 (`requireAdmin()` 헬퍼로 통일됨)
- 이중 인증 (`user_profiles` + `app_access`)
- proxy.ts에서 인증 못 받으면 즉시 signOut + /login 리다이렉트
- 마이그레이션에 `DROP TABLE` 0개

## 📋 권장 후속 작업

| # | 작업 | 우선순위 |
|---|---|---|
| 1 | bibot에 `--allowedTools` 적용 | 🔴 |
| 2 | bibot 사용자별 rate limit | 🔴 |
| 3 | RLS dashboard에서 핵심 테이블 검증 | 🔴 |
| 4 | Sentry 같은 에러 추적 도입 | 🟡 |
| 5 | API 라우트 zod 입력 검증 | 🟡 |
| 6 | 서비스 role 키 회전 정책 (90일마다) | 🟡 |
