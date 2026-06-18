/**
 * 메일 읽음 표시 API.
 *  POST { uids: string[] } : 인증·권한 확인 → 현재 유저 기준 읽음 표시(upsert).
 *
 * 인증=Auth.js 세션(currentUser), 권한=비모 ERP 접근(hasErpAccess).
 * 받은편지함에서 메일을 열 때 호출(fire-and-forget). 멱등(이미 읽음=무시).
 */
import { NextResponse } from 'next/server';
import { currentUser, hasErpAccess } from '@/lib/authz';
import { markMailRead } from '@/lib/supabase/db/mail-read-status';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  if (!(await hasErpAccess(user.id))) {
    return NextResponse.json({ error: '메일 권한이 없습니다.' }, { status: 403 });
  }

  let body: { uids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const uids = Array.isArray(body.uids) ? body.uids.map(String).map((s) => s.trim()).filter(Boolean) : [];
  if (uids.length === 0) {
    return NextResponse.json({ error: '대상이 없습니다.' }, { status: 400 });
  }

  try {
    await markMailRead(user.id, uids);
  } catch (e) {
    console.error('[mail/read] 읽음 표시 실패', e);
    return NextResponse.json({ error: '읽음 표시에 실패했습니다.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
