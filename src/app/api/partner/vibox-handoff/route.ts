/**
 * POST /api/partner/vibox-handoff
 *
 * 파트너(profiles.user_type='partner')에 대해 vibox 단기 JWT 발급.
 * 클라이언트는 이 토큰으로 vibox `/api/sso/exchange`를 호출 → vibox 세션 쿠키 받음.
 *
 * 토큰: HS256 + VIBOX_SSO_SECRET, 5초 만료, issuer='partner-erp', audience='vibox'
 *
 * 검증:
 *   1. Supabase 세션 존재
 *   2. profiles.user_type = 'partner'
 *   3. app_access(vibox, active) — 매핑 전이라도 가입 시점에 시드됨 (A안)
 *
 * ★ Phase 2b: profiles / app_access .from() → 자체 PG(Drizzle) db. 인증 게이트(getUser)는 불변.
 */
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { appAccess, profiles } from '@/db/schema';
import { currentUser } from '@/lib/authz';

const TOKEN_TTL_SECONDS = 5;

function getSecret(): Uint8Array {
  const s = process.env.VIBOX_SSO_SECRET;
  if (!s) throw new Error('VIBOX_SSO_SECRET not set');
  return new TextEncoder().encode(s);
}

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const [profile] = await db
    .select({ name: profiles.name, userType: profiles.userType })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!profile || profile.userType !== 'partner') {
    return Response.json({ error: 'not a partner' }, { status: 403 });
  }

  const [access] = await db
    .select({ status: appAccess.status })
    .from(appAccess)
    .where(and(
      eq(appAccess.userId, user.id),
      eq(appAccess.appCode, 'vibox'),
    ))
    .limit(1);

  if (!access || access.status !== 'active') {
    return Response.json(
      { error: 'vibox access not granted', code: 'no_vibox_access' },
      { status: 403 },
    );
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  console.info(`[partner-vibox-handoff] ${new Date().toISOString()} user=${user.id} ip=${ip}`);

  const token = await new SignJWT({
    email: user.email ?? '',
    name: profile.name ?? user.email ?? 'unknown',
    role: 'partner',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setSubject(user.id)
    .setIssuer('partner-erp')
    .setAudience('vibox')
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());

  const viboxBase = process.env.VIBOX_API_BASE ?? 'http://localhost:4200';

  return Response.json({
    token,
    exchangeUrl: `${viboxBase}/api/sso/exchange`,
  });
}
