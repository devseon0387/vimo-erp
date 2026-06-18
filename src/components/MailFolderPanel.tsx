'use client';
/**
 * 메일 허브 폴더 패널 (시안 B) — 공용함이 1급 폴더인 메일 전용 내비.
 *  - lg(1024)↑ : 풀 패널 200px (라벨 + 카운트 뱃지)
 *  - md(768)~lg: 아이콘 컬럼 58px (카운트 뱃지)
 *  - md 미만   : 숨김 (받은편지함 페이지가 칩 + 바텀시트로 처리)
 * 폴더 = 받은(전체/내 메일함/공용함들/미분류) 쿼리 링크 + 보낸/전체. (주소 관리는 관리자 레일/설정으로 이전)
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Archive, AtSign, Inbox, PenLine, Send, User, Users,
} from 'lucide-react';
import {
  fetchInbox, getInboxCache, subscribeInbox, getSeenSet,
  type InboxData,
} from '@/lib/mail/inbox-shared';

type Folder = {
  key: string;            // box 쿼리값 (all|mine|<address>|unmatched) 또는 라우트 키
  label: string;
  sub?: string;           // 주소 보조 표기 (tax@ 등)
  href: string;
  icon: React.ElementType;
  count?: number;
  amber?: boolean;
};

function buildFolders(data: InboxData | null, seenVer: number): { boxes: Folder[]; etc: Folder[] } {
  void seenVer; // 읽음 변경 시 재계산 트리거용
  const seen = typeof window !== 'undefined' ? getSeenSet() : new Set<string>();
  const emails = data?.emails ?? [];
  const unreadIn = (pred: (e: InboxData['emails'][number]) => boolean) =>
    emails.filter((e) => pred(e) && !seen.has(e.uid)).length;

  const myPersonal = (data?.myBoxes ?? []).filter((b) => b.type === 'personal').map((b) => b.address.toLowerCase());
  const sharedSource = data?.isAdmin && data.sharedBoxes
    ? data.sharedBoxes
    : (data?.myBoxes ?? []).filter((b) => b.type === 'shared');

  const boxes: Folder[] = [];
  if (data?.isAdmin) {
    boxes.push({
      key: 'all', label: '받은 메일함', href: '/mail/inbox?box=all', icon: Inbox,
      count: unreadIn(() => true),
    });
  }
  if (myPersonal.length > 0) {
    boxes.push({
      key: 'mine', label: '내 메일함', href: '/mail/inbox?box=mine', icon: User,
      count: unreadIn((e) => (e.boxes ?? []).some((b) => myPersonal.includes(b.address.toLowerCase()))),
    });
  }
  for (const b of sharedSource) {
    const addr = b.address.toLowerCase();
    boxes.push({
      key: addr,
      label: b.label || addr.split('@')[0],
      sub: `${addr.split('@')[0]}@`,
      href: `/mail/inbox?box=${encodeURIComponent(addr)}`,
      icon: Users,
      count: unreadIn((e) => (e.boxes ?? []).some((x) => x.address.toLowerCase() === addr)),
    });
  }
  if (data?.isAdmin) {
    boxes.push({
      key: 'unmatched', label: '미분류', href: '/mail/inbox?box=unmatched', icon: Inbox,
      count: unreadIn((e) => e.unmatched === true), amber: true,
    });
  }

  const etc: Folder[] = [
    { key: 'sent', label: '보낸 메일함', href: '/mail/sent', icon: Send },
    { key: 'allmail', label: '전체 메일함', href: '/mail', icon: Archive },
  ];
  return { boxes, etc };
}

export default function MailFolderPanel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<InboxData | null>(getInboxCache());
  const [ver, setVer] = useState(0);

  useEffect(() => {
    const unsub = subscribeInbox(() => {
      setData(getInboxCache());
      setVer((v) => v + 1);
    });
    fetchInbox();
    return unsub;
  }, []);

  const { boxes, etc } = buildFolders(data, ver);
  // 폴더 그룹화 — 받은/내 메일함 vs 공용함(+미분류). 멀티주소 모델을 한눈에.
  const receivedBoxes = boxes.filter((b) => b.key === 'all' || b.key === 'mine');
  const sharedBoxes = boxes.filter((b) => b.key !== 'all' && b.key !== 'mine' && b.key !== 'unmatched');
  const unmatchedBoxes = boxes.filter((b) => b.key === 'unmatched');
  // 내 발신 주소 — 부여받은 개인 메일 주소(personal). 이름 태그(label) + 주소로 표시.
  const myPersonalBoxes = (data?.myBoxes ?? []).filter((b) => b.type === 'personal');
  const curBox = searchParams.get('box');

  const isActive = (f: Folder) => {
    if (f.href.startsWith('/mail/inbox')) {
      if (pathname !== '/mail/inbox') return false;
      const want = new URL(f.href, 'http://x').searchParams.get('box');
      // 기본 진입(box 없음): 관리자=all, 직원=첫 폴더
      if (!curBox) {
        const defKey = data?.isAdmin ? 'all' : boxes[0]?.key;
        return want === defKey;
      }
      return curBox === want;
    }
    return pathname === f.href;
  };

  const renderItem = (f: Folder) => {
    const active = isActive(f);
    return (
      <Link
        key={f.key}
        href={f.href}
        className={`group flex items-center gap-2 px-2 py-[7px] rounded-[9px] text-[12.5px] font-semibold mb-px transition-colors ${
          active
            ? 'bg-orange-50 text-orange-600'
            : f.amber
              ? 'text-amber-600 hover:bg-[#fafaf9]'
              : 'text-[#44403c] hover:bg-[#fafaf9]'
        }`}
      >
        <span
          className={`w-6 h-6 rounded-[7px] flex items-center justify-center flex-shrink-0 ${
            active ? 'bg-white text-orange-500' : f.amber ? 'bg-amber-50 text-amber-500' : 'bg-[#f5f5f4] text-[#a8a29e]'
          }`}
        >
          <f.icon size={13} />
        </span>
        <span className="truncate">{f.label}</span>
        {f.sub && <span className="text-[10.5px] font-medium text-[#a8a29e] truncate">{f.sub}</span>}
        {typeof f.count === 'number' && f.count > 0 && (
          <span
            className={`ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-extrabold ${
              f.amber ? 'bg-amber-100 text-amber-700' : 'bg-orange-500 text-white'
            }`}
          >
            {f.count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex flex-col">
      <Link
        href="/mail/compose"
        className="flex items-center justify-center gap-1.5 mb-3 px-3 py-2 rounded-lg bg-orange-500 text-white text-[12.5px] font-bold hover:bg-orange-600 transition-colors"
      >
        <PenLine size={14} />
        메일 쓰기
      </Link>
      {/* 내 발신 주소 — 부여받은 개인 메일 주소 (이름 태그 + 주소) */}
      {myPersonalBoxes.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-extrabold text-[#a8a29e] tracking-wide px-2 mb-1">내 발신 주소</div>
          {myPersonalBoxes.map((b) => {
            const name = b.label?.trim();
            return (
              <Link
                key={b.id}
                href="/mail/inbox?box=mine"
                title={name ? `${name} (${b.address})` : b.address}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11.5px] text-[#44403c] hover:bg-[#fafaf9] transition-colors"
              >
                <AtSign size={13} className="flex-shrink-0 text-[#a8a29e]" />
                <span className="truncate">
                  {name && <span className="font-bold">{name}</span>}
                  <span className="font-medium text-[#a8a29e]">{name ? ` (${b.address})` : b.address}</span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
      {receivedBoxes.length > 0 && (
        <>
          <div className="text-[10.5px] font-extrabold text-[#a8a29e] tracking-wide px-2 mb-1.5">메일함</div>
          {receivedBoxes.map(renderItem)}
        </>
      )}
      {(sharedBoxes.length > 0 || unmatchedBoxes.length > 0) && (
        <>
          <div className="text-[10.5px] font-extrabold text-[#a8a29e] tracking-wide px-2 mb-1.5 mt-3">공용함</div>
          {sharedBoxes.map(renderItem)}
          {unmatchedBoxes.map(renderItem)}
        </>
      )}
      <div className="h-px bg-[#f0ece9] my-2 mx-2" />
      {etc.map(renderItem)}
    </div>
  );
}
