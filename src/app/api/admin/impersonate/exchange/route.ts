/**
 * GET /api/admin/impersonate/exchange
 *
 * impersonate POST 가 발급한 http-only cookie 의 magic link 를 가져와
 * 302 redirect 하면서 즉시 cookie 만료. action_link 가 클라 JS·응답 본문에
 * 직접 노출되지 않게 하기 위한 한 번만 통과하는 게이트.
 *
 * admin 권한이 없거나 cookie 가 비어있으면 차단.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/auth/admin';

const IMP_COOKIE_NAME = 'vimo_imp_link';
const IMP_COOKIE_PATH = '/api/admin/impersonate';

export async function GET() {
  // admin 재검증 — impersonate POST 와 동일 가드 (통합 헬퍼)
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const cookieStore = await cookies();
  const link = cookieStore.get(IMP_COOKIE_NAME)?.value;
  if (!link) {
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

  return NextResponse.redirect(link);
}
