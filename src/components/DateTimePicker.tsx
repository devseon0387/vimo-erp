'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// ── TimeWheel ──────────────────────────────────────────────────────────────
function TimeWheel({
  value,
  max,
  step = 1,
  label,
  onChange,
}: {
  value: number;
  max: number;
  step?: number;
  label: string;
  onChange: (v: number) => void;
}) {
  const range = max + 1;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // drag state
  const pressed = useRef(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(value);
  const totalMoved = useRef(0);
  const latestValue = useRef(value);
  latestValue.current = value;

  // animation direction
  const [animDir, setAnimDir] = useState(0); // +1 up, -1 down

  const display = String(value).padStart(2, '0');
  const PX_PER_STEP = 28;

  const applyDelta = useCallback((dy: number) => {
    const steps = Math.round(dy / PX_PER_STEP);
    let next = ((startVal.current - steps * step) % range + range) % range;
    if (step > 1) next = Math.round(next / step) * step % range;
    if (next !== latestValue.current) {
      setAnimDir(next > latestValue.current ? -1 : 1);
      onChange(next);
    }
  }, [range, step, onChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pressed.current = true;
    dragging.current = false;
    totalMoved.current = 0;
    startY.current = e.clientY;
    startVal.current = latestValue.current;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pressed.current) return;
    const dy = e.clientY - startY.current;
    totalMoved.current = Math.abs(dy);
    if (totalMoved.current > 4) {
      dragging.current = true;
      applyDelta(dy);
    }
  };

  const onPointerUp = () => {
    pressed.current = false;
    if (!dragging.current) {
      // click → enter edit mode
      setDraft(display);
      setEditing(true);
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 10);
    }
    dragging.current = false;
  };

  const commitEdit = () => {
    const n = parseInt(draft, 10);
    if (!isNaN(n)) {
      let clamped = Math.max(0, Math.min(max, n));
      if (step > 1) clamped = Math.round(clamped / step) * step;
      onChange(clamped);
    }
    setEditing(false);
  };

  const prevValue = ((value - step) % range + range) % range;
  const nextValue = (value + step) % range;

  return (
    <div className="flex flex-col items-center gap-1.5 select-none">
      {/* 위 미리보기 */}
      <span className="text-sm text-gray-300 font-semibold tabular-nums h-5 flex items-center">
        {String(prevValue).padStart(2, '0')}
      </span>

      {/* 메인 숫자 박스 */}
      <div
        className="relative w-[72px] h-16 bg-gradient-to-b from-orange-50 to-orange-50/60 rounded-2xl border-2 border-orange-200 flex items-center justify-center cursor-ns-resize overflow-hidden"
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* 상하 그라데이션 페이드 */}
        <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-white/60 to-transparent pointer-events-none z-10" />
        <div className="absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-white/60 to-transparent pointer-events-none z-10" />

        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            className="w-full text-center text-2xl font-bold text-orange-600 bg-transparent focus:outline-none tabular-nums"
            maxLength={2}
          />
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={value}
              initial={{ y: animDir * 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: animDir * -20, opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="text-2xl font-bold text-orange-600 tabular-nums"
            >
              {display}
            </motion.span>
          </AnimatePresence>
        )}
      </div>

      {/* 아래 미리보기 */}
      <span className="text-sm text-gray-300 font-semibold tabular-nums h-5 flex items-center">
        {String(nextValue).padStart(2, '0')}
      </span>

      <span className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase">{label}</span>
    </div>
  );
}
// ──────────────────────────────────────────────────────────────────────────

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDisplay(dateStr: string, timeStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = `${y}년 ${m}월 ${d}일`;
  return timeStr ? `${base} ${timeStr}` : base;
}

function shiftMonth(year: number, month: number, delta: number) {
  let m = month + delta;
  let y = year;
  while (m > 11) { m -= 12; y++; }
  while (m < 0) { m += 12; y--; }
  return { year: y, month: m };
}

export type RepeatType = 'none' | 'daily' | 'weekly' | 'days';

const REPEAT_LABELS: Record<RepeatType, string> = {
  none: '없음',
  daily: '매일',
  weekly: '매주',
  days: '요일 선택',
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

interface DateTimePickerProps {
  value: string; // "YYYY-MM-DDTHH:MM" or ""
  onChange: (v: string) => void;
  repeat?: RepeatType;
  repeatDays?: number[]; // 0=일, 1=월, ..., 6=토
  onRepeatChange?: (r: RepeatType) => void;
  onRepeatDaysChange?: (days: number[]) => void;
  children: React.ReactNode; // 트리거 버튼
}

export default function DateTimePicker({
  value, onChange,
  repeat = 'none', repeatDays = [],
  onRepeatChange, onRepeatDaysChange,
  children,
}: DateTimePickerProps) {
  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // value에서 날짜/시간 분리
  const [selectedDate, setSelectedDate] = useState(() => value ? value.split('T')[0] : '');
  const [selectedTime, setSelectedTime] = useState(() => value ? (value.split('T')[1] ?? '') : '');
  const [hoverDate, setHoverDate] = useState('');

  const initDate = selectedDate ? new Date(selectedDate + 'T00:00:00') : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  useEffect(() => { setMounted(true); }, []);

  // value 외부 변경 반영
  useEffect(() => {
    setSelectedDate(value ? value.split('T')[0] : '');
    setSelectedTime(value ? (value.split('T')[1] ?? '') : '');
  }, [value]);

  const handleOpen = () => {
    const ref = selectedDate ? new Date(selectedDate + 'T00:00:00') : today;
    setViewYear(ref.getFullYear());
    setViewMonth(ref.getMonth());
    setIsOpen(true);
  };

  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    if (!selectedTime) setSelectedTime('09:00');
  };

  const handleTimeChange = (time: string) => {
    setSelectedTime(time);
  };

  const handleSave = () => {
    if (selectedDate) {
      onChange(`${selectedDate}T${selectedTime || '09:00'}`);
    } else if (repeat && repeat !== 'none' && selectedTime) {
      // 반복 설정 + 시간만 있는 경우 → 오늘 날짜를 기준으로 저장
      onChange(`${todayStr}T${selectedTime}`);
    } else {
      // 반복 설정만 있고 날짜/시간 없음 → 빈 값 (repeatType만 저장됨)
      onChange('');
    }
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedDate('');
    setSelectedTime('');
    onChange('');
    if (onRepeatChange) onRepeatChange('none');
    if (onRepeatDaysChange) onRepeatDaysChange([]);
    setIsOpen(false);
  };

  // 달력 그리드
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = `${viewYear}년 ${viewMonth + 1}월`;

  const picker = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px]"
            style={{ zIndex: 10000 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setIsOpen(false)}
          />
          <motion.div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl border border-divider overflow-hidden"
            style={{ zIndex: 10001, width: '580px' }}
            initial={{ opacity: 0, scale: 0.93, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 12 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-divider">
              <div>
                <span className="text-sm font-bold text-gray-900">알림 설정</span>
                {selectedDate ? (
                  <span className="ml-2 text-xs text-orange-500 font-medium">
                    {selectedDate.split('-').slice(1).join('월 ')}일 {selectedTime || '09:00'}
                  </span>
                ) : repeat && repeat !== 'none' ? (
                  <span className="ml-2 text-xs text-orange-500 font-medium">
                    {REPEAT_LABELS[repeat]} 반복{selectedTime ? ` · ${selectedTime}` : ''}
                  </span>
                ) : null}
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                <X size={15} className="text-gray-400" />
              </button>
            </div>

            {/* 2컬럼 본문 */}
            <div className="flex">

              {/* 왼쪽: 달력 */}
              <div className="flex-1 px-5 py-4 border-r border-divider">
                {/* 월 네비게이션 */}
                <div className="flex items-center justify-between mb-3">
                  <button type="button"
                    onClick={() => { const m = shiftMonth(viewYear, viewMonth, -1); setViewYear(m.year); setViewMonth(m.month); }}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                    <ChevronLeft size={15} className="text-gray-600" />
                  </button>
                  <span className="text-sm font-semibold text-gray-900">{monthLabel}</span>
                  <button type="button"
                    onClick={() => { const m = shiftMonth(viewYear, viewMonth, 1); setViewYear(m.year); setViewMonth(m.month); }}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                    <ChevronRight size={15} className="text-gray-600" />
                  </button>
                </div>

                {/* 요일 헤더 */}
                <div className="grid grid-cols-7 mb-1">
                  {DAYS.map((d, i) => (
                    <div key={d} className={`text-center text-xs font-semibold py-1 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-orange-400' : 'text-gray-400'}`}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* 날짜 그리드 */}
                <div className="grid grid-cols-7">
                  {cells.map((day, idx) => {
                    if (day === null) return <div key={`e-${idx}`} className="h-9" />;
                    const str = toDateStr(viewYear, viewMonth, day);
                    const colIdx = idx % 7;
                    const isSelected = str === selectedDate;
                    const isToday = str === todayStr;
                    const isHover = str === hoverDate;
                    return (
                      <div key={str} className="flex items-center justify-center h-9">
                        <motion.button
                          type="button"
                          onClick={() => handleDayClick(str)}
                          onMouseEnter={() => setHoverDate(str)}
                          onMouseLeave={() => setHoverDate('')}
                          whileTap={{ scale: 0.82 }}
                          className={`relative w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-colors
                            ${isSelected
                              ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                              : isToday
                              ? 'bg-orange-50 text-orange-600 font-bold'
                              : isHover
                              ? 'bg-gray-100'
                              : colIdx === 0
                              ? 'text-red-400 hover:bg-red-50'
                              : colIdx === 6
                              ? 'text-orange-400 hover:bg-orange-50'
                              : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                          {day}
                          {isToday && !isSelected && (
                            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-400" />
                          )}
                        </motion.button>
                      </div>
                    );
                  })}
                </div>

                {/* 오늘 / 초기화 */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-divider">
                  <button type="button" onClick={handleClear}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                    초기화
                  </button>
                  <button type="button"
                    onClick={() => handleDayClick(todayStr)}
                    className="text-xs text-orange-500 hover:text-orange-600 font-medium transition-colors">
                    오늘
                  </button>
                </div>
              </div>

              {/* 오른쪽: 시간 + 반복 */}
              <div className="w-56 px-4 py-4 flex flex-col gap-5">

                {/* 시간 휠 */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">알림 시간</p>
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <TimeWheel
                      value={parseInt(selectedTime.split(':')[0] || '9')}
                      max={23} step={1} label="시"
                      onChange={h => handleTimeChange(`${String(h).padStart(2, '0')}:${selectedTime.split(':')[1] || '00'}`)}
                    />
                    <span className="text-2xl font-bold text-orange-200 mb-6">:</span>
                    <TimeWheel
                      value={parseInt(selectedTime.split(':')[1] || '0')}
                      max={59} step={1} label="분"
                      onChange={m => handleTimeChange(`${selectedTime.split(':')[0] || '09'}:${String(m).padStart(2, '0')}`)}
                    />
                  </div>

                </div>

                {/* 반복 알림 */}
                {onRepeatChange && (
                  <div className="border-t border-divider pt-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">반복 알림</p>

                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                      {(Object.keys(REPEAT_LABELS) as RepeatType[]).map(type => (
                        <motion.button
                          key={type}
                          type="button"
                          whileTap={{ scale: 0.92 }}
                          onClick={() => {
                            onRepeatChange(type);
                            if (type !== 'days' && onRepeatDaysChange) onRepeatDaysChange([]);
                          }}
                          className={`py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                            repeat === type
                              ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                              : 'bg-gray-50 text-gray-500 hover:bg-orange-50 hover:text-orange-600 border border-divider'
                          }`}
                        >
                          {REPEAT_LABELS[type]}
                        </motion.button>
                      ))}
                    </div>

                    {/* 요일 선택 */}
                    <AnimatePresence>
                      {repeat === 'days' && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <div className="flex gap-1 pt-1">
                            {DAY_LABELS.map((label, idx) => {
                              const isDaySelected = repeatDays.includes(idx);
                              const isSun = idx === 0;
                              const isSat = idx === 6;
                              return (
                                <motion.button
                                  key={idx}
                                  type="button"
                                  whileTap={{ scale: 0.88 }}
                                  onClick={() => {
                                    if (!onRepeatDaysChange) return;
                                    onRepeatDaysChange(
                                      isDaySelected
                                        ? repeatDays.filter(d => d !== idx)
                                        : [...repeatDays, idx].sort()
                                    );
                                  }}
                                  className={`flex-1 h-8 rounded-lg text-[11px] font-bold transition-all ${
                                    isDaySelected
                                      ? isSun ? 'bg-red-500 text-white' : isSat ? 'bg-orange-500 text-white' : 'bg-amber-500 text-white'
                                      : isSun ? 'bg-red-50 text-red-400 border border-red-100' : isSat ? 'bg-orange-50 text-orange-400 border border-orange-100' : 'bg-gray-50 text-gray-500 border border-divider'
                                  }`}
                                >
                                  {label}
                                </motion.button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>

            {/* 저장 버튼 */}
            <div className="px-6 py-4 border-t border-divider flex gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={handleSave}
                disabled={!selectedDate && (!repeat || repeat === 'none')}
                className="flex-2 px-8 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {selectedDate
                  ? `${selectedDate.slice(5).replace('-', '월 ')}일 ${selectedTime || '09:00'} 저장`
                  : repeat && repeat !== 'none'
                    ? selectedTime ? `${selectedTime} 반복 저장` : '반복 알림 저장'
                    : '날짜를 선택하세요'}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <div onClick={handleOpen} className="cursor-pointer">
        {children}
      </div>
      {mounted && createPortal(picker, document.body)}
    </>
  );
}
