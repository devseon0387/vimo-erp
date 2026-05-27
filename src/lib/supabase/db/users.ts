/**
 * User Profiles, Custom Roles, Checklists
 */
import { createClient } from '../client';
import { cachedFetch } from '../cache';

// ─── User Profiles ───────────────────────────────────────────

export async function getMyProfile(): Promise<{ id: string; role: string; name: string | null; approved?: boolean } | null> {
  return cachedFetch('profile:me', async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) { console.error('[DB] getMyProfile:', error.message); return null; }
    return data;
  }, 5 * 60 * 1000); // 프로필은 5분 TTL (자주 안 바뀜)
}

export async function upsertMyProfile(role: string, name: string): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: user.id, role, name, email: user.email ?? null }, { onConflict: 'id' });

  return !error;
}

export async function updateUserApproval(userId: string, approved: boolean): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('user_profiles')
    .update({ approved })
    .eq('id', userId);
  return !error;
}

export async function getAllUserProfiles(): Promise<{ id: string; role: string; name: string | null; email?: string; approved?: boolean }[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return [];
  return data || [];
}

export async function updateUserRole(userId: string, role: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('user_profiles')
    .update({ role })
    .eq('id', userId);

  return !error;
}

export async function deleteUserProfile(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('user_profiles')
    .delete()
    .eq('id', userId);

  return !error;
}

export async function getNeedsPasswordChange(): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('user_profiles')
    .select('needs_password_change')
    .eq('id', user.id)
    .single();

  return data?.needs_password_change === true;
}

export async function setPasswordChanged(): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('user_profiles')
    .update({ needs_password_change: false })
    .eq('id', user.id);

  return !error;
}

export async function getTutorialDone(): Promise<Record<string, boolean>> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  const { data } = await supabase
    .from('user_profiles')
    .select('tutorial_done')
    .eq('id', user.id)
    .single();

  return (data?.tutorial_done as Record<string, boolean>) ?? {};
}

export async function setTutorialPageDone(pageKey: string): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // 기존 tutorial_done 조회 후 머지
  const { data } = await supabase
    .from('user_profiles')
    .select('tutorial_done')
    .eq('id', user.id)
    .single();

  const current = (data?.tutorial_done as Record<string, boolean>) ?? {};
  const updated = { ...current, [pageKey]: true };

  const { error } = await supabase
    .from('user_profiles')
    .update({ tutorial_done: updated })
    .eq('id', user.id);

  return !error;
}

// ─── Custom Roles ─────────────────────────────────────────────

export async function getCustomRoles(): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('custom_roles')
    .select('name')
    .order('created_at', { ascending: true });
  return (data ?? []).map((r: { name: string }) => r.name);
}

export async function addCustomRole(name: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from('custom_roles').insert({ name });
  return !error;
}

export async function deleteCustomRole(name: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from('custom_roles').delete().eq('name', name);
  return !error;
}

// ─── Checklists ───────────────────────────────────────────────

export interface ChecklistRow {
  id: string;
  user_id: string;
  text: string;
  completed: boolean;
  reminder_time: string | null;
  notified: boolean;
  repeat_type: string | null;
  repeat_days: number[] | null;
  linked_episode_id: string | null;
  linked_episode_title: string | null;
  linked_episode_number: number | null;
  linked_project_id: string | null;
  linked_project_title: string | null;
  linked_client_name: string | null;
  linked_partner_id: string | null;
  linked_partner_name: string | null;
  created_at: string;
}

export async function getMyChecklists(): Promise<ChecklistRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('checklists')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return [];
  return data || [];
}

export async function insertChecklist(item: Omit<ChecklistRow, 'id' | 'user_id' | 'created_at'>): Promise<ChecklistRow | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? 'local';
  const { data, error } = await supabase
    .from('checklists')
    .insert({ ...item, user_id: userId })
    .select()
    .single();
  if (error) return null;
  return data;
}

export async function updateChecklist(id: string, updates: Partial<ChecklistRow>): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('checklists')
    .update(updates)
    .eq('id', id);
  return !error;
}

export async function deleteChecklist(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('checklists')
    .delete()
    .eq('id', id);
  return !error;
}

export async function clearCompletedChecklists(): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('checklists')
    .delete()
    .eq('completed', true);
  return !error;
}
