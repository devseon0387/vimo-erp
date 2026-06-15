'use server';
/**
 * Trash CRUD + Restore helpers — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2).
 * ★ 기존: 브라우저 클라이언트가 직접 쿼리(RLS가 보호).
 * ★ 변경: 서버 액션에서 Drizzle로 쿼리 + 서버에서 권한 검사.
 *   RLS는 trash/projects/clients/partners/episodes 모두 permissive
 *   (for all to authenticated using(true) with check(true)) → 앱계층 require-auth(로그인 필수)로 충실 번역.
 *   소유/admin/public 스코핑 없음. 인증(getUser)은 Phase 4까지 Supabase Auth 유지.
 *   호출부(클라이언트 컴포넌트 trash/page.tsx, lib/trash.ts)는 동일 시그니처라 무변경.
 *
 * 주의: 'use server' 파일이라 export는 async 함수만 허용 → 매퍼/타입은 내부 non-export로 내부화.
 *   (기존 export `trashFromRow`/`TrashRow`는 외부 실사용 없음 확인 → 안전하게 내부화.)
 */
import { eq, desc, lt } from 'drizzle-orm';
import { db } from '@/db';
import { trash, projects, clients, partners } from '@/db/schema';
import { currentUser } from '@/lib/authz';
import { upsertEpisode } from './episodes';
import type { Project, Client, Partner, Episode, TrashItem, TrashItemType } from '@/types';

// ─── Drizzle row → 도메인 타입 (내부 매퍼) ───────────────────
type TrashRow = typeof trash.$inferSelect;

function trashFromRow(row: TrashRow): TrashItem {
  return {
    id: row.id,
    type: row.type as TrashItemType,
    data: row.data as TrashItem['data'],
    deletedAt: row.deletedAt ?? '',
    originalProjectId: row.originalProjectId ?? undefined,
  };
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getTrash(): Promise<TrashItem[]> {
  if (!(await currentUser())) return [];
  try {
    const rows = await db
      .select()
      .from(trash)
      .orderBy(desc(trash.deletedAt));
    return rows.map(trashFromRow);
  } catch (err) {
    console.error('[DB] getTrash:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function insertTrash(
  type: TrashItemType,
  data: TrashItem['data'],
  originalProjectId?: string
): Promise<TrashItem | null> {
  if (!(await currentUser())) return null;
  try {
    const [row] = await db
      .insert(trash)
      .values({
        type,
        data,
        originalProjectId: originalProjectId ?? null,
      })
      .returning();
    return row ? trashFromRow(row) : null;
  } catch (err) {
    console.error('[DB] insertTrash:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function deleteTrashItem(id: string): Promise<TrashItem | null> {
  if (!(await currentUser())) return null;
  try {
    const [row] = await db.select().from(trash).where(eq(trash.id, id)).limit(1);
    if (!row) return null;
    await db.delete(trash).where(eq(trash.id, id));
    return trashFromRow(row);
  } catch (err) {
    console.error('[DB] deleteTrashItem:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function permanentDeleteTrash(id: string): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    await db.delete(trash).where(eq(trash.id, id));
    return true;
  } catch (err) {
    console.error('[DB] permanentDeleteTrash:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function emptyTrashAll(): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    // 원본의 .gte('deleted_at','1970-01-01')은 전체삭제 트릭 → where 없는 전체 delete로 동일 동작.
    await db.delete(trash);
    return true;
  } catch (err) {
    console.error('[DB] emptyTrashAll:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ─── Restore helpers (재삽입 with original ID) ───────────────
// 충실 번역: 기존 projectToInsert/clientToInsert/partnerToInsert(snake_case Supabase 매퍼)와
//   동일한 필드 집합을 Drizzle camelCase 컬럼으로 직접 매핑하고 onConflictDoUpdate(target: id)로 upsert.
//   created_at/updated_at(partner는 created_at만)은 원본값 보존.

export async function restoreProjectToTable(project: Project): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    const partnerIds = project.partnerIds ?? (project.partnerId ? [project.partnerId] : []);
    const values = {
      id: project.id,
      title: project.title,
      description: project.description,
      client: project.client,
      clientId: project.clientId ?? null,
      partnerId: partnerIds[0] ?? project.partnerId ?? null,
      partnerIds,
      managerIds: project.managerIds ?? [],
      category: project.category ?? null,
      channels: project.channels ?? null,
      status: project.status,
      totalAmount: String(project.budget?.totalAmount ?? 0),
      partnerPayment: String(project.budget?.partnerPayment ?? 0),
      managementFee: String(project.budget?.managementFee ?? 0),
      marginRate: String(project.budget?.marginRate ?? 0),
      workContent: project.workContent ?? [],
      tags: project.tags ?? [],
      thumbnailUrl: project.thumbnailUrl ?? null,
      videoUrl: project.videoUrl ?? null,
      completedAt: project.completedAt ?? null,
      workTypeCosts: project.workTypeCosts ?? null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    await db
      .insert(projects)
      .values(values)
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          title: values.title,
          description: values.description,
          client: values.client,
          clientId: values.clientId,
          partnerId: values.partnerId,
          partnerIds: values.partnerIds,
          managerIds: values.managerIds,
          category: values.category,
          channels: values.channels,
          status: values.status,
          totalAmount: values.totalAmount,
          partnerPayment: values.partnerPayment,
          managementFee: values.managementFee,
          marginRate: values.marginRate,
          workContent: values.workContent,
          tags: values.tags,
          thumbnailUrl: values.thumbnailUrl,
          videoUrl: values.videoUrl,
          completedAt: values.completedAt,
          workTypeCosts: values.workTypeCosts,
          createdAt: values.createdAt,
          updatedAt: values.updatedAt,
        },
      });
    return true;
  } catch (err) {
    console.error('[DB] restoreProjectToTable:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function restoreClientToTable(client: Client): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    const values = {
      id: client.id,
      name: client.name,
      contactPerson: client.contactPerson ?? null,
      email: client.email ?? null,
      phone: client.phone ?? null,
      company: client.company ?? null,
      address: client.address ?? null,
      status: client.status,
      notes: client.notes ?? null,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    };
    await db
      .insert(clients)
      .values(values)
      .onConflictDoUpdate({
        target: clients.id,
        set: {
          name: values.name,
          contactPerson: values.contactPerson,
          email: values.email,
          phone: values.phone,
          company: values.company,
          address: values.address,
          status: values.status,
          notes: values.notes,
          createdAt: values.createdAt,
          updatedAt: values.updatedAt,
        },
      });
    return true;
  } catch (err) {
    console.error('[DB] restoreClientToTable:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function restorePartnerToTable(partner: Partner): Promise<boolean> {
  if (!(await currentUser())) return false;
  try {
    const values = {
      id: partner.id,
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
      createdAt: partner.createdAt,
    };
    await db
      .insert(partners)
      .values(values)
      .onConflictDoUpdate({
        target: partners.id,
        set: {
          name: values.name,
          email: values.email,
          phone: values.phone,
          company: values.company,
          partnerType: values.partnerType,
          role: values.role,
          position: values.position,
          jobTitle: values.jobTitle,
          jobRank: values.jobRank,
          status: values.status,
          generation: values.generation,
          bank: values.bank,
          bankAccount: values.bankAccount,
          profileImage: values.profileImage,
          createdAt: values.createdAt,
        },
      });
    return true;
  } catch (err) {
    console.error('[DB] restorePartnerToTable:', err instanceof Error ? err.message : err);
    return false;
  }
}

export async function restoreEpisodeToTable(
  episode: Episode & { projectId: string }
): Promise<boolean> {
  // require-auth 가드는 위임 대상 upsertEpisode(episodes DAL)에 위치(episodes 이전 시 currentUser 가드 보유).
  // 충실 번역: 본 함수는 위임만 유지(이중 가드 불필요).
  return upsertEpisode(episode);
}

export async function cleanupExpiredTrashItems(days = 30): Promise<number> {
  if (!(await currentUser())) return 0;
  try {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - days);
    // deletedAt는 schema mode:'string'(timestamptz) → ISO 문자열로 lt 비교.
    const expiry = expiryDate.toISOString();

    const expired = await db
      .select({ id: trash.id })
      .from(trash)
      .where(lt(trash.deletedAt, expiry));

    if (expired.length === 0) return 0;

    await db.delete(trash).where(lt(trash.deletedAt, expiry));
    return expired.length;
  } catch (err) {
    console.error('[DB] cleanupExpiredTrashItems:', err instanceof Error ? err.message : err);
    return 0;
  }
}
