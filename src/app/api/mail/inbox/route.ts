/**
 * 받은 메일 API — Amazon SES Inbound(S3) 원본을 읽어 파싱 + 주소 디렉토리로 분류해 반환.
 *  GET : 인증·권한 확인 → 수신 메일을 mail_addresses 기준으로 분류
 *        - 관리자: 전체 + 미분류 포함
 *        - 직원  : 본인 개인 주소 + 담당 공용함 메일만
 *
 * MVP: DB 저장 없이 매 요청 시 소스에서 읽어 파싱(저용량). 읽음상태·캐시는 후속.
 */
import { NextResponse } from 'next/server';
import { currentUser, hasErpAccess, isProfileAdmin } from '@/lib/authz';
import { getInboundEmails, isInboundConfigured, type InboundEmail } from '@/lib/mail/inbound';
import { getMailDirectory, getMyMailBoxes } from '@/lib/supabase/db/mail-addresses';

export const runtime = 'nodejs';

type Box = { address: string; type: 'personal' | 'shared'; label: string | null };
type ClassifiedEmail = InboundEmail & { boxes: Box[]; unmatched: boolean };

export async function GET() {
  const user = await currentUser();
  if (!user?.id) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  if (!(await hasErpAccess(user.id))) {
    return NextResponse.json({ error: '메일 조회 권한이 없습니다.' }, { status: 403 });
  }

  const [admin, myBoxes] = await Promise.all([
    isProfileAdmin(user.id),
    getMyMailBoxes(user.id),
  ]);

  if (!isInboundConfigured()) {
    return NextResponse.json({ configured: false, isAdmin: admin, myBoxes, emails: [] });
  }

  try {
    const [emails, directory] = await Promise.all([getInboundEmails(), getMailDirectory()]);
    const dirByAddress = new Map(directory.map((d) => [d.address, d]));

    // 관리자: 모든 공용함을 탭으로 (담당자 여부 무관 — 전체를 관제)
    const allSharedBoxes: Box[] = directory
      .filter((d) => d.type === 'shared')
      .map((d) => ({ address: d.address, type: 'shared' as const, label: d.label }));

    const classified: ClassifiedEmail[] = emails.map((e) => {
      const matched = e.toAddresses
        .map((a) => dirByAddress.get(a))
        .filter((d): d is NonNullable<typeof d> => Boolean(d));
      return {
        ...e,
        boxes: matched.map((d) => ({ address: d.address, type: d.type, label: d.label })),
        unmatched: matched.length === 0,
      };
    });

    // 직원: 본인 메일함(개인 소유 or 공용 담당)에 해당하는 메일만
    const visible = admin
      ? classified
      : classified.filter((e) =>
          e.boxes.some((b) => {
            const d = dirByAddress.get(b.address);
            if (!d) return false;
            return d.type === 'personal'
              ? d.ownerUserId === user.id
              : d.memberIds.includes(user.id);
          }),
        );

    return NextResponse.json({
      configured: true,
      isAdmin: admin,
      myBoxes,
      sharedBoxes: admin ? allSharedBoxes : undefined,
      emails: visible,
    });
  } catch (e) {
    console.error('[mail/inbox] 수신 메일 조회 실패', e);
    return NextResponse.json(
      { configured: true, isAdmin: admin, myBoxes, emails: [], error: '받은 메일을 불러오지 못했습니다.' },
      { status: 502 },
    );
  }
}
