'use client';

import { useEffect, useRef, useState, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * 공용 모달 — 접근성(role=dialog/aria-modal/aria-labelledby) + ESC 닫기 + 바디 스크롤 락
 * + 포커스 트랩 + 포커스 복원 + portal. 페이지마다 제각각이던 fixed inset-0 인라인 모달을 통일.
 *   <Modal isOpen={open} onClose={close} title="제목"> ...본문... </Modal>
 *
 * 헤더(제목/닫기)가 필요 없으면 title 생략 + showClose={false}로 빈 셸로 쓸 수 있다(ConfirmDialog가 그 예).
 */
const SIZE: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdrop = true,
  showClose = true,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
  showClose?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // 바디 스크롤 락
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // 최초 포커스 + 포커스 트랩 + 닫힐 때 포커스 복원
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    const prevFocused = document.activeElement as HTMLElement | null;
    const getFocusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
        )
      );
    getFocusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = getFocusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener('keydown', onKey);
    return () => {
      panel.removeEventListener('keydown', onKey);
      prevFocused?.focus?.();
    };
  }, [isOpen]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 modal-overlay"
            onClick={closeOnBackdrop ? onClose : undefined}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`relative bg-white rounded-2xl shadow-xl w-full ${SIZE[size]} max-h-[90vh] overflow-y-auto`}
          >
            {(title || showClose) && (
              <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-3">
                {title ? (
                  <h3 id={titleId} className="text-base font-bold text-ink-900">
                    {title}
                  </h3>
                ) : (
                  <span />
                )}
                {showClose && (
                  <button
                    onClick={onClose}
                    aria-label="닫기"
                    className="text-ink-400 hover:text-ink-600 transition-colors p-1 -mr-1"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
