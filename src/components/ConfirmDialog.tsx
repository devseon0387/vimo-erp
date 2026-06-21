'use client';

import { type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

/**
 * 공용 확인 다이얼로그 — 위험·되돌릴 수 없는 액션 전 확인. 네이티브 confirm() 대체.
 * 색은 디자인 토큰(ink/bad/brand)만 사용. Modal(접근성/ESC/스크롤락/포커스트랩) 위에 구축.
 *   const [confirm, setConfirm] = useState<null | (() => void)>(null);
 *   <ConfirmDialog isOpen={!!confirm} onClose={() => setConfirm(null)}
 *     onConfirm={() => { confirm?.(); setConfirm(null); }}
 *     title="입금 완료 처리할까요?" description="..." tone="brand" confirmLabel="입금 완료" />
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  tone = 'danger',
  busy = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'brand';
  busy?: boolean;
}) {
  const isDanger = tone === 'danger';
  const confirmCls = isDanger ? 'bg-bad-500 hover:bg-bad-600' : 'bg-brand-500 hover:bg-brand-600';
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" showClose={false} closeOnBackdrop={!busy}>
      <div className="flex gap-3.5 pt-1">
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isDanger ? 'bg-bad-50' : 'bg-brand-50'}`}
        >
          <AlertTriangle size={20} className={isDanger ? 'text-bad-500' : 'text-brand-500'} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-ink-900">{title}</h3>
          {description != null && description !== '' && (
            <div className="text-[13px] text-ink-500 mt-1 leading-relaxed">{description}</div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button
          onClick={onClose}
          disabled={busy}
          className="px-4 py-2 border border-divider rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-50 transition-colors disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60 ${confirmCls}`}
        >
          {busy ? '처리 중...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
