'use server';
/**
 * Clients CRUD — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2, 버킷 C).
 * ★ 기존: 브라우저 클라이언트(../client)가 직접 쿼리(RLS가 보호) + getClients/getClientById cachedFetch.
 * ★ 변경: 'use server' 서버 액션에서 Drizzle로 쿼리 + 서버에서 권한 검사.
 *   - 쓰기(insert/update/delete) → vimo_team(is_vimo_team = vimo_erp active = hasErpAccess) 게이트.
 *     팀 전체에 쓰기를 허용하므로 isVimoAdmin이 아니라 hasErpAccess 사용.
 *   - 읽기(Phase 3 하드닝 완료): vimo_team(전체) OR partner_self_clients_select(legacy 매핑
 *     파트너=본인이 참여한 프로젝트의 거래처만, name-match 조인) — 원본 RLS permissive OR 재현
 *     (라이브 pg_policies 대조).
 *   인증 = Auth.js 세션 (Phase 4 전환). 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 * ★ cachedFetch 제거: 서버 액션은 브라우저측 cache/realtime invalidate와 무관(portfolio/episodes와 동일).
 * ★ ClientRow/clientFromRow/clientToInsert/clientToUpdate는 외부 import 0건(trash.ts는 이미 Drizzle
 *   재작성되어 미사용) 확인 → 전부 내부 non-export로 강등('use server'는 비-async export 금지).
 * ★ clients 테이블엔 numeric 컬럼 없음(전부 text/timestamp) → Number/String 캐스팅 불필요.
 */
import { and, eq, desc, exists, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/db';
import { clients, episodes, projects } from '@/db/schema';
import { currentUser, hasErpAccess, myLegacyPartnerId } from '@/lib/authz';
import type { Client } from '@/types';

// partner_self_clients_select RLS 재현: 본인이 참여한(p.partner_id=legacy OR 본인 assignee 회차 보유)
// 프로젝트의 거래처(p.client = clients.name 네임매치)만.
function partnerSelfClientsFilter(legacy: string): SQL {
  return exists(
    db.select({ one: sql`1` })
      .from(projects)
      .where(and(
        eq(projects.client, clients.name),
        or(
          eq(projects.partnerId, legacy),
          exists(
            db.select({ one: sql`1` })
              .from(episodes)
              .where(and(
                eq(episodes.projectId, sql`${projects.id}::text`),
                eq(episodes.assignee, legacy),
              )),
          ),
        ),
      )),
  ) as SQL;
}

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
    businessNumber: row.businessNumber ?? undefined,
    corpName: row.corpName ?? undefined,
    ceoName: row.ceoName ?? undefined,
    bizType: row.bizType ?? undefined,
    bizItem: row.bizItem ?? undefined,
    taxEmail: row.taxEmail ?? undefined,
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
    businessNumber: client.businessNumber ?? null,
    corpName: client.corpName ?? null,
    ceoName: client.ceoName ?? null,
    bizType: client.bizType ?? null,
    bizItem: client.bizItem ?? null,
    taxEmail: client.taxEmail ?? null,
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
  if (client.businessNumber !== undefined) patch.businessNumber = client.businessNumber;
  if (client.corpName !== undefined) patch.corpName = client.corpName;
  if (client.ceoName !== undefined) patch.ceoName = client.ceoName;
  if (client.bizType !== undefined) patch.bizType = client.bizType;
  if (client.bizItem !== undefined) patch.bizItem = client.bizItem;
  if (client.taxEmail !== undefined) patch.taxEmail = client.taxEmail;
  if (client.status !== undefined) patch.status = client.status;
  if (client.notes !== undefined) patch.notes = client.notes;
  return patch;
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  // 읽기 = vimo_team(전체) OR 파트너 self 분기(본인 참여 프로젝트의 거래처만, name-match).
  const u = await currentUser();
  if (!u) return [];
  try {
    if (await hasErpAccess(u.id)) {
      const rows = await db
        .select()
        .from(clients)
        .orderBy(desc(clients.createdAt));
      return rows.map(clientFromRow);
    }
    const legacy = await myLegacyPartnerId(u.id);
    if (!legacy) return [];
    const rows = await db
      .select()
      .from(clients)
      .where(partnerSelfClientsFilter(legacy))
      .orderBy(desc(clients.createdAt));
    return rows.map(clientFromRow);
  } catch (e) {
    console.error('[DB] getClients:', e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getClientById(id: string): Promise<Client | null> {
  // 읽기 = vimo_team(전체) OR 파트너 self 분기(본인 참여 프로젝트의 거래처만, name-match).
  const u = await currentUser();
  if (!u) return null;
  try {
    const isTeam = await hasErpAccess(u.id);
    let where: SQL = eq(clients.id, id);
    if (!isTeam) {
      const legacy = await myLegacyPartnerId(u.id);
      if (!legacy) return null;
      where = and(where, partnerSelfClientsFilter(legacy))!;
    }
    const [row] = await db
      .select()
      .from(clients)
      .where(where)
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
