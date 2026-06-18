/**
 * planhigh 포트폴리오 (portfolio_items 공유 테이블에서 planhigh 태그·게시분만).
 *  GET — 공개 읽기. 현 Supabase anon GET(tags cs {planhigh} & is_published) 대체.
 *
 * 주의: portfolio_items 는 ERP 소유 공유 테이블(전체 35행, planhigh 태그 12행)이다.
 *       반드시 서버에서 'planhigh' 태그 + is_published 로 강제 필터해 비-planhigh 행 유출 차단.
 */
import { NextResponse } from 'next/server';
import { and, eq, asc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { portfolioItems } from '@/db/schema';
import { withCors, preflight } from '../_lib';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req.headers.get('origin'));
}

export async function GET(req: Request) {
  const origin = req.headers.get('origin');
  try {
    const rows = await db
      .select({
        id: portfolioItems.id,
        title: portfolioItems.title,
        description: portfolioItems.description,
        client: portfolioItems.client,
        completedAt: portfolioItems.completedAt,
        tags: portfolioItems.tags,
        youtubeUrl: portfolioItems.youtubeUrl,
        category: portfolioItems.category,
        displayOrder: portfolioItems.displayOrder,
        createdAt: portfolioItems.createdAt,
      })
      .from(portfolioItems)
      .where(and(eq(portfolioItems.isPublished, true), sql`'planhigh' = ANY(${portfolioItems.tags})`))
      .orderBy(asc(portfolioItems.displayOrder), asc(portfolioItems.createdAt));
    return withCors(NextResponse.json(rows), origin);
  } catch (err) {
    return withCors(NextResponse.json({ error: String(err) }, { status: 500 }), origin);
  }
}
