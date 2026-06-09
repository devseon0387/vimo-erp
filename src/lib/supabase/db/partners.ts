'use server';
/**
 * Partners CRUD — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2, 버킷C / 보안민감).
 * ★ 기존: 브라우저 클라이언트가 직접 partners_safe 뷰/partners·partner_history·partner_issues 쿼리(RLS가 보호).
 * ★ 변경: 'use server' 서버 액션 + Drizzle + 서버에서 권한 검사.
 *
 *   권한 백본(RLS 재현):
 *   - partners / partner_history / partner_issues 의 행 게이트 = is_vimo_staff()
 *       (= profiles.user_type='staff' = isVimoStaff). staff 아니면 읽기 빈배열/null, 쓰기 거부.
 *   - ★ 민감 컬럼 마스킹(partners_safe 뷰 재현): getPartners/getPartnerById 에서 base partners 를
 *     읽은 뒤, !(await isProfileAdmin(user.id)) 이면 email·phone·bank·bank_account 4개 컬럼을 NULL로
 *     덮어 반환. (DB 뷰 차원 마스킹 → 앱계층 마스킹으로 이전.)
 *
 *   인증(currentUser)은 Phase 4까지 Supabase Auth 유지. 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 * ★ cachedFetch 제거: 서버 액션은 브라우저측 cache/realtime invalidate와 무관(portfolio.ts와 동일).
 *
 * PHASE3: 파트너 본인(owner) 분기 — 파트너가 자기 자신 행만 read/write, 자체 거래처 분리 등은 미구현.
 *   현 동작(staff 게이트)만 충실 번역.
 */
import { eq, asc, desc } from 'drizzle-orm';
import { db } from '@/db';
import { partners, partnerHistory, partnerIssues } from '@/db/schema';
import { currentUser, isVimoStaff, isProfileAdmin } from '@/lib/authz';
import type { Partner } from '@/types';

// ─── Mappers (내부 helper — 'use server'라 export 금지) ──────────────────────

type PartnerRow = typeof partners.$inferSelect;

function partnerFromRow(row: PartnerRow): Partner {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    company: row.company ?? undefined,
    partnerType: (row.partnerType as Partner['partnerType']) ?? undefined,
    role: row.role as Partner['role'],
    position: (row.position as Partner['position']) ?? 'partner',
    jobTitle: row.jobTitle ?? undefined,
    jobRank: row.jobRank ?? undefined,
    status: row.status as Partner['status'],
    generation: row.generation ?? undefined,
    bank: row.bank ?? undefined,
    bankAccount: row.bankAccount ?? undefined,
    profileImage: row.profileImage ?? undefined,
    kakaoChatId: row.kakaoChatId ?? undefined,
    createdAt: row.createdAt ?? '',
  };
}

// ★ partners_safe 뷰 재현: admin 이 아니면 민감 4컬럼(email/phone/bank/bank_account)을 NULL로 마스킹.
//   row 객체를 복제해 마스킹(원본 불변). partnerFromRow가 ?? undefined 처리하므로 결과는 undefined.
function maskSensitive(row: PartnerRow): PartnerRow {
  return { ...row, email: null, phone: null, bank: null, bankAccount: null };
}

function partnerToInsert(
  partner: Omit<Partner, 'id' | 'createdAt'>
): typeof partners.$inferInsert {
  return {
    name: partner.name,
    email: partner.email ?? null,
    phone: partner.phone ?? null,
    company: partner.company ?? null,
    partnerType: partner.partnerType ?? null,
    role: partner.role,
    position: partner.position ?? 'partner',
    jobTitle: partner.jobTitle ?? null,
    jobRank: partner.jobRank ?? null,
    status: partner.status,
    generation: partner.generation ?? null,
    bank: partner.bank ?? null,
    bankAccount: partner.bankAccount ?? null,
    profileImage: partner.profileImage ?? null,
    kakaoChatId: partner.kakaoChatId ?? null,
  };
}

function partnerToUpdate(partner: Partial<Partner>): Partial<typeof partners.$inferInsert> {
  const patch: Partial<typeof partners.$inferInsert> = {};
  // 충실 번역: 기존 partnerToUpdate는 정의된(!== undefined) 필드만 set. ?? null 정규화는 하지 않았음(값 그대로).
  if (partner.name !== undefined) patch.name = partner.name;
  if (partner.email !== undefined) patch.email = partner.email;
  if (partner.phone !== undefined) patch.phone = partner.phone;
  if (partner.company !== undefined) patch.company = partner.company;
  if (partner.partnerType !== undefined) patch.partnerType = partner.partnerType;
  if (partner.role !== undefined) patch.role = partner.role;
  if (partner.position !== undefined) patch.position = partner.position;
  if (partner.jobTitle !== undefined) patch.jobTitle = partner.jobTitle;
  if (partner.jobRank !== undefined) patch.jobRank = partner.jobRank;
  if (partner.status !== undefined) patch.status = partner.status;
  if (partner.generation !== undefined) patch.generation = partner.generation;
  if (partner.bank !== undefined) patch.bank = partner.bank;
  if (partner.bankAccount !== undefined) patch.bankAccount = partner.bankAccount;
  if (partner.profileImage !== undefined) patch.profileImage = partner.profileImage;
  if (partner.kakaoChatId !== undefined) patch.kakaoChatId = partner.kakaoChatId;
  return patch;
}

// ─── CRUD (partners) ─────────────────────────────────────────

export async function getPartners(): Promise<Partner[]> {
  // 행 게이트: staff 만. (partners_safe 뷰는 is_vimo_staff RLS 위에 있었음)
  const u = await currentUser();
  if (!u || !(await isVimoStaff(u.id))) return [];
  try {
    const rows = await db
      .select()
      .from(partners)
      .orderBy(desc(partners.createdAt));
    // ★ 민감 컬럼 마스킹: admin 아니면 email/phone/bank/bank_account → NULL.
    const isAdmin = await isProfileAdmin(u.id);
    const safe = isAdmin ? rows : rows.map(maskSensitive);
    return safe.map(partnerFromRow);
  } catch (e) {
    console.error('[DB] getPartners:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getPartnerById(id: string): Promise<Partner | null> {
  const u = await currentUser();
  if (!u || !(await isVimoStaff(u.id))) return null;
  try {
    const [row] = await db
      .select()
      .from(partners)
      .where(eq(partners.id, id))
      .limit(1);
    if (!row) return null;
    // ★ 민감 컬럼 마스킹: admin 아니면 email/phone/bank/bank_account → NULL.
    const isAdmin = await isProfileAdmin(u.id);
    return partnerFromRow(isAdmin ? row : maskSensitive(row));
  } catch (e) {
    console.error('[DB] getPartnerById:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function insertPartner(
  partner: Omit<Partner, 'id' | 'createdAt'>
): Promise<Partner | null> {
  // 쓰기 → staff 게이트.
  const u = await currentUser();
  if (!u || !(await isVimoStaff(u.id))) return null;
  try {
    const [row] = await db
      .insert(partners)
      .values(partnerToInsert(partner))
      .returning();
    return row ? partnerFromRow(row) : null;
  } catch (e) {
    console.error('[DB] insertPartner:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function updatePartner(id: string, updates: Partial<Partner>): Promise<boolean> {
  const u = await currentUser();
  if (!u || !(await isVimoStaff(u.id))) return false;
  try {
    await db.update(partners).set(partnerToUpdate(updates)).where(eq(partners.id, id));
    return true;
  } catch (e) {
    console.error('[DB] updatePartner:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function deletePartner(id: string): Promise<boolean> {
  const u = await currentUser();
  if (!u || !(await isVimoStaff(u.id))) return false;
  try {
    await db.delete(partners).where(eq(partners.id, id));
    return true;
  } catch (e) {
    console.error('[DB] deletePartner:', e instanceof Error ? e.message : e);
    return false;
  }
}

// ─── Partner History (활동 기수 이력) ───────────────────────────

interface PartnerHistoryEntry {
  id: string;
  generation: number;
  startDate: string;
  endDate?: string;
}

export async function getPartnerHistory(partnerId: string): Promise<PartnerHistoryEntry[]> {
  const u = await currentUser();
  if (!u || !(await isVimoStaff(u.id))) return [];
  try {
    const rows = await db
      .select()
      .from(partnerHistory)
      .where(eq(partnerHistory.partnerId, partnerId))
      .orderBy(asc(partnerHistory.generation));
    // start_date/end_date 는 date(mode:'string') → 문자열 그대로.
    return rows.map((r) => ({
      id: r.id,
      generation: r.generation,
      startDate: r.startDate,
      endDate: r.endDate ?? undefined,
    }));
  } catch (e) {
    console.error('[DB] getPartnerHistory:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function insertPartnerHistory(
  partnerId: string,
  entry: Omit<PartnerHistoryEntry, 'id'>
): Promise<PartnerHistoryEntry | null> {
  const u = await currentUser();
  if (!u || !(await isVimoStaff(u.id))) return null;
  try {
    const [r] = await db
      .insert(partnerHistory)
      .values({
        partnerId,
        generation: entry.generation,
        startDate: entry.startDate,
        endDate: entry.endDate ?? null,
      })
      .returning();
    if (!r) return null;
    return { id: r.id, generation: r.generation, startDate: r.startDate, endDate: r.endDate ?? undefined };
  } catch (e) {
    console.error('[DB] insertPartnerHistory:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function deletePartnerHistory(id: string): Promise<boolean> {
  const u = await currentUser();
  if (!u || !(await isVimoStaff(u.id))) return false;
  try {
    await db.delete(partnerHistory).where(eq(partnerHistory.id, id));
    return true;
  } catch (e) {
    console.error('[DB] deletePartnerHistory:', e instanceof Error ? e.message : e);
    return false;
  }
}

// ─── Partner Issues (파트너 이슈/메모) ──────────────────────────

interface PartnerIssueEntry {
  id: string;
  content: string;
  createdAt: string;
}

export async function getPartnerIssues(partnerId: string): Promise<PartnerIssueEntry[]> {
  const u = await currentUser();
  if (!u || !(await isVimoStaff(u.id))) return [];
  try {
    const rows = await db
      .select()
      .from(partnerIssues)
      .where(eq(partnerIssues.partnerId, partnerId))
      .orderBy(desc(partnerIssues.createdAt));
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.createdAt,
    }));
  } catch (e) {
    console.error('[DB] getPartnerIssues:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function insertPartnerIssue(
  partnerId: string,
  content: string
): Promise<PartnerIssueEntry | null> {
  const u = await currentUser();
  if (!u || !(await isVimoStaff(u.id))) return null;
  try {
    const [r] = await db
      .insert(partnerIssues)
      .values({ partnerId, content })
      .returning();
    if (!r) return null;
    return { id: r.id, content: r.content, createdAt: r.createdAt };
  } catch (e) {
    console.error('[DB] insertPartnerIssue:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function deletePartnerIssue(id: string): Promise<boolean> {
  const u = await currentUser();
  if (!u || !(await isVimoStaff(u.id))) return false;
  try {
    await db.delete(partnerIssues).where(eq(partnerIssues.id, id));
    return true;
  } catch (e) {
    console.error('[DB] deletePartnerIssue:', e instanceof Error ? e.message : e);
    return false;
  }
}
