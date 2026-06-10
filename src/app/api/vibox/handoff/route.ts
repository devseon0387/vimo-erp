/**
 * POST /api/vibox/handoff
 *
 * 비모 ERP 매니저(vimo_staff)에 대해 vibox 단기 JWT 발급.
 * 클라이언트는 이 토큰으로 vibox `/api/sso/exchange`를 호출 → vibox 세션 쿠키 받음.
 *
 * 토큰: HS256 + VIBOX_SSO_SECRET, 5초 만료, issuer='vimo-erp', audience='vibox'
 *
 * ★ Phase 2b: profiles / vimo_staff .from() → 자체 PG(Drizzle) db.
 * ★ Phase 3 하드닝: role 클레임 소스 교정 — 원본은 vimo_staff.role(미존재 컬럼)을 읽어 항상
 *   'member'로 귀결되던 선재 버그. vibox SSO는 'admin'을 화이트리스트에 두고 클레임대로 자기
 *   users.role을 동기화하므로, ERP admin(app_access vimo_erp role=admin = isVimoAdmin)을
 *   'admin'으로 전달하도록 수정(설계 의도 복원).
 */
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { profiles, vimoStaff } from '@/db/schema';
import { currentUser, isVimoAdmin } from '@/lib/authz';

const TOKEN_TTL_SECONDS = 5;

function getSecret(): Uint8Array {
  const s = process.env.VIBOX_SSO_SECRET;
  if (!s) throw new Error('VIBOX_SSO_SECRET not set');
  return new TextEncoder().encode(s);
}

export async function POST(_req: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  // 1차 검증: profiles.user_type = 'staff' (universe 차원의 staff 표식)
  const [profile] = await db
    .select({ name: profiles.name, userType: profiles.userType })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!profile || profile.userType !== 'staff') {
    return Response.json({ error: 'not a staff member' }, { status: 403 });
  }

  // 2차 검증: vimo_staff 메타 row 존재 (관리자 매핑 승인 표식)
  const [staff] = await db
    .select({ profileId: vimoStaff.profileId })
    .from(vimoStaff)
    .where(eq(vimoStaff.profileId, user.id))
    .limit(1);

  if (!staff) {
    return Response.json({ error: 'not a vimo team member' }, { status: 403 });
  }

  // ERP admin(app_access vimo_erp role=admin) → vibox 'admin', 그 외 'member'.
  const role: 'admin' | 'member' = (await isVimoAdmin(user.id)) ? 'admin' : 'member';

  // audit — 운영 logs 에 핸드오프 발급 기록. P2 차원의 가벼운 추적, 정식 audit 테이블은 후속.
  const ip = _req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  console.info(`[vibox-handoff] ${new Date().toISOString()} user=${user.id} role=${role} ip=${ip}`);

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
