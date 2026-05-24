import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export default async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 토큰 자동 갱신 (IMPORTANT: getUser 호출 필수)
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') ?? '';
  // partner.vi-mo.kr (운영) · partner.localhost (로컬). www·user.partner 같은 오인식 방어.
  const isPartnerHost = /^partner\.(vi-mo\.kr|localhost)(:\d+)?$/i.test(host);

  // 파트너 서브도메인은 별도 워크스페이스 — 비모 ERP 인증 로직 우회
  // 페이지 경로만 /partner/* 로 rewrite. _next, api, public 자산은 그대로 통과.
  if (isPartnerHost) {
    const isAssetOrApi =
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      (pathname === '/partner' || pathname.startsWith('/partner/')) ||
      /\.[a-zA-Z0-9]+$/.test(pathname); // .png, .ico, .json, .woff2 등
    if (!isAssetOrApi) {
      const url = request.nextUrl.clone();
      url.pathname = `/partner${pathname}`;
      return NextResponse.rewrite(url);
    }
    return supabaseResponse;
  }

  // 메인 도메인에서 /partner/* 직접 접근 차단 (서브도메인 노출 방지)
  if ((pathname === '/partner' || pathname.startsWith('/partner/'))) {
    return new NextResponse(null, { status: 404 });
  }

  // /signup 접근 시 /login으로 리다이렉트 (staff 가입 차단)
  if (pathname.startsWith('/signup')) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // 비봇 내부 툴 API: 라우트 내부에서 세션 또는 x-bibot-key 검증
  if (pathname.startsWith('/api/bibot/tools')) {
    return supabaseResponse;
  }

  // API key 인증: /api/mcp 경로 (외부 전용)
  if (pathname.startsWith('/api/mcp')) {
    const apiKey = request.headers.get('x-api-key');
    const expectedKey = process.env.API_SECRET_KEY;
    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return supabaseResponse;
  }

  // /api/strategy: API key 또는 로그인 세션 인증
  if (pathname.startsWith('/api/strategy')) {
    const apiKey = request.headers.get('x-api-key');
    const expectedKey = process.env.API_SECRET_KEY;
    if (apiKey && expectedKey && apiKey === expectedKey) {
      return supabaseResponse;
    }
    if (user) {
      return supabaseResponse;
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/api/auth');
  const isApiRoute = pathname.startsWith('/api/');

  if (!user && !isAuthPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // 인증된 사용자가 대시보드에 접근할 때 승인 여부 및 비밀번호 변경 확인
  if (user && !isAuthPage && !isApiRoute) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('approved, role, needs_password_change')
      .eq('id', user.id)
      .single();

    // 프로필이 없거나 미승인 비관리자 → 로그인 페이지로
    if (!profile || (profile.role !== 'admin' && profile.approved !== true)) {
      // 세션 쿠키 제거
      await supabase.auth.signOut();
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      return NextResponse.redirect(loginUrl);
    }

    // 비밀번호 변경이 필요한 경우 → /change-password로 강제 이동
    if (profile.needs_password_change === true && !pathname.startsWith('/change-password')) {
      const cpUrl = request.nextUrl.clone();
      cpUrl.pathname = '/change-password';
      return NextResponse.redirect(cpUrl);
    }
  }

  if (user && isAuthPage) {
    // 승인된 사용자만 대시보드로 리다이렉트
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('approved, role')
      .eq('id', user.id)
      .single();

    if (profile && (profile.role === 'admin' || profile.approved === true)) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/management';
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|icons/.*|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).*)',
  ],
};
