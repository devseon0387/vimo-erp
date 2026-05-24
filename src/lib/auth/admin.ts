import { NextResponse } from 'next/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Admin 검증 헬퍼.
 *
 * 정의: admin = `user_profiles.role='admin'` AND `app_access.vimo_erp.status='active'`
 * 두 조건 모두 통과해야 함. ERP 접근이 suspended 된 전 admin 은 차단.
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

  // 1) user_profiles.role='admin'
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

  // 2) app_access.vimo_erp.status='active' — 오프보딩(suspended) 시 즉시 차단
  const { data: access } = await serverSupabase
    .from('app_access')
    .select('status')
    .eq('user_id', user.id)
    .eq('app_code', 'vimo_erp')
    .maybeSingle();

  if (!access || access.status !== 'active') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'ERP 접근 권한이 비활성 상태입니다.' },
        { status: 403 },
      ),
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

/**
 * vimo_team 검증 (admin 보다 넓음): app_access.vimo_erp.status='active' 인
 * 모든 staff 통과. partner_erp 만 가진 사용자 차단.
 *
 * 비봇 도구 같은 read-only API 의 vimo_team 게이트 용도.
 */
export type TeamGuardOk = { ok: true; user: User };
export type TeamGuardFail = { ok: false };

export async function isVimoTeamMember(): Promise<TeamGuardOk | TeamGuardFail> {
  const serverSupabase = await createServerSupabase();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: access } = await serverSupabase
    .from('app_access')
    .select('status')
    .eq('user_id', user.id)
    .eq('app_code', 'vimo_erp')
    .maybeSingle();

  if (!access || access.status !== 'active') return { ok: false };
  return { ok: true, user };
}
