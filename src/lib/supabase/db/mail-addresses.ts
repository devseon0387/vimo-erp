'use server';
/**
 * 메일 주소 디렉토리 DAL — mail_addresses + mail_address_members.
 * catch-all(@vi-mo.kr 전체 수신)을 직원별/공용함으로 분류하는 기준 데이터.
 *  - personal: owner_user_id 직원 1명 귀속 (그 직원 받은편지함 + 발신 주소)
 *  - shared  : members 담당자 N명 (담당자 모두의 받은편지함에 표시)
 * 쓰기(생성·수정)는 관리자 전용 — 호출 라우트에서 isProfileAdmin 게이트.
 */
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import { mailAddresses, mailAddressMembers, userProfiles } from '@/db/schema';
import { currentUser } from '@/lib/authz';

export interface MailAddress {
  id: string;
  address: string;
  type: 'personal' | 'shared';
  ownerUserId: string | null;
  ownerName: string | null;
  label: string | null;
  active: boolean;
  members: { id: string; name: string | null }[];
}

export interface MyMailBox {
  id: string;
  address: string;
  type: 'personal' | 'shared';
  label: string | null;
}

async function membersByAddress(addressIds: string[]) {
  const map = new Map<string, { id: string; name: string | null }[]>();
  if (addressIds.length === 0) return map;
  const rows = await db
    .select({
      addressId: mailAddressMembers.addressId,
      userId: mailAddressMembers.userId,
      name: userProfiles.name,
    })
    .from(mailAddressMembers)
    .leftJoin(userProfiles, eq(mailAddressMembers.userId, userProfiles.id))
    .where(inArray(mailAddressMembers.addressId, addressIds));
  for (const r of rows) {
    const list = map.get(r.addressId) ?? [];
    list.push({ id: r.userId, name: r.name });
    map.set(r.addressId, list);
  }
  return map;
}

/** 전체 주소 목록 (관리자 화면용) — 소유자 이름·담당자 포함. */
export async function getMailAddresses(): Promise<MailAddress[]> {
  if (!(await currentUser())) return [];
  const rows = await db
    .select({
      id: mailAddresses.id,
      address: mailAddresses.address,
      type: mailAddresses.type,
      ownerUserId: mailAddresses.ownerUserId,
      ownerName: userProfiles.name,
      label: mailAddresses.label,
      active: mailAddresses.active,
    })
    .from(mailAddresses)
    .leftJoin(userProfiles, eq(mailAddresses.ownerUserId, userProfiles.id))
    .orderBy(mailAddresses.createdAt);
  const members = await membersByAddress(rows.map((r) => r.id));
  return rows.map((r) => ({
    ...r,
    type: (r.type === 'shared' ? 'shared' : 'personal') as 'personal' | 'shared',
    members: members.get(r.id) ?? [],
  }));
}

/** 현재 사용자의 메일함 목록 — 본인 개인 주소 + 담당 공용함 (활성만). */
export async function getMyMailBoxes(userId: string): Promise<MyMailBox[]> {
  const personal = await db
    .select({
      id: mailAddresses.id,
      address: mailAddresses.address,
      type: mailAddresses.type,
      label: mailAddresses.label,
    })
    .from(mailAddresses)
    .where(and(eq(mailAddresses.ownerUserId, userId), eq(mailAddresses.active, true)));
  const shared = await db
    .select({
      id: mailAddresses.id,
      address: mailAddresses.address,
      type: mailAddresses.type,
      label: mailAddresses.label,
    })
    .from(mailAddressMembers)
    .innerJoin(mailAddresses, eq(mailAddressMembers.addressId, mailAddresses.id))
    .where(and(eq(mailAddressMembers.userId, userId), eq(mailAddresses.active, true)));
  const seen = new Set<string>();
  const out: MyMailBox[] = [];
  for (const r of [...personal, ...shared]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      id: r.id,
      address: r.address,
      type: (r.type === 'shared' ? 'shared' : 'personal') as 'personal' | 'shared',
      label: r.label,
    });
  }
  // 개인 먼저, 그 다음 공용
  return out.sort((a, b) => (a.type === b.type ? 0 : a.type === 'personal' ? -1 : 1));
}

/** 주소 생성 (관리자) — address는 전체 주소(예: tax@vi-mo.kr). */
export async function createMailAddress(input: {
  address: string;
  type: 'personal' | 'shared';
  ownerUserId?: string | null;
  memberIds?: string[];
  label?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const address = input.address.trim().toLowerCase();
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(mailAddresses)
        .values({
          address,
          type: input.type,
          ownerUserId: input.type === 'personal' ? (input.ownerUserId ?? null) : null,
          label: input.label ?? null,
        })
        .returning({ id: mailAddresses.id });
      if (input.type === 'shared' && row && (input.memberIds?.length ?? 0) > 0) {
        await tx
          .insert(mailAddressMembers)
          .values(input.memberIds!.map((userId) => ({ addressId: row.id, userId })))
          .onConflictDoNothing();
      }
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ux_mail_addresses_address_lower|duplicate/i.test(msg)) {
      return { ok: false, error: '이미 등록된 주소입니다.' };
    }
    console.error('[mail-addresses] create 실패', e);
    return { ok: false, error: '주소 생성에 실패했습니다.' };
  }
}

/**
 * 주소 담당 변경 (관리자) — 유형·소유자(개인)·담당자(공용)·라벨 갱신.
 * 멤버 교체는 gap-free: 새 멤버 insert(onConflictDoNothing) 후 목록에 없는 기존 멤버만 delete
 * → 교체 중간에 "담당자 0명" 순간이 없어 수신 분류가 끊기지 않는다.
 */
export async function updateMailAddressAssignment(
  id: string,
  input: {
    type: 'personal' | 'shared';
    ownerUserId?: string | null;
    memberIds?: string[];
    label?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    await db.transaction(async (tx) => {
      if (input.type === 'personal') {
        await tx
          .update(mailAddresses)
          .set({ type: 'personal', ownerUserId: input.ownerUserId ?? null, label: input.label ?? null })
          .where(eq(mailAddresses.id, id));
        // 개인 주소엔 담당자 개념이 없으므로 잔여 멤버 정리
        await tx.delete(mailAddressMembers).where(eq(mailAddressMembers.addressId, id));
      } else {
        const memberIds = [...new Set((input.memberIds ?? []).map(String).filter(Boolean))];
        await tx
          .update(mailAddresses)
          .set({ type: 'shared', ownerUserId: null, label: input.label ?? null })
          .where(eq(mailAddresses.id, id));
        if (memberIds.length > 0) {
          await tx
            .insert(mailAddressMembers)
            .values(memberIds.map((userId) => ({ addressId: id, userId })))
            .onConflictDoNothing();
          await tx
            .delete(mailAddressMembers)
            .where(and(eq(mailAddressMembers.addressId, id), notInArray(mailAddressMembers.userId, memberIds)));
        } else {
          await tx.delete(mailAddressMembers).where(eq(mailAddressMembers.addressId, id));
        }
      }
    });
    return { ok: true };
  } catch (e) {
    console.error('[mail-addresses] 담당 변경 실패', e);
    return { ok: false, error: '담당 변경에 실패했습니다.' };
  }
}

/** 활성/비활성 토글 (관리자). 삭제 대신 비활성 — 파괴적 작업 회피. */
export async function setMailAddressActive(id: string, active: boolean): Promise<boolean> {
  try {
    await db.update(mailAddresses).set({ active }).where(eq(mailAddresses.id, id));
    return true;
  } catch (e) {
    console.error('[mail-addresses] active 토글 실패', e);
    return false;
  }
}

/** 수신 분류용 디렉토리 스냅샷 — 활성 주소 전체 + 담당자. */
export async function getMailDirectory(): Promise<
  { address: string; type: 'personal' | 'shared'; label: string | null; ownerUserId: string | null; memberIds: string[] }[]
> {
  const rows = await db
    .select({
      id: mailAddresses.id,
      address: mailAddresses.address,
      type: mailAddresses.type,
      label: mailAddresses.label,
      ownerUserId: mailAddresses.ownerUserId,
    })
    .from(mailAddresses)
    .where(eq(mailAddresses.active, true));
  const members = await membersByAddress(rows.map((r) => r.id));
  return rows.map((r) => ({
    address: r.address.toLowerCase(),
    type: (r.type === 'shared' ? 'shared' : 'personal') as 'personal' | 'shared',
    label: r.label,
    ownerUserId: r.ownerUserId,
    memberIds: (members.get(r.id) ?? []).map((m) => m.id),
  }));
}
