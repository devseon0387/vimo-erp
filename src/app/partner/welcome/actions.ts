'use server';
/**
 * 파트너 welcome 페이지 서버 액션 — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2b).
 *
 * ★ 기존: 'use client' 페이지가 브라우저에서 직접 두 .from() 호출(RLS의 "본인 행만" 정책이 보호).
 *   - partner_meta.status  WHERE profile_id = user.id   (maybeSingle)
 *   - app_access.status    WHERE user_id = user.id AND app_code = 'vibox'   (maybeSingle)
 * ★ 변경: 클라이언트는 .from()을 직접 못 옮기므로 서버 액션으로 분리.
 *   서버에서 currentUser()로 본인 식별 후 Drizzle로 본인 행만 조회(RLS "본인 한정" 재현).
 *   인증(getUser) 게이트·redirect는 페이지에 그대로 유지(Phase 4까지 Supabase Auth).
 *   비로그인 시 null 반환 → 페이지가 기존처럼 /signup 으로 redirect.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { partnerMeta, appAccess } from '@/db/schema';
import { currentUser } from '@/lib/authz';

export type PartnerWelcomeData = {
  /** partner_meta.status (없으면 'unknown'). 원본 PartnerStatus 매핑은 페이지에서 수행. */
  status: string | null;
  /** app_access(vibox).status === 'active' */
  viboxEnabled: boolean;
};

/**
 * 현재 로그인 파트너 본인의 welcome 상태 조회.
 * 비로그인이면 null(페이지가 /signup redirect 유지).
 * 조회는 항상 본인(user.id) 행에 한정 — 원본 .eq(profile_id/user_id, user.id) 1:1.
 */
export async function getPartnerWelcomeData(): Promise<PartnerWelcomeData | null> {
  const user = await currentUser();
  if (!user) return null;

  try {
    // partner_meta.status WHERE profile_id = user.id (maybeSingle → limit 1)
    const [meta] = await db
      .select({ status: partnerMeta.status })
      .from(partnerMeta)
      .where(eq(partnerMeta.profileId, user.id))
      .limit(1);

    // app_access.status WHERE user_id = user.id AND app_code = 'vibox' (maybeSingle → limit 1)
    const [vibox] = await db
      .select({ status: appAccess.status })
      .from(appAccess)
      .where(and(eq(appAccess.userId, user.id), eq(appAccess.appCode, 'vibox')))
      .limit(1);

    return {
      status: meta?.status ?? null,
      viboxEnabled: vibox?.status === 'active',
    };
  } catch (e) {
    console.error('getPartnerWelcomeData error:', e instanceof Error ? e.message : e);
    // 원본은 두 쿼리 실패 시 undefined → 'unknown'/false 로 graceful. 동일 폴백 유지.
    return { status: null, viboxEnabled: false };
  }
}
