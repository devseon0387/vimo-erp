/**
 * Clients CRUD
 */
import { createClient } from '../client';
import { cachedFetch } from '../cache';
import type { Client } from '@/types';

// ─── Row Types (Supabase snake_case) ─────────────────────────

export interface ClientRow {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Mappers ─────────────────────────────────────────────────

export function clientFromRow(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    company: row.company ?? undefined,
    address: row.address ?? undefined,
    status: row.status as Client['status'],
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function clientToInsert(client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>) {
  return {
    name: client.name,
    contact_person: client.contactPerson ?? null,
    email: client.email ?? null,
    phone: client.phone ?? null,
    company: client.company ?? null,
    address: client.address ?? null,
    status: client.status,
    notes: client.notes ?? null,
  };
}

export function clientToUpdate(client: Partial<Client>) {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (client.name !== undefined) row.name = client.name;
  if (client.contactPerson !== undefined) row.contact_person = client.contactPerson;
  if (client.email !== undefined) row.email = client.email;
  if (client.phone !== undefined) row.phone = client.phone;
  if (client.company !== undefined) row.company = client.company;
  if (client.address !== undefined) row.address = client.address;
  if (client.status !== undefined) row.status = client.status;
  if (client.notes !== undefined) row.notes = client.notes;
  return row;
}

// ─── CRUD ────────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  return cachedFetch('clients:list', async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error('[DB] getClients:', error.message); return []; }
    if (!data) return [];
    return (data as ClientRow[]).map(clientFromRow);
  });
}

export async function insertClient(
  client: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Client | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('clients')
    .insert([clientToInsert(client)])
    .select()
    .single();
  if (error) { console.error('[DB] insertClient:', error.message); return null; }
  if (!data) return null;
  return clientFromRow(data as ClientRow);
}

export async function updateClient(id: string, updates: Partial<Client>): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('clients')
    .update(clientToUpdate(updates))
    .eq('id', id);
  if (error) console.error('[DB] updateClient:', error.message);
  return !error;
}

export async function deleteClient(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) console.error('[DB] deleteClient:', error.message);
  return !error;
}
