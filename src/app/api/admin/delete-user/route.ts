import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const { user, admin: adminSupabase } = guard;

    const { userId } = await req.json();
    if (!userId || userId === user.id) {
      return NextResponse.json({ error: '자기 자신은 삭제할 수 없습니다' }, { status: 400 });
    }

    // user_profiles 삭제
    const { error: profileError } = await adminSupabase.from('user_profiles').delete().eq('id', userId);
    if (profileError) {
      return NextResponse.json({ error: '프로필 삭제 실패: ' + profileError.message }, { status: 500 });
    }

    // auth.users 삭제
    const { error } = await adminSupabase.auth.admin.deleteUser(userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: '서버 내부 오류: ' + String(err) }, { status: 500 });
  }
}
