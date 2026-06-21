/**
 * 공용 상태 배지 (시안8) — 단일 시맨틱 톤 사전으로 전 페이지의 상태칩을 통일.
 * 색은 디자인 토큰(ink/brand/ok/warn/bad/info)만 사용.
 *   <StatusBadge tone="ok" dot>완료</StatusBadge>
 *   <StatusBadge tone="brand">진행 중</StatusBadge>
 * tone: neutral(회색)·brand(주황)·ok(초록)·warn(앰버)·danger(빨강)·info(파랑)
 */
import React from 'react';

export type StatusTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info';

const TONE_BG: Record<StatusTone, string> = {
  neutral: 'bg-ink-100 text-ink-600',
  brand:   'bg-brand-50 text-brand-600',
  ok:      'bg-ok-50 text-ok-600',
  warn:    'bg-warn-50 text-warn-600',
  danger:  'bg-bad-50 text-bad-600',
  info:    'bg-info-50 text-info-700',
};

const TONE_DOT: Record<StatusTone, string> = {
  neutral: 'bg-ink-400',
  brand:   'bg-brand-500',
  ok:      'bg-ok-500',
  warn:    'bg-warn-500',
  danger:  'bg-bad-500',
  info:    'bg-info-500',
};

export function StatusBadge({
  tone = 'neutral',
  dot = false,
  className = '',
  children,
}: {
  tone?: StatusTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${TONE_BG[tone]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TONE_DOT[tone]}`} />}
      {children}
    </span>
  );
}
