'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * 공용 에러 상태 — 데이터 로드 실패 시 표시. '다시 시도' 액션 포함.
 * 페이지마다 복붙되던 "불러오는데 실패했습니다 + 다시 시도" 블록을 통일.
 * 색은 디자인 토큰(ink/bad/brand)만 사용.
 *   <ErrorState onRetry={loadData} />
 *   <ErrorState title="..." description="..." onRetry={fn} size="compact" />
 */
export function ErrorState({
  title = '불러오지 못했습니다',
  description = '데이터를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  onRetry,
  retryLabel = '다시 시도',
  size = 'default',
  className = '',
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  size?: 'default' | 'compact';
  className?: string;
}) {
  const compact = size === 'compact';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex flex-col items-center justify-center px-4 ${compact ? 'py-8' : 'py-14'} ${className}`}
    >
      <div
        className={`bg-bad-50 rounded-full flex items-center justify-center ${compact ? 'w-12 h-12 mb-3' : 'w-16 h-16 mb-5'}`}
      >
        <AlertTriangle size={compact ? 22 : 30} className="text-bad-500" />
      </div>
      <div className="text-center max-w-md">
        <h3 className={`font-semibold text-ink-900 ${compact ? 'text-sm mb-1' : 'text-base mb-1.5'}`}>{title}</h3>
        <p className={`text-ink-500 ${compact ? 'text-xs' : 'text-[13px]'} ${onRetry ? (compact ? 'mb-4' : 'mb-5') : ''}`}>
          {description}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors text-sm font-medium"
        >
          <RefreshCw size={15} />
          {retryLabel}
        </button>
      )}
    </motion.div>
  );
}
