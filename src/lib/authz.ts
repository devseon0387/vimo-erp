/**
 * 앱 계층 권한 백본 — Supabase RLS → 자체 PG(Drizzle) 이전용.
 * ★ 서버 전용 모듈 (Drizzle + Auth.js 세션에 의존). 'use server' DAL/액션에서만 import.
 * 인증 = Auth.js v5 JWT 세션 (Phase 4에서 Supabase Auth 대체).
 * ★ React cache()로 요청 단위 메모이즈 — 같은 요청 안의 currentUser/권한 조회 중복을 1회로 접는다.
 *   요청 경계라 보안 속성 불변(요청마다 라이브 재검증 → 승인취소 즉시 반영). 서로 다른
 *   서버액션 RPC는 별 요청이라 cache가 안 걸침(의도된 한계: 한 요청 내 중복만 절감).
 *   'use server'가 아닌 일반 서버 모듈이라 cache()로 감싼 값 export가 허용됨.
 */
import { cache } from 'react';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { appAccess, partnerMeta, profiles, userProfiles } from '@/db/schema';
import { auth } from '@/auth';

/** 현재 로그인 사용자 (Auth.js 세션). 없으면 null. */
export const currentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
});

/**
 * 비모 ERP 관리자 여부 — RLS의 public.is_vimo_admin() 재현.
 * app_access(user_id=현재유저, app_code='vimo_erp', role='admin', status='active') 행 존재.
 */
export const isVimoAdmin = cache(async (userId: string): Promise<boolean> => {
  const rows = await db
    .select({ id: appAccess.id })
    .from(appAccess)
    .where(and(
      eq(appAccess.userId, userId),
      eq(appAccess.appCode, 'vimo_erp'),
      eq(appAccess.role, 'admin'),
      eq(appAccess.status, 'active'),
    ))
    .limit(1);
  return rows.length > 0;
});

/** 비모 ERP 접근 권한 보유 여부 (vimo_erp active, role 무관). RLS의 is_vimo_team() 재현. */
export const hasErpAccess = cache(async (userId: string): Promise<boolean> => {
  const rows = await db
    .select({ id: appAccess.id })
    .from(appAccess)
    .where(and(
      eq(appAccess.userId, userId),
      eq(appAccess.appCode, 'vimo_erp'),
      eq(appAccess.status, 'active'),
    ))
    .limit(1);
  return rows.length > 0;
});

/**
 * 비모 스태프 여부 — RLS의 public.is_vimo_staff() 재현.
 * profiles.user_type='staff' (partners/partner_history/partner_issues 행 게이트).
 * ★ isVimoAdmin(app_access 기반)과는 다른 소스. 충실 번역용.
 */
export const isVimoStaff = cache(async (userId: string): Promise<boolean> => {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.id, userId), eq(profiles.userType, 'staff')))
    .limit(1);
  return rows.length > 0;
});

/**
 * user_profiles.role='admin' 여부 — RLS의 public.is_admin() 재현.
 * ★ isVimoAdmin(app_access role='admin')과는 다른 소스. partners 민감컬럼 마스킹,
 *   user_profiles admin_all 등에서 사용. 충실 번역용.
 */
export const isProfileAdmin = cache(async (userId: string): Promise<boolean> => {
  const rows = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(and(eq(userProfiles.id, userId), eq(userProfiles.role, 'admin')))
    .limit(1);
  return rows.length > 0;
});

/**
 * 현재 사용자의 legacy 파트너 매핑 — RLS의 public.my_legacy_partner_id_text() 재현.
 * partner_meta.legacy_partner_id(→ partners.id). 매핑 없으면 null.
 * Phase 3 파트너 SELECT 분기(projects/episodes/clients/partners)의 행 필터 키.
 */
export const myLegacyPartnerId = cache(async (userId: string): Promise<string | null> => {
  const rows = await db
    .select({ legacy: partnerMeta.legacyPartnerId })
    .from(partnerMeta)
    .where(eq(partnerMeta.profileId, userId))
    .limit(1);
  return rows[0]?.legacy ?? null;
});
