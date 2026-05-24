import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const { admin: adminSupabase } = guard;

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

    // auth.users 이메일/비밀번호 업데이트
    const authUpdate: Record<string, string> = {};
    if (email) authUpdate.email = email;
    if (password) authUpdate.password = password;

    if (Object.keys(authUpdate).length > 0) {
      const { error } = await adminSupabase.auth.admin.updateUserById(userId, authUpdate);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // user_profiles 이름/이메일 업데이트
    const profileUpdate: Record<string, string> = {};
    if (name !== undefined) profileUpdate.name = name;
    if (email) profileUpdate.email = email;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await adminSupabase.from('user_profiles').update(profileUpdate).eq('id', userId);
      if (profileError) {
        return NextResponse.json({ error: '프로필 수정 실패: ' + profileError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: '서버 내부 오류: ' + String(err) }, { status: 500 });
  }
}
