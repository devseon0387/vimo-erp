'use server';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { profiles, partnerMeta, appAccess } from '@/db/schema';
import { currentUser } from '@/lib/authz';

// 파트너 자가 가입 — Supabase auth.signUp(+트리거) 대체.
// profiles(user_type=partner) + partner_meta(pending) 생성. 비번 bcrypt.
// 가입 후 클라가 signIn('credentials')로 세션 확립 → /welcome.
export async function partnerSignup(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ ok: boolean; error?: string }> {
  const email = String(input.email ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim();
  const password = String(input.password ?? '');

  if (!email || !name || !password) return { ok: false, error: '모든 항목을 입력해주세요.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: '이메일 형식이 올바르지 않습니다.' };
  }
  if (password.length < 8) {
    return { ok: false, error: '비밀번호는 8자 이상으로 입력해주세요.' };
  }

  // 중복 이메일 점유 확인
  const dup = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1);
  if (dup[0]) return { ok: false, error: '이미 가입된 이메일입니다. 로그인해주세요.' };

  try {
    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(profiles).values({
      id,
      userType: 'partner',
      name,
      email,
      passwordHash,
    });
    await db.insert(partnerMeta).values({
      profileId: id,
      type: 'freelancer', // 기본값(이후 관리자/온보딩에서 조정)
      status: 'pending',
      workFormats: [],
    });
    return { ok: true };
  } catch (e) {
    console.error('[auth] partnerSignup:', (e as Error).message);
    return { ok: false, error: '가입 처리 중 오류가 발생했습니다.' };
  }
}

// 파트너 환영 페이지용 — 본인 partner_meta 상태 + vibox 접근권 조회.
export async function getMyPartnerStatus(): Promise<{
  status: 'pending' | 'active' | 'suspended' | 'unknown';
  viboxEnabled: boolean;
} | null> {
  const u = await currentUser();
  if (!u) return null;
  try {
    const [pm] = await db
      .select({ status: partnerMeta.status })
      .from(partnerMeta)
      .where(eq(partnerMeta.profileId, u.id))
      .limit(1);
    const [vibox] = await db
      .select({ status: appAccess.status })
      .from(appAccess)
      .where(and(eq(appAccess.userId, u.id), eq(appAccess.appCode, 'vibox')))
      .limit(1);
    return {
      status: (pm?.status as 'pending' | 'active' | 'suspended' | undefined) ?? 'unknown',
      viboxEnabled: vibox?.status === 'active',
    };
  } catch (e) {
    console.error('[auth] getMyPartnerStatus:', (e as Error).message);
    return null;
  }
}
