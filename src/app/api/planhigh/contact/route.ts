/**
 * planhigh 문의 신청 (planhigh_contact_requests INSERT-only).
 *  POST — 공개(익명) 신청. 현 Supabase anon INSERT 대체.
 *
 * Supabase anon RLS(INSERT-only)의 보호를 앱 경계로 옮김: IP 레이트리밋 + 필수필드 검증
 * + honeypot + 길이 상한.
 */
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { planhighContactRequests } from '@/db/schema';
import { withCors, preflight, rateLimit, clientIp } from '../_lib';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: Request) {
  return preflight(req.headers.get('origin'));
}

const cap = (s: string, n: number) => s.slice(0, n);

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const ip = clientIp(req);
  if (!rateLimit(`planhigh-contact:${ip}`, 5, 60_000)) {
    return withCors(NextResponse.json({ error: '잠시 후 다시 시도해주세요' }, { status: 429 }), origin);
  }
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return withCors(NextResponse.json({ error: '잘못된 요청' }, { status: 400 }), origin);
    }
    // honeypot — 봇이 채우는 숨김 필드. 채워졌으면 성공한 척 무시.
    if (body._hp) return withCors(NextResponse.json({ ok: true }), origin);

    const hospitalName = String(body.hospital_name ?? body.hospitalName ?? '').trim();
    const contactName = String(body.contact_name ?? body.contactName ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    if (!hospitalName || !contactName || !phone) {
      return withCors(
        NextResponse.json({ error: '필수 항목(병원명·담당자·연락처)을 입력해주세요' }, { status: 400 }),
        origin,
      );
    }

    await db.insert(planhighContactRequests).values({
      hospitalName: cap(hospitalName, 200),
      contactName: cap(contactName, 100),
      phone: cap(phone, 50),
      email: body.email ? cap(String(body.email).trim(), 200) : null,
      service: body.service ? cap(String(body.service).trim(), 200) : null,
      message: body.message ? cap(String(body.message).trim(), 5000) : null,
    });
    return withCors(NextResponse.json({ ok: true }), origin);
  } catch (err) {
    return withCors(NextResponse.json({ error: String(err) }, { status: 500 }), origin);
  }
}
