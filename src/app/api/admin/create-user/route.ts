import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/admin';
import { db } from '@/db';
import { userProfiles, profiles, appAccess } from '@/db/schema';

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

    // 이메일 중복 체크 — 직원/파트너 둘 다 이메일로 로그인 조회되므로 두 정체성 테이블 모두 검사.
    const [dupUp] = await db.select({ id: userProfiles.id }).from(userProfiles).where(eq(userProfiles.email, normEmail)).limit(1);
    const [dupP] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, normEmail)).limit(1);
    if (dupUp || dupP) {
      return NextResponse.json({ error: '이미 존재하는 이메일입니다' }, { status: 409 });
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    const resolvedRole = role || 'manager';
    // 비모 ERP 접근권 role: 대표(admin)는 'admin'(isVimoAdmin 충족), 그 외는 'staff'.
    const appAccessRole = resolvedRole === 'admin' ? 'admin' : 'staff';

    // 직원 정체성은 세 곳을 한 트랜잭션으로 만들어야 온보딩이 UI만으로 완결된다:
    //  user_profiles(로그인) + profiles(user_type=staff: 권한게이트·표시·앱권한목록) + app_access(vimo_erp: 미들웨어 접근권).
    await db.transaction(async (tx) => {
      await tx.insert(userProfiles).values({
        id: userId,
        name: name.trim(),
        email: normEmail,
        role: resolvedRole,
        approved: true,
        needsPasswordChange: true,
        passwordHash,
      });
      await tx.insert(profiles).values({
        id: userId,
        userType: 'staff',
        name: name.trim(),
        email: normEmail,
        passwordHash,
      });
      await tx.insert(appAccess).values({
        userId,
        appCode: 'vimo_erp',
        role: appAccessRole,
        status: 'active',
      });
    });

    return NextResponse.json({ ok: true, userId });
  } catch (err) {
    return NextResponse.json({ error: '서버 내부 오류: ' + String(err) }, { status: 500 });
  }
}
