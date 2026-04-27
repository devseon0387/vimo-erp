// Widget(로그인한 사용자)이 호출하는 쓰기 엔드포인트.
// 비봇 CLI는 이 라우트를 직접 호출하지 않음 (비봇은 [ACTION] 마커로 제안만).
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  // 세션 검증
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const type = body.type as string;
  const db = adminClient();

  try {
    if (type === 'create-episode') {
      const projectId = body.projectId as string;
      const title = body.title as string;
      if (!projectId || !title) {
        return NextResponse.json({ error: 'projectId, title 필수' }, { status: 400 });
      }

      let episodeNumber = body.episodeNumber as number | undefined;
      if (episodeNumber == null) {
        const { data: existing } = await db
          .from('episodes')
          .select('episode_number')
          .eq('project_id', projectId)
          .order('episode_number', { ascending: false })
          .limit(1);
        episodeNumber = (existing?.[0]?.episode_number ?? 0) + 1;
      }

      const { data, error } = await db
        .from('episodes')
        .insert({
          project_id: projectId,
          episode_number: episodeNumber,
          title,
          status: (body.status as string) ?? 'pending',
          description: (body.description as string) ?? null,
          due_date: (body.dueDate as string) ?? null,
          start_date: (body.startDate as string) ?? null,
          end_date: (body.endDate as string) ?? null,
          assignee: (body.assignee as string) ?? null,
          manager: (body.manager as string) ?? null,
          work_content: (body.workContent as string[]) ?? [],
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

    if (type === 'update-episode-fields') {
      const id = body.id as string;
      const fields = body.fields as Record<string, unknown> | undefined;
      if (!id || !fields) {
        return NextResponse.json({ error: 'id, fields 필수' }, { status: 400 });
      }

      const allow: Record<string, string> = {
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

      const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const [k, v] of Object.entries(fields)) {
        const col = allow[k];
        if (!col) continue;
        row[col] = v;
      }
      if (Object.keys(row).length <= 1) {
        return NextResponse.json({ error: '수정할 필드 없음' }, { status: 400 });
      }

      const { data, error } = await db
        .from('episodes')
        .update(row)
        .eq('id', id)
        .select('id, project_id, title')
        .single();
      if (error) throw error;
      return NextResponse.json({
        ok: true,
        episode: data,
        href: `/projects/${data.project_id}/episodes/${data.id}`,
      });
    }

    return NextResponse.json({ error: 'unknown type' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
