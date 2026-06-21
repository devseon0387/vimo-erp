'use client';

import { Loader2 } from 'lucide-react';

/**
 * 공용 로딩 표시 — 스피너 + 라벨. 페이지마다 제각각이던 '불러오는 중'·'로딩 중' 통일.
 * 색은 디자인 토큰(ink)만 사용.
 *   <LoadingState />                      // 섹션/페이지 로딩
 *   <LoadingState size="compact" label="저장 중..." />  // 인라인/작은 영역
 */
export function LoadingState({
  label = '불러오는 중...',
  size = 'default',
  className = '',
}: {
  label?: string;
  size?: 'default' | 'compact';
  className?: string;
}) {
  const compact = size === 'compact';
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2.5 text-ink-500 ${compact ? 'py-8' : 'py-16'} ${className}`}
    >
      <Loader2 className="animate-spin text-ink-400" size={compact ? 18 : 26} />
      <p className={`font-medium ${compact ? 'text-xs' : 'text-[13px]'}`}>{label}</p>
    </div>
  );
}
