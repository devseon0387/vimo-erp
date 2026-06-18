/**
 * planhigh 공개 API 공용 유틸.
 *
 * planhigh.co.kr 정적 사이트(Vercel)가 Supabase REST/Auth 직접 호출을 떠나
 * 이 ERP 앱(erp.vi-mo.kr, Baseon 직결)의 /api/planhigh/* 로 옮겨오기 위한 토대.
 * 크로스 오리진(planhigh.co.kr → erp.vi-mo.kr)이므로 CORS 필수.
 *
 * 인증은 ERP Auth.js 와 독립된 planhigh 전용 토큰(HS256, PLANHIGH_ADMIN_SECRET).
 * (세온님 결정 2026-06-18: planhigh 어드민은 ERP 계정과 분리 유지)
 *
 * env:
 *   PLANHIGH_ADMIN_SECRET   — 어드민 토큰 서명 시크릿(>=16자)
 *   PLANHIGH_ALLOWED_ORIGINS — CORS 허용 오리진 CSV(기본 planhigh.co.kr·www)
 */
import { NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

// ── CORS ──
const ALLOWED_ORIGINS = new Set(
  (process.env.PLANHIGH_ALLOWED_ORIGINS ?? 'https://planhigh.co.kr,https://www.planhigh.co.kr')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  // 허용 목록에 있는 오리진만 반사(반사 안 하면 브라우저가 차단 → 비허용 오리진 안전 거부)
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

export function withCors(res: NextResponse, origin: string | null): NextResponse {
  for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
  return res;
}

export function preflight(origin: string | null): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }), origin);
}

// ── planhigh 전용 어드민 토큰 (ERP Auth.js 와 독립) ──
function adminSecret(): Uint8Array {
  const s = process.env.PLANHIGH_ADMIN_SECRET;
  if (!s || s.length < 16) {
    throw new Error('PLANHIGH_ADMIN_SECRET env not set (>=16 chars)');
  }
  return new TextEncoder().encode(s);
}

export async function signAdminToken(sub: string, email: string): Promise<string> {
  return new SignJWT({ email, scope: 'planhigh-admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(adminSecret());
}

export async function verifyAdminToken(
  req: Request,
): Promise<{ sub: string; email: string } | null> {
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], adminSecret(), { algorithms: ['HS256'] });
    if (payload.scope !== 'planhigh-admin' || !payload.sub) return null;
    return { sub: String(payload.sub), email: String(payload.email ?? '') };
  } catch {
    return null;
  }
}

// ── best-effort IP 레이트리밋 (in-memory, 단일 인스턴스 가정) ──
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const e = hits.get(key);
  if (!e || now > e.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (e.count >= limit) return false;
  e.count++;
  return true;
}

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  return xff.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}
