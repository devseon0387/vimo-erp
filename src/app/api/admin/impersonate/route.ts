import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/auth/admin';

// 파트너 ERP 콜백 URL — 환경에 따라 변경
const PARTNER_ERP_BASE = process.env.PARTNER_ERP_URL ?? 'http://localhost:3010';

// 임퍼소네이션 magic link 를 담는 http-only cookie 이름·경로·TTL
// path 를 좁혀서 다른 라우트에서 접근 차단, exchange 라우트만 매칭됨
const IMP_COOKIE_NAME = 'vimo_imp_link';
const IMP_COOKIE_PATH = '/api/admin/impersonate';
const IMP_COOKIE_TTL = 60; // seconds

export async function POST(request: NextRequest) {
  // 0. CSRF 방지 — same-origin 검증
  //    Referer 비교는 URL parse 후 origin 단위로. prefix startsWith 비교는
  //    'app.vi-mo.kr.evil.com' 같은 도메인 위조에 취약하므로 사용 금지.
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');
  const expectedOrigin = `${request.nextUrl.protocol}//${host}`;
  const originOk = origin === expectedOrigin;
  let refererOk = false;
  if (referer) {
    try {
      refererOk = new URL(referer).origin === expectedOrigin;
    } catch {
      refererOk = false;
    }
  }
  if (!originOk && !refererOk) {
    return NextResponse.json({ error: 'Origin 검증 실패 (CSRF 의심)' }, { status: 403 });
  }

  // 1. 호출자 검증 — 통합 admin 게이트 (user_profiles.role='admin' AND
  //    app_access.vimo_erp.status='active'). impersonate 와 requireAdmin 의
  //    admin 정의 불일치 해소 (C1).
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { user, admin: adminSupabase } = guard;

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

  const { data: targetProfile } = await adminSupabase
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

  // 3. Supabase Admin SDK로 magic link 생성 (adminSupabase 는 requireAdmin 이 발급한 service_role)
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

  // 5. magic link URL 은 응답 본문에 노출하지 않고 http-only cookie 에 저장.
  //    클라는 exchangeUrl 을 새 탭으로 열고, exchange 라우트가 cookie 읽어 302 redirect 후 cookie 즉시 만료.
  //    XSS·스크린레코더로 응답 캡처돼도 action_link 자체는 새지 않음.
  const cookieStore = await cookies();
  cookieStore.set({
    name: IMP_COOKIE_NAME,
    value: linkData.properties.action_link,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: IMP_COOKIE_TTL,
    path: IMP_COOKIE_PATH,
  });

  return NextResponse.json({
    exchangeUrl: `${IMP_COOKIE_PATH}/exchange`,
    targetName: targetProfile.name ?? targetProfile.email,
  });
}
