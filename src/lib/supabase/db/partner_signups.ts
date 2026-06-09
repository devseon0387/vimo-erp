'use server';
/**
 * 파트너 가입 신청 (universe — partner_meta) CRUD
 * Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2, 버킷C — 보안민감).
 *
 * 비모 팀(admin)만 사용. 신규 가입한 파트너를 검토하고 기존 partners
 * 테이블과 매핑(legacy_partner_id 채움)하거나 신규 등록.
 *
 * ★ 기존: 브라우저 클라이언트가 직접 쿼리(RLS가 보호).
 * ★ 변경: 'use server' 서버 액션에서 Drizzle로 쿼리 + 서버에서 권한 검사(RLS 대체).
 *   - 이 파일은 cross-user 관리(partner_meta/profiles/app_access 타 유저 행 수정)와
 *     admin-only 초대 토큰 발급을 다루므로 모든 함수에 isVimoAdmin(user.id) 게이트.
 *     RLS의 is_vimo_admin() 재현. (anon invite-lookup 정책은 제거됨 — createPartnerInvite도 admin전용.)
 *   - currentUser()로 invited_by / legacy_mapped_by 기록.
 *   인증(currentUser)은 Phase 4까지 Supabase Auth 유지. 호출부(클라이언트 컴포넌트)는 동일 시그니처라 무변경.
 *
 * ★ 타입(PendingPartnerSignup / CreateInviteInput)은 partner_signups.types.ts로 분리
 *   ('use server' 모듈은 async 함수만 export 가능). 매퍼(MetaRow/ProfileRow 머지)는 내부 helper.
 */
import { and, or, eq, isNull, inArray, desc } from 'drizzle-orm';
import { db } from '@/db';
import { partnerMeta, profiles, partners, partnerInvites, appAccess } from '@/db/schema';
import { currentUser, isVimoAdmin } from '@/lib/authz';
import type { PendingPartnerSignup, CreateInviteInput } from './partner_signups.types';

// ─── 내부 매퍼 (외부 미사용, 'use server'라 export 금지) ───────────────────────

type MetaRow = Pick<
  typeof partnerMeta.$inferSelect,
  'profileId' | 'type' | 'status' | 'legacyPartnerId' | 'createdAt'
>;
type ProfileRow = Pick<
  typeof profiles.$inferSelect,
  'id' | 'name' | 'email' | 'phone'
>;

// partner_meta row + 조인된 profile을 도메인 타입으로 머지.
function toPendingSignup(row: MetaRow, profile: ProfileRow | undefined): PendingPartnerSignup {
  return {
    profileId: row.profileId,
    email: profile?.email ?? '',
    name: profile?.name ?? '(이름 없음)',
    phone: profile?.phone ?? null,
    type: (row.type as 'freelancer' | 'business') ?? 'freelancer',
    signupAt: row.createdAt,
  };
}

// ─── 관리자 게이트: 현재 유저가 vimo_erp admin인지. 아니면 null. ────────────────
async function requireAdmin() {
  const user = await currentUser();
  if (!user || !(await isVimoAdmin(user.id))) return null;
  return user;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

// 매핑 안 된 (status='pending' OR legacy_partner_id IS NULL) 파트너 가입자 조회
export async function getPendingPartnerSignups(): Promise<PendingPartnerSignup[]> {
  // cross-user partner_meta/profiles 조회 → admin 전용.
  if (!(await requireAdmin())) return [];
  try {
    // 1. partner_meta 조회 (FK 중첩 안 함)
    const metaRows = await db
      .select({
        profileId: partnerMeta.profileId,
        type: partnerMeta.type,
        status: partnerMeta.status,
        legacyPartnerId: partnerMeta.legacyPartnerId,
        createdAt: partnerMeta.createdAt,
      })
      .from(partnerMeta)
      .where(or(eq(partnerMeta.status, 'pending'), isNull(partnerMeta.legacyPartnerId)))
      .orderBy(desc(partnerMeta.createdAt));

    if (metaRows.length === 0) return [];

    // 2. 해당 profile_id로 profiles 조회
    const profileIds = metaRows.map((r) => r.profileId);
    const profileRows = await db
      .select({
        id: profiles.id,
        name: profiles.name,
        email: profiles.email,
        phone: profiles.phone,
      })
      .from(profiles)
      .where(inArray(profiles.id, profileIds));

    const profileMap = new Map(profileRows.map((p) => [p.id, p]));

    return metaRows.map((row) => toPendingSignup(row, profileMap.get(row.profileId)));
  } catch (e) {
    console.error('getPendingPartnerSignups error:', e instanceof Error ? e.message : e);
    return [];
  }
}

// 기존 partners 테이블의 row와 매핑
export async function mapToExistingPartner(profileId: string, legacyPartnerId: string): Promise<boolean> {
  // 타 유저(profileId)의 partner_meta를 active로 승격 → admin 전용.
  const user = await requireAdmin();
  if (!user) return false;
  try {
    const now = new Date().toISOString();
    await db
      .update(partnerMeta)
      .set({
        legacyPartnerId,
        legacyMappedAt: now,
        legacyMappedBy: user.id,
        status: 'active',
        updatedAt: now,
      })
      .where(eq(partnerMeta.profileId, profileId));
    return true;
  } catch (e) {
    console.error('mapToExistingPartner error:', e instanceof Error ? e.message : e);
    return false;
  }
}

// 신규 partners 행 생성 + 자동 매핑 (B안)
export async function createAndMapNewPartner(profileId: string): Promise<boolean> {
  // partners 신규 생성 + 타 유저 partner_meta 승격 → admin 전용.
  const user = await requireAdmin();
  if (!user) return false;
  try {
    // 1. profile 정보 조회
    const [profile] = await db
      .select({ name: profiles.name, email: profiles.email, phone: profiles.phone })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);

    if (!profile) {
      console.error('createAndMapNewPartner: profile not found');
      return false;
    }

    const [meta] = await db
      .select({ type: partnerMeta.type })
      .from(partnerMeta)
      .where(eq(partnerMeta.profileId, profileId))
      .limit(1);

    // 2. partners 테이블에 row 생성
    const [newPartner] = await db
      .insert(partners)
      .values({
        name: profile.name ?? '',
        email: profile.email,
        phone: profile.phone,
        partnerType: meta?.type ?? 'freelancer',
        status: 'active',
      })
      .returning({ id: partners.id });

    if (!newPartner) {
      console.error('createAndMapNewPartner partners insert: no row returned');
      return false;
    }

    // 3. partner_meta에 legacy_partner_id 매핑
    const now = new Date().toISOString();
    await db
      .update(partnerMeta)
      .set({
        legacyPartnerId: newPartner.id,
        legacyMappedAt: now,
        legacyMappedBy: user.id,
        status: 'active',
        updatedAt: now,
      })
      .where(eq(partnerMeta.profileId, profileId));

    return true;
  } catch (e) {
    console.error('createAndMapNewPartner error:', e instanceof Error ? e.message : e);
    return false;
  }
}

// 새 초대 토큰 생성 — admin전용(anon lookup 정책 제거됨)
export async function createPartnerInvite(
  input: CreateInviteInput
): Promise<{ token: string; expiresAt: string } | null> {
  // partner_invites 발급 → admin 전용.
  const user = await requireAdmin();
  if (!user) return null;
  try {
    const token = crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(
      Date.now() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000
    ).toISOString();

    await db.insert(partnerInvites).values({
      token,
      invitedName: input.invitedName ?? null,
      invitedEmail: input.invitedEmail ?? null,
      legacyHintId: input.legacyHintId ?? null,
      invitedBy: user.id,
      expiresAt,
      status: 'pending',
    });

    return { token, expiresAt };
  } catch (e) {
    console.error('createPartnerInvite error:', e instanceof Error ? e.message : e);
    return null;
  }
}

// 거부 — partner_meta status='suspended' (계정은 남기되 접근 차단)
export async function rejectPartnerSignup(profileId: string): Promise<boolean> {
  // 타 유저 partner_meta + app_access suspend → admin 전용.
  if (!(await requireAdmin())) return false;
  try {
    await db
      .update(partnerMeta)
      .set({ status: 'suspended', updatedAt: new Date().toISOString() })
      .where(eq(partnerMeta.profileId, profileId));

    // app_access도 suspended로
    await db
      .update(appAccess)
      .set({ status: 'suspended' })
      .where(eq(appAccess.userId, profileId));

    return true;
  } catch (e) {
    console.error('rejectPartnerSignup error:', e instanceof Error ? e.message : e);
    return false;
  }
}
