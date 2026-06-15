/**
 * 메일 발송 API — Amazon SES SMTP 경유.
 *  GET  : 현재 유저 기준 발신 설정 상태(configured) + 발신자(senderEmail/Name) 반환 (compose 초기화용)
 *  POST : 인증·권한 확인 → 검증 → SES 발송 → sent_emails 이력 저장
 *
 * 인증=Auth.js 세션(currentUser), 권한=비모 ERP 접근(hasErpAccess). 파트너는 발송 불가.
 */
import { NextResponse } from 'next/server';
import { currentUser, hasErpAccess } from '@/lib/authz';
import { isMailConfigured, resolveSender, sendMail } from '@/lib/mail/ses';
import { insertSentEmail } from '@/lib/supabase/db/sent-emails';
import { getMyMailBoxes } from '@/lib/supabase/db/mail-addresses';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 사용자가 보낼 수 있는 주소 목록 — 부여된 개인 주소 + 담당 공용함 (+ 대표 폴백). */
async function senderOptionsFor(user: { id: string; email?: string | null; name?: string | null }) {
  const boxes = await getMyMailBoxes(user.id);
  const options = boxes.map((b) => ({
    email: b.address,
    label: b.type === 'personal' ? (user.name || b.address) : (b.label || b.address),
    type: b.type,
  }));
  if (options.length === 0) {
    const { senderEmail, senderName } = resolveSender(user);
    options.push({ email: senderEmail, label: senderName || senderEmail, type: 'personal' as const });
  }
  return options;
}

export async function GET() {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  if (!(await hasErpAccess(user.id))) {
    return NextResponse.json({ error: '메일 발송 권한이 없습니다.' }, { status: 403 });
  }
  const options = await senderOptionsFor(user);
  return NextResponse.json({
    configured: isMailConfigured(),
    senderEmail: options[0]?.email ?? null,
    senderName: options[0]?.label ?? null,
    senderOptions: options,
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  if (!(await hasErpAccess(user.id))) {
    return NextResponse.json({ error: '메일 발송 권한이 없습니다.' }, { status: 403 });
  }
  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: '메일 서버가 아직 설정되지 않았습니다. 관리자에게 문의하세요.' },
      { status: 503 },
    );
  }

  let body: { to?: unknown; cc?: unknown; bcc?: unknown; subject?: unknown; content?: unknown; from?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const to = Array.isArray(body.to) ? body.to.map(String).map((s) => s.trim()).filter(Boolean) : [];
  const cc = Array.isArray(body.cc) ? body.cc.map(String).map((s) => s.trim()).filter(Boolean) : [];
  const bcc = Array.isArray(body.bcc) ? body.bcc.map(String).map((s) => s.trim()).filter(Boolean) : [];
  const subject = String(body.subject ?? '').trim();
  const content = String(body.content ?? '');

  if (to.length === 0 || !to.every((e) => EMAIL_RE.test(e))) {
    return NextResponse.json({ error: '받는 사람 이메일이 올바르지 않습니다.' }, { status: 400 });
  }
  if (![...cc, ...bcc].every((e) => EMAIL_RE.test(e))) {
    return NextResponse.json({ error: '참조 이메일이 올바르지 않습니다.' }, { status: 400 });
  }
  if (!subject) {
    return NextResponse.json({ error: '제목을 입력해주세요.' }, { status: 400 });
  }
  if (!content.replace(/<[^>]*>/g, '').trim()) {
    return NextResponse.json({ error: '본문을 입력해주세요.' }, { status: 400 });
  }

  // 보내는 주소 — 사용자에게 허용된 주소(부여 개인 + 담당 공용 + 폴백)만 발신 가능.
  // 요청 from이 허용목록에 없으면 조용히 폴백하지 않고 거부 — 화면 표시와 실제 발신의 불일치 방지.
  const options = await senderOptionsFor(user);
  const requested = String(body.from ?? '').trim().toLowerCase();
  let chosen;
  if (requested) {
    chosen = options.find((o) => o.email.toLowerCase() === requested);
    if (!chosen) {
      return NextResponse.json(
        { error: '선택한 발신 주소를 사용할 권한이 없습니다.' },
        { status: 403 },
      );
    }
  } else {
    chosen = options[0];
  }
  if (!chosen) {
    return NextResponse.json({ error: '발신 가능한 주소가 없습니다. 관리자에게 문의하세요.' }, { status: 403 });
  }
  const senderEmail = chosen.email;
  const senderName = chosen.label;
  // 수신도 자체 처리하므로 회신은 보낸 주소 그대로 받는다
  const replyTo = senderEmail;
  const from = senderName && senderName !== senderEmail ? `${senderName} <${senderEmail}>` : senderEmail;

  try {
    await sendMail({ from, to, cc, bcc, replyTo, subject, html: content });
  } catch (e) {
    console.error('[mail/send] SES 발송 실패', e);
    return NextResponse.json(
      { error: '이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    );
  }

  // 발송 이력 저장 — 실패해도 발송 자체는 성공으로 처리(이력은 부가 기능)
  try {
    await insertSentEmail({
      senderId: user.id,
      senderEmail,
      to,
      cc: cc.length > 0 ? cc : undefined,
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      content,
    });
  } catch (e) {
    console.error('[mail/send] 발송 이력 저장 실패', e);
  }

  return NextResponse.json({ ok: true });
}
