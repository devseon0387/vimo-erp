// Phase 2b: Supabase service_role .from() → 자체 PG(Drizzle) 이전.
// ★ 기존 인증 게이트는 불변:
//   - GET: authorizeRead(비봇 CLI 키 OR 로그인 세션) — Phase 4에서 Auth.js 세션으로 전환.
//   - POST: requireAdmin(admin 세션) — service_role 우회를 admin 게이트로 차단하던 의미 보존.
// 본 PG는 RLS가 없어 app_vimoerp가 풀 액세스 → 기존 service_role 읽기/쓰기 범위가 그대로 재현됨.
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/authz';
import { requireAdmin } from '@/lib/auth/admin';
import { db } from '@/db';
import { projects, episodes, clients, partners } from '@/db/schema';
import { and, eq, ne, ilike, inArray, asc, desc, isNotNull, gte, lt } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

// 읽기용 인가: 비봇 CLI 키 OR 로그인 세션. service_role로 데이터 노출되지만
// 같은 데이터는 RLS 통과 시에도 vimo_team에게 보이는 범위라서 read는 키 OR 세션.
async function authorizeRead(req: NextRequest): Promise<boolean> {
  const key = req.headers.get('x-bibot-key');
  if (process.env.BIBOT_API_KEY && key === process.env.BIBOT_API_KEY) return true;
  try {
    return !!(await currentUser());
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

  try {
    if (action === 'recent-projects') {
      const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100);
      const data = await db
        .select({
          id: projects.id,
          title: projects.title,
          client: projects.client,
          status: projects.status,
          updated_at: projects.updatedAt,
        })
        .from(projects)
        .orderBy(desc(projects.updatedAt))
        .limit(limit);
      return NextResponse.json({ projects: data });
    }

    if (action === 'recent-episodes') {
      const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100);
      const projectId = searchParams.get('projectId');
      const data = await db
        .select({
          id: episodes.id,
          project_id: episodes.projectId,
          episode_number: episodes.episodeNumber,
          title: episodes.title,
          status: episodes.status,
          due_date: episodes.dueDate,
          end_date: episodes.endDate,
          updated_at: episodes.updatedAt,
        })
        .from(episodes)
        .where(projectId ? eq(episodes.projectId, projectId) : undefined)
        .orderBy(desc(episodes.updatedAt))
        .limit(limit);

      const projectIds = [...new Set((data ?? []).map(r => r.project_id))];
      let projectMap: Record<string, { title: string; client: string | null }> = {};
      if (projectIds.length) {
        const projs = await db
          .select({ id: projects.id, title: projects.title, client: projects.client })
          .from(projects)
          .where(inArray(projects.id, projectIds));
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

      const [projectRows, episodeRows, clientRows, partnerRows] = await Promise.all([
        db
          .select({ id: projects.id, title: projects.title, client: projects.client, status: projects.status })
          .from(projects)
          .where(ilike(projects.title, `%${q}%`))
          .limit(10),
        db
          .select({
            id: episodes.id,
            project_id: episodes.projectId,
            episode_number: episodes.episodeNumber,
            title: episodes.title,
            status: episodes.status,
          })
          .from(episodes)
          .where(ilike(episodes.title, `%${q}%`))
          .limit(10),
        db
          .select({ id: clients.id, name: clients.name, company: clients.company })
          .from(clients)
          .where(ilike(clients.name, `%${q}%`))
          .limit(10),
        // partner email은 민감 정보 — 검색 결과에서 제외
        db
          .select({ id: partners.id, name: partners.name })
          .from(partners)
          .where(ilike(partners.name, `%${q}%`))
          .limit(10),
      ]);

      return NextResponse.json({
        projects: projectRows ?? [],
        episodes: episodeRows ?? [],
        clients: clientRows ?? [],
        partners: partnerRows ?? [],
      });
    }

    if (action === 'project') {
      const id = searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      const [data] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      // 원본 .single()은 행이 없으면 에러 → 빈 결과도 동일하게 catch로 500.
      if (!data) throw new Error('JSON object requested, multiple (or no) rows returned');
      return NextResponse.json({ project: data });
    }

    if (action === 'pending-settlements') {
      const limit = Math.min(Number(searchParams.get('limit') ?? 30), 100);
      const data = await db
        .select({
          id: episodes.id,
          project_id: episodes.projectId,
          episode_number: episodes.episodeNumber,
          title: episodes.title,
          payment_status: episodes.paymentStatus,
          payment_due_date: episodes.paymentDueDate,
          budget_partner: episodes.budgetPartner,
          end_date: episodes.endDate,
        })
        .from(episodes)
        .where(and(eq(episodes.paymentStatus, 'pending'), isNotNull(episodes.endDate)))
        // 원본: .order('payment_due_date', { ascending: true, nullsFirst: false })
        .orderBy(asc(episodes.paymentDueDate))
        .limit(limit);

      const projectIds = [...new Set((data ?? []).map(r => r.project_id))];
      let projectMap: Record<string, { title: string }> = {};
      if (projectIds.length) {
        const projs = await db
          .select({ id: projects.id, title: projects.title })
          .from(projects)
          .where(inArray(projects.id, projectIds));
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

      const data = await db
        .select({
          id: episodes.id,
          project_id: episodes.projectId,
          episode_number: episodes.episodeNumber,
          title: episodes.title,
          status: episodes.status,
          due_date: episodes.dueDate,
          assignee: episodes.assignee,
        })
        .from(episodes)
        // due_date(text 컬럼)에 대한 lexicographic 비교 — 원본 .gte/.lt(YYYY-MM-DD 문자열)와 동일.
        // (text 컬럼이라 ISO 날짜 문자열 사전순 = 시간순이 일치)
        .where(and(
          gte(episodes.dueDate, todayStr),
          lt(episodes.dueDate, tomorrowStr),
          ne(episodes.status, 'completed'),
        ))
        .orderBy(asc(episodes.episodeNumber));

      const projectIds = [...new Set((data ?? []).map(r => r.project_id))];
      let projectMap: Record<string, { title: string }> = {};
      if (projectIds.length) {
        const projs = await db
          .select({ id: projects.id, title: projects.title })
          .from(projects)
          .where(inArray(projects.id, projectIds));
        projectMap = Object.fromEntries((projs ?? []).map(p => [p.id, { title: p.title }]));
      }
      return NextResponse.json({
        today: todayStr,
        episodes: (data ?? []).map(r => ({ ...r, project_title: projectMap[r.project_id]?.title })),
      });
    }

    if (action === 'active-projects') {
      const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100);
      const data = await db
        .select({
          id: projects.id,
          title: projects.title,
          client: projects.client,
          status: projects.status,
          updated_at: projects.updatedAt,
        })
        .from(projects)
        .where(eq(projects.status, 'in_progress'))
        .orderBy(desc(projects.updatedAt))
        .limit(limit);

      const projectIds = (data ?? []).map(p => p.id);
      let counts: Record<string, { total: number; done: number }> = {};
      if (projectIds.length) {
        const eps = await db
          .select({ project_id: episodes.projectId, status: episodes.status })
          .from(episodes)
          .where(inArray(episodes.projectId, projectIds));
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
      const data = await db
        .select({
          id: episodes.id,
          project_id: episodes.projectId,
          episode_number: episodes.episodeNumber,
          title: episodes.title,
          status: episodes.status,
          due_date: episodes.dueDate,
          end_date: episodes.endDate,
        })
        .from(episodes)
        .where(eq(episodes.projectId, projectId))
        .orderBy(asc(episodes.episodeNumber));
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

// camelCase 필드 키 → episodes 스키마 컬럼(Drizzle 속성명) 화이트리스트.
const fieldToColumn: Record<string, keyof typeof episodes.$inferInsert> = {
  title: 'title',
  status: 'status',
  dueDate: 'dueDate',
  startDate: 'startDate',
  endDate: 'endDate',
  description: 'description',
  assignee: 'assignee',
  manager: 'manager',
  paymentStatus: 'paymentStatus',
  invoiceStatus: 'invoiceStatus',
};

export async function POST(req: NextRequest) {
  // 쓰기 액션은 episodes를 직접 변조 → admin 세션만 허용 (키 우회 차단).
  // requireAdmin 게이트는 불변. guard.admin(supabase service_role)은 데이터에만 쓰였으므로 db로 대체.
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

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

      const [data] = await db
        .insert(episodes)
        .values({
          projectId: body.projectId,
          // NULL → trg_set_episode_number 트리거가 채움. 스키마는 notNull이라 cast.
          episodeNumber: episodeNumber as unknown as number,
          title: body.title,
          status: body.status ?? 'pending',
          description: body.description ?? null,
          dueDate: body.dueDate ?? null,
          startDate: body.startDate ?? null,
          endDate: body.endDate ?? null,
          assignee: body.assignee ?? null,
          manager: body.manager ?? null,
          workContent: body.workContent ?? [],
          budgetTotal: '0',
          budgetPartner: '0',
          budgetManagement: '0',
          paymentStatus: 'pending',
          invoiceStatus: 'pending',
        })
        .returning({
          id: episodes.id,
          project_id: episodes.projectId,
          episode_number: episodes.episodeNumber,
          title: episodes.title,
        });

      if (!data) throw new Error('insert returned no row');
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
      const row: Partial<typeof episodes.$inferInsert> = { updatedAt: new Date().toISOString() };
      for (const [k, v] of Object.entries(body.fields)) {
        const col = fieldToColumn[k];
        if (!col) continue;
        (row as Record<string, unknown>)[col] = v;
      }
      if (Object.keys(row).length <= 1) {
        return NextResponse.json({ error: '수정할 필드 없음' }, { status: 400 });
      }

      const [data] = await db
        .update(episodes)
        .set(row)
        .where(eq(episodes.id, body.id))
        .returning({
          id: episodes.id,
          project_id: episodes.projectId,
          title: episodes.title,
        });
      if (!data) throw new Error('JSON object requested, multiple (or no) rows returned');
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
