'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, Check } from 'lucide-react';

interface DateField {
  label: string;
  value: string; // YYYY-MM-DD or ''
  onChange: (value: string) => void;
  isMissing: boolean;
}

interface DateTripleModalProps {
  fields: DateField[];
  isOpen: boolean;
  onClose: () => void;
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];



function isValidDate(v: string): boolean {
  if (!v || v.length !== 10) return false;
  const d = new Date(v + 'T00:00:00');
  return !isNaN(d.getTime());
}

function MiniCalendar({ label, value, onChange, isMissing, disabled }: DateField & { disabled: boolean }) {
  const today = new Date();
  const validValue = isValidDate(value) ? value : '';
  const initDate = validValue ? new Date(validValue + 'T00:00:00') : today;
  const [viewYear, setViewYear] = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cellStr = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  return (
    <div className={`flex-1 min-w-[220px] rounded-xl border p-3 transition-all ${
      disabled
        ? 'border-green-200 bg-green-50/30 opacity-60'
        : 'border-[#ede9e6] bg-white'
    }`}>
      {/* 라벨 + 현재 값 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[13px] font-bold ${disabled ? 'text-green-600' : 'text-gray-900'}`}>
            {label}
          </span>
          {disabled && (
            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600 font-semibold">
              <Check size={9} />입력됨
            </span>
          )}
          {!disabled && isMissing && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-500 font-semibold">
              미입력
            </span>
          )}
        </div>
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            초기화
          </button>
        )}
      </div>

      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevMonth} disabled={disabled} className="p-1 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30">
          <ChevronLeft size={14} className="text-gray-500" />
        </button>
        <span className="text-[12px] font-semibold text-gray-800">
          {viewYear}년 {MONTHS[viewMonth]}
        </span>
        <button type="button" onClick={nextMonth} disabled={disabled} className="p-1 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30">
          <ChevronRight size={14} className="text-gray-500" />
        </button>
      </div>

      {/* 요일 */}
      <div className="grid grid-cols-7 mb-0.5">
        {DAYS.map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-semibold py-1 ${
            i === 0 ? 'text-red-300' : i === 6 ? 'text-orange-300' : 'text-gray-300'
          }`}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} />;
          const str = cellStr(day);
          const isSelected = str === validValue;
          const isToday = str === todayStr;
          const colIdx = idx % 7;

          return (
            <motion.button
              key={str}
              type="button"
              onClick={() => !disabled && onChange(str)}
              disabled={disabled}
              whileTap={!disabled ? { scale: 0.85 } : {}}
              className={`
                relative h-7 w-7 mx-auto flex items-center justify-center rounded-full text-[12px] font-medium transition-all
                ${disabled
                  ? isSelected
                    ? 'bg-green-400 text-white'
                    : 'text-gray-300 cursor-default'
                  : isSelected
                    ? 'bg-orange-500 text-white shadow-sm shadow-orange-200'
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
              {isToday && !isSelected && !disabled && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-0.5 rounded-full bg-orange-400" />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* 오늘 버튼 */}
      {!disabled && (
        <div className="mt-2 pt-2 border-t border-divider">
          <button
            type="button"
            onClick={() => onChange(todayStr)}
            className="w-full text-[11px] text-orange-500 hover:text-orange-600 font-medium py-1 hover:bg-orange-50 rounded-lg transition-colors"
          >
            오늘
          </button>
        </div>
      )}
    </div>
  );
}

export default function DateTripleModal({ fields, isOpen, onClose }: DateTripleModalProps) {
  if (typeof window === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[9998]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] bg-[#f8f7f6] rounded-2xl shadow-2xl border border-divider p-5 max-w-[780px] w-[95vw]"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-gray-900">날짜 설정</h3>
              <button type="button" onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="flex gap-3 flex-wrap sm:flex-nowrap">
              {fields.map((f, i) => (
                <MiniCalendar
                  key={i}
                  label={f.label}
                  value={f.value}
                  onChange={v => f.onChange(v)}
                  isMissing={f.isMissing}
                  disabled={!f.isMissing && isValidDate(f.value)}
                />
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={onClose} className="px-4 py-2 bg-orange-500 text-white rounded-xl text-[13px] font-semibold hover:bg-orange-600 transition-colors shadow-sm shadow-orange-500/20">
                확인
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
