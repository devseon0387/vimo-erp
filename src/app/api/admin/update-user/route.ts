import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/admin';
import { db } from '@/db';
import { userProfiles } from '@/db/schema';

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

    const set: Partial<typeof userProfiles.$inferInsert> = {};
    if (name !== undefined) set.name = name;
    if (email) set.email = String(email).trim().toLowerCase();
    if (password) set.passwordHash = await bcrypt.hash(password, 10);

    if (Object.keys(set).length > 0) {
      await db.update(userProfiles).set(set).where(eq(userProfiles.id, userId));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: '서버 내부 오류: ' + String(err) }, { status: 500 });
  }
}
