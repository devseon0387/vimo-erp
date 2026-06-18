import { NextResponse } from 'next/server';
import { eq, asc, desc } from 'drizzle-orm';
import { db } from '@/db';
import { strategyGroups, strategyDocs } from '@/db/schema';
import { currentUser } from '@/lib/authz';

/** 인증 + 역할 확인. 실패 시 NextResponse 에러를 반환 */
export async function requireAuth(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const user = await currentUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: '인증 필요' }, { status: 401 }) };

  // 기존 의미 유지: user_profiles.role/approved → Auth.js 세션 클레임(role/approved)으로 재현.
  if (user.role !== 'admin' && user.approved !== true) {
    return { ok: false, response: NextResponse.json({ error: '권한 없음' }, { status: 403 }) };
  }
  return { ok: true };
}

export interface StrategyGroup {
  id: string;
  name: string;
  emoji: string;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyBlock {
  id: string;
  type: string;
  content: string;
  checked: boolean;
}

export interface StrategyDoc {
  id: string;
  groupId: string;
  title: string;
  emoji: string;
  blocks: StrategyBlock[];
  createdAt: string;
  updatedAt: string;
}

function toGroup(row: typeof strategyGroups.$inferSelect): StrategyGroup {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDoc(row: typeof strategyDocs.$inferSelect): StrategyDoc {
  return {
    id: row.id,
    groupId: row.groupId,
    title: row.title,
    emoji: row.emoji,
    blocks: (row.blocks as StrategyBlock[]) || [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function dbGetGroups(): Promise<StrategyGroup[]> {
  const rows = await db.select().from(strategyGroups).orderBy(asc(strategyGroups.createdAt));
  return rows.map(toGroup);
}

export async function dbGetGroup(id: string): Promise<StrategyGroup | null> {
  const rows = await db.select().from(strategyGroups).where(eq(strategyGroups.id, id)).limit(1);
  return rows[0] ? toGroup(rows[0]) : null;
}

export async function dbCreateGroup(group: { id: string; name: string; emoji: string }): Promise<StrategyGroup> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(strategyGroups)
    .values({ id: group.id, name: group.name, emoji: group.emoji, createdAt: now, updatedAt: now })
    .returning();
  if (!row) throw new Error('Group 생성 실패');
  return toGroup(row);
}

export async function dbUpdateGroup(id: string, updates: { name?: string; emoji?: string }): Promise<StrategyGroup> {
  const patch: Partial<typeof strategyGroups.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (updates.name  !== undefined) patch.name  = updates.name;
  if (updates.emoji !== undefined) patch.emoji = updates.emoji;
  const [row] = await db.update(strategyGroups).set(patch).where(eq(strategyGroups.id, id)).returning();
  if (!row) throw new Error('Group 수정 실패');
  return toGroup(row);
}

export async function dbDeleteGroup(id: string): Promise<void> {
  // strategy_docs_group_id_fkey ON DELETE CASCADE → 하위 문서 자동 삭제
  await db.delete(strategyGroups).where(eq(strategyGroups.id, id));
}

export async function dbGetDocs(groupId?: string): Promise<StrategyDoc[]> {
  const rows = groupId
    ? await db.select().from(strategyDocs).where(eq(strategyDocs.groupId, groupId)).orderBy(desc(strategyDocs.updatedAt))
    : await db.select().from(strategyDocs).orderBy(desc(strategyDocs.updatedAt));
  return rows.map(toDoc);
}

export async function dbGetDoc(id: string): Promise<StrategyDoc | null> {
  const rows = await db.select().from(strategyDocs).where(eq(strategyDocs.id, id)).limit(1);
  return rows[0] ? toDoc(rows[0]) : null;
}

export async function dbCreateDoc(doc: StrategyDoc): Promise<StrategyDoc> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(strategyDocs)
    .values({
      id: doc.id,
      groupId: doc.groupId,
      title: doc.title,
      emoji: doc.emoji,
      blocks: doc.blocks,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error('Doc 생성 실패');
  return toDoc(row);
}

export async function dbUpdateDoc(id: string, updates: Partial<StrategyDoc>): Promise<StrategyDoc> {
  const patch: Partial<typeof strategyDocs.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (updates.title  !== undefined) patch.title  = updates.title;
  if (updates.emoji  !== undefined) patch.emoji  = updates.emoji;
  if (updates.blocks !== undefined) patch.blocks = updates.blocks;
  const [row] = await db.update(strategyDocs).set(patch).where(eq(strategyDocs.id, id)).returning();
  if (!row) throw new Error('Doc 수정 실패');
  return toDoc(row);
}

export async function dbDeleteDoc(id: string): Promise<void> {
  await db.delete(strategyDocs).where(eq(strategyDocs.id, id));
}
