'use server';
/**
 * App Updates 조회 — Supabase → Baseon 자체 PG(Drizzle) 이전 (Phase 2b).
 * ★ 기존: 'use client' 페이지가 supabase.from('app_updates') 직접 쿼리(RLS 보호).
 * ★ 변경: 서버 액션에서 Drizzle로 조회. 두 페이지(/updates, /vbot/updates)가 공유 호출.
 *   인증(getUser)은 Phase 4까지 Supabase Auth 유지. 호출부는 동일 데이터 형태(select '*')라 무변경.
 *
 * 원본 쿼리:
 *   - /updates: .from('app_updates').select('*').eq('app', app).order('date', { ascending: false })
 *   - /vbot/updates: .from('app_updates').select('*').eq('app', 'bibot').order('date', { ascending: false }).limit(30)
 * 필터(app)·정렬(date desc)·limit 차이는 인자로 처리.
 */
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { appUpdates } from '@/db/schema';

export type ChangeType = 'feat' | 'fix' | 'improve' | 'style';

/** select '*' 형태를 그대로 보존한 행 모양 (snake_case created_at 포함). */
export interface AppUpdateRow {
  id: string;
  app: string;
  version: string;
  title: string;
  date: string;
  tag: string | null;
  changes: { type: ChangeType; text: string }[];
  created_at: string | null;
}

type Row = typeof appUpdates.$inferSelect;
function fromRow(r: Row): AppUpdateRow {
  return {
    id: r.id,
    app: r.app,
    version: r.version,
    title: r.title,
    date: r.date,
    tag: r.tag ?? null,
    changes: (r.changes as { type: ChangeType; text: string }[]) ?? [],
    created_at: r.createdAt ?? null,
  };
}

/**
 * 특정 앱('erp' | 'bibot' 등)의 업데이트 목록을 date 내림차순으로 조회.
 * @param app  필터할 앱 코드
 * @param limit 선택적 최대 개수 (vbot 페이지의 .limit(30) 재현)
 * 원본이 에러 시 빈배열/[]로 graceful 처리되므로 동일하게 보존.
 */
export async function getAppUpdates(app: string, limit?: number): Promise<AppUpdateRow[]> {
  try {
    const base = db
      .select()
      .from(appUpdates)
      .where(eq(appUpdates.app, app))
      .orderBy(desc(appUpdates.date));
    const rows = await (limit != null ? base.limit(limit) : base);
    return rows.map(fromRow);
  } catch {
    return [];
  }
}
