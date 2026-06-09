'use server';
/**
 * Sent Emails CRUD — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2, 버킷 B).
 * ★ 기존: 브라우저 클라이언트가 직접 쿼리(RLS가 보호).
 * ★ 변경: 'use server' 서버 액션에서 Drizzle로 쿼리 + 서버에서 권한 검사.
 *   RLS: sent_emails_authenticated_all = for all to authenticated using(true) with check(true)
 *   → permissive(로그인 필수, 소유/관리자 제약 없음). Phase 2는 "현 동작 그대로 충실 번역"이
 *   원칙이라 로그인 가드만 적용(권한 강화는 Phase 3).
 *   인증(currentUser)은 Phase 4까지 Supabase Auth 유지. 호출부는 동일 시그니처라 무변경.
 *   ※ 버킷 B: 모든 export는 async 함수만. 매퍼/Row 타입은 내부 non-export helper로 강등
 *     (기존 export 매퍼 2종·SentEmailRow는 외부 미사용이라 호출부 영향 0).
 */
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { sentEmails } from '@/db/schema';
import { currentUser } from '@/lib/authz';
import type { SentEmail } from '@/types';

// ─── Drizzle row → 도메인 타입 (내부 helper) ───
type Row = typeof sentEmails.$inferSelect;
function fromRow(r: Row): SentEmail {
  return {
    id: r.id,
    senderEmail: r.senderEmail,
    to: r.to,
    cc: r.cc ?? undefined,
    bcc: r.bcc ?? undefined,
    subject: r.subject,
    content: r.content,
    status: r.status as SentEmail['status'],
    createdAt: r.createdAt ?? '',
  };
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getSentEmails(): Promise<SentEmail[]> {
  if (!(await currentUser())) return [];
  const rows = await db
    .select()
    .from(sentEmails)
    .orderBy(desc(sentEmails.createdAt))
    .limit(200);
  return rows.map(fromRow);
}

export async function getSentEmailById(id: string): Promise<SentEmail | null> {
  if (!(await currentUser())) return null;
  const [row] = await db
    .select()
    .from(sentEmails)
    .where(eq(sentEmails.id, id))
    .limit(1);
  return row ? fromRow(row) : null;
}

export async function insertSentEmail(email: {
  senderId?: string;
  senderEmail: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  content: string;
}): Promise<SentEmail | null> {
  if (!(await currentUser())) return null;
  const [row] = await db
    .insert(sentEmails)
    .values({
      senderId: email.senderId ?? null,
      senderEmail: email.senderEmail,
      to: email.to,
      cc: email.cc ?? null,
      bcc: email.bcc ?? null,
      subject: email.subject,
      content: email.content,
      // status는 schema default('sent')라 미지정 → DB default 적용(기존 매퍼도 미포함).
    })
    .returning();
  return row ? fromRow(row) : null;
}

export async function deleteSentEmail(id: string): Promise<boolean> {
  if (!(await currentUser())) return false;
  await db.delete(sentEmails).where(eq(sentEmails.id, id));
  return true;
}
