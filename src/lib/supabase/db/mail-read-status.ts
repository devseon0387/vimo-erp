'use server';
/**
 * 메일 읽음 상태 DAL — 사용자별(per-user) 받은 메일 읽음 표시.
 * ★ 서버 전용(Drizzle). 라우트 핸들러에서만 호출.
 *
 *  - getReadUids(userId)      : 해당 유저가 읽은 mail_uid 목록 (선택적으로 uids 교집합으로 한정)
 *  - markMailRead(userId, …)  : 읽음 표시 upsert (유니크 (user_id, mail_uid) → onConflictDoNothing)
 *
 * mail_uid 는 inbound.ts 의 InboundEmail.uid(=S3 객체키/샘플 파일명).
 */
import { inArray, eq, and } from 'drizzle-orm';
import { db } from '@/db';
import { mailReadStatus } from '@/db/schema';

/** 유저가 읽은 mail_uid 목록. onlyUids 주면 그 교집합만(목록 페이로드 최소화). */
export async function getReadUids(userId: string, onlyUids?: string[]): Promise<string[]> {
  if (!userId) return [];
  if (onlyUids && onlyUids.length === 0) return [];
  const where = onlyUids
    ? and(eq(mailReadStatus.userId, userId), inArray(mailReadStatus.mailUid, onlyUids))
    : eq(mailReadStatus.userId, userId);
  const rows = await db
    .select({ mailUid: mailReadStatus.mailUid })
    .from(mailReadStatus)
    .where(where)
    .limit(2000);
  return rows.map((r) => r.mailUid);
}

/** 읽음 표시(여러 개). 이미 읽은 건 onConflictDoNothing 으로 무시. */
export async function markMailRead(userId: string, uids: string[]): Promise<void> {
  if (!userId) return;
  const clean = [...new Set(uids.map((u) => String(u).trim()).filter(Boolean))].slice(0, 200);
  if (clean.length === 0) return;
  await db
    .insert(mailReadStatus)
    .values(clean.map((mailUid) => ({ userId, mailUid })))
    .onConflictDoNothing();
}
