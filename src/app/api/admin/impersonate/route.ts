import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSbClient } from '@supabase/supabase-js';

// 파트너 ERP 콜백 URL — 환경에 따라 변경
const PARTNER_ERP_BASE = process.env.PARTNER_ERP_URL ?? 'http://localhost:3010';

export async function POST(request: NextRequest) {
  // 0. CSRF 방지 — same-origin 검증
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');
  const expectedOrigin = `${request.nextUrl.protocol}//${host}`;
  const originOk = origin === expectedOrigin;
  const refererOk = referer?.startsWith(expectedOrigin) ?? false;
  if (!originOk && !refererOk) {
    return NextResponse.json({ error: 'Origin 검증 실패 (CSRF 의심)' }, { status: 403 });
  }

  // 1. 호출자 검증 — 비모 ERP에 로그인된 admin 인지
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { data: access } = await supabase
    .from('app_access')
    .select('role, status')
    .eq('user_id', user.id)
    .eq('app_code', 'vimo_erp')
    .maybeSingle();

  if (!access || access.role !== 'admin' || access.status !== 'active') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  }

  // 2. 대상 파트너 정보 가져오기
  let body: { partnerProfileId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const { partnerProfileId, reason } = body;
  if (!partnerProfileId) {
    return NextResponse.json({ error: 'partnerProfileId 필수' }, { status: 400 });
  }

  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id, email, name, user_type')
    .eq('id', partnerProfileId)
    .maybeSingle();

  if (!targetProfile) {
    return NextResponse.json({ error: '대상 파트너를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (targetProfile.user_type !== 'partner') {
    return NextResponse.json({ error: '파트너 계정만 임퍼소네이션 가능합니다.' }, { status: 400 });
  }
  if (!targetProfile.email) {
    return NextResponse.json({ error: '대상 파트너의 이메일이 없습니다.' }, { status: 400 });
  }

  // 3. Supabase Admin SDK로 magic link 생성
  const adminSupabase = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email: targetProfile.email,
    options: {
      redirectTo: `${PARTNER_ERP_BASE}/auth/callback`,
    },
  });

  if (linkError || !linkData?.properties?.action_link) {
    console.error('generateLink error:', linkError);
    return NextResponse.json({ error: linkError?.message ?? '링크 생성 실패' }, { status: 500 });
  }

  // 4. 감사 로그 (실패해도 메인 동작은 진행)
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null;
  const userAgent = request.headers.get('user-agent') ?? null;
  await adminSupabase.from('impersonation_audit').insert({
    admin_id: user.id,
    target_user_id: targetProfile.id,
    target_email: targetProfile.email,
    reason: reason ?? null,
    ip_address: ip,
    user_agent: userAgent,
  });

  // 5. magic link URL 반환
  return NextResponse.json({
    url: linkData.properties.action_link,
    targetName: targetProfile.name ?? targetProfile.email,
  });
}
