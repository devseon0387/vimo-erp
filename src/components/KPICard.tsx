import React from 'react';

/**
 * 공용 KPI 카드 — 라벨(+아이콘) + 큰 값 + 보조 텍스트. 정산/상세의 지표 카드를 통일.
 * 시각은 기존 상세뷰 Kpi와 동일(rounded-lg + ink-200 border + 17px 값).
 *   <KPICard label="이번 달 정산" value="₩320만" sub="완료 4건" tone="ok" />
 */
export type KPITone = 'default' | 'ok' | 'bad' | 'warn' | 'brand';

const TONE_COLOR: Record<KPITone, string> = {
  default: '#1c1917',
  ok: '#16a34a',
  bad: '#ef4444',
  warn: '#b45309',
  brand: '#ea580c',
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
    <div className={`rounded-lg border border-[#ede9e6] bg-white p-3 ${className}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-[#a8a29e] flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-[17px] font-bold mt-1 whitespace-nowrap" style={{ color: TONE_COLOR[tone] }}>
        {value}
      </div>
      {sub != null && sub !== '' && (
        <div className="text-[10.5px] mt-0.5 text-[#78716c]">{sub}</div>
      )}
    </div>
  );
}
