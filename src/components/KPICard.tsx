import React from 'react';

/**
 * 공용 KPI 카드 — 라벨(+아이콘) + 큰 값 + 보조 텍스트. 정산/상세의 지표 카드를 통일.
 * 색은 디자인 토큰(ink/ok/bad/warn/brand)만 사용.
 *   <KPICard label="이번 달 정산" value="₩320만" sub="완료 4건" tone="ok" />
 */
export type KPITone = 'default' | 'ok' | 'bad' | 'warn' | 'brand';

const TONE_COLOR: Record<KPITone, string> = {
  default: 'var(--color-ink-900)',
  ok:      'var(--color-ok-600)',
  bad:     'var(--color-bad-500)',
  warn:    'var(--color-warn-700)',
  brand:   'var(--color-brand-600)',
};

export function KPICard({
  label,
  value,
  sub,
  tone = 'default',
  icon,
  className = '',
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: KPITone;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-divider bg-white p-3 ${className}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-400 flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-[17px] font-bold mt-1 whitespace-nowrap" style={{ color: TONE_COLOR[tone] }}>
        {value}
      </div>
      {sub != null && sub !== '' && (
        <div className="text-[10.5px] mt-0.5 text-ink-500">{sub}</div>
      )}
    </div>
  );
}
