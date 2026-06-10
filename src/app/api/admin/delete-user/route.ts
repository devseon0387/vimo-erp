import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/admin';
import { db } from '@/db';
import { userProfiles } from '@/db/schema';

// 사용자 삭제 — user_profiles 행 삭제 (Supabase auth.admin.deleteUser 대체).
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { userId } = await req.json();
    if (!userId || userId === guard.user.id) {
      return NextResponse.json({ error: '자기 자신은 삭제할 수 없습니다' }, { status: 400 });
    }

    await db.delete(userProfiles).where(eq(userProfiles.id, userId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: '서버 내부 오류: ' + String(err) }, { status: 500 });
  }
}
