import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Admin role + service_role 헬퍼.
 *
 * 사용:
 *   const guard = await requireAdmin();
 *   if (!guard.ok) return guard.response;
 *   const { user, admin } = guard;  // admin = service_role 클라이언트
 */
export type AdminGuardOk = {
  ok: true;
  user: User;
  admin: SupabaseClient;
};

export type AdminGuardFail = {
  ok: false;
  response: NextResponse;
};

export async function requireAdmin(): Promise<AdminGuardOk | AdminGuardFail> {
  const serverSupabase = await createServerSupabase();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: '인증 필요' }, { status: 401 }),
    };
  }

  const { data: profile } = await serverSupabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: '권한 없음' }, { status: 403 }),
    };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다' },
        { status: 500 },
      ),
    };
  }

  const admin = createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  return { ok: true, user, admin };
}
