import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { db } from '@/db';
import { userProfiles } from '@/db/schema';

// 사용자 활동(마지막 로그인) — user_profiles.last_login_at (Supabase auth.admin.listUsers 대체).
export async function GET() {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const rows = await db
      .select({ id: userProfiles.id, lastLoginAt: userProfiles.lastLoginAt })
      .from(userProfiles);

    const users = rows.map((r) => ({ id: r.id, lastSignInAt: r.lastLoginAt ?? null }));
    return NextResponse.json({ users });
  } catch (err) {
    console.error('users-activity error:', err);
    return NextResponse.json({ error: '서버 내부 오류가 발생했습니다' }, { status: 500 });
  }
}
