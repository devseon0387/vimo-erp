'use server';
/**
 * Inquiries CRUD — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2, 버킷 B).
 * ★ 기존: 브라우저 클라이언트가 직접 쿼리(RLS가 보호).
 * ★ 변경: 서버 액션에서 Drizzle로 쿼리 + 서버에서 권한 검사.
 *   RLS 'inquiries_authenticated_all'(for all to authenticated using/with check(true))
 *   = 로그인 필수(소유/관리자 구분 없음)를 currentUser() 가드로 충실 번역.
 *   anon INSERT 정책(외부 문의 폼)은 이 파일에 insert 함수가 없어 영향 없음.
 *   인증(currentUser)은 Phase 4까지 Supabase Auth 유지. 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 *
 * ※ 'use server' 파일은 async 함수만 export 가능 → 기존 동기 export(inquiryFromRow)·
 *   타입 export(InquiryRow)는 내부 non-export로 강등(외부 importer 0건 확인됨).
 */
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { inquiries } from '@/db/schema';
import { currentUser } from '@/lib/authz';
import type { Inquiry, InquiryStatus } from '@/types';

// ─── Drizzle row → 도메인 타입 ───
type Row = typeof inquiries.$inferSelect;
function fromRow(row: Row): Inquiry {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone,
    projectType: row.projectType,
    budget: row.budget ?? undefined,
    message: row.message,
    referencesLinks: row.referencesLinks ?? [],
    portfolioReferences: (row.portfolioReferences as Inquiry['portfolioReferences']) ?? [],
    referralSource: row.referralSource ?? undefined,
    status: (row.status ?? 'new') as InquiryStatus,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt ?? '',
    updatedAt: row.updatedAt ?? '',
  };
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getInquiries(): Promise<Inquiry[]> {
  if (!(await currentUser())) return [];
  const rows = await db
    .select()
    .from(inquiries)
    .orderBy(desc(inquiries.createdAt));
  return rows.map(fromRow);
}

export async function updateInquiryStatus(id: string, status: InquiryStatus): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    await db
      .update(inquiries)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(inquiries.id, id));
    return true;
  } catch (e) {
    console.error('[DB] updateInquiryStatus:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function updateInquiryNotes(id: string, notes: string): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    await db
      .update(inquiries)
      .set({ notes, updatedAt: new Date().toISOString() })
      .where(eq(inquiries.id, id));
    return true;
  } catch (e) {
    console.error('[DB] updateInquiryNotes:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function deleteInquiry(id: string): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    await db.delete(inquiries).where(eq(inquiries.id, id));
    return true;
  } catch (e) {
    console.error('[DB] deleteInquiry:', e instanceof Error ? e.message : e);
    return false;
  }
}
