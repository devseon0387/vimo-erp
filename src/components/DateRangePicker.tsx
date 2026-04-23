'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function toStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDisplay(value: string): string {
  if (!value) return '';
  if (value === 'tbd') return '미정';
  const [y, m, d] = value.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return '';
  return `${y}년 ${m}월 ${d}일`;
}

function shiftMonth(year: number, month: number, delta: number) {
  let m = month + delta;
  let y = year;
  while (m > 11) { m -= 12; y++; }
  while (m < 0)  { m += 12; y--; }
  return { year: y, month: m };
}

function MonthGrid({
  year, month,
  startDate, endDate, hoverDate,
  selecting,
  rippleDate,
  onDayClick,
  onDayHover,
}: {
  year: number; month: number;
  startDate: string; endDate: string; hoverDate: string;
  selecting: 'start' | 'end';
  rippleDate: string;
  onDayClick: (s: string) => void;
  onDayHover: (s: string) => void;
}) {
  const today = new Date();
  const todayStr = toStr(today.getFullYear(), today.getMonth(), today.getDate());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const effectiveEnd = endDate === 'tbd' ? '' : endDate;
  let rangeMin = startDate;
  let rangeMax = effectiveEnd;
  if (selecting === 'end' && startDate && hoverDate) {
    rangeMin = startDate < hoverDate ? startDate : hoverDate;
    rangeMax = startDate < hoverDate ? hoverDate : startDate;
  }
  const isSingleDay = rangeMin && rangeMin === rangeMax;

  return (
    <div className="flex-1 min-w-0">
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-xs font-semibold py-1.5 ${
              i === 0 ? 'text-red-400' : i === 6 ? 'text-orange-400' : 'text-gray-400'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} className="h-9" />;

          const str = toStr(year, month, day);
          const colIdx = idx % 7;

          const isStart     = str === rangeMin && !isSingleDay;
          const isEnd       = str === rangeMax && !isSingleDay;
          const isStartOnly = str === startDate && !(str === effectiveEnd && effectiveEnd);
          const isEndOnly   = str === effectiveEnd && effectiveEnd && str !== startDate;
          const inRange     = rangeMin && rangeMax && str > rangeMin && str < rangeMax;
          const isToday     = str === todayStr;
          const isHighlighted = isStart || isEnd || isStartOnly || isEndOnly;
          const isEndHighlight = isEnd || isEndOnly;

          return (
            <div key={str} className="relative h-9 flex items-center justify-center">
              {inRange  && <div className="absolute inset-0 bg-amber-50" />}
              {isStart  && <div className="absolute inset-y-0 left-1/2 right-0 bg-amber-50" />}
              {isEnd    && <div className="absolute inset-y-0 left-0 right-1/2 bg-amber-50" />}

              {/* 클릭 ripple */}
              {str === rippleDate && (
                <motion.div
                  className="absolute z-20 w-8 h-8 rounded-full bg-orange-400 pointer-events-none"
                  initial={{ scale: 1, opacity: 0.65 }}
                  animate={{ scale: 3, opacity: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              )}

              <motion.button
                type="button"
                onClick={() => onDayClick(str)}
                onMouseEnter={() => onDayHover(str)}
                whileTap={{ scale: 0.82 }}
                className={`
                  relative z-10 w-8 h-8 flex items-center justify-center rounded-full
                  text-sm font-medium transition-colors
                  ${isHighlighted
                    ? isEndHighlight
                      ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                      : 'bg-orange-500 text-white shadow-md shadow-orange-200'
                    : isToday
                    ? 'bg-orange-50 text-orange-600 font-bold'
                    : colIdx === 0
                    ? 'text-red-400 hover:bg-red-50'
                    : colIdx === 6
                    ? 'text-orange-400 hover:bg-orange-50'
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                {day}
                {isToday && !isHighlighted && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-400" />
                )}
              </motion.button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  compact?: boolean;
}

export default function DateRangePicker({
  startDate, endDate, onStartChange, onEndChange, compact,
}: DateRangePickerProps) {
  const today = new Date();
  const todayStr = toStr(today.getFullYear(), today.getMonth(), today.getDate());

  const [isOpen, setIsOpen] = useState(false);
  const [selecting, setSelecting] = useState<'start' | 'end'>('start');
  const [hoverDate, setHoverDate] = useState('');
  const [mounted, setMounted] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rippleDate, setRippleDate] = useState('');
  const rippleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initMonth = startDate && startDate !== 'tbd' ? new Date(startDate + 'T00:00:00') : today;
  const safeInit = isNaN(initMonth.getTime()) ? today : initMonth;
  const [leftYear, setLeftYear]   = useState(safeInit.getFullYear());
  const [leftMonth, setLeftMonth] = useState(safeInit.getMonth());
  const right = shiftMonth(leftYear, leftMonth, 1);

  useEffect(() => { setMounted(true); }, []);

  const handleOpen = (mode: 'start' | 'end') => {
    setSelecting(mode === 'end' && startDate ? 'end' : 'start');
    const parsed = startDate && startDate !== 'tbd' ? new Date(startDate + 'T00:00:00') : today;
    const ref = isNaN(parsed.getTime()) ? today : parsed;
    setLeftYear(ref.getFullYear());
    setLeftMonth(ref.getMonth());
    setIsOpen(true);
  };

  const handleDayClick = (str: string) => {
    if (selecting === 'start') {
      onStartChange(str);
      if (endDate && str > endDate) onEndChange('');
      setSelecting('end');
      // ripple 애니메이션
      setRippleDate(str);
      if (rippleTimer.current) clearTimeout(rippleTimer.current);
      rippleTimer.current = setTimeout(() => setRippleDate(''), 550);
      // 화살표·탭 전환 효과
      setTransitioning(true);
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
      transitionTimer.current = setTimeout(() => setTransitioning(false), 1000);
    } else {
      if (str < startDate) {
        onStartChange(str);
        onEndChange(startDate);
      } else {
        onEndChange(str);
      }
      setIsOpen(false);
      setHoverDate('');
    }
  };

  const monthLabel = (y: number, m: number) => `${y}년 ${m + 1}월`;

  const pickerModal = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 반투명 backdrop */}
          <motion.div
            className="fixed inset-0 z-[10000] bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => { setIsOpen(false); setHoverDate(''); }}
          />

          {/* 달력 패널 */}
          <motion.div
            className="fixed z-[10001] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                       bg-white rounded-2xl shadow-2xl border border-divider p-6 w-[580px] max-w-[95vw]"
            initial={{ opacity: 0, scale: 0.93, y: 12 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.93, y: 12 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            onMouseLeave={() => setHoverDate('')}
          >
            {/* 헤더 */}
            <div className="mb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* 시작일 탭 */}
                  <button
                    type="button"
                    onClick={() => setSelecting('start')}
                    className={`text-sm font-semibold px-3 py-1.5 rounded-full transition-colors ${
                      selecting === 'start' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-400 hover:bg-orange-100'
                    }`}
                  >
                    시작일 {startDate ? formatDisplay(startDate) : '선택'}
                  </button>

                  {/* 화살표 */}
                  <motion.span
                    className="text-gray-400 self-center text-base select-none"
                    animate={transitioning ? { x: [0, 5, 0, 5, 0], color: ['#9ca3af', '#f97316', '#9ca3af'] } : {}}
                    transition={{ duration: 0.45, ease: 'easeInOut' }}
                  >
                    →
                  </motion.span>

                  {/* 마감일 탭 */}
                  <div className="relative">
                    <motion.button
                      type="button"
                      onClick={() => startDate && setSelecting('end')}
                      animate={transitioning ? {
                        boxShadow: [
                          '0 0 0 0px rgba(249,115,22,0)',
                          '0 0 0 5px rgba(249,115,22,0.35)',
                          '0 0 0 0px rgba(249,115,22,0)',
                        ],
                      } : {}}
                      transition={{ duration: 0.55, delay: 0.1 }}
                      className={`text-sm font-semibold px-3 py-1.5 rounded-full transition-colors ${
                        selecting === 'end' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-400 hover:bg-orange-100'
                      } ${!startDate ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      마감일 {endDate ? formatDisplay(endDate) : '선택'}
                    </motion.button>
                  </div>

                  {/* 미정 버튼 */}
                  <AnimatePresence>
                    {selecting === 'end' && startDate && (
                      <motion.button
                        type="button"
                        onClick={() => { onEndChange('tbd'); setIsOpen(false); setHoverDate(''); }}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={{ duration: 0.15 }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full border border-orange-200 text-orange-500 hover:bg-orange-50 transition-colors"
                      >
                        미정
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  type="button"
                  onClick={() => { setIsOpen(false); setHoverDate(''); }}
                  className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={16} className="text-gray-400" />
                </button>
              </div>

            </div>

            {/* 두 달력 */}
            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() => { const m = shiftMonth(leftYear, leftMonth, -1); setLeftYear(m.year); setLeftMonth(m.month); }}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronLeft size={16} className="text-gray-600" />
                  </button>
                  <span className="text-sm font-semibold text-gray-900">{monthLabel(leftYear, leftMonth)}</span>
                  <div className="w-7" />
                </div>
                <MonthGrid
                  year={leftYear} month={leftMonth}
                  startDate={startDate} endDate={endDate} hoverDate={hoverDate}
                  selecting={selecting}
                  rippleDate={rippleDate}
                  onDayClick={handleDayClick}
                  onDayHover={setHoverDate}
                />
              </div>

              <div className="w-px bg-gray-100 self-stretch" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-7" />
                  <span className="text-sm font-semibold text-gray-900">{monthLabel(right.year, right.month)}</span>
                  <button
                    type="button"
                    onClick={() => { const m = shiftMonth(leftYear, leftMonth, 1); setLeftYear(m.year); setLeftMonth(m.month); }}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronRight size={16} className="text-gray-600" />
                  </button>
                </div>
                <MonthGrid
                  year={right.year} month={right.month}
                  startDate={startDate} endDate={endDate} hoverDate={hoverDate}
                  selecting={selecting}
                  rippleDate={rippleDate}
                  onDayClick={handleDayClick}
                  onDayHover={setHoverDate}
                />
              </div>
            </div>

            {/* 하단 */}
            <div className="mt-4 pt-3 border-t border-divider flex items-center justify-between">
              <button
                type="button"
                onClick={() => { onStartChange(''); onEndChange(''); setSelecting('start'); }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                초기화
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selecting === 'start') { onStartChange(todayStr); setSelecting('end'); }
                  else { onEndChange(todayStr); setIsOpen(false); }
                }}
                className="text-xs text-orange-500 hover:text-orange-600 font-medium"
              >
                오늘 선택
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (compact) {
    const formatShort = (v: string) => {
      if (!v) return '';
      if (v === 'tbd') return '미정';
      const [y, m, d] = v.split('-').map(Number);
      if (isNaN(m) || isNaN(d)) return '';
      return `${String(m).padStart(2, '\u2007')}/${String(d).padStart(2, '0')}`;
    };

    return (
      <div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          <button
            type="button"
            onClick={() => handleOpen('start')}
            className={`px-2 py-2 border rounded-md text-left flex items-center gap-1 transition-all text-xs ${
              isOpen && selecting === 'start'
                ? 'border-gray-400 ring-1 ring-gray-200 bg-gray-50'
                : 'border-divider hover:border-gray-300 bg-white'
            }`}
          >
            <Calendar size={12} className={`flex-shrink-0 ${formatShort(startDate) ? 'text-orange-500' : 'text-gray-400'}`} />
            <span className={`truncate tabular-nums ${formatShort(startDate) ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
              {formatShort(startDate) || '시작일'}
            </span>
          </button>
          <span className="text-gray-300 text-xs">→</span>
          <button
            type="button"
            onClick={() => handleOpen('end')}
            className={`px-2 py-2 border rounded-md text-left flex items-center gap-1 transition-all text-xs ${
              isOpen && selecting === 'end'
                ? 'border-gray-400 ring-1 ring-gray-200 bg-gray-50'
                : 'border-divider hover:border-gray-300 bg-white'
            }`}
          >
            <Calendar size={12} className={`flex-shrink-0 ${endDate === 'tbd' ? 'text-orange-400' : endDate ? 'text-orange-500' : 'text-gray-400'}`} />
            <span className={`truncate tabular-nums ${endDate === 'tbd' ? 'text-orange-500 font-medium' : endDate ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
              {formatShort(endDate) || '마감일'}
            </span>
          </button>
        </div>
        {mounted && createPortal(pickerModal, document.body)}
      </div>
    );
  }

  return (
    <div>
      {/* 트리거 버튼 */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleOpen('start')}
          className={`h-12 px-4 border-2 rounded-xl text-left flex items-center gap-2 transition-all ${
            isOpen && selecting === 'start'
              ? 'border-gray-400 ring-2 ring-gray-100'
              : 'border-divider hover:border-gray-300'
          }`}
        >
          <Calendar size={16} className={startDate ? 'text-orange-500' : 'text-gray-400'} />
          <span className={startDate ? 'text-gray-900 font-medium text-sm' : 'text-gray-400 text-sm'}>
            {startDate ? formatDisplay(startDate) : '시작일'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleOpen('end')}
          className={`h-12 px-4 border-2 rounded-xl text-left flex items-center gap-2 transition-all ${
            isOpen && selecting === 'end'
              ? 'border-gray-400 ring-2 ring-gray-100'
              : 'border-divider hover:border-gray-300'
          }`}
        >
          <Calendar size={16} className={endDate === 'tbd' ? 'text-orange-400' : endDate ? 'text-orange-500' : 'text-gray-400'} />
          <span className={endDate === 'tbd' ? 'text-orange-500 font-medium text-sm' : endDate ? 'text-orange-600 font-medium text-sm' : 'text-gray-400 text-sm'}>
            {formatDisplay(endDate) || '예정 종료일 (선택)'}
          </span>
        </button>
      </div>

      {mounted && createPortal(pickerModal, document.body)}
    </div>
  );
}
