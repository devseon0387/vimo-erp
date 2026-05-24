import { type ReactNode } from 'react';

interface SectionHeaderProps {
  title: ReactNode;
  kicker?: ReactNode;
  count?: number | string | null;
  icon?: ReactNode;
  right?: ReactNode;
  className?: string;
  variant?: 'section' | 'kicker';
}

/**
 * 섹션 제목. 두 가지 스타일 지원.
 * - variant="section": text-section 기본 (13px bold dark)
 * - variant="kicker": text-kicker (11px uppercase, 라벨성)
 */
export default function SectionHeader({
  title, kicker, count, icon, right, className = '', variant = 'section',
}: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="text-ink-500 shrink-0 inline-flex">{icon}</span>}
        {kicker && <span className="text-kicker">{kicker}</span>}
        <span className={variant === 'kicker' ? 'text-kicker' : 'text-section'}>{title}</span>
        {count !== undefined && count !== null && (
          <span className="text-[11px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded-md font-semibold tabular-nums">{count}</span>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
