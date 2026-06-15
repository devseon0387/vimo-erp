import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/db';
import { userProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Admin 권한 가드 (Auth.js 세션 + role).
 *
 * 사용:
 *   const guard = await requireAdmin();
 *   if (!guard.ok) return guard.response;
 *   const { user } = guard;       // { id, email, role:'admin' }
 *
 * 데이터 작업은 Drizzle(db) 직통 — 자체 PG엔 RLS 없음(app_vimoerp 풀권한).
 * 세션 무효화(rank9): JWT가 아니라 DB의 현재 role을 **라이브 조회** — 강등·삭제 즉시 반영. DB 오류 시 fail-closed.
 */
export type AdminUser = { id: string; email: string | null; role: string };
export type AdminGuardOk = { ok: true; user: AdminUser };
export type AdminGuardFail = { ok: false; response: NextResponse };

export async function requireAdmin(): Promise<AdminGuardOk | AdminGuardFail> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) {
    return { ok: false, response: NextResponse.json({ error: '인증 필요' }, { status: 401 }) };
  }
  let role: string | undefined;
  try {
    const [row] = await db
      .select({ role: userProfiles.role })
      .from(userProfiles)
      .where(eq(userProfiles.id, u.id))
      .limit(1);
    role = row?.role;
  } catch {
    return { ok: false, response: NextResponse.json({ error: '권한 확인 실패' }, { status: 503 }) };
  }
  if (role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: '권한 없음' }, { status: 403 }) };
  }
  return { ok: true, user: { id: u.id, email: u.email ?? null, role } };
}
