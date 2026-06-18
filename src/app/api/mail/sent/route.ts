/**
 * 보낸 메일 API — 발송 이력(sent_emails) 조회.
 *  GET : 인증·권한 확인 → 발송 메일 반환
 *        - 관리자: 전체
 *        - 직원  : 본인 발송분(senderId) + 본인 담당 주소(개인/공용)에서 나간 메일
 *
 * 인증=Auth.js 세션(currentUser), 권한=비모 ERP 접근(hasErpAccess). 받은편지함과 동일 게이트.
 */
import { NextResponse } from 'next/server';
import { currentUser, hasErpAccess, isProfileAdmin } from '@/lib/authz';
import { getSentEmails } from '@/lib/supabase/db/sent-emails';
import { getMyMailBoxes } from '@/lib/supabase/db/mail-addresses';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  if (!(await hasErpAccess(user.id))) {
    return NextResponse.json({ error: '메일 조회 권한이 없습니다.' }, { status: 403 });
  }

  const admin = await isProfileAdmin(user.id);
  try {
    let emails;
    if (admin) {
      emails = await getSentEmails();
    } else {
      const boxes = await getMyMailBoxes(user.id);
      emails = await getSentEmails({
        senderId: user.id,
        senderEmails: boxes.map((b) => b.address),
      });
    }
    return NextResponse.json({ isAdmin: admin, emails });
  } catch (e) {
    console.error('[mail/sent] 발송 메일 조회 실패', e);
    return NextResponse.json(
      { emails: [], error: '보낸 메일을 불러오지 못했습니다.' },
      { status: 502 },
    );
  }
}
