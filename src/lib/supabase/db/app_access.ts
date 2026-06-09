'use server';
/**
 * 사용자 앱 접근 권한 관리 (admin 전용) — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2, 버킷 C).
 *
 * 비모 ERP / 파트너 ERP / vibox 별 권한을 토글한다.
 * vimo_erp ↔ partner_erp 상호 배제는 DB 레벨에서 강제됨 (app_access_erp_exclusive 부분 유니크 인덱스).
 *
 * ★ 기존: 브라우저 클라이언트가 직접 쿼리(RLS의 admin-only 정책이 보호).
 * ★ 변경: 'use server' 서버 액션에서 Drizzle로 쿼리 + 서버에서 isVimoAdmin 게이트.
 *   - 원본 RLS는 app_access 관리(select/insert/update)를 is_vimo_admin()으로 제한 → 앱계층에서 동일 재현.
 *   - 비관리자/비로그인 호출 시: 조회는 빈 배열, 변경은 { ok: false } 반환(현 boolean/객체 폴백 동작 보존).
 *   인증(currentUser)은 Phase 4까지 Supabase Auth 유지. 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 * ★ 타입(AppCode/AccessStatus/UserWithAccess)은 './app_access.types'로 분리('use server'는 함수만 export 가능).
 */
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { appAccess, profiles } from '@/db/schema';
import { currentUser, isVimoAdmin } from '@/lib/authz';
import type { AppCode, AccessStatus, UserWithAccess } from './app_access.types';

// ─── 관리자 게이트 헬퍼 (RLS is_vimo_admin() = app_access vimo_erp/admin/active 재현) ───
async function requireVimoAdmin(): Promise<boolean> {
  const u = await currentUser();
  if (!u) return false;
  return isVimoAdmin(u.id);
}

export async function listUsersWithAccess(): Promise<UserWithAccess[]> {
  // 관리자 전용 — 비관리자/비로그인은 빈 배열.
  if (!(await requireVimoAdmin())) return [];

  try {
    // ① profiles (created_at 내림차순) ─ 원본: .order('created_at', { ascending: false })
    const profileRows = await db
      .select({
        id: profiles.id,
        name: profiles.name,
        email: profiles.email,
        userType: profiles.userType,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .orderBy(desc(profiles.createdAt));

    // ② app_access (user_id, app_code, status)
    const accessRows = await db
      .select({
        userId: appAccess.userId,
        appCode: appAccess.appCode,
        status: appAccess.status,
      })
      .from(appAccess);

    // userId별 access 맵 머지 — 원본 accessMap 로직 1:1 보존.
    const accessMap = new Map<string, Record<AppCode, AccessStatus | null>>();
    for (const row of accessRows) {
      const key = row.userId;
      const existing = accessMap.get(key) ?? { vimo_erp: null, partner_erp: null, vibox: null };
      if (row.appCode === 'vimo_erp' || row.appCode === 'partner_erp' || row.appCode === 'vibox') {
        existing[row.appCode] = row.status as AccessStatus;
      }
      accessMap.set(key, existing);
    }

    return profileRows.map((p) => ({
      userId: p.id,
      name: p.name ?? '(이름 없음)',
      email: p.email ?? '',
      userType: p.userType,
      access: accessMap.get(p.id) ?? { vimo_erp: null, partner_erp: null, vibox: null },
    }));
  } catch (e) {
    console.error('listUsersWithAccess error:', e instanceof Error ? e.message : e);
    return [];
  }
}

// 권한 부여/활성화 — 관리자 전용.
export async function grantAppAccess(userId: string, appCode: AppCode): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireVimoAdmin())) return { ok: false, error: '권한이 없습니다.' };

  // role 파생: vimo_erp→staff, partner_erp→partner, else(vibox)→member.
  const role = appCode === 'vimo_erp' ? 'staff' : appCode === 'partner_erp' ? 'partner' : 'member';

  try {
    // Supabase upsert(onConflict: 'user_id,app_code') 1:1 재현.
    // 충돌 시 role/status만 갱신(joined_at 등 보존).
    await db
      .insert(appAccess)
      .values({ userId, appCode, role, status: 'active' })
      .onConflictDoUpdate({
        target: [appAccess.userId, appAccess.appCode],
        set: { role, status: 'active' },
      });
    return { ok: true };
  } catch (e) {
    console.error('grantAppAccess error:', e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// 권한 정지 (행 유지, status='suspended') — 관리자 전용.
export async function suspendAppAccess(userId: string, appCode: AppCode): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireVimoAdmin())) return { ok: false, error: '권한이 없습니다.' };

  try {
    await db
      .update(appAccess)
      .set({ status: 'suspended' })
      .where(and(eq(appAccess.userId, userId), eq(appAccess.appCode, appCode)));
    return { ok: true };
  } catch (e) {
    console.error('suspendAppAccess error:', e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
