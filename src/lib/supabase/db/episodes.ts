/**
 * Episodes CRUD
 */
import { createClient } from '../client';
import type { Episode, WorkContentType } from '@/types';

// ─── Row Types (Supabase snake_case) ─────────────────────────

export interface EpisodeRow {
  id: string;
  project_id: string;
  episode_number: number;
  title: string;
  description: string | null;
  client: string | null;
  client_id: string | null;
  work_content: string[] | null;
  work_items: unknown | null;
  status: string;
  assignee: string | null;
  manager: string | null;
  start_date: string | null;
  end_date: string | null;
  due_date: string | null;
  budget_total: number;
  budget_partner: number;
  budget_management: number;
  work_steps: unknown | null;
  work_budgets: unknown | null;
  payment_due_date: string | null;
  payment_status: string | null;
  invoice_date: string | null;
  invoice_status: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Mappers ─────────────────────────────────────────────────

export function episodeFromRow(row: EpisodeRow): Episode & { projectId: string } {
  return {
    id: row.id,
    projectId: row.project_id,
    episodeNumber: row.episode_number,
    title: row.title,
    description: row.description ?? undefined,
    client: row.client ?? undefined,
    clientId: row.client_id ?? undefined,
    workContent: (row.work_content as WorkContentType[]) ?? [],
    workItems: row.work_items as Episode['workItems'],
    status: row.status as Episode['status'],
    assignee: row.assignee ?? '',
    manager: row.manager ?? '',
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    budget: {
      totalAmount: row.budget_total,
      partnerPayment: row.budget_partner,
      managementFee: row.budget_management,
    },
    workSteps: row.work_steps as Episode['workSteps'],
    workBudgets: row.work_budgets as Episode['workBudgets'],
    paymentDueDate: row.payment_due_date ?? undefined,
    paymentStatus: (row.payment_status as Episode['paymentStatus']) ?? 'pending',
    invoiceDate: row.invoice_date ?? undefined,
    invoiceStatus: (row.invoice_status as Episode['invoiceStatus']) ?? 'pending',
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function episodeToInsert(episode: Episode & { projectId: string }) {
  // episode_number=0 또는 음수 → null 로 보내 DB 트리거(set_episode_number)가
  // advisory lock 안에서 max+1 부여하도록 위임. 클라이언트 max+1 계산은 race 발생.
  const epNum = episode.episodeNumber && episode.episodeNumber > 0
    ? episode.episodeNumber
    : null;
  return {
    id: episode.id,
    project_id: episode.projectId,
    episode_number: epNum,
    title: episode.title,
    description: episode.description ?? null,
    client: episode.client ?? null,
    work_content: episode.workContent ?? [],
    work_items: episode.workItems ?? null,
    status: episode.status,
    assignee: episode.assignee ?? null,
    manager: episode.manager ?? null,
    start_date: episode.startDate ?? null,
    end_date: episode.endDate ?? null,
    due_date: episode.dueDate ?? null,
    budget_total: episode.budget?.totalAmount ?? 0,
    budget_partner: episode.budget?.partnerPayment ?? 0,
    budget_management: episode.budget?.managementFee ?? 0,
    work_steps: episode.workSteps ?? null,
    work_budgets: episode.workBudgets ?? null,
    payment_due_date: episode.paymentDueDate ?? null,
    payment_status: episode.paymentStatus ?? 'pending',
    invoice_date: episode.invoiceDate ?? null,
    invoice_status: episode.invoiceStatus ?? 'pending',
    completed_at: episode.completedAt ?? null,
  };
}

export function episodeToUpdate(fields: Partial<Episode>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.episodeNumber !== undefined) row.episode_number = fields.episodeNumber;
  if (fields.title !== undefined) row.title = fields.title;
  if (fields.description !== undefined) row.description = fields.description ?? null;
  if (fields.client !== undefined) row.client = fields.client ?? null;
  if (fields.clientId !== undefined) row.client_id = fields.clientId ?? null;
  if (fields.workContent !== undefined) row.work_content = fields.workContent ?? [];
  if (fields.workItems !== undefined) row.work_items = fields.workItems ?? null;
  if (fields.status !== undefined) row.status = fields.status;
  if (fields.assignee !== undefined) row.assignee = fields.assignee ?? null;
  if (fields.manager !== undefined) row.manager = fields.manager ?? null;
  if (fields.startDate !== undefined) row.start_date = fields.startDate ?? null;
  if (fields.endDate !== undefined) row.end_date = fields.endDate ?? null;
  if (fields.dueDate !== undefined) row.due_date = fields.dueDate ?? null;
  if (fields.budget !== undefined) {
    row.budget_total = fields.budget.totalAmount;
    row.budget_partner = fields.budget.partnerPayment;
    row.budget_management = fields.budget.managementFee;
  }
  if (fields.workSteps !== undefined) row.work_steps = fields.workSteps ?? null;
  if (fields.workBudgets !== undefined) row.work_budgets = fields.workBudgets ?? null;
  if (fields.paymentDueDate !== undefined) row.payment_due_date = fields.paymentDueDate ?? null;
  if (fields.paymentStatus !== undefined) row.payment_status = fields.paymentStatus ?? 'pending';
  if (fields.invoiceDate !== undefined) row.invoice_date = fields.invoiceDate ?? null;
  if (fields.invoiceStatus !== undefined) row.invoice_status = fields.invoiceStatus ?? 'pending';
  if (fields.completedAt !== undefined) row.completed_at = fields.completedAt ?? null;
  return row;
}

export async function updateEpisodeFields(
  id: string,
  fields: Partial<Episode>
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('episodes')
    .update(episodeToUpdate(fields))
    .eq('id', id);
  if (error) console.error('[DB] updateEpisodeFields:', error.message);
  return !error;
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getAllEpisodes(): Promise<(Episode & { projectId: string })[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('[DB] getAllEpisodes:', error.message); return []; }
  if (!data) return [];
  return (data as EpisodeRow[]).map(episodeFromRow);
}

export async function getProjectEpisodes(
  projectId: string
): Promise<(Episode & { projectId: string })[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('project_id', projectId)
    .order('episode_number', { ascending: false });
  if (error) { console.error('[DB] getProjectEpisodes:', error.message); return []; }
  if (!data) return [];
  return (data as EpisodeRow[]).map(episodeFromRow);
}

export async function upsertEpisodes(
  episodes: (Episode & { projectId: string })[]
): Promise<boolean> {
  if (episodes.length === 0) return true;
  const supabase = createClient();
  const { error } = await supabase
    .from('episodes')
    .upsert(episodes.map(episodeToInsert), { onConflict: 'id' });
  if (error) console.error('[DB] upsertEpisodes:', error.message);
  return !error;
}

export async function upsertEpisode(
  episode: Episode & { projectId: string }
): Promise<boolean> {
  return upsertEpisodes([episode]);
}

export async function deleteEpisode(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from('episodes').delete().eq('id', id);
  if (error) console.error('[DB] deleteEpisode:', error.message);
  return !error;
}

export async function deleteProjectEpisodes(projectId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('episodes')
    .delete()
    .eq('project_id', projectId);
  if (error) console.error('[DB] deleteProjectEpisodes:', error.message);
  return !error;
}
