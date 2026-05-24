import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';

export async function GET() {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
    const { admin: adminSupabase } = guard;

    // 전체 사용자 조회 (페이지네이션 처리)
    const allUsers: { id: string; lastSignInAt: string | null }[] = [];
    let page = 1;
    const perPage = 100;
    while (true) {
      const { data: { users }, error } = await adminSupabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      for (const u of users) {
        allUsers.push({ id: u.id, lastSignInAt: u.last_sign_in_at ?? null });
      }
      if (users.length < perPage) break;
      page++;
    }

    return NextResponse.json({ users: allUsers });
  } catch (err) {
    console.error('users-activity error:', err);
    return NextResponse.json({ error: '서버 내부 오류가 발생했습니다' }, { status: 500 });
  }
}
