/**
 * POST /api/vibox/handoff
 *
 * 비모 ERP 매니저(vimo_staff)에 대해 vibox 단기 JWT 발급.
 * 클라이언트는 이 토큰으로 vibox `/api/sso/exchange`를 호출 → vibox 세션 쿠키 받음.
 *
 * 토큰: HS256 + VIBOX_SSO_SECRET, 5초 만료, issuer='vimo-erp', audience='vibox'
 */
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { createClient } from '@/lib/supabase/server';

const TOKEN_TTL_SECONDS = 5;

function getSecret(): Uint8Array {
  const s = process.env.VIBOX_SSO_SECRET;
  if (!s) throw new Error('VIBOX_SSO_SECRET not set');
  return new TextEncoder().encode(s);
}

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  // vimo_staff 검증 — 비모 팀만 핸드오프 가능
  const { data: staff } = await supabase
    .from('vimo_staff')
    .select('role')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!staff) {
    return Response.json({ error: 'not a vimo team member' }, { status: 403 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .maybeSingle();

  const role: 'admin' | 'member' = staff.role === 'admin' ? 'admin' : 'member';

  const token = await new SignJWT({
    email: user.email ?? '',
    name: profile?.name ?? user.email ?? 'unknown',
    role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setSubject(user.id)
    .setIssuer('vimo-erp')
    .setAudience('vibox')
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());

  const viboxBase = process.env.VIBOX_API_BASE ?? 'http://localhost:4200';

  return Response.json({
    token,
    exchangeUrl: `${viboxBase}/api/sso/exchange`,
    shareLinksUrl: `${viboxBase}/api/external/share-links`,
  });
}
