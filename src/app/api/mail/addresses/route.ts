/**
 * 메일 주소 관리 API — 관리자 전용 (user_profiles.role='admin').
 *  GET   : 주소 목록(소유자·담당자 포함) + 직원 목록(부여 현황)
 *  POST  : 주소 생성 {local, type, ownerUserId?, memberIds?, label?}
 *  PATCH : 활성 토글 {id, active} 또는 담당 변경 {id, type, ownerUserId?, memberIds?, label?}
 *
 * catch-all 수신이라 생성 = 디렉토리 등록일 뿐, 등록 즉시 분류·발신에 사용된다(AWS 설정 불필요).
 */
import { NextResponse } from 'next/server';
import { currentUser, isProfileAdmin } from '@/lib/authz';
import {
  createMailAddress,
  getMailAddresses,
  setMailAddressActive,
  updateMailAddressAssignment,
} from '@/lib/supabase/db/mail-addresses';
import { getAllUserProfiles } from '@/lib/supabase/db/users';

export const runtime = 'nodejs';

const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

function mailDomain(): string {
  return (process.env.MAIL_FROM_ADDRESS || 'noreply@vi-mo.kr').split('@')[1] || 'vi-mo.kr';
}

async function requireAdmin() {
  const user = await currentUser();
  if (!user?.id) return { error: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }) };
  if (!(await isProfileAdmin(user.id))) {
    return { error: NextResponse.json({ error: '관리자 전용 기능입니다.' }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const [addresses, users] = await Promise.all([getMailAddresses(), getAllUserProfiles()]);
  const personalOwners = new Set(
    addresses.filter((a) => a.type === 'personal' && a.active && a.ownerUserId).map((a) => a.ownerUserId),
  );
  return NextResponse.json({
    domain: mailDomain(),
    addresses,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email ?? null,
      approved: u.approved ?? false,
      hasPersonal: personalOwners.has(u.id),
    })),
  });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: {
    local?: unknown;
    type?: unknown;
    ownerUserId?: unknown;
    memberIds?: unknown;
    label?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const local = String(body.local ?? '').trim().toLowerCase();
  const type = body.type === 'shared' ? 'shared' : 'personal';
  const ownerUserId = body.ownerUserId ? String(body.ownerUserId) : null;
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
  const label = body.label ? String(body.label).trim() : null;

  if (!LOCAL_RE.test(local)) {
    return NextResponse.json(
      { error: '주소는 영문 소문자·숫자·점·하이픈만 가능합니다. (예: tax, contact)' },
      { status: 400 },
    );
  }
  if (type === 'personal' && !ownerUserId) {
    return NextResponse.json({ error: '개인 주소는 직원을 선택해야 합니다.' }, { status: 400 });
  }
  if (type === 'shared' && memberIds.length === 0) {
    return NextResponse.json({ error: '공용 주소는 담당 직원을 1명 이상 선택해야 합니다.' }, { status: 400 });
  }

  const address = `${local}@${mailDomain()}`;
  const result = await createMailAddress({ address, type, ownerUserId, memberIds, label });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? '주소 생성에 실패했습니다.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, address });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: {
    id?: unknown;
    active?: unknown;
    type?: unknown;
    ownerUserId?: unknown;
    memberIds?: unknown;
    label?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  const id = String(body.id ?? '');
  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }

  // (1) 활성 토글 — type 미지정 + active boolean
  if (body.type === undefined && typeof body.active === 'boolean') {
    const ok = await setMailAddressActive(id, body.active);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: '변경에 실패했습니다.' }, { status: 500 });
  }

  // (2) 담당 변경 — type 지정
  const type = body.type === 'shared' ? 'shared' : 'personal';
  const ownerUserId = body.ownerUserId ? String(body.ownerUserId) : null;
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
  const trimmed = body.label != null ? String(body.label).trim() : '';
  const label = trimmed.length > 0 ? trimmed : null;

  if (type === 'personal' && !ownerUserId) {
    return NextResponse.json({ error: '개인 주소는 직원을 선택해야 합니다.' }, { status: 400 });
  }
  if (type === 'shared' && memberIds.length === 0) {
    return NextResponse.json({ error: '공용 주소는 담당 직원을 1명 이상 선택해야 합니다.' }, { status: 400 });
  }

  const result = await updateMailAddressAssignment(id, { type, ownerUserId, memberIds, label });
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: result.error ?? '담당 변경에 실패했습니다.' }, { status: 400 });
}
