'use server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userProfiles } from '@/db/schema';
import { currentUser } from '@/lib/authz';

// 본인 프로필(이름/이메일) 수정 — Supabase auth.updateUser 대체.
export async function updateMyProfile(input: {
  name?: string;
  email?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const u = await currentUser();
  if (!u) return { ok: false, error: '세션이 만료되었습니다. 다시 로그인해주세요.' };

  const set: Partial<typeof userProfiles.$inferInsert> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.email) {
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return { ok: false, error: '올바른 이메일 형식이 아닙니다.' };
    }
    // 다른 사용자가 쓰는 이메일인지 체크 (authorize는 이메일로 조회)
    const dup = await db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.email, email))
      .limit(1);
    if (dup[0] && dup[0].id !== u.id) {
      return { ok: false, error: '이미 사용 중인 이메일입니다.' };
    }
    set.email = email;
  }

  if (Object.keys(set).length === 0) return { ok: true };

  try {
    await db.update(userProfiles).set(set).where(eq(userProfiles.id, u.id));
    return { ok: true };
  } catch (e) {
    console.error('[auth] updateMyProfile:', (e as Error).message);
    return { ok: false, error: '저장 중 오류가 발생했습니다.' };
  }
}
