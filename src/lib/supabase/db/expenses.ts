'use server';
/**
 * Expenses CRUD — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2).
 * ★ 기존: 브라우저 클라이언트가 직접 쿼리(RLS가 보호).
 * ★ 변경: 서버 액션에서 Drizzle로 쿼리 + 서버에서 권한 검사.
 *   RLS `expenses_authenticated_all` (for all to authenticated, using/with check true)
 *   = 소유/관리자 분리 없는 require-auth → 앱계층에서 currentUser() 로그인 필수로 번역.
 *   인증(currentUser)은 Phase 4까지 Supabase Auth 유지. 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 *
 * 'use server' 모듈이라 동기 export 불가 → 매퍼/타입은 내부 non-export helper로 강등(외부 미사용).
 */
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { expenses } from '@/db/schema';
import { currentUser } from '@/lib/authz';
import type { Expense } from '@/types';

// ─── Drizzle row → 도메인 타입 ───────────────────────────────
// amount는 numeric()→Drizzle이 string으로 반환하므로 Number() 유지.
type Row = typeof expenses.$inferSelect;
function expenseFromRow(r: Row): Expense {
  return {
    id: r.id,
    title: r.title,
    amount: Number(r.amount),
    category: r.category as Expense['category'],
    paymentType: r.paymentType as Expense['paymentType'],
    expenseDate: r.expenseDate,
    nextRenewalDate: r.nextRenewalDate ?? undefined,
    status: r.status as Expense['status'],
    cancelReason: r.cancelReason ?? undefined,
    description: r.description ?? undefined,
    spenderName: r.spenderName ?? undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ─── 도메인 → Drizzle insert ─────────────────────────────────
// numeric() 컬럼은 Drizzle에서 string으로 주고받음 → amount는 String()으로 직렬화.
function expenseToInsert(
  expense: Omit<Expense, 'createdAt' | 'updatedAt'>
): typeof expenses.$inferInsert {
  return {
    id: expense.id,
    title: expense.title,
    amount: String(expense.amount),
    category: expense.category,
    paymentType: expense.paymentType,
    expenseDate: expense.expenseDate,
    nextRenewalDate: expense.nextRenewalDate ?? null,
    status: expense.status,
    cancelReason: expense.cancelReason ?? null,
    description: expense.description ?? null,
    spenderName: expense.spenderName ?? null,
  };
}

// ─── 도메인 부분 → Drizzle update patch ──────────────────────
// updated_at은 트리거(trg_expenses_updated_at)도 존재하나 현 코드처럼 앱계층 명시 set 유지.
function expenseToUpdate(fields: Partial<Expense>): Partial<typeof expenses.$inferInsert> {
  const patch: Partial<typeof expenses.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.amount !== undefined) patch.amount = String(fields.amount);
  if (fields.category !== undefined) patch.category = fields.category;
  if (fields.paymentType !== undefined) patch.paymentType = fields.paymentType;
  if (fields.expenseDate !== undefined) patch.expenseDate = fields.expenseDate;
  if (fields.nextRenewalDate !== undefined) patch.nextRenewalDate = fields.nextRenewalDate ?? null;
  if (fields.status !== undefined) patch.status = fields.status;
  if (fields.cancelReason !== undefined) patch.cancelReason = fields.cancelReason ?? null;
  if (fields.description !== undefined) patch.description = fields.description ?? null;
  if (fields.spenderName !== undefined) patch.spenderName = fields.spenderName ?? null;
  return patch;
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getExpenses(): Promise<Expense[]> {
  if (!(await currentUser())) return [];
  const rows = await db
    .select()
    .from(expenses)
    .orderBy(desc(expenses.expenseDate));
  return rows.map(expenseFromRow);
}

export async function insertExpense(
  expense: Omit<Expense, 'createdAt' | 'updatedAt'>
): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    await db.insert(expenses).values(expenseToInsert(expense));
    return true;
  } catch (e) {
    console.error('[DB] insertExpense:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function updateExpense(id: string, fields: Partial<Expense>): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    await db.update(expenses).set(expenseToUpdate(fields)).where(eq(expenses.id, id));
    return true;
  } catch (e) {
    console.error('[DB] updateExpense:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function deleteExpense(id: string): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    await db.delete(expenses).where(eq(expenses.id, id));
    return true;
  } catch (e) {
    console.error('[DB] deleteExpense:', e instanceof Error ? e.message : e);
    return false;
  }
}
