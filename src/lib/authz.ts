/**
 * 앱 계층 권한 백본 — Supabase RLS → 자체 PG(Drizzle) 이전용.
 * ★ 서버 전용 모듈 (Drizzle + next/headers cookies에 의존). 'use server' DAL/액션에서만 import.
 * 인증(getUser)은 Phase 4까지 Supabase Auth 유지.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { appAccess, profiles, userProfiles } from '@/db/schema';
import { createClient } from '@/lib/supabase/server';

/** 현재 로그인 사용자. 없으면 null. */
export async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * 비모 ERP 관리자 여부 — RLS의 public.is_vimo_admin() 재현.
 * app_access(user_id=현재유저, app_code='vimo_erp', role='admin', status='active') 행 존재.
 */
export async function isVimoAdmin(userId: string): Promise<boolean> {
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
}

/** 비모 ERP 접근 권한 보유 여부 (vimo_erp active, role 무관). RLS의 is_vimo_team() 재현. */
export async function hasErpAccess(userId: string): Promise<boolean> {
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
}

/**
 * 비모 스태프 여부 — RLS의 public.is_vimo_staff() 재현.
 * profiles.user_type='staff' (partners/partner_history/partner_issues 행 게이트).
 * ★ isVimoAdmin(app_access 기반)과는 다른 소스. 충실 번역용.
 */
export async function isVimoStaff(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.id, userId), eq(profiles.userType, 'staff')))
    .limit(1);
  return rows.length > 0;
}

/**
 * user_profiles.role='admin' 여부 — RLS의 public.is_admin() 재현.
 * ★ isVimoAdmin(app_access role='admin')과는 다른 소스. partners 민감컬럼 마스킹,
 *   user_profiles admin_all 등에서 사용. 충실 번역용.
 */
export async function isProfileAdmin(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(and(eq(userProfiles.id, userId), eq(userProfiles.role, 'admin')))
    .limit(1);
  return rows.length > 0;
}
