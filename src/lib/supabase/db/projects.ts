'use server';
/**
 * Projects CRUD — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2, 버킷 C).
 * ★ 기존: 브라우저 클라이언트가 직접 쿼리(RLS가 보호) + cachedFetch.
 * ★ 변경: 'use server' 서버 액션에서 Drizzle로 쿼리 + 서버에서 권한 검사.
 *   - projects RLS(is_vimo_team = vimo_erp active = hasErpAccess) → 쓰기는 hasErpAccess 게이트.
 *   - 읽기(Phase 3 하드닝 완료): vimo_team_projects(hasErpAccess=전체) OR
 *     partner_self_projects_select(legacy 매핑 파트너=본인 partner_id 또는 본인 assignee 회차가
 *     있는 프로젝트만 read) — 원본 RLS 2정책의 permissive OR를 분기로 재현(라이브 pg_policies 대조).
 *   인증 = Auth.js 세션 (Phase 4 전환). 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 * ★ cachedFetch 제거: 서버 액션은 브라우저측 cache/realtime invalidate와 무관(portfolio.ts·episodes.ts와 동일).
 * ★ 매퍼/ProjectRow 내부화: projectFromRow/projectToInsert/projectToUpdate/ProjectRow 외부 import 0 재확인
 *   (trash.ts는 동일 로직을 Drizzle로 인라인 재구현, 코드 import 아님) → 'use server' 규칙상 non-export 강등.
 * ★ numeric 컬럼(total_amount/partner_payment/management_fee/margin_rate)은 Drizzle에서 string으로 반환
 *   → fromRow에서 Number() 캐스트, insert/update에서 String() 직렬화.
 */
import { and, eq, desc, exists, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { episodes, projects } from '@/db/schema';
import { currentUser, hasErpAccess, myLegacyPartnerId } from '@/lib/authz';
import type { Project, WorkContentType } from '@/types';

// partner_self_projects_select RLS 재현: 본인 partner_id 프로젝트 OR 본인 assignee 회차 보유 프로젝트.
// (원본: COALESCE(partner_id,'')=legacy OR EXISTS(episodes e WHERE e.project_id=projects.id::text
//  AND COALESCE(e.assignee,'')=legacy) — legacy는 non-null이라 coalesce 생략 동치.)
function partnerSelfProjectsFilter(legacy: string): SQL {
  return or(
    eq(projects.partnerId, legacy),
    exists(
      db.select({ one: sql`1` })
        .from(episodes)
        .where(and(
          eq(episodes.projectId, sql`${projects.id}::text`),
          eq(episodes.assignee, legacy),
        )),
    ),
  )!;
}

// ─── Mappers (내부 helper — 외부 미사용, 'use server'라 export 금지) ──────────

type ProjectRow = typeof projects.$inferSelect;

function projectFromRow(row: ProjectRow): Project {
  const partnerIds = row.partnerIds ?? (row.partnerId ? [row.partnerId] : []);
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    client: row.client ?? '',
    clientId: row.clientId ?? undefined,
    partnerId: row.partnerId ?? partnerIds[0] ?? '',
    partnerIds,
    managerIds: row.managerIds ?? [],
    category: row.category ?? undefined,
    channels: row.channels ?? undefined,
    status: row.status as Project['status'],
    budget: {
      // numeric 컬럼은 Drizzle에서 string으로 반환 → Number() 캐스트 필수.
      totalAmount: Number(row.totalAmount ?? 0),
      partnerPayment: Number(row.partnerPayment ?? 0),
      managementFee: Number(row.managementFee ?? 0),
      marginRate: Number(row.marginRate ?? 0),
    },
    workContent: (row.workContent as WorkContentType[]) ?? [],
    tags: row.tags ?? [],
    thumbnailUrl: row.thumbnailUrl ?? undefined,
    videoUrl: row.videoUrl ?? undefined,
    completedAt: row.completedAt ?? undefined,
    workTypeCosts: row.workTypeCosts as Project['workTypeCosts'],
    createdAt: row.createdAt ?? '',
    updatedAt: row.updatedAt ?? '',
  };
}

function projectToInsert(
  project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
): typeof projects.$inferInsert {
  const partnerIds = project.partnerIds ?? (project.partnerId ? [project.partnerId] : []);
  return {
    title: project.title,
    description: project.description,
    client: project.client,
    clientId: project.clientId ?? null,
    partnerId: partnerIds[0] ?? project.partnerId ?? null,
    partnerIds,
    managerIds: project.managerIds ?? [],
    category: project.category ?? null,
    channels: project.channels ?? null,
    status: project.status,
    // numeric 컬럼 → String() 직렬화.
    totalAmount: String(project.budget?.totalAmount ?? 0),
    partnerPayment: String(project.budget?.partnerPayment ?? 0),
    managementFee: String(project.budget?.managementFee ?? 0),
    marginRate: String(project.budget?.marginRate ?? 0),
    workContent: project.workContent ?? [],
    tags: project.tags ?? [],
    thumbnailUrl: project.thumbnailUrl ?? null,
    videoUrl: project.videoUrl ?? null,
    completedAt: project.completedAt ?? null,
    workTypeCosts: project.workTypeCosts ?? null,
  };
}

function projectToUpdate(project: Partial<Project>): Partial<typeof projects.$inferInsert> {
  const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (project.title !== undefined) patch.title = project.title;
  if (project.description !== undefined) patch.description = project.description;
  if (project.client !== undefined) patch.client = project.client;
  if (project.clientId !== undefined) patch.clientId = project.clientId ?? null;
  if (project.partnerIds !== undefined) {
    patch.partnerIds = project.partnerIds;
    patch.partnerId = project.partnerIds[0] ?? null;
  } else if (project.partnerId !== undefined) {
    patch.partnerId = project.partnerId;
  }
  if (project.managerIds !== undefined) patch.managerIds = project.managerIds;
  if (project.category !== undefined) patch.category = project.category ?? null;
  if (project.channels !== undefined) patch.channels = project.channels ?? null;
  if (project.status !== undefined) patch.status = project.status;
  if (project.budget) {
    // numeric 컬럼 → String() 직렬화.
    patch.totalAmount = String(project.budget.totalAmount);
    patch.partnerPayment = String(project.budget.partnerPayment);
    patch.managementFee = String(project.budget.managementFee);
    patch.marginRate = String(project.budget.marginRate);
  }
  if (project.workContent !== undefined) patch.workContent = project.workContent;
  if (project.tags !== undefined) patch.tags = project.tags;
  if (project.thumbnailUrl !== undefined) patch.thumbnailUrl = project.thumbnailUrl ?? null;
  if (project.videoUrl !== undefined) patch.videoUrl = project.videoUrl ?? null;
  if (project.completedAt !== undefined) patch.completedAt = project.completedAt ?? null;
  if (project.workTypeCosts !== undefined) patch.workTypeCosts = project.workTypeCosts ?? null;
  return patch;
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  // 읽기 = vimo_team(전체) OR 파트너 self 분기(원본 RLS permissive OR 재현).
  const u = await currentUser();
  if (!u) return [];
  try {
    if (await hasErpAccess(u.id)) {
      const rows = await db
        .select()
        .from(projects)
        .orderBy(desc(projects.createdAt));
      return rows.map(projectFromRow);
    }
    // 파트너 분기: legacy 매핑 있을 때만 본인 행 subset.
    const legacy = await myLegacyPartnerId(u.id);
    if (!legacy) return [];
    const rows = await db
      .select()
      .from(projects)
      .where(partnerSelfProjectsFilter(legacy))
      .orderBy(desc(projects.createdAt));
    return rows.map(projectFromRow);
  } catch (e) {
    console.error('[DB] getProjects:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getProjectById(id: string): Promise<Project | null> {
  // 읽기 = vimo_team(전체) OR 파트너 self 분기(원본 RLS permissive OR 재현).
  const u = await currentUser();
  if (!u) return null;
  try {
    const isTeam = await hasErpAccess(u.id);
    let where: SQL = eq(projects.id, id);
    if (!isTeam) {
      const legacy = await myLegacyPartnerId(u.id);
      if (!legacy) return null;
      where = and(where, partnerSelfProjectsFilter(legacy))!;
    }
    const rows = await db
      .select()
      .from(projects)
      .where(where)
      .limit(1);
    const row = rows[0];
    return row ? projectFromRow(row) : null;
  } catch (e) {
    console.error('[DB] getProjectById:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function insertProject(
  project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Project | null> {
  // 쓰기 → vimo_team(is_vimo_team = hasErpAccess)만.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return null;
  try {
    const [row] = await db
      .insert(projects)
      .values(projectToInsert(project))
      .returning();
    return row ? projectFromRow(row) : null;
  } catch (e) {
    console.error('[DB] insertProject:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<boolean> {
  // 쓰기 → vimo_team만.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return false;
  try {
    await db.update(projects).set(projectToUpdate(updates)).where(eq(projects.id, id));
    return true;
  } catch (e) {
    console.error('[DB] updateProject:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  // 쓰기 → vimo_team만.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return false;
  try {
    await db.delete(projects).where(eq(projects.id, id));
    return true;
  } catch (e) {
    console.error('[DB] deleteProject:', e instanceof Error ? e.message : e);
    return false;
  }
}
