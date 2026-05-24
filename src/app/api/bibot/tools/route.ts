import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

// 읽기용 인가: 비봇 CLI 키 OR 로그인 세션. service_role로 데이터 노출되지만
// 같은 데이터는 RLS 통과 시에도 vimo_team에게 보이는 범위라서 read는 키 OR 세션.
async function authorizeRead(req: NextRequest): Promise<boolean> {
  const key = req.headers.get('x-bibot-key');
  if (process.env.BIBOT_API_KEY && key === process.env.BIBOT_API_KEY) return true;
  try {
    const supa = await createServerClient();
    const { data: { user } } = await supa.auth.getUser();
    return !!user;
  } catch {
    return false;
  }
}

// ilike 패턴 인젝션 방지: %, _, \ 이스케이프
function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

export async function GET(req: NextRequest) {
  if (!(await authorizeRead(req))) return unauthorized();

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const db = adminClient();

  try {
    if (action === 'recent-projects') {
      const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100);
      const { data, error } = await db
        .from('projects')
        .select('id, title, client, status, updated_at')
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return NextResponse.json({ projects: data });
    }

    if (action === 'recent-episodes') {
      const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100);
      const projectId = searchParams.get('projectId');
      let q = db
        .from('episodes')
        .select('id, project_id, episode_number, title, status, due_date, end_date, updated_at')
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (projectId) q = q.eq('project_id', projectId);
      const { data, error } = await q;
      if (error) throw error;

      const projectIds = [...new Set((data ?? []).map(r => r.project_id))];
      let projectMap: Record<string, { title: string; client: string | null }> = {};
      if (projectIds.length) {
        const { data: projs } = await db.from('projects').select('id, title, client').in('id', projectIds);
        projectMap = Object.fromEntries((projs ?? []).map(p => [p.id, { title: p.title, client: p.client }]));
      }
      return NextResponse.json({
        episodes: (data ?? []).map(r => ({
          ...r,
          project_title: projectMap[r.project_id]?.title,
          project_client: projectMap[r.project_id]?.client,
        })),
      });
    }

    if (action === 'search') {
      const raw = (searchParams.get('q') ?? '').trim().slice(0, 100);
      if (!raw) return NextResponse.json({ projects: [], episodes: [], clients: [], partners: [] });
      const q = escapeIlike(raw);

      const [projects, episodes, clients, partners] = await Promise.all([
        db.from('projects').select('id, title, client, status').ilike('title', `%${q}%`).limit(10),
        db.from('episodes').select('id, project_id, episode_number, title, status').ilike('title', `%${q}%`).limit(10),
        db.from('clients').select('id, name, company').ilike('name', `%${q}%`).limit(10),
        // partner email은 민감 정보 — 검색 결과에서 제외
        db.from('partners').select('id, name').ilike('name', `%${q}%`).limit(10),
      ]);

      return NextResponse.json({
        projects: projects.data ?? [],
        episodes: episodes.data ?? [],
        clients: clients.data ?? [],
        partners: partners.data ?? [],
      });
    }

    if (action === 'project') {
      const id = searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      const { data, error } = await db.from('projects').select('*').eq('id', id).single();
      if (error) throw error;
      return NextResponse.json({ project: data });
    }

    if (action === 'pending-settlements') {
      const limit = Math.min(Number(searchParams.get('limit') ?? 30), 100);
      const { data, error } = await db
        .from('episodes')
        .select('id, project_id, episode_number, title, payment_status, payment_due_date, budget_partner, end_date')
        .eq('payment_status', 'pending')
        .not('end_date', 'is', null)
        .order('payment_due_date', { ascending: true, nullsFirst: false })
        .limit(limit);
      if (error) throw error;

      const projectIds = [...new Set((data ?? []).map(r => r.project_id))];
      let projectMap: Record<string, { title: string }> = {};
      if (projectIds.length) {
        const { data: projs } = await db.from('projects').select('id, title').in('id', projectIds);
        projectMap = Object.fromEntries((projs ?? []).map(p => [p.id, { title: p.title }]));
      }
      return NextResponse.json({
        episodes: (data ?? []).map(r => ({ ...r, project_title: projectMap[r.project_id]?.title })),
      });
    }

    if (action === 'today-due-episodes') {
      const today = new Date();
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, '0');
      const d = String(today.getDate()).padStart(2, '0');
      const todayStr = `${y}-${m}-${d}`;
      const tomorrow = new Date(today.getTime() + 86400000);
      const ty = tomorrow.getFullYear();
      const tm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const td = String(tomorrow.getDate()).padStart(2, '0');
      const tomorrowStr = `${ty}-${tm}-${td}`;

      const { data, error } = await db
        .from('episodes')
        .select('id, project_id, episode_number, title, status, due_date, assignee')
        .gte('due_date', todayStr)
        .lt('due_date', tomorrowStr)
        .neq('status', 'completed')
        .order('episode_number', { ascending: true });
      if (error) throw error;

      const projectIds = [...new Set((data ?? []).map(r => r.project_id))];
      let projectMap: Record<string, { title: string }> = {};
      if (projectIds.length) {
        const { data: projs } = await db.from('projects').select('id, title').in('id', projectIds);
        projectMap = Object.fromEntries((projs ?? []).map(p => [p.id, { title: p.title }]));
      }
      return NextResponse.json({
        today: todayStr,
        episodes: (data ?? []).map(r => ({ ...r, project_title: projectMap[r.project_id]?.title })),
      });
    }

    if (action === 'active-projects') {
      const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100);
      const { data, error } = await db
        .from('projects')
        .select('id, title, client, status, updated_at')
        .eq('status', 'in_progress')
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error) throw error;

      const projectIds = (data ?? []).map(p => p.id);
      let counts: Record<string, { total: number; done: number }> = {};
      if (projectIds.length) {
        const { data: eps } = await db
          .from('episodes')
          .select('project_id, status')
          .in('project_id', projectIds);
        for (const e of eps ?? []) {
          if (!counts[e.project_id]) counts[e.project_id] = { total: 0, done: 0 };
          counts[e.project_id].total++;
          if (e.status === 'completed') counts[e.project_id].done++;
        }
      }
      return NextResponse.json({
        projects: (data ?? []).map(p => ({
          ...p,
          episode_total: counts[p.id]?.total ?? 0,
          episode_done: counts[p.id]?.done ?? 0,
        })),
      });
    }

    if (action === 'episodes-by-project') {
      const projectId = searchParams.get('projectId');
      if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
      const { data, error } = await db
        .from('episodes')
        .select('id, project_id, episode_number, title, status, due_date, end_date')
        .eq('project_id', projectId)
        .order('episode_number', { ascending: true });
      if (error) throw error;
      return NextResponse.json({ episodes: data });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── 쓰기 액션 (POST) ─────────────────────────────────────────
// Widget이 사용자 확인 후 직접 호출. 비봇 CLI는 이 엔드포인트를 직접 부르지 않음.
type WriteBody =
  | {
      action: 'create-episode';
      projectId: string;
      title: string;
      episodeNumber?: number;
      status?: string;
      dueDate?: string;
      startDate?: string;
      endDate?: string;
      description?: string;
      assignee?: string;
      manager?: string;
      workContent?: string[];
    }
  | {
      action: 'update-episode-fields';
      id: string;
      fields: Partial<{
        title: string;
        status: string;
        dueDate: string | null;
        startDate: string | null;
        endDate: string | null;
        description: string | null;
        assignee: string | null;
        manager: string | null;
        paymentStatus: string;
        invoiceStatus: string;
      }>;
    };

const camelToSnake: Record<string, string> = {
  title: 'title',
  status: 'status',
  dueDate: 'due_date',
  startDate: 'start_date',
  endDate: 'end_date',
  description: 'description',
  assignee: 'assignee',
  manager: 'manager',
  paymentStatus: 'payment_status',
  invoiceStatus: 'invoice_status',
};

export async function POST(req: NextRequest) {
  // 쓰기 액션은 service_role로 episodes를 직접 변조 → admin 세션만 허용 (키 우회 차단)
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const db = guard.admin;

  let body: WriteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  try {
    if (body.action === 'create-episode') {
      if (!body.projectId || !body.title) {
        return NextResponse.json({ error: 'projectId와 title 필수' }, { status: 400 });
      }

      // episode_number는 클라가 명시 보내면 그 값, NULL 이면 DB 트리거(set_episode_number)가
      // advisory_xact_lock 으로 atomic 할당 — 동시 INSERT race 차단.
      const episodeNumber = body.episodeNumber ?? null;

      const { data, error } = await db
        .from('episodes')
        .insert({
          project_id: body.projectId,
          episode_number: episodeNumber,
          title: body.title,
          status: body.status ?? 'pending',
          description: body.description ?? null,
          due_date: body.dueDate ?? null,
          start_date: body.startDate ?? null,
          end_date: body.endDate ?? null,
          assignee: body.assignee ?? null,
          manager: body.manager ?? null,
          work_content: body.workContent ?? [],
          budget_total: 0,
          budget_partner: 0,
          budget_management: 0,
          payment_status: 'pending',
          invoice_status: 'pending',
        })
        .select('id, project_id, episode_number, title')
        .single();

      if (error) throw error;
      return NextResponse.json({
        ok: true,
        episode: data,
        href: `/projects/${data.project_id}/episodes/${data.id}`,
      });
    }

    if (body.action === 'update-episode-fields') {
      if (!body.id || !body.fields) {
        return NextResponse.json({ error: 'id와 fields 필수' }, { status: 400 });
      }
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const [k, v] of Object.entries(body.fields)) {
        const col = camelToSnake[k];
        if (!col) continue;
        row[col] = v;
      }
      if (Object.keys(row).length <= 1) {
        return NextResponse.json({ error: '수정할 필드 없음' }, { status: 400 });
      }

      const { data, error } = await db
        .from('episodes')
        .update(row)
        .eq('id', body.id)
        .select('id, project_id, title')
        .single();
      if (error) throw error;
      return NextResponse.json({
        ok: true,
        episode: data,
        href: `/projects/${data.project_id}/episodes/${data.id}`,
      });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
