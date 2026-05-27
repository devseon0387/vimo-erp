/**
 * Partners CRUD
 */
import { createClient } from '../client';
import { cachedFetch } from '../cache';
import type { Partner } from '@/types';

// ─── Row Types (Supabase snake_case) ─────────────────────────

export interface PartnerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  partner_type: string | null;
  role: string;
  position: string | null;
  job_title: string | null;
  job_rank: string | null;
  status: string;
  generation: number | null;
  bank: string | null;
  bank_account: string | null;
  profile_image: string | null;
  created_at: string;
}

// ─── Mappers ─────────────────────────────────────────────────

export function partnerFromRow(row: PartnerRow): Partner {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    company: row.company ?? undefined,
    partnerType: row.partner_type as Partner['partnerType'],
    role: row.role as Partner['role'],
    position: (row.position as Partner['position']) ?? 'partner',
    jobTitle: row.job_title ?? undefined,
    jobRank: row.job_rank ?? undefined,
    status: row.status as Partner['status'],
    generation: row.generation ?? undefined,
    bank: row.bank ?? undefined,
    bankAccount: row.bank_account ?? undefined,
    profileImage: row.profile_image ?? undefined,
    createdAt: row.created_at,
  };
}

export function partnerToInsert(partner: Omit<Partner, 'id' | 'createdAt'>) {
  return {
    name: partner.name,
    email: partner.email ?? null,
    phone: partner.phone ?? null,
    company: partner.company ?? null,
    partner_type: partner.partnerType ?? null,
    role: partner.role,
    position: partner.position ?? 'partner',
    job_title: partner.jobTitle ?? null,
    job_rank: partner.jobRank ?? null,
    status: partner.status,
    generation: partner.generation ?? null,
    bank: partner.bank ?? null,
    bank_account: partner.bankAccount ?? null,
    profile_image: partner.profileImage ?? null,
  };
}

export function partnerToUpdate(partner: Partial<Partner>) {
  const row: Record<string, unknown> = {};
  if (partner.name !== undefined) row.name = partner.name;
  if (partner.email !== undefined) row.email = partner.email;
  if (partner.phone !== undefined) row.phone = partner.phone;
  if (partner.company !== undefined) row.company = partner.company;
  if (partner.partnerType !== undefined) row.partner_type = partner.partnerType;
  if (partner.role !== undefined) row.role = partner.role;
  if (partner.position !== undefined) row.position = partner.position;
  if (partner.jobTitle !== undefined) row.job_title = partner.jobTitle;
  if (partner.jobRank !== undefined) row.job_rank = partner.jobRank;
  if (partner.status !== undefined) row.status = partner.status;
  if (partner.generation !== undefined) row.generation = partner.generation;
  if (partner.bank !== undefined) row.bank = partner.bank;
  if (partner.bankAccount !== undefined) row.bank_account = partner.bankAccount;
  if (partner.profileImage !== undefined) row.profile_image = partner.profileImage;
  return row;
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getPartners(): Promise<Partner[]> {
  return cachedFetch('partners:list', async () => {
    const supabase = createClient();
    // partners_safe view: 민감 컬럼(email/phone/bank/bank_account)은 admin 만 볼 수 있게
    // DB 차원에서 마스킹. 일반 staff/매니저에게는 NULL 로 반환됨.
    const { data, error } = await supabase
      .from('partners_safe')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error('[DB] getPartners:', error.message); return []; }
    if (!data) return [];
    return (data as PartnerRow[]).map(partnerFromRow);
  });
}

export async function getPartnerById(id: string): Promise<Partner | null> {
  return cachedFetch(`partners:byId:${id}`, async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('partners_safe')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) { console.error('[DB] getPartnerById:', error.message); return null; }
    if (!data) return null;
    return partnerFromRow(data as PartnerRow);
  });
}

export async function insertPartner(
  partner: Omit<Partner, 'id' | 'createdAt'>
): Promise<Partner | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('partners')
    .insert([partnerToInsert(partner)])
    .select()
    .single();
  if (error) { console.error('[DB] insertPartner:', error.message); return null; }
  if (!data) return null;
  return partnerFromRow(data as PartnerRow);
}

export async function updatePartner(id: string, updates: Partial<Partner>): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('partners')
    .update(partnerToUpdate(updates))
    .eq('id', id);
  if (error) console.error('[DB] updatePartner:', error.message);
  return !error;
}

export async function deletePartner(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from('partners').delete().eq('id', id);
  if (error) console.error('[DB] deletePartner:', error.message);
  return !error;
}

// ─── Partner History (활동 기수 이력) ───────────────────────────

export interface PartnerHistoryRow {
  id: string;
  partner_id: string;
  generation: number;
  start_date: string;
  end_date: string | null;
  created_at: string;
}

export interface PartnerHistoryEntry {
  id: string;
  generation: number;
  startDate: string;
  endDate?: string;
}

export async function getPartnerHistory(partnerId: string): Promise<PartnerHistoryEntry[]> {
  return cachedFetch(`partner_history:${partnerId}`, async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('partner_history')
      .select('*')
      .eq('partner_id', partnerId)
      .order('generation', { ascending: true });
    if (error) { console.error('[DB] getPartnerHistory:', error.message); return []; }
    if (!data) return [];
    return (data as PartnerHistoryRow[]).map(r => ({
      id: r.id,
      generation: r.generation,
      startDate: r.start_date,
      endDate: r.end_date ?? undefined,
    }));
  });
}

export async function insertPartnerHistory(
  partnerId: string,
  entry: Omit<PartnerHistoryEntry, 'id'>
): Promise<PartnerHistoryEntry | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('partner_history')
    .insert([{ partner_id: partnerId, generation: entry.generation, start_date: entry.startDate, end_date: entry.endDate ?? null }])
    .select()
    .single();
  if (error) { console.error('[DB] insertPartnerHistory:', error.message); return null; }
  if (!data) return null;
  const r = data as PartnerHistoryRow;
  return { id: r.id, generation: r.generation, startDate: r.start_date, endDate: r.end_date ?? undefined };
}

export async function deletePartnerHistory(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from('partner_history').delete().eq('id', id);
  if (error) console.error('[DB] deletePartnerHistory:', error.message);
  return !error;
}

// ─── Partner Issues (파트너 이슈/메모) ──────────────────────────

export interface PartnerIssueRow {
  id: string;
  partner_id: string;
  content: string;
  created_at: string;
}

export interface PartnerIssueEntry {
  id: string;
  content: string;
  createdAt: string;
}

export async function getPartnerIssues(partnerId: string): Promise<PartnerIssueEntry[]> {
  return cachedFetch(`partner_issues:${partnerId}`, async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('partner_issues')
      .select('*')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false });
    if (error) { console.error('[DB] getPartnerIssues:', error.message); return []; }
    if (!data) return [];
    return (data as PartnerIssueRow[]).map(r => ({
      id: r.id,
      content: r.content,
      createdAt: r.created_at,
    }));
  });
}

export async function insertPartnerIssue(
  partnerId: string,
  content: string
): Promise<PartnerIssueEntry | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('partner_issues')
    .insert([{ partner_id: partnerId, content }])
    .select()
    .single();
  if (error) { console.error('[DB] insertPartnerIssue:', error.message); return null; }
  if (!data) return null;
  const r = data as PartnerIssueRow;
  return { id: r.id, content: r.content, createdAt: r.created_at };
}

export async function deletePartnerIssue(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from('partner_issues').delete().eq('id', id);
  if (error) console.error('[DB] deletePartnerIssue:', error.message);
  return !error;
}
