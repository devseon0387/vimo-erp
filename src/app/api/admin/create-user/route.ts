import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/admin';
import { db } from '@/db';
import { userProfiles } from '@/db/schema';

// 신규 사용자 생성 — Auth.js 체제: user_profiles 행 + bcrypt 해시 (Supabase auth.admin.createUser 대체).
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { name, email, role, password } = await req.json();
    if (!email || !password || !name) {
      return NextResponse.json({ error: '이름, 이메일, 비밀번호는 필수입니다' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: '올바른 이메일 형식이 아닙니다' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: '비밀번호는 8자 이상이어야 합니다' }, { status: 400 });
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return NextResponse.json({ error: '비밀번호에 영문과 숫자가 모두 포함되어야 합니다' }, { status: 400 });
    }

    const normEmail = String(email).trim().toLowerCase();

    // 이메일 중복 체크 (authorize는 이메일로 조회하므로 유니크 보장)
    const existing = await db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.email, normEmail))
      .limit(1);
    if (existing[0]) {
      return NextResponse.json({ error: '이미 존재하는 이메일입니다' }, { status: 409 });
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    await db.insert(userProfiles).values({
      id: userId,
      name: name.trim(),
      email: normEmail,
      role: role || 'manager',
      approved: true,
      needsPasswordChange: true,
      passwordHash,
    });

    return NextResponse.json({ ok: true, userId });
  } catch (err) {
    return NextResponse.json({ error: '서버 내부 오류: ' + String(err) }, { status: 500 });
  }
}
