/**
 * 사용자 앱 접근 권한 관리 (admin 전용)
 *
 * 비모 ERP / 파트너 ERP / vibox 별 권한을 토글한다.
 * vimo_erp ↔ partner_erp 상호 배제는 DB 레벨에서 강제됨 (app_access_erp_exclusive).
 */
import { createClient } from '../client';

export type AppCode = 'vimo_erp' | 'partner_erp' | 'vibox';
export type AccessStatus = 'active' | 'suspended';

export interface UserWithAccess {
  userId: string;
  name: string;
  email: string;
  userType: string | null;       // profiles.user_type ('staff' | 'partner' | null)
  access: Record<AppCode, AccessStatus | null>;
}

export async function listUsersWithAccess(): Promise<UserWithAccess[]> {
  const supabase = createClient();

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, name, email, user_type, created_at')
    .order('created_at', { ascending: false });

  if (pErr) {
    console.error('listUsersWithAccess profiles error:', pErr);
    return [];
  }

  const { data: accessRows, error: aErr } = await supabase
    .from('app_access')
    .select('user_id, app_code, status');

  if (aErr) {
    console.error('listUsersWithAccess access error:', aErr);
    return [];
  }

  type AccessRow = { user_id: string; app_code: string; status: string };
  const accessMap = new Map<string, Record<AppCode, AccessStatus | null>>();
  for (const row of (accessRows ?? []) as AccessRow[]) {
    const key = row.user_id;
    const existing = accessMap.get(key) ?? { vimo_erp: null, partner_erp: null, vibox: null };
    if (row.app_code === 'vimo_erp' || row.app_code === 'partner_erp' || row.app_code === 'vibox') {
      existing[row.app_code] = row.status as AccessStatus;
    }
    accessMap.set(key, existing);
  }

  type ProfileRow = { id: string; name: string | null; email: string | null; user_type: string | null };
  return ((profiles ?? []) as ProfileRow[]).map((p) => ({
    userId: p.id,
    name: p.name ?? '(이름 없음)',
    email: p.email ?? '',
    userType: p.user_type,
    access: accessMap.get(p.id) ?? { vimo_erp: null, partner_erp: null, vibox: null },
  }));
}

// 권한 부여/활성화
export async function grantAppAccess(userId: string, appCode: AppCode): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const role = appCode === 'vimo_erp' ? 'staff' : appCode === 'partner_erp' ? 'partner' : 'member';

  const { error } = await supabase
    .from('app_access')
    .upsert(
      { user_id: userId, app_code: appCode, role, status: 'active' },
      { onConflict: 'user_id,app_code' }
    );

  if (error) {
    console.error('grantAppAccess error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// 권한 정지 (행 유지, status='suspended')
export async function suspendAppAccess(userId: string, appCode: AppCode): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase
    .from('app_access')
    .update({ status: 'suspended' })
    .eq('user_id', userId)
    .eq('app_code', appCode);

  if (error) {
    console.error('suspendAppAccess error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
