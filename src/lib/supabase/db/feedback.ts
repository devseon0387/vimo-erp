'use server';
/**
 * Feedback CRUD — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2).
 * ★ 변경: 서버 액션에서 Drizzle로 쿼리 + 서버에서 인증 게이트(require-auth).
 *   인증 = Auth.js 세션 (Phase 4 전환). 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 *
 * 권한 주석 (Phase 3 정정 — 2026-06-10 라이브 Supabase pg_policies 실측):
 *   - 옛 FLAG("RLS 부재 = anon 가능")는 오진. 실제 운영 DB는 feedback에 RLS enabled +
 *     "Allow authenticated read/insert/update" 3정책(전부 TO authenticated, USING true)이 존재
 *     (마이그레이션 파일엔 없고 대시보드에서 생성된 것). 즉 원본도 anon 불가·로그인 필수.
 *   - 따라서 현 require-auth 게이트 = 원본과 정확한 패리티. anon 완화 결정 불필요(해소).
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
  // 원본 RLS "Allow authenticated insert"(TO authenticated) = 로그인 필수 — 정확한 패리티(라이브 대조).
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
