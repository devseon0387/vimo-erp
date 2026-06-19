'use server';
/**
 * Episodes CRUD — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2).
 * ★ 기존: 브라우저 클라이언트가 직접 쿼리(RLS가 보호) + cachedFetch.
 * ★ 변경: 'use server' 서버 액션에서 Drizzle로 쿼리 + 서버에서 권한 검사.
 *   - vimo_team_episodes RLS(is_vimo_team = vimo_erp active = hasErpAccess) → 쓰기는 hasErpAccess 게이트.
 *   - 읽기(Phase 3 하드닝 완료): vimo_team(전체) OR partner_self_episodes_select(legacy 매핑
 *     파트너=본인 assignee 회차만 read) — 원본 RLS permissive OR 재현(라이브 pg_policies 대조).
 *   인증 = Auth.js 세션 (Phase 4 전환). 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 * ★ cachedFetch 제거: 서버 액션은 브라우저측 cache/realtime invalidate와 무관(portfolio.ts와 동일하게 캐시 미사용).
 */
import { and, eq, desc, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { currentUser, hasErpAccess, myLegacyPartnerId } from '@/lib/authz';
import type { Episode, WorkContentType } from '@/types';

// onConflictDoUpdate set 절: Supabase upsert(onConflict:'id')의 "충돌 시 제공 컬럼 전체 덮어쓰기"를
// PG의 excluded 의사테이블로 1:1 재현. (col = excluded.<db_column>)
function excluded(dbColumn: string): SQL {
  return sql.raw(`excluded.${dbColumn}`);
}

// ─── Mappers (내부 helper — 외부 미사용, 'use server'라 export 금지) ──────────

type EpisodeRow = typeof episodes.$inferSelect;

function episodeFromRow(row: EpisodeRow): Episode & { projectId: string } {
  return {
    id: row.id,
    projectId: row.projectId,
    episodeNumber: row.episodeNumber,
    title: row.title,
    description: row.description ?? undefined,
    client: row.client ?? undefined,
    clientId: row.clientId ?? undefined,
    workContent: (row.workContent as WorkContentType[]) ?? [],
    workItems: row.workItems as Episode['workItems'],
    status: row.status as Episode['status'],
    assignee: row.assignee ?? '',
    manager: row.manager ?? '',
    startDate: row.startDate ?? '',
    endDate: row.endDate ?? undefined,
    dueDate: row.dueDate ?? undefined,
    budget: {
      // numeric 컬럼은 Drizzle에서 string으로 반환 → Number() 캐스트 필수.
      totalAmount: Number(row.budgetTotal ?? 0),
      partnerPayment: Number(row.budgetPartner ?? 0),
      managementFee: Number(row.budgetManagement ?? 0),
    },
    workSteps: row.workSteps as Episode['workSteps'],
    workBudgets: row.workBudgets as Episode['workBudgets'],
    paymentDueDate: row.paymentDueDate ?? undefined,
    paymentStatus: (row.paymentStatus as Episode['paymentStatus']) ?? 'pending',
    paymentDate: row.paymentDate ?? undefined,
    invoiceDate: row.invoiceDate ?? undefined,
    invoiceStatus: (row.invoiceStatus as Episode['invoiceStatus']) ?? 'pending',
    completedAt: row.completedAt ?? undefined,
    createdAt: row.createdAt ?? '',
    updatedAt: row.updatedAt ?? '',
  };
}

function episodeToInsert(
  episode: Episode & { projectId: string }
): typeof episodes.$inferInsert {
  // 주의: 기존 episodeToInsert는 client_id를 insert payload에 포함하지 않았음 → 동작 보존 위해 clientId 생략.
  return {
    id: episode.id,
    projectId: episode.projectId,
    episodeNumber: episode.episodeNumber,
    title: episode.title,
    description: episode.description ?? null,
    client: episode.client ?? null,
    workContent: episode.workContent ?? [],
    workItems: episode.workItems ?? null,
    status: episode.status,
    assignee: episode.assignee ?? null,
    manager: episode.manager ?? null,
    startDate: episode.startDate ?? null,
    endDate: episode.endDate ?? null,
    dueDate: episode.dueDate ?? null,
    budgetTotal: String(episode.budget?.totalAmount ?? 0),
    budgetPartner: String(episode.budget?.partnerPayment ?? 0),
    budgetManagement: String(episode.budget?.managementFee ?? 0),
    workSteps: episode.workSteps ?? null,
    workBudgets: episode.workBudgets ?? null,
    paymentDueDate: episode.paymentDueDate ?? null,
    paymentStatus: episode.paymentStatus ?? 'pending',
    paymentDate: episode.paymentDate ?? null,
    invoiceDate: episode.invoiceDate ?? null,
    invoiceStatus: episode.invoiceStatus ?? 'pending',
    completedAt: episode.completedAt ?? null,
  };
}

function episodeToUpdate(fields: Partial<Episode>): Partial<typeof episodes.$inferInsert> {
  const patch: Partial<typeof episodes.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (fields.episodeNumber !== undefined) patch.episodeNumber = fields.episodeNumber;
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.description !== undefined) patch.description = fields.description ?? null;
  if (fields.client !== undefined) patch.client = fields.client ?? null;
  if (fields.clientId !== undefined) patch.clientId = fields.clientId ?? null;
  if (fields.workContent !== undefined) patch.workContent = fields.workContent ?? [];
  if (fields.workItems !== undefined) patch.workItems = fields.workItems ?? null;
  if (fields.status !== undefined) patch.status = fields.status;
  if (fields.assignee !== undefined) patch.assignee = fields.assignee ?? null;
  if (fields.manager !== undefined) patch.manager = fields.manager ?? null;
  if (fields.startDate !== undefined) patch.startDate = fields.startDate ?? null;
  if (fields.endDate !== undefined) patch.endDate = fields.endDate ?? null;
  if (fields.dueDate !== undefined) patch.dueDate = fields.dueDate ?? null;
  if (fields.budget !== undefined) {
    patch.budgetTotal = String(fields.budget.totalAmount);
    patch.budgetPartner = String(fields.budget.partnerPayment);
    patch.budgetManagement = String(fields.budget.managementFee);
  }
  if (fields.workSteps !== undefined) patch.workSteps = fields.workSteps ?? null;
  if (fields.workBudgets !== undefined) patch.workBudgets = fields.workBudgets ?? null;
  if (fields.paymentDueDate !== undefined) patch.paymentDueDate = fields.paymentDueDate ?? null;
  if (fields.paymentStatus !== undefined) patch.paymentStatus = fields.paymentStatus ?? 'pending';
  if (fields.paymentDate !== undefined) patch.paymentDate = fields.paymentDate ?? null;
  if (fields.invoiceDate !== undefined) patch.invoiceDate = fields.invoiceDate ?? null;
  if (fields.invoiceStatus !== undefined) patch.invoiceStatus = fields.invoiceStatus ?? 'pending';
  if (fields.completedAt !== undefined) patch.completedAt = fields.completedAt ?? null;
  return patch;
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getAllEpisodes(): Promise<(Episode & { projectId: string })[]> {
  // 읽기 = vimo_team(전체) OR 파트너 self 분기(본인 assignee 회차만, 원본 RLS permissive OR 재현).
  const u = await currentUser();
  if (!u) return [];
  try {
    const isTeam = await hasErpAccess(u.id);
    let where: SQL | undefined;
    if (!isTeam) {
      const legacy = await myLegacyPartnerId(u.id);
      if (!legacy) return [];
      where = eq(episodes.assignee, legacy);
    }
    const rows = await db
      .select()
      .from(episodes)
      .where(where)
      .orderBy(desc(episodes.createdAt));
    return rows.map(episodeFromRow);
  } catch (e) {
    console.error('[DB] getAllEpisodes:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getProjectEpisodes(
  projectId: string
): Promise<(Episode & { projectId: string })[]> {
  // 읽기 = vimo_team(전체) OR 파트너 self 분기(본인 assignee 회차만).
  const u = await currentUser();
  if (!u) return [];
  try {
    const isTeam = await hasErpAccess(u.id);
    let where: SQL = eq(episodes.projectId, projectId);
    if (!isTeam) {
      const legacy = await myLegacyPartnerId(u.id);
      if (!legacy) return [];
      where = and(where, eq(episodes.assignee, legacy))!;
    }
    const rows = await db
      .select()
      .from(episodes)
      .where(where)
      .orderBy(desc(episodes.episodeNumber));
    return rows.map(episodeFromRow);
  } catch (e) {
    console.error('[DB] getProjectEpisodes:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function upsertEpisodes(
  episodeList: (Episode & { projectId: string })[]
): Promise<boolean> {
  if (episodeList.length === 0) return true;
  // 쓰기 → vimo_team(is_vimo_team = hasErpAccess)만.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return false;
  try {
    await db
      .insert(episodes)
      .values(episodeList.map(episodeToInsert))
      .onConflictDoUpdate({
        target: episodes.id,
        set: {
          projectId: excluded('project_id'),
          episodeNumber: excluded('episode_number'),
          title: excluded('title'),
          description: excluded('description'),
          client: excluded('client'),
          workContent: excluded('work_content'),
          workItems: excluded('work_items'),
          status: excluded('status'),
          assignee: excluded('assignee'),
          manager: excluded('manager'),
          startDate: excluded('start_date'),
          endDate: excluded('end_date'),
          dueDate: excluded('due_date'),
          budgetTotal: excluded('budget_total'),
          budgetPartner: excluded('budget_partner'),
          budgetManagement: excluded('budget_management'),
          workSteps: excluded('work_steps'),
          workBudgets: excluded('work_budgets'),
          paymentDueDate: excluded('payment_due_date'),
          paymentStatus: excluded('payment_status'),
          paymentDate: excluded('payment_date'),
          invoiceDate: excluded('invoice_date'),
          invoiceStatus: excluded('invoice_status'),
          completedAt: excluded('completed_at'),
        },
      });
    return true;
  } catch (e) {
    console.error('[DB] upsertEpisodes:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function upsertEpisode(
  episode: Episode & { projectId: string }
): Promise<boolean> {
  // 자체 게이트 불필요 — upsertEpisodes 내부에서 적용됨.
  return upsertEpisodes([episode]);
}

export async function deleteEpisode(id: string): Promise<boolean> {
  // 쓰기 → vimo_team만.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return false;
  try {
    await db.delete(episodes).where(eq(episodes.id, id));
    return true;
  } catch (e) {
    console.error('[DB] deleteEpisode:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function deleteProjectEpisodes(projectId: string): Promise<boolean> {
  // 쓰기 → vimo_team만.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return false;
  try {
    await db.delete(episodes).where(eq(episodes.projectId, projectId));
    return true;
  } catch (e) {
    console.error('[DB] deleteProjectEpisodes:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function updateEpisodeFields(
  id: string,
  fields: Partial<Episode>
): Promise<boolean> {
  // 쓰기 → vimo_team만. (10개 'use client' 호출 핫패스 — 시그니처 절대 유지)
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return false;
  try {
    await db.update(episodes).set(episodeToUpdate(fields)).where(eq(episodes.id, id));
    return true;
  } catch (e) {
    console.error('[DB] updateEpisodeFields:', e instanceof Error ? e.message : e);
    return false;
  }
}
