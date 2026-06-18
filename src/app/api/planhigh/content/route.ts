/**
 * planhigh 사이트 콘텐츠 (단일 행 id=1 jsonb).
 *  GET   — 공개 읽기(홈/어드민 로드). 현 Supabase anon GET 대체.
 *  PATCH — 어드민 전용 저장. 현 Supabase authenticated UPDATE 대체.
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { planhighSiteContent } from '@/db/schema';
import { withCors, preflight, verifyAdminToken } from '../_lib';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req.headers.get('origin'));
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin');
  try {
    const rows = await db
      .select({ content: planhighSiteContent.content, updatedAt: planhighSiteContent.updatedAt })
      .from(planhighSiteContent)
      .where(eq(planhighSiteContent.id, 1))
      .limit(1);
    return withCors(
      NextResponse.json({ content: rows[0]?.content ?? {}, updatedAt: rows[0]?.updatedAt ?? null }),
      origin,
    );
  } catch (err) {
    return withCors(NextResponse.json({ error: String(err) }, { status: 500 }), origin);
  }
}

export async function PATCH(req: Request) {
  const origin = req.headers.get('origin');
  const admin = await verifyAdminToken(req);
  if (!admin) {
    return withCors(NextResponse.json({ error: '인증 필요' }, { status: 401 }), origin);
  }
  try {
    const body = await req.json().catch(() => null);
    const content = body?.content;
    if (typeof content !== 'object' || content === null || Array.isArray(content)) {
      return withCors(NextResponse.json({ error: 'content 객체가 필요합니다' }, { status: 400 }), origin);
    }
    const now = new Date().toISOString();
    await db
      .insert(planhighSiteContent)
      .values({ id: 1, content, updatedAt: now })
      .onConflictDoUpdate({ target: planhighSiteContent.id, set: { content, updatedAt: now } });
    return withCors(NextResponse.json({ ok: true, updatedAt: now }), origin);
  } catch (err) {
    return withCors(NextResponse.json({ error: String(err) }, { status: 500 }), origin);
  }
}
