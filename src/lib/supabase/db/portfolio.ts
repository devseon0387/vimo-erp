'use server';
/**
 * Portfolio CRUD — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2 패턴 1호).
 * ★ 기존: 브라우저 클라이언트가 직접 쿼리(RLS가 보호).
 * ★ 변경: 서버 액션에서 Drizzle로 쿼리 + 서버에서 권한 검사(RLS 'to authenticated' 대체).
 *   인증 = Auth.js 세션 (Phase 4 전환). 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 */
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { portfolioItems } from '@/db/schema';
import { currentUser } from '@/lib/authz';
import type { PortfolioItem } from '@/types';

// ─── 인증 가드 (RLS의 'to authenticated' = 로그인 필수를 앱계층으로) ───
async function getUser() {
  return currentUser();
}

// ─── Drizzle row → 도메인 타입 ───
type Row = typeof portfolioItems.$inferSelect;
function fromRow(r: Row): PortfolioItem {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    client: r.client ?? '',
    partnerId: r.partnerId ?? undefined,
    category: r.category ?? '기타',
    displayOrder: r.displayOrder ?? 0,
    completedAt: r.completedAt ?? '',
    tags: r.tags ?? [],
    youtubeUrl: r.youtubeUrl ?? '',
    isPublished: r.isPublished ?? false,
    createdAt: r.createdAt ?? '',
    updatedAt: r.updatedAt ?? '',
  };
}

// ─── CRUD ───
export async function getPortfolioItems(publishedOnly?: boolean): Promise<PortfolioItem[]> {
  if (!(await getUser())) return [];
  const rows = await db
    .select()
    .from(portfolioItems)
    .where(publishedOnly ? eq(portfolioItems.isPublished, true) : undefined)
    .orderBy(desc(portfolioItems.createdAt));
  return rows.map(fromRow);
}

export async function insertPortfolioItem(
  item: Omit<PortfolioItem, 'id' | 'createdAt' | 'updatedAt'>
): Promise<PortfolioItem | null> {
  if (!(await getUser())) return null;
  const [row] = await db
    .insert(portfolioItems)
    .values({
      title: item.title,
      description: item.description,
      client: item.client,
      partnerId: item.partnerId ?? null,
      category: item.category ?? '기타',
      displayOrder: item.displayOrder ?? 0,
      completedAt: item.completedAt || null,
      tags: item.tags ?? [],
      youtubeUrl: item.youtubeUrl,
      isPublished: item.isPublished,
    })
    .returning();
  return row ? fromRow(row) : null;
}

export async function updatePortfolioItem(id: string, updates: Partial<PortfolioItem>): Promise<boolean> {
  if (!(await getUser())) return false;
  const patch: Partial<typeof portfolioItems.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.client !== undefined) patch.client = updates.client;
  if (updates.partnerId !== undefined) patch.partnerId = updates.partnerId ?? null;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.displayOrder !== undefined) patch.displayOrder = updates.displayOrder;
  if (updates.completedAt !== undefined) patch.completedAt = updates.completedAt;
  if (updates.tags !== undefined) patch.tags = updates.tags;
  if (updates.youtubeUrl !== undefined) patch.youtubeUrl = updates.youtubeUrl;
  if (updates.isPublished !== undefined) patch.isPublished = updates.isPublished;
  await db.update(portfolioItems).set(patch).where(eq(portfolioItems.id, id));
  return true;
}

export async function deletePortfolioItem(id: string): Promise<boolean> {
  if (!(await getUser())) return false;
  await db.delete(portfolioItems).where(eq(portfolioItems.id, id));
  return true;
}

export async function togglePortfolioPublished(id: string, isPublished: boolean): Promise<boolean> {
  if (!(await getUser())) return false;
  await db
    .update(portfolioItems)
    .set({ isPublished, updatedAt: new Date().toISOString() })
    .where(eq(portfolioItems.id, id));
  return true;
}
