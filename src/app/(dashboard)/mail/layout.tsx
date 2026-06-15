'use client';
/**
 * 메일 허브 레이아웃 (시안 B) — 대시보드 공용 패널 대신 메일 전용 폴더 패널.
 * 대시보드 layout이 /mail 경로에서 공용 패널을 닫고(totalW=52), 여기서:
 *  - md↑ : 부모 패딩을 음수 마진으로 탈출 → [폴더 패널 | 콘텐츠] 풀하이트 2열
 *  - 모바일: 패널 없음, 페이지가 자체 처리(칩·시트) — 일반 플로우 유지
 * 받은편지함(/mail/inbox)은 스플릿 뷰라 패딩 0, 나머지 페이지는 기존 패딩 유지.
 */
import { usePathname } from 'next/navigation';

export default function MailLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInbox = pathname === '/mail/inbox';

  // 메일 폴더 메뉴는 대시보드 슬라이드 패널(MailFolderPanel)이 담당 → 여기선 본문만(별도 칸 제거)
  return (
    <div className="md:-m-6 lg:-m-8 -m-0 md:h-[calc(100vh-56px)] md:overflow-hidden">
      <div className={`min-w-0 h-full md:overflow-y-auto ${isInbox ? '' : 'md:p-6 lg:p-8'}`}>
        {children}
      </div>
    </div>
  );
}
