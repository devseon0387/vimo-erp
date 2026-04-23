'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Search, Bell, Sparkles, FolderOpen, Briefcase, Users, HelpCircle, MessageSquarePlus, FilePlus, Bot } from 'lucide-react';

interface FABAction {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  bg: string;
  text: string;
  iconColor: string;
}

// 튜토리얼이 있는 페이지인지 판별
function hasTutorial(pathname: string): boolean {
  if (['/management', '/', '/projects', '/clients', '/partners'].includes(pathname)) return true;
  // /projects/[id]/episodes/[episodeId]
  if (/^\/projects\/[^/]+\/episodes\/[^/]+$/.test(pathname)) return true;
  // /projects/[id]
  if (/^\/projects\/[^/]+$/.test(pathname)) return true;
  return false;
}

function getPageActions(pathname: string): FABAction[] {
  const common: FABAction[] = [
    {
      label: '비봇',
      icon: Bot,
      onClick: () => window.dispatchEvent(new CustomEvent('fab:action', { detail: 'bibot' })),
      bg: 'bg-gradient-to-r from-orange-500 to-pink-500',
      text: 'text-white',
      iconColor: 'text-white',
    },
    {
      label: '개선사항',
      icon: MessageSquarePlus,
      onClick: () => window.dispatchEvent(new CustomEvent('fab:action', { detail: 'feedback' })),
      bg: 'bg-white',
      text: 'text-gray-700',
      iconColor: 'text-orange-500',
    },
    {
      label: '검색',
      icon: Search,
      onClick: () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
      },
      bg: 'bg-white',
      text: 'text-gray-700',
      iconColor: 'text-orange-500',
    },
    {
      label: '알림',
      icon: Bell,
      onClick: () => {
        const bellBtn = document.querySelector('[aria-label="알림"]') as HTMLButtonElement;
        bellBtn?.click();
      },
      bg: 'bg-white',
      text: 'text-gray-700',
      iconColor: 'text-orange-500',
    },
  ];

  // 튜토리얼이 있는 페이지에서만 "다시 보기" 표시
  if (hasTutorial(pathname)) {
    common.push({
      label: '튜토리얼 다시 보기',
      icon: HelpCircle,
      onClick: () => window.dispatchEvent(new CustomEvent('fab:action', { detail: 'replay-tutorial' })),
      bg: 'bg-white',
      text: 'text-gray-700',
      iconColor: 'text-orange-500',
    });
  }

  if (pathname === '/management' || pathname === '/') {
    return [
      ...common,
      {
        label: '새 프로젝트 시작',
        icon: Sparkles,
        onClick: () => window.dispatchEvent(new CustomEvent('fab:action', { detail: 'new-project' })),
        bg: 'bg-gradient-to-r from-orange-500 to-orange-600',
        text: 'text-white',
        iconColor: 'text-white',
      },
    ];
  }

  if (pathname === '/projects') {
    return [
      ...common,
      {
        label: '새 프로젝트',
        icon: FolderOpen,
        onClick: () => window.dispatchEvent(new CustomEvent('fab:action', { detail: 'new-project' })),
        bg: 'bg-gradient-to-r from-orange-500 to-orange-600',
        text: 'text-white',
        iconColor: 'text-white',
      },
    ];
  }

  if (pathname === '/clients') {
    return [
      ...common,
      {
        label: '새 클라이언트',
        icon: Briefcase,
        onClick: () => window.dispatchEvent(new CustomEvent('fab:action', { detail: 'new-client' })),
        bg: 'bg-gradient-to-r from-orange-500 to-orange-600',
        text: 'text-white',
        iconColor: 'text-white',
      },
    ];
  }

  // /projects/[id] 프로젝트 상세 페이지 — 새 회차
  if (/^\/projects\/[^/]+$/.test(pathname)) {
    return [
      ...common,
      {
        label: '새 회차',
        icon: FilePlus,
        onClick: () => window.dispatchEvent(new CustomEvent('fab:action', { detail: 'new-episode' })),
        bg: 'bg-gradient-to-r from-orange-500 to-orange-600',
        text: 'text-white',
        iconColor: 'text-white',
      },
    ];
  }

  if (pathname === '/partners') {
    return [
      ...common,
      {
        label: '새 파트너',
        icon: Users,
        onClick: () => window.dispatchEvent(new CustomEvent('fab:action', { detail: 'new-partner' })),
        bg: 'bg-gradient-to-r from-orange-500 to-orange-600',
        text: 'text-white',
        iconColor: 'text-white',
      },
    ];
  }

  return common;
}

// 정산 상세 페이지에서는 FAB 숨김
function shouldHideFAB(pathname: string): boolean {
  if (/^\/finance\/partner-settlement\/[^/]+/.test(pathname)) return true;
  if (/^\/finance\/manager-settlement\/[^/]+/.test(pathname)) return true;
  return false;
}

export default function GlobalFAB() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  if (shouldHideFAB(pathname)) return null;

  const actions = getPageActions(pathname);

  return (
    <div
      className="fixed bottom-6 sm:bottom-8 z-40 flex flex-col items-end gap-3"
      style={{
        right: 'calc(1.5rem + var(--bibot-pad, 0px))',
        transition: 'right 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* 배경 오버레이 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-gray-900/30 backdrop-blur-[2px]"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 액션 메뉴 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="relative flex flex-col gap-2"
          >
            {actions.map((item, i) => (
              <motion.button
                key={item.label}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => {
                  setIsOpen(false);
                  item.onClick();
                }}
                className={`${item.bg} ${item.text} pl-4 pr-5 py-3 rounded-2xl shadow-lg hover:shadow-xl transition-shadow flex items-center gap-3 font-semibold text-sm whitespace-nowrap active:scale-[0.97]`}
              >
                <item.icon size={18} className={item.iconColor} />
                {item.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 메인 FAB 버튼 */}
      <motion.button
        onClick={() => setIsOpen(v => !v)}
        animate={{ rotate: isOpen ? 45 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        data-tour="tour-fab"
        className="w-14 h-14 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-2xl hover:from-orange-600 hover:to-orange-700 transition-colors active:scale-[0.93] shadow-xl shadow-orange-500/30 flex items-center justify-center"
      >
        <Plus size={24} strokeWidth={2.5} />
      </motion.button>
    </div>
  );
}
