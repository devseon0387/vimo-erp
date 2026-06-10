import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { requireAdmin } from '@/lib/auth/admin';
import { db } from '@/db';
import { profiles, impersonationAudit } from '@/db/schema';

// 파트너 ERP(별개 앱) 콜백 — 자체인증 통합 후 토큰을 검증해 해당 파트너로 로그인.
const PARTNER_ERP_BASE = process.env.PARTNER_ERP_URL ?? 'http://localhost:3010';

// 1회용 impersonation 토큰을 담는 http-only cookie (응답 본문 노출 방지).
const IMP_COOKIE_NAME = 'vimo_imp_token';
const IMP_COOKIE_PATH = '/api/admin/impersonate';
const IMP_COOKIE_TTL = 60; // seconds

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

  // 1. 호출자 = 비모 ERP admin 인지 (Auth.js 세션 + role)
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  // 2. 대상 파트너 정보
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

  const rows = await db.select().from(profiles).where(eq(profiles.id, partnerProfileId)).limit(1);
  const target = rows[0];
  if (!target) {
    return NextResponse.json({ error: '대상 파트너를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (target.userType !== 'partner') {
    return NextResponse.json({ error: '파트너 계정만 임퍼소네이션 가능합니다.' }, { status: 400 });
  }
  if (!target.email) {
    return NextResponse.json({ error: '대상 파트너의 이메일이 없습니다.' }, { status: 400 });
  }

  // 3. 서명 토큰 발급 (jose HS256, AUTH_SECRET 공유 — 파트너 앱이 검증).
  //    contract: { sub: 파트너 profile id, email, name, impersonator: admin id, type:'impersonation' }, exp 60s
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  const token = await new SignJWT({
    email: target.email,
    name: target.name ?? null,
    impersonator: guard.user.id,
    type: 'impersonation',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(target.id)
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(secret);

  // 4. 감사 로그 (실패해도 메인 동작 진행)
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null;
  const userAgent = request.headers.get('user-agent') ?? null;
  try {
    await db.insert(impersonationAudit).values({
      adminId: guard.user.id,
      targetProfileId: target.id,
      targetEmail: target.email,
      reason: reason ?? null,
      ipAddress: ip,
      userAgent,
    });
  } catch (e) {
    console.error('[impersonate] audit:', (e as Error).message);
  }

  // 5. 토큰을 http-only cookie 에 저장 → exchange 라우트가 302 redirect (본문 노출 X).
  const cookieStore = await cookies();
  cookieStore.set({
    name: IMP_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: IMP_COOKIE_TTL,
    path: IMP_COOKIE_PATH,
  });

  return NextResponse.json({
    exchangeUrl: `${IMP_COOKIE_PATH}/exchange`,
    targetName: target.name ?? target.email,
  });
}
