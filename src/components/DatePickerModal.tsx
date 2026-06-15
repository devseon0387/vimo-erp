'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';

interface DatePickerModalProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

function formatDisplay(value: string): string {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  return `${String(y).slice(2)}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
}

export default function DatePickerModal({ value, onChange, placeholder, className }: DatePickerModalProps) {
  const today = new Date();
  const initDate = value ? new Date(value + 'T00:00:00') : today;

  const [isOpen, setIsOpen] = useState(false);
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  const handleOpen = () => {
    const d = value ? new Date(value + 'T00:00:00') : today;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setIsOpen(true);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const handleSelectDay = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    onChange(`${viewYear}-${mm}-${dd}`);
    setIsOpen(false);
  };

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const cellStr = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      {/* 트리거 버튼 */}
      <button
        type="button"
        onClick={handleOpen}
        className={className || `w-full min-w-[120px] px-2.5 py-1.5 border-[1.5px] rounded-lg text-left flex items-center justify-between transition-all text-[12px] ${
          value
            ? 'border-[#ede9e6] bg-[#fafaf9] hover:border-[#d6d3d1]'
            : 'border-dashed border-orange-300 bg-orange-50/30 hover:border-orange-400'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <Calendar size={12} className={`flex-shrink-0 ${value ? 'text-orange-500' : 'text-[#d6cec8]'}`} />
          <span className={value ? 'font-medium text-gray-900' : 'text-[#a8a29e]'}>
            {value ? formatDisplay(value) : placeholder}
          </span>
        </div>
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="text-gray-300 hover:text-gray-500 transition-colors text-[10px] leading-none cursor-pointer ml-1"
          >
            <X className="w-2.5 h-2.5" />
          </span>
        )}
      </button>

      {/* 모달 */}
      {typeof window !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && (
            <>
              {/* 배경 오버레이 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[9998]"
                onClick={() => setIsOpen(false)}
              />
              {/* 달력 모달 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 20 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] bg-white rounded-2xl shadow-2xl border border-divider p-5 w-[320px]"
              >
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-bold text-gray-900">{placeholder}</h3>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X size={16} className="text-gray-400" />
                  </button>
                </div>

                {/* 월 네비게이션 */}
                <div className="flex items-center justify-between mb-4">
                  <button type="button" onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <ChevronLeft size={16} className="text-gray-600" />
                  </button>
                  <span className="text-sm font-semibold text-gray-900">
                    {viewYear}년 {MONTHS[viewMonth]}
                  </span>
                  <button type="button" onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <ChevronRight size={16} className="text-gray-600" />
                  </button>
                </div>

                {/* 요일 헤더 */}
                <div className="grid grid-cols-7 mb-1">
                  {DAYS.map((d, i) => (
                    <div key={d} className={`text-center text-xs font-semibold py-1.5 ${
                      i === 0 ? 'text-red-400' : i === 6 ? 'text-orange-400' : 'text-gray-400'
                    }`}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* 날짜 격자 */}
                <div className="grid grid-cols-7 gap-y-1">
                  {cells.map((day, idx) => {
                    if (day === null) return <div key={`empty-${idx}`} />;
                    const str = cellStr(day);
                    const isSelected = str === value;
                    const isToday = str === todayStr;
                    const colIdx = idx % 7;

                    return (
                      <motion.button
                        key={str}
                        type="button"
                        onClick={() => handleSelectDay(day)}
                        whileTap={{ scale: 0.88 }}
                        className={`
                          relative h-9 w-9 mx-auto flex items-center justify-center rounded-full text-sm font-medium transition-all
                          ${isSelected
                            ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
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
                        {isToday && !isSelected && (
                          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-400" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>

                {/* 하단 */}
                <div className="mt-4 pt-3 border-t border-divider flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { onChange(''); setIsOpen(false); }}
                    className="text-xs text-gray-400 hover:text-gray-600 font-medium px-3 py-1.5 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    초기화
                  </button>
                  <button
                    type="button"
                    onClick={() => { onChange(todayStr); setIsOpen(false); }}
                    className="text-xs text-orange-500 hover:text-orange-600 font-semibold px-3 py-1.5 hover:bg-orange-50 rounded-lg transition-colors"
                  >
                    오늘 선택
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
