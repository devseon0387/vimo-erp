import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const { admin: adminSupabase } = guard;

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

    // auth 유저 생성
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const userId = authData.user.id;

    // user_profiles에 upsert
    const { error: profileError } = await adminSupabase
      .from('user_profiles')
      .upsert({
        id: userId,
        name: name.trim(),
        email,
        role: role || 'manager',
        approved: true,
        needs_password_change: true,
      }, { onConflict: 'id' });

    if (profileError) {
      return NextResponse.json({ error: '프로필 생성 실패: ' + profileError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, userId });
  } catch (err) {
    return NextResponse.json({ error: '서버 내부 오류: ' + String(err) }, { status: 500 });
  }
}
