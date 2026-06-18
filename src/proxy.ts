import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import authConfig from '@/auth.config';

// Auth.js v5 미들웨어 — JWT 세션을 Edge에서 검증(DB 없음). authConfig는 Edge-안전.
// (구) Supabase 세션 갱신은 Auth.js JWT 클레임 게이트로 완전 교체됨 — Supabase 의존 제거 완료.
const { auth } = NextAuth(authConfig);

export default auth((request) => {
  // request.auth = JWT에서 디코드한 세션 (session 콜백 적용: role/approved/needsPasswordChange/erpAccess)
  const user = request.auth?.user ?? null;

  const okResponse = NextResponse.next();

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
    return okResponse;
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
    return okResponse;
  }

  // 비봇 strategy MCP 엔드포인트: 라우트 내부 authorizeMcp(x-api-key=API_SECRET_KEY)로
  // 자체 인증 + rate limit. 미들웨어 로그인 게이트(307)를 우회해 MCP 핸드셰이크 허용. (2026-06-13)
  if (pathname.startsWith('/api/mcp')) {
    return okResponse;
  }

  // planhigh 공개 API: planhigh.co.kr(정적 사이트)가 호출하는 공개/익명 엔드포인트.
  // 라우트 내부에서 CORS + planhigh 전용 토큰(어드민 PATCH) / 레이트리밋(공개 POST)로 자체 보호.
  // 로그인 게이트(307)를 우회해 크로스 오리진 접근 허용. (2026-06-18 Supabase 탈출)
  if (pathname.startsWith('/api/planhigh')) {
    return okResponse;
  }

  // Auth.js 엔드포인트(session/signin/signout/callback/csrf)는 항상 통과 — 게이트 우회.
  if (pathname.startsWith('/api/auth')) {
    return okResponse;
  }

  const isAuthPage = pathname.startsWith('/login');
  const isApiRoute = pathname.startsWith('/api/');

  if (!user && !isAuthPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // 인증된 사용자가 대시보드에 접근할 때 승인 여부 및 비밀번호 변경 확인
  // ── Phase 4 (universe): user_profiles(approved/role) + app_access(vimo_erp) 이중 검증.
  //    JWT 클레임 기반(DB 호출 없음) — 로그인 시점 스냅샷. 계정 상태 변경의 즉시 차단은
  //    레이아웃 getSessionUser(라이브)·DAL authz 가드가 담당, 여기는 상한 1일(JWT maxAge).
  if (user && !isAuthPage && !isApiRoute) {
    const profileOk = user.role === 'admin' || user.approved === true;
    const accessOk = user.erpAccess === true;

    // 둘 중 하나라도 통과 못하면 거부 (이중 검증)
    if (!profileOk || !accessOk) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      return NextResponse.redirect(loginUrl);
    }

    // 비밀번호 변경이 필요한 경우 → /change-password로 강제 이동
    if (user.needsPasswordChange === true && !pathname.startsWith('/change-password')) {
      const cpUrl = request.nextUrl.clone();
      cpUrl.pathname = '/change-password';
      return NextResponse.redirect(cpUrl);
    }
  }

  if (user && isAuthPage) {
    // 이미 인증·승인된 사용자가 로그인 페이지에 오면 대시보드로 (/api/auth 는 위에서 통과)
    const profileOk = user.role === 'admin' || user.approved === true;
    const accessOk = user.erpAccess === true;
    if (profileOk && accessOk) {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = '/management';
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return okResponse;
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|icons/.*|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).*)',
  ],
};
