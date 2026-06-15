/**
 * 공용 상태 배지 (시안8) — 단일 시맨틱 톤 사전으로 전 페이지의 상태칩을 통일.
 * 도메인별 status(진행중/완료/대기/거절/비활성 등)는 각 페이지가 tone+라벨로 매핑해 호출한다.
 *   <StatusBadge tone="ok" dot>완료</StatusBadge>
 *   <StatusBadge tone="brand">진행 중</StatusBadge>
 * tone: neutral(회색)·brand(주황)·ok(초록)·warn(앰버)·danger(빨강)·info(파랑)
 */
import React from 'react';

export type StatusTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info';

const TONE_BG: Record<StatusTone, string> = {
  neutral: 'bg-[#f5f5f4] text-[#57534e]',
  brand:   'bg-orange-50 text-orange-600',
  ok:      'bg-green-50 text-green-600',
  warn:    'bg-amber-50 text-amber-600',
  danger:  'bg-red-50 text-red-600',
  info:    'bg-blue-50 text-blue-700',
};

const TONE_DOT: Record<StatusTone, string> = {
  neutral: 'bg-[#a8a29e]',
  brand:   'bg-orange-500',
  ok:      'bg-green-500',
  warn:    'bg-amber-500',
  danger:  'bg-red-500',
  info:    'bg-blue-500',
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
