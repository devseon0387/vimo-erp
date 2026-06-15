'use server';
import { auth } from '@/auth';
import { db } from '@/db';
import { userProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

// 클라이언트 컴포넌트(레이아웃)가 현재 세션 정보를 읽기 위한 서버 액션.
// Auth.js 세션은 httpOnly 쿠키라 브라우저 JS가 직접 못 읽으므로 액션으로 노출.
//
// 세션 무효화: JWT 스냅샷이 아니라 DB를 **라이브 재검증**한다.
// 정지(approved=false)·삭제·역할변경이 JWT 만료를 기다리지 않고 다음 페이지 로드에서 반영 →
// 레이아웃이 (role!=='admin' && !approved) 또는 null 이면 로그인으로 바운스.
export async function getSessionUser(): Promise<
  { id: string; email: string | null; name: string | null; role: string; approved: boolean; needsPasswordChange: boolean; userType: string } | null
> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return null;
  try {
    const [row] = await db
      .select({
        role: userProfiles.role,
        approved: userProfiles.approved,
        needsPasswordChange: userProfiles.needsPasswordChange,
        name: userProfiles.name,
        email: userProfiles.email,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, uid))
      .limit(1);
    if (!row) {
      // user_profiles에 없는 계정 — 파트너 세션이면 JWT 스냅샷 반환(파트너 페이지가 사용),
      // 스태프인데 행이 없으면 삭제된 계정 → 세션 무효
      if (session.user.userType === 'partner') {
        return {
          id: uid,
          email: session.user.email ?? null,
          name: session.user.name ?? null,
          role: session.user.role,
          approved: session.user.approved,
          needsPasswordChange: session.user.needsPasswordChange,
          userType: session.user.userType,
        };
      }
      return null;
    }
    return {
      id: uid,
      email: row.email ?? session.user.email ?? null,
      name: row.name ?? session.user.name ?? null,
      role: row.role,
      approved: row.approved === true,
      needsPasswordChange: row.needsPasswordChange === true,
      userType: session.user.userType,
    };
  } catch (e) {
    console.error('[auth] getSessionUser:', (e as Error).message);
    // DB 오류 시 JWT 스냅샷 폴백(가용성). 변이는 authz 가드가 fail-closed로 별도 차단.
    return {
      id: uid,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      role: session.user.role,
      approved: session.user.approved,
      needsPasswordChange: session.user.needsPasswordChange,
      userType: session.user.userType,
    };
  }
}
