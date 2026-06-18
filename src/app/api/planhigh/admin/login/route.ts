/**
 * planhigh 전용 어드민 로그인 (ERP Auth.js 와 독립).
 *  POST {email,password} — bcrypt 검증 → planhigh 어드민 토큰(HS256, 12h) 발급.
 *
 * 현 Supabase GoTrue password grant 대체. 자격증명은 Baseon planhigh_admins 테이블.
 * 세온님 결정 2026-06-18: planhigh 어드민은 ERP 계정과 분리 유지.
 */
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/db';
import { planhighAdmins } from '@/db/schema';
import { withCors, preflight, signAdminToken, rateLimit, clientIp } from '../../_lib';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req.headers.get('origin'));
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const ip = clientIp(req);
  if (!rateLimit(`planhigh-login:${ip}`, 10, 60_000)) {
    return withCors(NextResponse.json({ error: '잠시 후 다시 시도해주세요' }, { status: 429 }), origin);
  }
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    if (!email || !password) {
      return withCors(NextResponse.json({ error: '이메일/비밀번호가 필요합니다' }, { status: 400 }), origin);
    }
    const rows = await db
      .select()
      .from(planhighAdmins)
      .where(sql`lower(${planhighAdmins.email}) = ${email}`)
      .limit(1);
    const admin = rows[0];
    if (!admin || !admin.passwordHash || !(await bcrypt.compare(password, admin.passwordHash))) {
      return withCors(
        NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' }, { status: 401 }),
        origin,
      );
    }
    const token = await signAdminToken(String(admin.id), admin.email);
    return withCors(NextResponse.json({ token, email: admin.email }), origin);
  } catch (err) {
    return withCors(NextResponse.json({ error: String(err) }, { status: 500 }), origin);
  }
}
