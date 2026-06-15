'use server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userProfiles } from '@/db/schema';
import { currentUser } from '@/lib/authz';
import { unstable_update } from '@/auth';

// 현재 로그인 사용자의 비밀번호 변경 (Auth.js + bcrypt). Supabase auth.updateUser 대체.
// 현재 비번을 검증한다 — 세션 탈취·공용PC 시 공격자가 비번을 바꿔 계정을 탈취하는 것 차단.
export async function changeMyPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, error: '비밀번호는 6자 이상이어야 합니다.' };
  }
  const u = await currentUser();
  if (!u) return { ok: false, error: '세션이 만료되었습니다. 다시 로그인해주세요.' };
  try {
    const [row] = await db
      .select({ passwordHash: userProfiles.passwordHash })
      .from(userProfiles)
      .where(eq(userProfiles.id, u.id))
      .limit(1);
    if (!row?.passwordHash) return { ok: false, error: '계정 정보를 확인할 수 없습니다.' };
    // 현재 비번 검증 (소유 증명)
    if (!(await bcrypt.compare(currentPassword ?? '', row.passwordHash))) {
      return { ok: false, error: '현재 비밀번호가 일치하지 않습니다.' };
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db
      .update(userProfiles)
      .set({ passwordHash: hash, needsPasswordChange: false })
      .where(eq(userProfiles.id, u.id));
    // JWT 클레임 갱신 — 미들웨어의 needsPasswordChange 강제 리다이렉트 루프 방지
    try {
      await unstable_update({ user: { needsPasswordChange: false } } as Parameters<typeof unstable_update>[0]);
    } catch { /* 클레임 갱신 실패해도 DB는 반영됨 — 재로그인 시 정상화 */ }
    return { ok: true };
  } catch (e) {
    console.error('[auth] changeMyPassword:', (e as Error).message);
    return { ok: false, error: '비밀번호 변경 중 오류가 발생했습니다.' };
  }
}
