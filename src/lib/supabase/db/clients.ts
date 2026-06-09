'use server';
/**
 * Clients CRUD — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2, 버킷 C).
 * ★ 기존: 브라우저 클라이언트(../client)가 직접 쿼리(RLS가 보호) + getClients/getClientById cachedFetch.
 * ★ 변경: 'use server' 서버 액션에서 Drizzle로 쿼리 + 서버에서 권한 검사.
 *   - 쓰기(insert/update/delete) → vimo_team(is_vimo_team = vimo_erp active = hasErpAccess) 게이트.
 *     팀 전체에 쓰기를 허용하므로 isVimoAdmin이 아니라 hasErpAccess 사용.
 *   - 읽기(getClients/getClientById) → currentUser 로그인 게이트(require-auth 베이스라인).
 *   인증(currentUser)은 Phase 4까지 Supabase Auth 유지. 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 * ★ cachedFetch 제거: 서버 액션은 브라우저측 cache/realtime invalidate와 무관(portfolio/episodes와 동일).
 * ★ ClientRow/clientFromRow/clientToInsert/clientToUpdate는 외부 import 0건(trash.ts는 이미 Drizzle
 *   재작성되어 미사용) 확인 → 전부 내부 non-export로 강등('use server'는 비-async export 금지).
 * ★ clients 테이블엔 numeric 컬럼 없음(전부 text/timestamp) → Number/String 캐스팅 불필요.
 */
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { clients } from '@/db/schema';
import { currentUser, hasErpAccess } from '@/lib/authz';
import type { Client } from '@/types';

// ─── Mappers (내부 helper — 외부 미사용, 'use server'라 export 금지) ──────────

type ClientRow = typeof clients.$inferSelect;

function clientFromRow(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contactPerson ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    company: row.company ?? undefined,
    address: row.address ?? undefined,
    status: row.status as Client['status'],
    notes: row.notes ?? undefined,
    createdAt: row.createdAt ?? '',
    updatedAt: row.updatedAt ?? '',
  };
}

function clientToInsert(
  client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
): typeof clients.$inferInsert {
  return {
    name: client.name,
    contactPerson: client.contactPerson ?? null,
    email: client.email ?? null,
    phone: client.phone ?? null,
    company: client.company ?? null,
    address: client.address ?? null,
    status: client.status,
    notes: client.notes ?? null,
  };
}

function clientToUpdate(client: Partial<Client>): Partial<typeof clients.$inferInsert> {
  const patch: Partial<typeof clients.$inferInsert> = { updatedAt: new Date().toISOString() };
  // 충실 번역: 기존 매퍼는 undefined 아닌 필드만 patch에 담고, ?? null 정규화는 하지 않았음(undefined→null
  // 변환 없이 값 그대로 set). 동작 보존을 위해 동일하게 set.
  if (client.name !== undefined) patch.name = client.name;
  if (client.contactPerson !== undefined) patch.contactPerson = client.contactPerson;
  if (client.email !== undefined) patch.email = client.email;
  if (client.phone !== undefined) patch.phone = client.phone;
  if (client.company !== undefined) patch.company = client.company;
  if (client.address !== undefined) patch.address = client.address;
  if (client.status !== undefined) patch.status = client.status;
  if (client.notes !== undefined) patch.notes = client.notes;
  return patch;
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  // 읽기 베이스라인: 로그인 필수.
  // PHASE3: 파트너 name-match 읽기 분기(파트너=본인 거래처만 read) 하드닝 — 현 DAL은 전체 반환.
  if (!(await currentUser())) return [];
  try {
    const rows = await db
      .select()
      .from(clients)
      .orderBy(desc(clients.createdAt));
    return rows.map(clientFromRow);
  } catch (e) {
    console.error('[DB] getClients:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getClientById(id: string): Promise<Client | null> {
  // 읽기 베이스라인: 로그인 필수.
  // PHASE3: 파트너 name-match 읽기 분기(파트너=본인 거래처만 read) 하드닝 — 현 DAL은 무분기.
  if (!(await currentUser())) return null;
  try {
    const [row] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, id))
      .limit(1);
    if (!row) return null;
    return clientFromRow(row);
  } catch (e) {
    console.error('[DB] getClientById:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function insertClient(
  client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Client | null> {
  // 쓰기 → vimo_team(is_vimo_team = hasErpAccess)만.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return null;
  try {
    const [row] = await db
      .insert(clients)
      .values(clientToInsert(client))
      .returning();
    return row ? clientFromRow(row) : null;
  } catch (e) {
    console.error('[DB] insertClient:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function updateClient(id: string, updates: Partial<Client>): Promise<boolean> {
  // 쓰기 → vimo_team만.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return false;
  try {
    await db.update(clients).set(clientToUpdate(updates)).where(eq(clients.id, id));
    return true;
  } catch (e) {
    console.error('[DB] updateClient:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function deleteClient(id: string): Promise<boolean> {
  // 쓰기 → vimo_team만.
  const u = await currentUser();
  if (!u || !(await hasErpAccess(u.id))) return false;
  try {
    await db.delete(clients).where(eq(clients.id, id));
    return true;
  } catch (e) {
    console.error('[DB] deleteClient:', e instanceof Error ? e.message : e);
    return false;
  }
}
