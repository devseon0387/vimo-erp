'use server';
/**
 * User Profiles, Custom Roles, Checklists — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2, 버킷C).
 * ★ 기존: 브라우저 클라이언트가 직접 쿼리(RLS가 보호) + 일부 cachedFetch.
 * ★ 변경: 'use server' 서버 액션에서 Drizzle로 쿼리 + 서버에서 권한 검사(RLS 대체).
 *   인증(currentUser)은 Phase 4까지 Supabase Auth 유지. 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 *
 * ★★ checklists 사용자 격리 (CRITICAL) — 2026-05-29 격리복구가 막은 구멍 재발 절대 금지:
 *   getMy/update/delete/clearCompleted 는 반드시 where 에 eq(checklists.userId, user.id) 포함.
 *   관리자(isVimoAdmin)만 전체 허용. insertChecklist 는 user.id 필수('local' fallback 제거).
 *
 * ★ user_profiles: self(getMyProfile/self-update)=eq(id, user.id) / admin(목록·역할·승인·삭제)=isProfileAdmin 게이트.
 * ★ custom_roles: require-auth(currentUser).
 *
 * ★ cachedFetch 제거: 서버 액션은 브라우저측 cache/realtime invalidate와 무관(portfolio.ts와 동일하게 캐시 미사용).
 * ★ 타입(ChecklistRow)은 'use server'라 export 불가 → ./users.types.ts 로 분리.
 */
import { and, eq, asc } from 'drizzle-orm';
import { db } from '@/db';
import { checklists, customRoles, userProfiles } from '@/db/schema';
import { currentUser, isVimoAdmin, isProfileAdmin } from '@/lib/authz';
import type { ChecklistRow } from './users.types';

// ─── Mappers (내부 helper — 외부 미사용, 'use server'라 export 금지) ──────────

type ChecklistDbRow = typeof checklists.$inferSelect;

// Drizzle row(camelCase) → ChecklistRow(snake_case, 호출부 계약). createdAt 은 mode:'string'.
function checklistFromRow(r: ChecklistDbRow): ChecklistRow {
  return {
    id: r.id,
    user_id: r.userId,
    text: r.text,
    completed: r.completed,
    reminder_time: r.reminderTime ?? null,
    notified: r.notified,
    repeat_type: r.repeatType ?? null,
    repeat_days: r.repeatDays ?? null,
    linked_episode_id: r.linkedEpisodeId ?? null,
    linked_episode_title: r.linkedEpisodeTitle ?? null,
    linked_episode_number: r.linkedEpisodeNumber ?? null,
    linked_project_id: r.linkedProjectId ?? null,
    linked_project_title: r.linkedProjectTitle ?? null,
    linked_client_name: r.linkedClientName ?? null,
    linked_partner_id: r.linkedPartnerId ?? null,
    linked_partner_name: r.linkedPartnerName ?? null,
    created_at: r.createdAt ?? '',
  };
}

// ChecklistRow(snake_case) 부분 패치 → Drizzle insert/update 컬럼(camelCase).
// id/user_id/created_at 은 호출부에서 다루지 않음 → 매핑 제외(insert는 서버에서 user_id 강제).
function checklistToColumns(
  patch: Partial<ChecklistRow>
): Partial<typeof checklists.$inferInsert> {
  const out: Partial<typeof checklists.$inferInsert> = {};
  if (patch.text !== undefined) out.text = patch.text;
  if (patch.completed !== undefined) out.completed = patch.completed;
  if (patch.reminder_time !== undefined) out.reminderTime = patch.reminder_time ?? null;
  if (patch.notified !== undefined) out.notified = patch.notified;
  if (patch.repeat_type !== undefined) out.repeatType = patch.repeat_type ?? null;
  if (patch.repeat_days !== undefined) out.repeatDays = patch.repeat_days ?? null;
  if (patch.linked_episode_id !== undefined) out.linkedEpisodeId = patch.linked_episode_id ?? null;
  if (patch.linked_episode_title !== undefined) out.linkedEpisodeTitle = patch.linked_episode_title ?? null;
  if (patch.linked_episode_number !== undefined) out.linkedEpisodeNumber = patch.linked_episode_number ?? null;
  if (patch.linked_project_id !== undefined) out.linkedProjectId = patch.linked_project_id ?? null;
  if (patch.linked_project_title !== undefined) out.linkedProjectTitle = patch.linked_project_title ?? null;
  if (patch.linked_client_name !== undefined) out.linkedClientName = patch.linked_client_name ?? null;
  if (patch.linked_partner_id !== undefined) out.linkedPartnerId = patch.linked_partner_id ?? null;
  if (patch.linked_partner_name !== undefined) out.linkedPartnerName = patch.linked_partner_name ?? null;
  return out;
}

// ─── User Profiles ───────────────────────────────────────────

export async function getMyProfile(): Promise<{ id: string; role: string; name: string | null; approved?: boolean } | null> {
  // ★ cachedFetch 제거 — 서버에서 직접 쿼리. self only: eq(id, user.id).
  const user = await currentUser();
  if (!user) return null;
  try {
    const [row] = await db
      .select({
        id: userProfiles.id,
        role: userProfiles.role,
        name: userProfiles.name,
        approved: userProfiles.approved,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, user.id))
      .limit(1);
    if (!row) return null;
    return { id: row.id, role: row.role, name: row.name, approved: row.approved ?? undefined };
  } catch (e) {
    console.error('[DB] getMyProfile:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function upsertMyProfile(role: string, name: string): Promise<boolean> {
  // self upsert: id = user.id 고정. (dead code 가능성 있으나 동작 보존.)
  const user = await currentUser();
  if (!user) return false;
  try {
    await db
      .insert(userProfiles)
      .values({ id: user.id, role, name, email: user.email ?? null })
      .onConflictDoUpdate({
        target: userProfiles.id,
        set: { role, name, email: user.email ?? null },
      });
    return true;
  } catch (e) {
    console.error('[DB] upsertMyProfile:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function updateUserApproval(userId: string, approved: boolean): Promise<boolean> {
  // 타인 프로필 승인 변경 → isProfileAdmin 게이트(RLS admin_all).
  const user = await currentUser();
  if (!user || !(await isProfileAdmin(user.id))) return false;
  try {
    await db.update(userProfiles).set({ approved }).where(eq(userProfiles.id, userId));
    return true;
  } catch (e) {
    console.error('[DB] updateUserApproval:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function getAllUserProfiles(): Promise<{ id: string; role: string; name: string | null; email?: string; approved?: boolean }[]> {
  // 전체 사용자 목록 → isProfileAdmin 게이트.
  const user = await currentUser();
  if (!user || !(await isProfileAdmin(user.id))) return [];
  try {
    const rows = await db
      .select({
        id: userProfiles.id,
        role: userProfiles.role,
        name: userProfiles.name,
        email: userProfiles.email,
        approved: userProfiles.approved,
      })
      .from(userProfiles)
      .orderBy(asc(userProfiles.createdAt));
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      name: r.name,
      email: r.email ?? undefined,
      approved: r.approved ?? undefined,
    }));
  } catch (e) {
    console.error('[DB] getAllUserProfiles:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function updateUserRole(userId: string, role: string): Promise<boolean> {
  // 타인 역할 변경 → isProfileAdmin 게이트.
  const user = await currentUser();
  if (!user || !(await isProfileAdmin(user.id))) return false;
  try {
    await db.update(userProfiles).set({ role }).where(eq(userProfiles.id, userId));
    return true;
  } catch (e) {
    console.error('[DB] updateUserRole:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function deleteUserProfile(userId: string): Promise<boolean> {
  // 타인 프로필 삭제 → isProfileAdmin 게이트.
  const user = await currentUser();
  if (!user || !(await isProfileAdmin(user.id))) return false;
  try {
    await db.delete(userProfiles).where(eq(userProfiles.id, userId));
    return true;
  } catch (e) {
    console.error('[DB] deleteUserProfile:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function getNeedsPasswordChange(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  try {
    const [row] = await db
      .select({ needsPasswordChange: userProfiles.needsPasswordChange })
      .from(userProfiles)
      .where(eq(userProfiles.id, user.id))
      .limit(1);
    return row?.needsPasswordChange === true;
  } catch (e) {
    console.error('[DB] getNeedsPasswordChange:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function setPasswordChanged(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  try {
    await db
      .update(userProfiles)
      .set({ needsPasswordChange: false })
      .where(eq(userProfiles.id, user.id));
    return true;
  } catch (e) {
    console.error('[DB] setPasswordChanged:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function getTutorialDone(): Promise<Record<string, boolean>> {
  const user = await currentUser();
  if (!user) return {};
  try {
    const [row] = await db
      .select({ tutorialDone: userProfiles.tutorialDone })
      .from(userProfiles)
      .where(eq(userProfiles.id, user.id))
      .limit(1);
    return (row?.tutorialDone as Record<string, boolean>) ?? {};
  } catch (e) {
    console.error('[DB] getTutorialDone:', e instanceof Error ? e.message : e);
    return {};
  }
}

export async function setTutorialPageDone(pageKey: string): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  try {
    // 기존 tutorial_done 조회 후 머지 (self only).
    const [row] = await db
      .select({ tutorialDone: userProfiles.tutorialDone })
      .from(userProfiles)
      .where(eq(userProfiles.id, user.id))
      .limit(1);
    const current = (row?.tutorialDone as Record<string, boolean>) ?? {};
    const updated = { ...current, [pageKey]: true };
    await db
      .update(userProfiles)
      .set({ tutorialDone: updated })
      .where(eq(userProfiles.id, user.id));
    return true;
  } catch (e) {
    console.error('[DB] setTutorialPageDone:', e instanceof Error ? e.message : e);
    return false;
  }
}

// ─── Custom Roles ─────────────────────────────────────────────

export async function getCustomRoles(): Promise<string[]> {
  // require-auth (custom_roles RLS: authenticated).
  if (!(await currentUser())) return [];
  try {
    const rows = await db
      .select({ name: customRoles.name })
      .from(customRoles)
      .orderBy(asc(customRoles.createdAt));
    return rows.map((r) => r.name);
  } catch (e) {
    console.error('[DB] getCustomRoles:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function addCustomRole(name: string): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    await db.insert(customRoles).values({ name });
    return true;
  } catch (e) {
    console.error('[DB] addCustomRole:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function deleteCustomRole(name: string): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    await db.delete(customRoles).where(eq(customRoles.name, name));
    return true;
  } catch (e) {
    console.error('[DB] deleteCustomRole:', e instanceof Error ? e.message : e);
    return false;
  }
}

// ─── Checklists ───────────────────────────────────────────────
// ★★ CRITICAL: 모든 읽기/수정/삭제는 본인(user.id) 행으로 격리. 관리자(isVimoAdmin)만 전체.

export async function getMyChecklists(): Promise<ChecklistRow[]> {
  const user = await currentUser();
  if (!user) return [];
  try {
    const admin = await isVimoAdmin(user.id);
    const rows = await db
      .select()
      .from(checklists)
      // ★ 격리: 비관리자는 본인 행만. (admin 전체)
      .where(admin ? undefined : eq(checklists.userId, user.id))
      .orderBy(asc(checklists.createdAt));
    return rows.map(checklistFromRow);
  } catch (e) {
    console.error('[DB] getMyChecklists:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function insertChecklist(item: Omit<ChecklistRow, 'id' | 'user_id' | 'created_at'>): Promise<ChecklistRow | null> {
  // ★ user.id 필수 — 기존 'local' fallback 제거(미인증 insert 차단).
  const user = await currentUser();
  if (!user) return null;
  try {
    // text 는 NOT NULL — item 계약상 항상 존재. user_id 는 서버에서 강제.
    const [row] = await db
      .insert(checklists)
      .values({
        userId: user.id,
        text: item.text,
        completed: item.completed,
        reminderTime: item.reminder_time ?? null,
        notified: item.notified,
        repeatType: item.repeat_type ?? null,
        repeatDays: item.repeat_days ?? null,
        linkedEpisodeId: item.linked_episode_id ?? null,
        linkedEpisodeTitle: item.linked_episode_title ?? null,
        linkedEpisodeNumber: item.linked_episode_number ?? null,
        linkedProjectId: item.linked_project_id ?? null,
        linkedProjectTitle: item.linked_project_title ?? null,
        linkedClientName: item.linked_client_name ?? null,
        linkedPartnerId: item.linked_partner_id ?? null,
        linkedPartnerName: item.linked_partner_name ?? null,
      })
      .returning();
    return row ? checklistFromRow(row) : null;
  } catch (e) {
    console.error('[DB] insertChecklist:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function updateChecklist(id: string, updates: Partial<ChecklistRow>): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  try {
    const admin = await isVimoAdmin(user.id);
    // ★ 격리: 비관리자는 id AND 본인 user_id 일치 행만 수정.
    const whereClause = admin
      ? eq(checklists.id, id)
      : and(eq(checklists.id, id), eq(checklists.userId, user.id));
    await db.update(checklists).set(checklistToColumns(updates)).where(whereClause);
    return true;
  } catch (e) {
    console.error('[DB] updateChecklist:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function deleteChecklist(id: string): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  try {
    const admin = await isVimoAdmin(user.id);
    // ★ 격리: 비관리자는 id AND 본인 user_id 일치 행만 삭제.
    const whereClause = admin
      ? eq(checklists.id, id)
      : and(eq(checklists.id, id), eq(checklists.userId, user.id));
    await db.delete(checklists).where(whereClause);
    return true;
  } catch (e) {
    console.error('[DB] deleteChecklist:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function clearCompletedChecklists(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  try {
    const admin = await isVimoAdmin(user.id);
    // ★ 격리: 비관리자는 본인 완료 행만 삭제. (admin 전체 완료 행)
    const whereClause = admin
      ? eq(checklists.completed, true)
      : and(eq(checklists.completed, true), eq(checklists.userId, user.id));
    await db.delete(checklists).where(whereClause);
    return true;
  } catch (e) {
    console.error('[DB] clearCompletedChecklists:', e instanceof Error ? e.message : e);
    return false;
  }
}
