/**
 * 파트너 가입 신청 (universe — partner_meta) CRUD
 *
 * 비모 팀(admin)만 사용. 신규 가입한 파트너를 검토하고 기존 partners
 * 테이블과 매핑(legacy_partner_id 채움)하거나 신규 등록.
 */
import { createClient } from '../client';

export interface PendingPartnerSignup {
  profileId: string;        // = auth.users.id
  email: string;
  name: string;
  phone: string | null;
  type: 'freelancer' | 'business';
  signupAt: string;          // ISO
}

// 매핑 안 된 (status='pending' OR legacy_partner_id IS NULL) 파트너 가입자 조회
export async function getPendingPartnerSignups(): Promise<PendingPartnerSignup[]> {
  const supabase = createClient();

  // 1. partner_meta 조회 (FK 중첩 안 함)
  const { data: metaRows, error: metaError } = await supabase
    .from('partner_meta')
    .select('profile_id, type, status, legacy_partner_id, created_at')
    .or('status.eq.pending,legacy_partner_id.is.null')
    .order('created_at', { ascending: false });

  if (metaError) {
    console.error('getPendingPartnerSignups (partner_meta) error:', {
      message: metaError.message,
      details: metaError.details,
      hint: metaError.hint,
      code: metaError.code,
    });
    return [];
  }

  if (!metaRows || metaRows.length === 0) return [];

  type MetaRow = { profile_id: string; type: string; status: string; legacy_partner_id: string | null; created_at: string };
  type ProfileRow = { id: string; name: string | null; email: string | null; phone: string | null };

  const typedMetaRows = metaRows as MetaRow[];

  // 2. 해당 profile_id로 profiles 조회
  const profileIds = typedMetaRows.map((r) => r.profile_id);
  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, email, phone')
    .in('id', profileIds);

  if (profileError) {
    console.error('getPendingPartnerSignups (profiles) error:', {
      message: profileError.message,
      details: profileError.details,
      hint: profileError.hint,
      code: profileError.code,
    });
    return [];
  }

  const profileMap = new Map(((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  return typedMetaRows.map((row) => {
    const p = profileMap.get(row.profile_id);
    return {
      profileId: row.profile_id,
      email: p?.email ?? '',
      name: p?.name ?? '(이름 없음)',
      phone: p?.phone ?? null,
      type: (row.type as 'freelancer' | 'business') ?? 'freelancer',
      signupAt: row.created_at,
    };
  });
}

// 기존 partners 테이블의 row와 매핑
export async function mapToExistingPartner(profileId: string, legacyPartnerId: string): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('partner_meta')
    .update({
      legacy_partner_id: legacyPartnerId,
      legacy_mapped_at: new Date().toISOString(),
      legacy_mapped_by: user?.id ?? null,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('profile_id', profileId);

  if (error) {
    console.error('mapToExistingPartner error:', error);
    return false;
  }
  return true;
}

// 신규 partners 행 생성 + 자동 매핑 (B안)
export async function createAndMapNewPartner(profileId: string): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 1. profile 정보 조회
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email, phone')
    .eq('id', profileId)
    .single();

  if (!profile) {
    console.error('createAndMapNewPartner: profile not found');
    return false;
  }

  const { data: meta } = await supabase
    .from('partner_meta')
    .select('type')
    .eq('profile_id', profileId)
    .single();

  // 2. partners 테이블에 row 생성
  const { data: newPartner, error: insertError } = await supabase
    .from('partners')
    .insert({
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      partner_type: meta?.type ?? 'freelancer',
      status: 'active',
    })
    .select('id')
    .single();

  if (insertError || !newPartner) {
    console.error('createAndMapNewPartner partners insert error:', insertError);
    return false;
  }

  // 3. partner_meta에 legacy_partner_id 매핑
  const { error: updateError } = await supabase
    .from('partner_meta')
    .update({
      legacy_partner_id: newPartner.id,
      legacy_mapped_at: new Date().toISOString(),
      legacy_mapped_by: user?.id ?? null,
      status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('profile_id', profileId);

  if (updateError) {
    console.error('createAndMapNewPartner partner_meta update error:', updateError);
    return false;
  }

  return true;
}

export interface CreateInviteInput {
  invitedName?: string;
  invitedEmail?: string;
  legacyHintId?: string;
  expiresInDays?: number;
}

// 새 초대 토큰 생성
export async function createPartnerInvite(input: CreateInviteInput): Promise<{ token: string; expiresAt: string } | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const token = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from('partner_invites').insert({
    token,
    invited_name: input.invitedName ?? null,
    invited_email: input.invitedEmail ?? null,
    legacy_hint_id: input.legacyHintId ?? null,
    invited_by: user?.id ?? null,
    expires_at: expiresAt,
    status: 'pending',
  });

  if (error) {
    console.error('createPartnerInvite error:', error);
    return null;
  }
  return { token, expiresAt };
}

// 거부 — partner_meta status='suspended' (계정은 남기되 접근 차단)
export async function rejectPartnerSignup(profileId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('partner_meta')
    .update({ status: 'suspended', updated_at: new Date().toISOString() })
    .eq('profile_id', profileId);

  if (error) {
    console.error('rejectPartnerSignup error:', error);
    return false;
  }
  // app_access도 suspended로
  await supabase
    .from('app_access')
    .update({ status: 'suspended' })
    .eq('user_id', profileId);

  return true;
}
