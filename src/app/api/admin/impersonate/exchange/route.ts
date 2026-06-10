/**
 * GET /api/admin/impersonate/exchange
 *
 * impersonate POST 가 발급한 http-only cookie 의 서명 토큰을 꺼내
 * 파트너 ERP(별개 앱)의 콜백으로 302 redirect 하면서 즉시 cookie 만료.
 * 토큰이 클라 JS·응답 본문에 직접 노출되지 않게 하는 1회용 게이트.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/auth/admin';

const PARTNER_ERP_BASE = process.env.PARTNER_ERP_URL ?? 'http://localhost:3010';
const IMP_COOKIE_NAME = 'vimo_imp_token';
const IMP_COOKIE_PATH = '/api/admin/impersonate';

export async function GET() {
  // admin 재검증 (impersonate POST 와 동일 가드)
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const cookieStore = await cookies();
  const token = cookieStore.get(IMP_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ error: '만료되었거나 없는 링크입니다. 다시 시도해주세요.' }, { status: 410 });
  }

  // cookie 즉시 만료 (1회용)
  cookieStore.set({
    name: IMP_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: IMP_COOKIE_PATH,
  });

  const url = `${PARTNER_ERP_BASE}/auth/impersonate?token=${encodeURIComponent(token)}`;
  return NextResponse.redirect(url);
}
