'use client';

import { useEffect, useRef, useState, Fragment, Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  LayoutDashboard, Users, FolderOpen, Settings, Briefcase, Trash2,
  Megaphone, LogOut, ClipboardCheck, Mail, Inbox, Send, MailPlus, Archive,
  Wallet, Receipt, FileText, Shield, Layers, Menu, X, Calendar,
  MessageSquarePlus, CreditCard, Bot, RefreshCw, UserPlus,
  MessageSquare, Video, AtSign, UserCog, KeyRound, Wrench,
} from 'lucide-react';
import DashboardContent from '@/components/DashboardContent';
import GlobalSearch from '@/components/GlobalSearch';
import MailFolderPanel from '@/components/MailFolderPanel';
import TutorialProvider from '@/components/tutorial/TutorialProvider';
import NotificationDropdown from '@/components/NotificationDropdown';

// 무거운 클라이언트 위젯은 지연 로드 — 모든 대시보드 라우트 공통 청크에서 분리(초기 로드 경량화).
const BibotWidget = dynamic(() => import('@/components/BibotWidget'), { ssr: false });
const TutorialOverlay = dynamic(() => import('@/components/tutorial/TutorialOverlay'), { ssr: false });

import FeedbackModal from '@/components/FeedbackModal';
import { invalidateAll } from '@/lib/supabase/cache';
import UpdateNoticeModal from '@/components/UpdateNoticeModal';
import { APP_VERSION, APP_LAST_UPDATED } from '@/config/version';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { signOut } from 'next-auth/react';
import { getSessionUser } from '@/lib/auth/session-info';
import { getProjectById, getProjectEpisodes } from '@/lib/supabase/db';

// ── 타입 정의
type NavLink    = { type: 'link';    href: string; label: string; icon: React.ElementType; badge?: string; sub?: SubLink[]; adminOnly?: boolean };
type NavDivider = { type: 'divider' };
type NavHeading = { type: 'heading'; label: string };
type NavItem    = NavLink | NavDivider | NavHeading;
type SubLink    = { href: string; label: string; icon: React.ElementType; badge?: string };
type Section    = { key: string; icon: React.ElementType; label: string; items: NavItem[]; adminOnly?: boolean };

const isLink = (i: NavItem): i is NavLink => i.type === 'link';

// 전 섹션을 통틀어 현재 경로에 '가장 구체적으로(가장 긴 href)' 매칭되는 섹션을 찾는다.
// 섹션-내부 best가 아니라 전역 best라서 크로스섹션 접두 충돌(예: /partners vs /partners/signups)을 올바르게 해소.
function matchSection(pathname: string, sections: Section[]): { sec: Section; href: string; label: string } | null {
  let best: { sec: Section; href: string; label: string } | null = null;
  for (const sec of sections) {
    for (const link of sec.items) {
      if (link.type !== 'link') continue;
      const candidates: { href: string; label: string }[] = [{ href: link.href, label: link.label }, ...(link.sub ?? [])];
      for (const c of candidates) {
        if (pathname === c.href || pathname.startsWith(c.href + '/')) {
          if (!best || c.href.length > best.href.length) best = { sec, href: c.href, label: c.label };
        }
      }
    }
  }
  return best;
}

// ── 섹션 정의 (레일 탭 기준)
const SECTIONS: Section[] = [
  {
    key: 'main',
    icon: LayoutDashboard,
    label: '메인',
    items: [
      { type: 'link', href: '/management', label: '매니지먼트', icon: ClipboardCheck  },
      { type: 'link', href: '/projects',   label: '프로젝트',   icon: FolderOpen      },
      { type: 'divider' },
      { type: 'link', href: '/finance/partner-settlement', label: '정산 관리', icon: Users },
      { type: 'divider' },
      { type: 'link', href: '/clients',    label: '클라이언트 관리', icon: Briefcase       },
      { type: 'link', href: '/partners',   label: '파트너 관리',     icon: Users           },
      { type: 'divider' },
      { type: 'link', href: '/feedback',   label: '피드백',   icon: MessageSquarePlus },
      { type: 'link', href: '/updates',    label: '업데이트', icon: Megaphone },
    ],
  },
  {
    key: 'inquiries',
    icon: MessageSquare,
    label: '문의',
    items: [
      { type: 'link', href: '/inquiries?tab=dashboard', label: '문의 매니지먼트', icon: ClipboardCheck },
      { type: 'link', href: '/inquiries',               label: '신규 문의',       icon: Mail },
      { type: 'link', href: '/inquiries?tab=all',       label: '문의 관리',       icon: MessageSquare },
      { type: 'divider' },
      { type: 'link', href: '/inquiries/portfolio',     label: '포트폴리오',      icon: Video },
    ],
  },
  {
    key: 'finance',
    icon: Wallet,
    label: '재무·경영',
    items: [
      { type: 'heading', label: '재무' },
      { type: 'link', href: '/finance/revenue',    label: '매출 관리',    icon: Receipt },
      { type: 'link', href: '/finance/expenses',   label: '지출 관리',    icon: CreditCard },
      { type: 'link', href: '/settlement', label: '월별 손익',   icon: Receipt, badge: '준비중', sub: [
        { href: '/settlement/history', label: '월별 내역', icon: Calendar },
      ] },
      { type: 'heading', label: '경영' },
      { type: 'link', href: '/contracts',    label: '계약',       icon: FileText, badge: '준비중' },
      { type: 'link', href: '/operations',   label: '운영',       icon: Layers,   badge: '준비중' },
    ],
  },
  {
    key: 'vbot',
    icon: Bot,
    label: '비봇',
    items: [
      { type: 'link', href: '/vbot', label: '비봇 매니지먼트', icon: Bot },
      { type: 'link', href: '/vbot/updates', label: '비봇 업데이트', icon: RefreshCw },
    ],
  },
  {
    key: 'mail',
    icon: Mail,
    label: '메일',
    items: [
      { type: 'link', href: '/mail/compose', label: '메일 쓰기', icon: MailPlus },
      { type: 'divider' },
      { type: 'link', href: '/mail', label: '전체 메일함', icon: Archive },
      { type: 'link', href: '/mail/inbox', label: '받은 메일함', icon: Inbox },
      { type: 'link', href: '/mail/sent', label: '보낸 메일함', icon: Send },
    ],
  },
  {
    key: 'admin',
    icon: Shield,
    label: '대표',
    adminOnly: true,
    items: [
      { type: 'link', href: '/settings/users',          label: '계정 관리',       icon: UserCog  },
      { type: 'link', href: '/settings/app-access',      label: '앱 접근 권한',    icon: KeyRound },
      { type: 'link', href: '/partners/signups',         label: '파트너 가입 승인', icon: UserPlus },
      { type: 'divider' },
      { type: 'link', href: '/settings/mail-addresses',  label: '메일 주소 관리',  icon: AtSign   },
      { type: 'divider' },
      { type: 'link', href: '/admin-fix',                label: '데이터 보정',     icon: Wrench   },
    ],
  },
];

// ── 시스템 항목 (레일 하단에 직접 배치)
const SYSTEM_ITEMS: NavLink[] = [
  { type: 'link', href: '/settings', label: '설정',   icon: Settings },
  { type: 'link', href: '/trash',    label: '휴지통', icon: Trash2   },
];

const RAIL_W  = 52;   // 아이콘 레일 너비
const PANEL_W = 190;  // 슬라이드 패널 너비 (시안8 밀집)

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [activeSection, setActiveSection] = useState<string | null>('main');
  const [userEmail,     setUserEmail    ] = useState('');
  const [myRole,        setMyRole       ] = useState('manager');
  const [expanded,      setExpanded     ] = useState<string | null>(null);
  const [mobileMenu,    setMobileMenu  ] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [feedbackOpen,  setFeedbackOpen] = useState(false);

  // breadcrumb 동적 이름
  const [breadcrumbProject, setBreadcrumbProject] = useState<string | null>(null);
  const [breadcrumbEpisode, setBreadcrumbEpisode] = useState<string | null>(null);

  useEffect(() => {
    const projectMatch = pathname.match(/^\/projects\/([^/]+)/);
    if (!projectMatch) {
      setBreadcrumbProject(null);
      setBreadcrumbEpisode(null);
      return;
    }
    const projectId = projectMatch[1];
    if (projectId === 'new') { setBreadcrumbProject(null); setBreadcrumbEpisode(null); return; }

    getProjectById(projectId).then(p => setBreadcrumbProject(p?.title ?? null));

    const episodeMatch = pathname.match(/^\/projects\/[^/]+\/episodes\/([^/]+)/);
    if (episodeMatch) {
      const epId = episodeMatch[1];
      getProjectEpisodes(projectId).then(episodes => {
        const ep = episodes.find(e => e.id === epId);
        setBreadcrumbEpisode(ep ? `${ep.episodeNumber}편 ${ep.title}` : null);
      });
    } else {
      setBreadcrumbEpisode(null);
    }
  }, [pathname]);

  // fab:action → feedback 이벤트 리스닝
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === 'feedback') setFeedbackOpen(true);
    };
    window.addEventListener('fab:action', handler);
    return () => window.removeEventListener('fab:action', handler);
  }, []);

  const panelOpen = activeSection !== null;
  const totalW    = RAIL_W + (panelOpen ? PANEL_W : 0);

  // 패널 상태를 CSS 변수로 노출 → 하위 페이지에서 maxWidth 조절에 사용
  useEffect(() => {
    document.documentElement.style.setProperty('--doc-max-w', panelOpen ? '960px' : '1200px');
  }, [panelOpen]);

  // 현재 경로에 맞는 섹션 자동 선택
  useEffect(() => {
    // 전역 best-href 매칭으로 단일 섹션 선택 (크로스섹션 접두 충돌 해소)
    // 메일도 다른 섹션과 동일하게 슬라이드 패널을 사용(폴더 메뉴는 MailFolderPanel이 패널 안에 렌더)
    const matched = matchSection(pathname, SECTIONS);
    if (matched) {
      setActiveSection(matched.sec.key);
      return;
    }
    // 시스템 항목 경로면 섹션 패널 닫기
    if (SYSTEM_ITEMS.some(i => pathname === i.href || pathname.startsWith(i.href + '/'))) {
      setActiveSection(null);
    }
    // 모바일 메뉴 자동 닫기
    setMobileMenu(false);
  }, [pathname]);

  useEffect(() => {
    const checkAuth = async () => {
      // 1차 게이트는 미들웨어(proxy)가 처리. 여기선 UI용 세션정보 로드 + 세션-only 만료 처리.
      const stay    = localStorage.getItem('vm_stay_logged_in');
      const session = sessionStorage.getItem('vm_active_session');
      if (!stay && !session) {
        // "로그인 유지" 미체크 + 브라우저 세션 종료 → 로그아웃
        invalidateAll();
        await signOut({ redirect: false });
        router.push('/login');
        return;
      }

      const u = await getSessionUser();
      if (!u) { router.push('/login'); return; }
      if (u.role !== 'admin' && u.approved !== true) {
        await signOut({ redirect: false });
        router.push('/login');
        return;
      }
      setUserEmail(u.email ?? '');
      setMyRole(u.role);
    };
    checkAuth();
  }, [router]);


  const handleLogout = async () => {
    localStorage.removeItem('vm_stay_logged_in');
    sessionStorage.removeItem('vm_active_session');
    sessionStorage.removeItem('vm_profile');
    sessionStorage.removeItem('vm_profile_at');
    invalidateAll();
    await signOut({ redirect: false });
    window.location.href = '/login';
  };

  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : '관';
  // 관리자 전용 섹션은 admin 역할에게만 노출 (레일/패널/모바일 모두 이 목록 기준)
  const visibleSections = SECTIONS.filter(s => !s.adminOnly || myRole === 'admin');
  const currentSection = visibleSections.find(s => s.key === activeSection) ?? null;
  // 현재 경로가 속한 섹션(전역 best-href). 레일 활성 점·브레드크럼이 단일 섹션만 활성화하도록 공유.
  const matchedNav = matchSection(pathname, visibleSections);
  const activeSecKey = matchedNav?.sec.key ?? null;

  return (
    <TutorialProvider>
    <div style={{ minHeight: '100vh', background: '#fafafa' }}>
      {/* 글로벌 검색 (Cmd+K / FAB로 열림, 버튼 UI는 숨기고 모달 리스너만 유지) */}
      <div className="hidden md:block" style={{ position: 'fixed', width: 0, height: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ pointerEvents: 'auto' }}><GlobalSearch /></div>
      </div>
      {/* 커스텀 툴팁 + 모바일 반응형 CSS */}
      <style>{`
        [data-rail-tip] { position: relative; }
        [data-rail-tip]::after {
          content: attr(data-rail-tip);
          position: absolute;
          left: calc(100% + 10px);
          top: 50%;
          transform: translateY(-50%);
          background: #18181b;
          color: #fff;
          font-size: 12px;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: 6px;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.15s;
          z-index: 100;
        }
        [data-rail-tip]:hover::after { opacity: 1; }
        @media (max-width: 768px) {
          .vm-rail, .vm-panel { display: none !important; }
          .vm-header { left: 0 !important; right: 0 !important; }
          .vm-main { margin-left: 0 !important; margin-right: 0 !important; }
          .vm-hamburger { display: flex !important; }
        }
        /* 비봇 사이드바 모드일 때 메인 컨텐츠를 왼쪽으로 밀기 */
        @media (min-width: 900px) {
          .vm-main { margin-right: var(--bibot-pad, 0px); transition: margin-right 0.25s cubic-bezier(0.4,0,0.2,1), margin-left 0.2s cubic-bezier(0.4,0,0.2,1); }
          .vm-header { right: var(--bibot-pad, 0px); transition: right 0.25s cubic-bezier(0.4,0,0.2,1); }
        }
      `}</style>
      {/* ══════════════════════════════════════════
          아이콘 레일 — 항상 보이는 왼쪽 세로 바
      ══════════════════════════════════════════ */}
      <div
        className="vm-rail"
        style={{
          position:      'fixed',
          top:           0,
          left:          0,
          bottom:        0,
          width:         RAIL_W,
          zIndex:        50,
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          background:    '#18181b',
          paddingTop:    '0',
          paddingBottom: '0',
        }}
      >
        {/* 로고 */}
        <Link
          href="/management"
          style={{
            width:          '100%',
            height:         '56px',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            flexShrink:     0,
            textDecoration: 'none',
            borderBottom:   '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <img
            src="/logo-white.png"
            alt="VIMO"
            style={{
              width:  '28px',
              height: '28px',
              objectFit: 'contain',
            }}
          />
        </Link>

        {/* 섹션 아이콘들 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: '2px', width: '100%' }}>
          {visibleSections.map(sec => {
            const Icon      = sec.icon;
            const isSel     = activeSection === sec.key;
            // 전역 best-href로 정해진 단일 섹션만 활성 표시 (크로스섹션 접두 충돌로 인한 이중 점 방지)
            const hasActive = activeSecKey === sec.key;

            return (
              <Fragment key={sec.key}>
                {/* 관리자 섹션은 일반 섹션과 시각적으로 분리 */}
                {sec.adminOnly && (
                  <div style={{ width: '22px', height: '1px', background: 'rgba(255,255,255,0.1)', margin: '5px 0' }} />
                )}
                <button
                  onClick={() => setActiveSection(isSel ? null : sec.key)}
                  data-rail-tip={sec.label}
                  style={{
                    position:       'relative',
                    width:          '36px',
                    height:         '36px',
                    borderRadius:   '10px',
                    border:         'none',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    cursor:         'pointer',
                    background:     isSel ? 'var(--accent-soft)' : 'transparent',
                    color:          isSel ? 'var(--accent)' : hasActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
                    transition:     'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; } }}
                  onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = hasActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)'; } }}
                >
                  <Icon size={19} />
                  {/* 활성 경로 있으면 오렌지 점 */}
                  {hasActive && !isSel && (
                    <span style={{ position: 'absolute', top: '5px', right: '5px', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)' }} />
                  )}
                </button>
              </Fragment>
            );
          })}
        </div>

        {/* 하단 — 시스템 + 로그아웃 + 유저 아바타 */}
        <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.07)', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: '2px' }}>
          {/* 설정 / 휴지통 */}
          {SYSTEM_ITEMS.map(item => {
            const SysIcon = item.icon;
            const sysActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                data-rail-tip={item.label}
                style={{
                  position:       'relative',
                  width:          '36px',
                  height:         '36px',
                  borderRadius:   '10px',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  background:     sysActive ? 'var(--accent-soft)' : 'transparent',
                  color:          sysActive ? 'var(--accent)' : 'rgba(255,255,255,0.35)',
                  transition:     'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { if (!sysActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; } }}
                onMouseLeave={e => { if (!sysActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; } }}
              >
                <SysIcon size={18} />
              </Link>
            );
          })}

          <div style={{ height: '4px' }} />

          <button
            onClick={handleLogout}
            data-rail-tip="로그아웃"
            style={{
              position:       'relative',
              width:          '36px',
              height:         '36px',
              borderRadius:   '10px',
              border:         'none',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              cursor:         'pointer',
              background:     'transparent',
              color:          'rgba(255,255,255,0.25)',
              transition:     'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
          >
            <LogOut size={17} />
          </button>

          <div
            data-rail-tip={userEmail}
            style={{
              position:       'relative',
              width:          '30px',
              height:         '30px',
              borderRadius:   '9px',
              background:     'var(--accent)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       '11px',
              fontWeight:     700,
              color:          '#fff',
              flexShrink:     0,
            }}
          >
            {userInitial}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          슬라이드 패널 — 섹션 선택 시 열림
      ══════════════════════════════════════════ */}
      <AnimatePresence>
        {panelOpen && currentSection && (
          <motion.div
            className="vm-panel"
            key={activeSection}
            initial={{ x: -PANEL_W, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -PANEL_W, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position:           'fixed',
              top:                0,
              left:               RAIL_W,
              bottom:             0,
              width:              PANEL_W,
              zIndex:             45,
              display:            'flex',
              flexDirection:      'column',
              background:         '#ffffff',
              borderRight:        '1px solid var(--color-ink-200)',
              boxShadow:          '2px 0 12px rgba(0,0,0,0.05)',
              willChange:         'transform, opacity',
              backfaceVisibility: 'hidden',
            }}
          >
            {/* 패널 헤더 */}
            <div
              style={{
                height:      '56px',
                flexShrink:  0,
                display:     'flex',
                alignItems:  'flex-end',
                padding:     '0 16px 12px',
                borderBottom:'1px solid #f0ece9',
              }}
            >
              <div>
                <p style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.02em', color: 'var(--accent)', lineHeight: 1 }}>
                  {currentSection.label}
                </p>
              </div>
            </div>

            {/* 패널 네비게이션 — 메일은 폴더 패널(공용함·미분류·카운트)을 슬라이드 패널 안에 렌더 */}
            <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
              {currentSection.key === 'mail' ? <Suspense fallback={null}><MailFolderPanel /></Suspense> : (() => {
                // 섹션 내 가장 긴 매칭 href를 먼저 찾기
                const linkItems = currentSection.items.filter(isLink);
                let bestHref = '';
                for (const li of linkItems) {
                  const candidates = [li.href, ...(li.sub?.map(s => s.href) ?? [])];
                  for (const h of candidates) {
                    if ((pathname === h || pathname.startsWith(h + '/')) && h.length > bestHref.length) {
                      bestHref = h;
                    }
                  }
                }
                return currentSection.items
                  .filter((it) => it.type === 'divider' || it.type === 'heading' || !it.adminOnly || myRole === 'admin')
                  .map((item, idx) => {
                if (item.type === 'divider') {
                  return <div key={`div-${idx}`} style={{ height: '1px', background: '#f0ece9', margin: '6px 10px' }} />;
                }
                if (item.type === 'heading') {
                  return (
                    <div
                      key={`head-${idx}`}
                      style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-ink-400)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: idx === 0 ? '2px 10px 5px' : '12px 10px 5px' }}
                    >
                      {item.label}
                    </div>
                  );
                }

                const Icon     = item.icon;
                const matchesThis = pathname === item.href || pathname.startsWith(item.href + '/') ||
                  (item.sub?.some(s => pathname.startsWith(s.href)) ?? false);
                const isActive = matchesThis && (
                  item.href === bestHref ||
                  (item.sub?.some(s => s.href === bestHref) ?? false)
                );
                const hasSub   = !!item.sub?.length;
                const isExp    = expanded === item.href;

                return (
                  <div key={item.href}>
                    {hasSub ? (
                      <button
                        onClick={() => setExpanded(isExp ? null : item.href)}
                        style={{
                          width:          '100%',
                          display:        'flex',
                          alignItems:     'center',
                          gap:            '9px',
                          padding:        '8px 10px',
                          borderRadius:   '9px',
                          border:         'none',
                          cursor:         'pointer',
                          marginBottom:   '1px',
                          transition:     'background 0.12s, color 0.12s',
                          background:     isActive ? 'var(--accent)' : 'transparent',
                          color:          isActive ? '#ffffff' : 'var(--color-ink-700)',
                        }}
                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = '#f5f3f1'; } }}
                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; } }}
                      >
                        <Icon size={16} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.5 }} />
                        <span style={{ fontSize: '14px', fontWeight: isActive ? 600 : 400, flex: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>{item.label}</span>
                        {item.badge && <PanelBadge label={item.badge} active={isActive} />}
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, opacity: 0.4, transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }}>
                          <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    ) : (
                      <Link
                        href={item.href}
                        style={{
                          display:        'flex',
                          alignItems:     'center',
                          gap:            '9px',
                          padding:        '8px 10px',
                          borderRadius:   '9px',
                          textDecoration: 'none',
                          marginBottom:   '1px',
                          transition:     'background 0.12s, color 0.12s',
                          background:     isActive ? 'var(--accent)' : 'transparent',
                          color:          isActive ? '#ffffff' : 'var(--color-ink-700)',
                        }}
                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = '#f5f3f1'; } }}
                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; } }}
                      >
                        <Icon size={16} style={{ flexShrink: 0, opacity: isActive ? 1 : 0.5 }} />
                        <span style={{ fontSize: '14px', fontWeight: isActive ? 600 : 400, flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
                        {item.badge && <PanelBadge label={item.badge} active={isActive} />}
                      </Link>
                    )}

                    {/* 서브메뉴 */}
                    <AnimatePresence initial={false}>
                      {hasSub && isExp && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{ paddingLeft: '10px', paddingBottom: '2px' }}>
                            {item.sub!.map((s: SubLink) => {
                              const SubIcon   = s.icon;
                              const subActive = pathname.startsWith(s.href);
                              return (
                                <Link
                                  key={s.href}
                                  href={s.href}
                                  style={{
                                    display:        'flex',
                                    alignItems:     'center',
                                    gap:            '8px',
                                    padding:        '7px 10px',
                                    borderRadius:   '8px',
                                    background:     subActive ? 'var(--accent-pale)' : 'transparent',
                                    color:          subActive ? 'var(--accent)' : 'var(--color-ink-500)',
                                    textDecoration: 'none',
                                    fontSize:       '14px',
                                    fontWeight:     subActive ? 600 : 400,
                                    marginBottom:   '1px',
                                    transition:     'background 0.12s, color 0.12s',
                                  }}
                                  onMouseEnter={e => { if (!subActive) { e.currentTarget.style.background = '#f5f3f1'; e.currentTarget.style.color = 'var(--color-ink-700)'; } }}
                                  onMouseLeave={e => { if (!subActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-ink-500)'; } }}
                                >
                                  <SubIcon size={14} style={{ flexShrink: 0, opacity: subActive ? 1 : 0.6 }} />
                                  <span style={{ whiteSpace: 'nowrap' }}>{s.label}</span>
                                  {s.badge && <PanelBadge label={s.badge} active={false} />}
                                </Link>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              });
              })()}
            </nav>

            {/* 패널 하단 — 브랜드 워드마크 */}
            <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: '1px solid #f0ece9' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#d6cec8', letterSpacing: '0.1em' }}>VIMO ERP <span style={{ fontWeight: 500, color: '#e0d9d3' }}>{APP_VERSION}</span> <span style={{ fontWeight: 400, color: '#e0d9d3', marginLeft: '4px' }}>· {APP_LAST_UPDATED}</span></p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════
          상단 헤더
      ══════════════════════════════════════════ */}
      <header
        className="vm-header px-4 sm:px-6"
        style={{
          position:    'fixed',
          top:         0,
          left:        totalW,
          right:       'var(--bibot-pad, 0px)',
          height:      '56px',
          transition:  'right 0.25s cubic-bezier(0.4,0,0.2,1), left 0.22s cubic-bezier(0.22,1,0.36,1)',
          willChange:  'left',
          transform:   'translateZ(0)',
          zIndex:      30,
          display:     'flex',
          alignItems:  'center',
          gap:         '12px',
          background:  '#ffffff',
          borderBottom:'1px solid var(--color-ink-200)',
        }}
      >
        {/* 모바일 햄버거 */}
        <button
          className="vm-hamburger"
          onClick={() => {
            // 현재 페이지가 속한 섹션 자동 선택
            const currentSec = visibleSections.find(s => s.items.filter(isLink).some(i => pathname === i.href || pathname.startsWith(i.href + '/')));
            setMobileSection(currentSec?.key ?? visibleSections[0]?.key ?? null);
            setMobileMenu(v => !v);
          }}
          style={{
            display:        'none',
            alignItems:     'center',
            justifyContent: 'center',
            width:          '40px',
            height:         '40px',
            marginLeft:     '-8px',
            background:      'none',
            border:         'none',
            cursor:         'pointer',
            color:          'var(--color-ink-700)',
            flexShrink:     0,
          }}
        >
          <Menu size={20} />
        </button>

        {(() => {
          // 전역 best-href로 매칭된 섹션을 표기 (크로스섹션 접두 충돌 해소: /partners vs /partners/signups)
          if (matchedNav) {
            const sec = matchedNav.sec;
            const found = { href: matchedNav.href, label: matchedNav.label };
            const isProjectSubpage = found.label === '프로젝트' && pathname !== '/projects';
            return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', minWidth: 0, overflow: 'hidden' }}>
                    <button
                      onClick={() => setActiveSection(activeSection === sec.key ? null : sec.key)}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        color: 'var(--color-ink-400)', fontWeight: 500, fontSize: '14px',
                        transition: 'color 0.15s', flexShrink: 0, whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-400)'; }}
                    >
                      {sec.label}
                    </button>
                    <span style={{ color: '#d6cec8' }}>/</span>
                    {isProjectSubpage ? (
                      <Link href="/projects" style={{ color: 'var(--color-ink-400)', fontWeight: 500, textDecoration: 'none', transition: 'color 0.15s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-400)'; }}
                      >
                        {found.label}
                      </Link>
                    ) : (
                      <span style={{ fontWeight: 600, color: 'var(--color-ink-900)' }}>{found.label}</span>
                    )}
                    {isProjectSubpage && breadcrumbProject && !breadcrumbEpisode && (
                      <>
                        <span style={{ color: '#d6cec8', flexShrink: 0 }}>/</span>
                        <span style={{ fontWeight: 600, color: 'var(--color-ink-900)', maxWidth: 'min(180px, 45vw)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle', minWidth: 0 }}>{breadcrumbProject}</span>
                      </>
                    )}
                    {isProjectSubpage && breadcrumbEpisode && (
                      <>
                        {breadcrumbProject && (
                          <>
                            <span style={{ color: '#d6cec8', flexShrink: 0 }} className="hidden sm:inline">/</span>
                            <Link href={`/projects/${pathname.match(/^\/projects\/([^/]+)/)?.[1]}`} style={{ color: 'var(--color-ink-400)', fontWeight: 500, textDecoration: 'none', transition: 'color 0.15s', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle', minWidth: 0 }} className="hidden sm:inline-block"
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-ink-400)'; }}
                            >
                              {breadcrumbProject}
                            </Link>
                          </>
                        )}
                        <span style={{ color: '#d6cec8', flexShrink: 0 }}>/</span>
                        <span style={{ fontWeight: 600, color: 'var(--color-ink-900)', maxWidth: 'min(220px, 50vw)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle', display: 'inline-block', minWidth: 0 }}>{breadcrumbEpisode}</span>
                      </>
                    )}
                  </div>
                );
          }
          // 시스템 항목 체크 (섹션에 안 잡힌 /settings, /trash 등)
          const sysItem = SYSTEM_ITEMS.find(i => pathname === i.href || pathname.startsWith(i.href + '/'));
          if (sysItem) {
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                <span style={{ color: 'var(--color-ink-400)', fontWeight: 500 }}>시스템</span>
                <span style={{ color: '#d6cec8' }}>/</span>
                <span style={{ fontWeight: 600, color: 'var(--color-ink-900)' }}>{sysItem.label}</span>
              </div>
            );
          }
          return null;
        })()}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <NotificationDropdown />
        </div>
      </header>

      {/* ══════════════════════════════════════════
          모바일 오버레이 메뉴
      ══════════════════════════════════════════ */}
      {/* 모바일 오버레이 메뉴 — 레일 + 패널 */}
      <AnimatePresence>
        {mobileMenu && (
          <>
            {/* 배경 오버레이 */}
            <motion.div
              key="mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileMenu(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.3)' }}
            />
            {/* 메뉴 패널 */}
            <motion.div
              key="mobile-panel"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 61, display: 'flex', width: 'auto', maxWidth: '85vw' }}
            >
              {/* 레일 (아이콘 바) */}
              <div style={{ width: '56px', background: '#18181b', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '8px', paddingBottom: '8px', flexShrink: 0 }}>
                {/* 닫기 */}
                <button
                  onClick={() => setMobileMenu(false)}
                  style={{ width: '40px', height: '40px', borderRadius: '10px', border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: '8px' }}
                >
                  <X size={18} />
                </button>
                {/* 섹션 아이콘 */}
                {visibleSections.map(sec => {
                  const Icon = sec.icon;
                  const isSel = mobileSection === sec.key;
                  const hasActive = activeSecKey === sec.key;
                  return (
                    <button
                      key={sec.key}
                      onClick={() => setMobileSection(isSel ? null : sec.key)}
                      style={{
                        width: '40px', height: '40px', borderRadius: '10px', border: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        background: isSel ? 'var(--accent-soft)' : 'transparent',
                        color: isSel ? 'var(--accent)' : hasActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
                        marginBottom: '4px',
                      }}
                    >
                      <Icon size={18} />
                    </button>
                  );
                })}
                {/* 하단: 시스템 */}
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  {SYSTEM_ITEMS.map(item => {
                    const Icon = item.icon;
                    const active = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenu(false)}
                        style={{
                          width: '40px', height: '40px', borderRadius: '10px', textDecoration: 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: active ? 'var(--accent)' : 'rgba(255,255,255,0.35)',
                        }}
                      >
                        <Icon size={18} />
                      </Link>
                    );
                  })}
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '40px', height: '40px', borderRadius: '10px', border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      background: 'transparent', color: 'rgba(255,255,255,0.35)',
                    }}
                  >
                    <LogOut size={18} />
                  </button>
                </div>
              </div>
              {/* 패널 (선택된 섹션의 메뉴) */}
              <AnimatePresence mode="wait">
                {mobileSection && (() => {
                  const sec = visibleSections.find(s => s.key === mobileSection);
                  if (!sec) return null;
                  return (
                    <motion.div
                      key={mobileSection}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.15 }}
                      style={{ width: PANEL_W, background: '#fff', borderRight: '1px solid #f0ece9', display: 'flex', flexDirection: 'column' }}
                    >
                      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 8px' }}>
                        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink-900)', padding: '4px 8px', marginBottom: '8px' }}>{sec.label}</p>
                        {sec.items.filter((it): it is NavLink | NavHeading => it.type === 'link' || it.type === 'heading').map((item, idx) => {
                          if (item.type === 'heading') {
                            return (
                              <div key={`mh-${idx}`} style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-ink-400)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: idx === 0 ? '2px 8px 5px' : '12px 8px 5px' }}>{item.label}</div>
                            );
                          }
                          const Icon = item.icon;
                          const active = pathname === item.href || pathname.startsWith(item.href + '/');
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setMobileMenu(false)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '10px 10px', borderRadius: '10px', textDecoration: 'none',
                                background: active ? 'var(--accent)' : 'transparent',
                                color: active ? '#fff' : 'var(--color-ink-700)',
                                fontSize: '14px', fontWeight: active ? 600 : 400,
                                marginBottom: '2px',
                              }}
                            >
                              <Icon size={16} style={{ opacity: active ? 1 : 0.6 }} />
                              <span>{item.label}</span>
                              {item.badge && <PanelBadge label={item.badge} active={active} />}
                            </Link>
                          );
                        })}
                      </div>
                      {/* 모바일 메뉴 하단 — 브랜드 워드마크 + 버전 (데스크탑 패널과 동일 형식) */}
                      <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: '1px solid #f0ece9' }}>
                        <p style={{ fontSize: '10px', fontWeight: 700, color: '#d6cec8', letterSpacing: '0.1em' }}>
                          VIMO ERP{' '}
                          <span style={{ fontWeight: 500, color: '#e0d9d3' }}>{APP_VERSION}</span>{' '}
                          <span style={{ fontWeight: 400, color: '#e0d9d3', marginLeft: '4px' }}>· {APP_LAST_UPDATED}</span>
                        </p>
                      </div>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════
          메인 컨텐츠
      ══════════════════════════════════════════ */}
      <main
        className="vm-main"
        style={{
          marginLeft:  totalW,
          marginRight: 'var(--bibot-pad, 0px)',
          marginTop:   '56px',
          minHeight:   'calc(100vh - 56px)',
          transition:  'margin-left 0.22s cubic-bezier(0.22,1,0.36,1), margin-right 0.25s cubic-bezier(0.4,0,0.2,1)',
          willChange:  'margin-left',
          transform:   'translateZ(0)',
        }}
      >
        <div className="p-4 sm:p-6 lg:p-8 pb-24 sm:pb-6 lg:pb-8">
          <DashboardContent>{children}</DashboardContent>
        </div>
      </main>
      <BibotWidget />
      <TutorialOverlay />
      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <UpdateNoticeModal />
    </div>
    </TutorialProvider>
  );
}

function PanelBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span style={{
      fontSize:    '10px',
      fontWeight:  600,
      padding:     '2px 7px',
      borderRadius:'999px',
      whiteSpace:  'nowrap',
      flexShrink:  0,
      background:  active ? 'rgba(255,255,255,0.25)' : 'var(--accent-pale)',
      color:       active ? '#ffffff' : 'var(--accent)',
    }}>
      {label}
    </span>
  );
}
