'use server';
/**
 * Feedback CRUD — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2).
 * ★ 기존: 브라우저 클라이언트가 직접 쿼리(feedback 테이블은 RLS 부재 = anon 키로 사실상 public).
 * ★ 변경: 서버 액션에서 Drizzle로 쿼리 + 서버에서 인증 게이트(충실번역: 가장 가벼운 require-auth).
 *   인증(currentUser)은 Phase 4까지 Supabase Auth 유지. 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 *
 * 권한 주석:
 *   - 원본 feedback 테이블엔 RLS 정책·enable이 전무(마이그레이션에 정의 없음) → 현재 anon 키로 read/insert/update 모두 가능.
 *   - Phase 2 충실번역 원칙상 권한 강화는 Phase 3로 미루되, 최소 게이트로 require-auth(로그인 필수)를 적용.
 *   - 모든 호출부(feedback/page.tsx · FeedbackModal.tsx)가 (dashboard) 인증 영역 내부라 require-auth가 현 시나리오에 무영향.
 *   - FLAG: insertFeedback은 RLS 부재로 원래 비로그인(anon) 제출이 기술적으로 가능했음. 비로그인 제출 의도였다면 Phase 3에서 anon 허용으로 완화 필요(PO 결정).
 */
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { feedback } from '@/db/schema';
import { currentUser } from '@/lib/authz';
import type { Feedback, FeedbackStatus } from '@/types';

// ─── Drizzle row → 도메인 타입 (내부 helper) ─────────────────
type Row = typeof feedback.$inferSelect;
function fromRow(r: Row): Feedback {
  return {
    id: r.id,
    content: r.content,
    pagePath: r.pagePath ?? '',
    status: (r.status ?? 'pending') as FeedbackStatus,
    createdAt: r.createdAt ?? '',
  };
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getFeedbacks(): Promise<Feedback[]> {
  if (!(await currentUser())) return [];
  const rows = await db
    .select()
    .from(feedback)
    .orderBy(desc(feedback.createdAt));
  return rows.map(fromRow);
}

export async function insertFeedback(content: string, pagePath: string): Promise<Feedback | null> {
  // FLAG: 원본은 RLS 부재라 anon insert가 사실상 허용. 충실번역 보수안으로 require-auth 적용(현 호출부는 인증 영역 내부).
  if (!(await currentUser())) return null;
  const [row] = await db
    .insert(feedback)
    .values({ content, pagePath })
    .returning();
  return row ? fromRow(row) : null;
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<boolean> {
  if (!(await currentUser())) return false;
  await db.update(feedback).set({ status }).where(eq(feedback.id, id));
  return true;
}
