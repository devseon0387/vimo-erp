'use server';
/**
 * Contracts CRUD — 영업 퍼널(문의→계약→프로젝트). 자체 PG(Drizzle).
 * ★ 'use server' 서버 액션 + 서버측 권한 검사.
 *   - 쓰기(insert/update/delete) → vimo_team(hasErpAccess) 게이트.
 *   - 읽기(getContracts/getContractById) → vimo_team(전체) OR 파트너 비공개([]/null).
 *     계약은 비모 내부 영업 자료 → 파트너에게 노출 안 함.
 * ★ 매퍼/타입은 외부 미사용 → 내부 non-export('use server'는 비-async export 금지).
 * ★ numeric 컬럼(supply_amount/vat_amount/total_amount/partner_payment/management_fee/margin_rate)
 *   은 drizzle가 string으로 돌려주므로 Number(x ?? 0) 캐스팅.
 */
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { contracts } from '@/db/schema';
import { currentUser, hasErpAccess } from '@/lib/authz';
import type { Contract } from '@/types';

// ─── Mappers (내부 helper — 외부 미사용, 'use server'라 export 금지) ──────────

type ContractRow = typeof contracts.$inferSelect;

function contractFromRow(row: ContractRow): Contract {
  return {
    id: row.id,
    clientId: row.clientId,
    inquiryId: row.inquiryId ?? undefined,
    title: row.title,
    contractType: row.contractType as Contract['contractType'],
    supplyAmount: Number(row.supplyAmount ?? 0),
    vatAmount: Number(row.vatAmount ?? 0),
    totalAmount: Number(row.totalAmount ?? 0),
    partnerPayment: Number(row.partnerPayment ?? 0),
    managementFee: Number(row.managementFee ?? 0),
    marginRate: Number(row.marginRate ?? 0),
    startDate: row.startDate ?? undefined,
    endDate: row.endDate ?? undefined,
    status: row.status as Contract['status'],
    contractDate: row.contractDate ?? undefined,
    signedDate: row.signedDate ?? undefined,
    paymentTerms: row.paymentTerms ?? undefined,
    managerId: row.managerId ?? undefined,
    memo: row.memo ?? undefined,
    createdAt: row.createdAt ?? '',
    updatedAt: row.updatedAt ?? '',
  };
}

function contractToInsert(
  contract: Omit<Contract, 'id' | 'createdAt' | 'updatedAt'>
): typeof contracts.$inferInsert {
  return {
    clientId: contract.clientId,
    inquiryId: contract.inquiryId ?? null,
    title: contract.title,
    contractType: contract.contractType,
    supplyAmount: String(contract.supplyAmount ?? 0),
    vatAmount: String(contract.vatAmount ?? 0),
    totalAmount: String(contract.totalAmount ?? 0),
    partnerPayment: String(contract.partnerPayment ?? 0),
    managementFee: String(contract.managementFee ?? 0),
    marginRate: String(contract.marginRate ?? 0),
    startDate: contract.startDate ?? null,
    endDate: contract.endDate ?? null,
    status: contract.status,
    contractDate: contract.contractDate ?? null,
    signedDate: contract.signedDate ?? null,
    paymentTerms: contract.paymentTerms ?? null,
    managerId: contract.managerId ?? null,
    memo: contract.memo ?? null,
  };
}

function contractToUpdate(contract: Partial<Contract>): Partial<typeof contracts.$inferInsert> {
  const patch: Partial<typeof contracts.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (contract.clientId !== undefined) patch.clientId = contract.clientId;
  if (contract.inquiryId !== undefined) patch.inquiryId = contract.inquiryId ?? null;
  if (contract.title !== undefined) patch.title = contract.title;
  if (contract.contractType !== undefined) patch.contractType = contract.contractType;
  if (contract.supplyAmount !== undefined) patch.supplyAmount = String(contract.supplyAmount ?? 0);
  if (contract.vatAmount !== undefined) patch.vatAmount = String(contract.vatAmount ?? 0);
  if (contract.totalAmount !== undefined) patch.totalAmount = String(contract.totalAmount ?? 0);
  if (contract.partnerPayment !== undefined) patch.partnerPayment = String(contract.partnerPayment ?? 0);
  if (contract.managementFee !== undefined) patch.managementFee = String(contract.managementFee ?? 0);
  if (contract.marginRate !== undefined) patch.marginRate = String(contract.marginRate ?? 0);
  if (contract.startDate !== undefined) patch.startDate = contract.startDate ?? null;
  if (contract.endDate !== undefined) patch.endDate = contract.endDate ?? null;
  if (contract.status !== undefined) patch.status = contract.status;
  if (contract.contractDate !== undefined) patch.contractDate = contract.contractDate ?? null;
  if (contract.signedDate !== undefined) patch.signedDate = contract.signedDate ?? null;
  if (contract.paymentTerms !== undefined) patch.paymentTerms = contract.paymentTerms ?? null;
  if (contract.managerId !== undefined) patch.managerId = contract.managerId ?? null;
  if (contract.memo !== undefined) patch.memo = contract.memo ?? null;
  return patch;
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getContracts(): Promise<Contract[]> {
  // 읽기 = vimo_team(전체)만. 파트너 비공개.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return [];
  try {
    const rows = await db
      .select()
      .from(contracts)
      .orderBy(desc(contracts.createdAt));
    return rows.map(contractFromRow);
  } catch (e) {
    console.error('[DB] getContracts:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getContractById(id: string): Promise<Contract | null> {
  // 읽기 = vimo_team(전체)만. 파트너 비공개.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return null;
  try {
    const [row] = await db
      .select()
      .from(contracts)
      .where(eq(contracts.id, id))
      .limit(1);
    if (!row) return null;
    return contractFromRow(row);
  } catch (e) {
    console.error('[DB] getContractById:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function insertContract(
  contract: Omit<Contract, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Contract | null> {
  // 쓰기 → vimo_team(hasErpAccess)만.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return null;
  try {
    const [row] = await db
      .insert(contracts)
      .values(contractToInsert(contract))
      .returning();
    return row ? contractFromRow(row) : null;
  } catch (e) {
    console.error('[DB] insertContract:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function updateContract(id: string, updates: Partial<Contract>): Promise<boolean> {
  // 쓰기 → vimo_team만.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return false;
  try {
    await db.update(contracts).set(contractToUpdate(updates)).where(eq(contracts.id, id));
    return true;
  } catch (e) {
    console.error('[DB] updateContract:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function deleteContract(id: string): Promise<boolean> {
  // 쓰기 → vimo_team만.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return false;
  try {
    await db.delete(contracts).where(eq(contracts.id, id));
    return true;
  } catch (e) {
    console.error('[DB] deleteContract:', e instanceof Error ? e.message : e);
    return false;
  }
}
