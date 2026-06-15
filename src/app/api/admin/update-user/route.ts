import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/admin';
import { db } from '@/db';
import { userProfiles, profiles } from '@/db/schema';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// 사용자 정보/비밀번호 수정 — user_profiles + bcrypt (Supabase auth.admin.updateUserById 대체).
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { userId, email, password, name } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: '유저 ID가 필요합니다' }, { status: 400 });
    }
    if (email && !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: '올바른 이메일 형식이 아닙니다' }, { status: 400 });
    }
    if (password) {
      if (password.length < 8) {
        return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다' }, { status: 400 });
      }
      if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return NextResponse.json({ error: '비밀번호에 영문과 숫자가 모두 포함되어야 합니다' }, { status: 400 });
      }
    }

    // 정체성이 두 테이블에 나뉘어 있음: user_profiles(직원 로그인) / profiles(파트너 로그인 + 표시용).
    // 같은 id가 어느 쪽에 있는지 확인해 존재하는 쪽 '전부'를 갱신한다(직원은 두 곳 동기화, 파트너는 profiles).
    const set: { name?: string | null; email?: string; passwordHash?: string } = {};
    if (name !== undefined) set.name = name;
    if (email) set.email = String(email).trim().toLowerCase();
    if (password) set.passwordHash = await bcrypt.hash(password, 10);

    const [upRow] = await db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.id, userId))
      .limit(1);
    const [pRow] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (!upRow && !pRow) {
      return NextResponse.json({ error: '대상 사용자를 찾을 수 없습니다' }, { status: 404 });
    }

    // 이메일(로그인 아이디) 변경 시 두 테이블 모두에서 중복 검사 — UNIQUE 위반 전에 친절한 409.
    if (set.email) {
      const [dupUp] = await db
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(eq(userProfiles.email, set.email))
        .limit(1);
      const [dupP] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.email, set.email))
        .limit(1);
      if ((dupUp && dupUp.id !== userId) || (dupP && dupP.id !== userId)) {
        return NextResponse.json({ error: '이미 사용 중인 이메일입니다' }, { status: 409 });
      }
    }

    if (Object.keys(set).length > 0) {
      if (upRow) await db.update(userProfiles).set(set).where(eq(userProfiles.id, userId));
      if (pRow) await db.update(profiles).set(set).where(eq(profiles.id, userId));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: '서버 내부 오류: ' + String(err) }, { status: 500 });
  }
}
