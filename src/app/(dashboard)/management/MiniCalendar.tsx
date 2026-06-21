'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  calYear: number;
  calMonth: number;
  setCalYear: (y: number) => void;
  setCalMonth: (m: number) => void;
  now: Date;
  selectedCalendarDay: string | null;
  setSelectedCalendarDay: (d: string | null) => void;
  /** YYYY-MM-DD → 마감 회차 수 (pre-computed Map) */
  deadlineCountByDay: Map<string, number>;
}

/** 미니 달력. 마감 회차 있는 날에 점 표시. */
export default function MiniCalendar({
  calYear, calMonth, setCalYear, setCalMonth,
  now, selectedCalendarDay, setSelectedCalendarDay,
  deadlineCountByDay,
}: Props) {
  const todayStr = useMemo(
    () => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    [now]
  );

  const cells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const out: { key: string; el: React.ReactNode }[] = [];
    for (let i = 0; i < firstDay; i++) {
      out.push({ key: `e${i}`, el: <div key={`e${i}`} /> });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      const dayOfWeek = new Date(calYear, calMonth, d).getDay();
      const deadlineCount = deadlineCountByDay.get(dateStr) ?? 0;
      out.push({
        key: `d${d}`,
        el: (
          <button
            key={d}
            onClick={() => setSelectedCalendarDay(selectedCalendarDay === dateStr ? null : dateStr)}
            className={`relative text-center py-1.5 rounded-lg text-[12px] font-medium transition-all ${
              isToday
                ? 'bg-brand-500 text-white font-bold'
                : selectedCalendarDay === dateStr
                ? 'bg-orange-100 text-orange-700'
                : 'hover:bg-ink-50'
            } ${dayOfWeek === 0 ? 'text-red-400' : dayOfWeek === 6 ? 'text-blue-400' : ''} ${isToday ? '!text-white' : ''}`}
          >
            {d}
            {deadlineCount > 0 && !isToday && (
              <div title={`마감 ${deadlineCount}건`} aria-label={`마감 ${deadlineCount}건`} className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-400" />
            )}
          </button>
        ),
      });
    }
    return out;
  }, [calYear, calMonth, todayStr, selectedCalendarDay, setSelectedCalendarDay, deadlineCountByDay]);

  const prev = () => {
    if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); }
    else setCalMonth(calMonth - 1);
  };
  const next = () => {
    if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); }
    else setCalMonth(calMonth + 1);
  };

  return (
    <div className="bg-white rounded-2xl border border-ink-100 p-4">
      {/* 달력 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prev} aria-label="이전 달" className="p-2 hover:bg-ink-100 rounded-lg transition-colors">
          <ChevronLeft size={14} className="text-[var(--color-ink-400)]" />
        </button>
        <span className="text-[13px] font-bold">{calYear}년 {calMonth + 1}월</span>
        <button onClick={next} aria-label="다음 달" className="p-2 hover:bg-ink-100 rounded-lg transition-colors">
          <ChevronRight size={14} className="text-[var(--color-ink-400)]" />
        </button>
      </div>
      {/* 요일 */}
      <div className="grid grid-cols-7 mb-1">
        {['일','월','화','수','목','금','토'].map(d => (
          <div key={d} className={`text-center text-[10px] font-semibold py-1 ${d === '일' ? 'text-red-400' : d === '토' ? 'text-blue-400' : 'text-[var(--color-ink-400)]'}`}>{d}</div>
        ))}
      </div>
      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-0.5">{cells.map(c => c.el)}</div>
    </div>
  );
}
