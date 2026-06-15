// Widget(로그인한 사용자)이 호출하는 쓰기 엔드포인트.
// 비봇 CLI는 이 라우트를 직접 호출하지 않음 (비봇은 [ACTION] 마커로 제안만).
// Phase 2b: episodes 쓰기를 Supabase service_role(.from) → 자체 PG(Drizzle)로 이전.
// ★ requireAdmin 인증 게이트는 불변. guard.admin(service_role)은 데이터에만 쓰였으므로 db로 대체.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import { db } from '@/db';
import { episodes } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // episodes를 직접 변조하므로 admin 역할만 허용.
  // 일반 staff/매니저가 bibot 위젯의 액션을 실행해야 한다면 별도 staff 가드 헬퍼 도입 검토.
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const type = body.type as string;

  try {
    if (type === 'create-episode') {
      const projectId = body.projectId as string;
      const title = body.title as string;
      if (!projectId || !title) {
        return NextResponse.json({ error: 'projectId, title 필수' }, { status: 400 });
      }

      // episode_number는 클라가 명시 보내면 그 값, NULL 이면 DB 트리거(set_episode_number)가
      // advisory_xact_lock 으로 atomic 할당 — 동시 INSERT race 차단.
      const episodeNumber = (body.episodeNumber as number | null | undefined) ?? null;

      const [data] = await db
        .insert(episodes)
        .values({
          projectId,
          // NULL → trg_set_episode_number 트리거가 채움. 스키마는 notNull이라 cast.
          episodeNumber: episodeNumber as unknown as number,
          title,
          status: (body.status as string) ?? 'pending',
          description: (body.description as string) ?? null,
          dueDate: (body.dueDate as string) ?? null,
          startDate: (body.startDate as string) ?? null,
          endDate: (body.endDate as string) ?? null,
          assignee: (body.assignee as string) ?? null,
          manager: (body.manager as string) ?? null,
          workContent: (body.workContent as string[]) ?? [],
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

    if (type === 'update-episode-fields') {
      const id = body.id as string;
      const fields = body.fields as Record<string, unknown> | undefined;
      if (!id || !fields) {
        return NextResponse.json({ error: 'id, fields 필수' }, { status: 400 });
      }

      // camelCase 입력 키 → episodes 스키마 컬럼(Drizzle 속성명) 화이트리스트.
      const allow: Record<string, keyof typeof episodes.$inferInsert> = {
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

      const row: Partial<typeof episodes.$inferInsert> = { updatedAt: new Date().toISOString() };
      for (const [k, v] of Object.entries(fields)) {
        const col = allow[k];
        if (!col) continue;
        (row as Record<string, unknown>)[col] = v;
      }
      if (Object.keys(row).length <= 1) {
        return NextResponse.json({ error: '수정할 필드 없음' }, { status: 400 });
      }

      const [data] = await db
        .update(episodes)
        .set(row)
        .where(eq(episodes.id, id))
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

    return NextResponse.json({ error: 'unknown type' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
