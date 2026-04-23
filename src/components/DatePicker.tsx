'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder: string;
  minDate?: string;
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

function formatDisplay(value: string): string {
  if (!value) return '';
  const [, m, d] = value.split('-').map(Number);
  return `${m}/${d}`;
}

export default function DatePicker({ value, onChange, placeholder, minDate }: DatePickerProps) {
  const today = new Date();
  const initDate = value ? new Date(value + 'T00:00:00') : today;

  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const containerRef = useRef<HTMLDivElement>(null);

  // 달력 외부 클릭 시 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // 열 때 현재 선택된 날짜로 뷰 이동
  const handleOpen = () => {
    const d = value ? new Date(value + 'T00:00:00') : today;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setIsOpen(true);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onChange(`${viewYear}-${mm}-${dd}`);
    setIsOpen(false);
  };

  // 이달의 날짜 계산
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=일
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // minDate 비교용
  const minTs = minDate ? new Date(minDate + 'T00:00:00').getTime() : null;
  const isDisabled = (day: number) => {
    if (!minTs) return false;
    const ts = new Date(viewYear, viewMonth, day).getTime();
    return ts < minTs;
  };

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const selectedStr = value;

  const cellStr = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // 달력 격자 만들기
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div ref={containerRef} className="relative">
      {/* 인풋 */}
      <button
        type="button"
        onClick={handleOpen}
        className={`w-full min-w-[130px] px-3 py-2 border-[1.5px] rounded-[10px] text-left flex items-center justify-between transition-all text-sm ${
          isOpen
            ? 'border-[#44403c] ring-[3px] ring-black/[0.04]'
            : 'border-[#ede9e6] hover:border-[#d6d3d1]'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <Calendar size={13} className={`flex-shrink-0 ${value ? 'text-orange-500' : 'text-gray-400'}`} />
          <span className={value ? 'text-gray-900 font-semibold' : 'text-[#d6d3d1]'}>
            {value ? formatDisplay(value) : placeholder}
          </span>
        </div>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onChange('');
              }
            }}
            className="text-gray-300 hover:text-gray-500 transition-colors text-xs leading-none cursor-pointer ml-1"
          >
            ✕
          </span>
        )}
      </button>

      {/* 달력 드롭다운 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute z-50 mt-2 bg-white rounded-2xl shadow-2xl border border-divider p-4 w-72"
          >
            {/* 월 네비게이션 */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft size={16} className="text-gray-600" />
              </button>
              <span className="text-sm font-semibold text-gray-900">
                {viewYear}년 {MONTHS[viewMonth]}
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronRight size={16} className="text-gray-600" />
              </button>
            </div>

            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map((d, i) => (
                <div
                  key={d}
                  className={`text-center text-xs font-semibold py-1 ${
                    i === 0 ? 'text-red-400' : i === 6 ? 'text-orange-400' : 'text-gray-400'
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* 날짜 격자 */}
            <div className="grid grid-cols-7 gap-y-1">
              {cells.map((day, idx) => {
                if (day === null) return <div key={`empty-${idx}`} />;

                const str = cellStr(day);
                const isSelected = str === selectedStr;
                const isToday = str === todayStr;
                const disabled = isDisabled(day);
                const colIdx = idx % 7;

                return (
                  <motion.button
                    key={str}
                    type="button"
                    onClick={() => !disabled && handleSelectDay(day)}
                    disabled={disabled}
                    whileTap={!disabled ? { scale: 0.88 } : {}}
                    className={`
                      relative h-8 w-8 mx-auto flex items-center justify-center rounded-full text-sm font-medium transition-all
                      ${isSelected
                        ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                        : isToday && !isSelected
                        ? 'bg-orange-50 text-orange-600 font-bold'
                        : disabled
                        ? 'text-gray-200 cursor-not-allowed'
                        : colIdx === 0
                        ? 'text-red-400 hover:bg-red-50'
                        : colIdx === 6
                        ? 'text-orange-400 hover:bg-orange-50'
                        : 'text-gray-700 hover:bg-gray-100'
                      }
                    `}
                  >
                    {day}
                    {isToday && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-400" />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* 오늘 바로가기 */}
            <div className="mt-3 pt-3 border-t border-divider">
              <button
                type="button"
                onClick={() => {
                  onChange(todayStr);
                  setIsOpen(false);
                }}
                className="w-full text-xs text-orange-500 hover:text-orange-600 font-medium py-1 hover:bg-orange-50 rounded-lg transition-colors"
              >
                오늘 선택
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
