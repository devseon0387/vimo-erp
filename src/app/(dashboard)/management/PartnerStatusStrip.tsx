'use client';

import { useMemo } from 'react';
import type { Partner, Episode } from '@/types';

interface Props {
  partners: Partner[];
  allEpisodes: (Episode & { projectId: string })[];
  thisWeekStart: Date;
  thisWeekEnd: Date;
}

/** 파트너 현황 — 인라인 칩 strip. 이번 주 작업 있는 파트너 먼저, 임원은 후순위. */
export default function PartnerStatusStrip({ partners, allEpisodes, thisWeekStart, thisWeekEnd }: Props) {
  // 파트너별 이번 주 회차 수 + 정렬을 한 번에 계산
  const sortedWithCounts = useMemo(() => {
    const weekStartMs = thisWeekStart.getTime();
    const weekEndMs = thisWeekEnd.getTime();
    const counts = new Map<string, number>();
    for (const ep of allEpisodes) {
      if (!ep.assignee || !ep.dueDate) continue;
      const ms = new Date(ep.dueDate).getTime();
      if (ms < weekStartMs || ms > weekEndMs) continue;
      counts.set(ep.assignee, (counts.get(ep.assignee) ?? 0) + 1);
    }
    return partners
      .filter(p => p.status === 'active')
      .map(p => ({ partner: p, total: counts.get(p.id) ?? 0 }))
      .sort((a, b) => {
        const aWork = a.total > 0 ? 0 : 1;
        const bWork = b.total > 0 ? 0 : 1;
        if (aWork !== bWork) return aWork - bWork;
        const aExec = a.partner.position === 'executive' ? 1 : 0;
        const bExec = b.partner.position === 'executive' ? 1 : 0;
        return aExec - bExec;
      });
  }, [partners, allEpisodes, thisWeekStart, thisWeekEnd]);

  return (
    <div className="bg-white rounded-2xl border border-ink-100 p-4">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[13px] font-bold">파트너 현황</span>
      </div>
      <div className="flex gap-[5px] flex-wrap">
        {sortedWithCounts.map(({ partner: p, total }) => {
          const hasWork = total > 0;
          const isExec = p.position === 'executive';
          return (
            <div key={p.id} className={`flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg text-[11px] max-w-full min-w-0 transition-colors ${
              isExec
                ? hasWork ? 'bg-purple-50' : 'bg-[var(--color-ink-50)]'
                : hasWork ? 'bg-[var(--color-brand-50)]' : 'bg-[var(--color-ink-50)]'
            }`}>
              <div
                title={`${p.name} · ${isExec ? '임원 · ' : ''}${hasWork ? `이번 주 작업 ${total}건` : '이번 주 작업 없음'}`}
                aria-label={`${p.name} · ${isExec ? '임원 · ' : ''}${hasWork ? `이번 주 작업 ${total}건` : '이번 주 작업 없음'}`}
                className={`w-[20px] h-[20px] rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0 ${
                isExec
                  ? hasWork ? 'bg-purple-500 text-white' : 'bg-purple-100 text-purple-400'
                  : hasWork ? 'bg-brand-500 text-white' : 'bg-[var(--color-ink-200)] text-[var(--color-ink-400)]'
              }`}>
                {p.name.charAt(0)}
              </div>
              <span className={`truncate min-w-0 ${hasWork ? 'font-semibold text-[var(--color-ink-900)]' : 'text-[var(--color-ink-400)]'}`}>{p.name}</span>
              <span className={`font-bold ml-0.5 flex-shrink-0 ${
                isExec
                  ? hasWork ? 'text-purple-500' : 'text-[var(--color-ink-300)]'
                  : hasWork ? 'text-brand-500' : 'text-[var(--color-ink-300)]'
              }`}>{total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
