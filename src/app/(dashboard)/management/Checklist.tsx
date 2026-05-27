'use client';

import { motion, AnimatePresence } from 'framer-motion';

/** ManagementMain 내부 ChecklistItem 과 동일 shape (camelCase UI 타입) */
export interface ChecklistItemView {
  id: string;
  text: string;
  completed: boolean;
  reminderTime?: string;
  repeatType?: string;
  linkedProjectTitle?: string;
  linkedEpisodeTitle?: string;
  linkedEpisodeNumber?: number;
}

interface Props {
  /** 1회성 체크리스트 (반복 아닌 것만) */
  oneTimeItems: ChecklistItemView[];
  /** 전체 체크리스트 (헤더의 '남은 개수' 계산용) */
  checklistItems: ChecklistItemView[];
  onToggle: (id: string) => void;
  onAdd: () => void;
}

/** 메인 우측 컬럼 체크리스트 카드. 미완료 → 완료 분리, 추가 버튼은 외부 모달 트리거. */
export default function Checklist({ oneTimeItems, checklistItems, onToggle, onAdd }: Props) {
  const incomplete = oneTimeItems.filter(i => !i.completed);
  const completed = oneTimeItems.filter(i => i.completed);
  const remainingCount = checklistItems.filter(i => !i.completed).length;

  return (
    <div className="bg-white rounded-2xl border border-ink-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-bold">체크리스트</span>
        <span className="text-[11px] text-brand-500 font-semibold">{remainingCount}개 남음</span>
      </div>

      <div className="flex flex-direction:column gap-1">
        <AnimatePresence initial={false}>
          {incomplete.map(item => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className={`flex items-center gap-2 p-2 rounded-lg ${item.reminderTime ? 'bg-bad-50 border border-red-200' : 'hover:bg-[var(--color-ink-50)]'}`}>
                <button
                  onClick={() => onToggle(item.id)}
                  className="w-[18px] h-[18px] rounded-[5px] border-2 border-[var(--color-ink-300)] flex-shrink-0 flex items-center justify-center hover:border-brand-500 transition-colors"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-medium block truncate">{item.text}</span>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    {item.reminderTime && (
                      <span className="text-[10px] font-semibold text-bad-500 bg-bad-100 px-1.5 py-0.5 rounded">🔴 {new Date(item.reminderTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                    {item.linkedProjectTitle && (
                      <span className="text-[10px] text-[var(--color-ink-500)] bg-[var(--color-ink-100)] px-1.5 py-0.5 rounded">📁 {item.linkedProjectTitle}</span>
                    )}
                    {item.linkedEpisodeTitle && (
                      <span className="text-[10px] text-[var(--color-ink-500)] bg-[var(--color-ink-100)] px-1.5 py-0.5 rounded">🎬 {item.linkedEpisodeNumber}편</span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {completed.length > 0 && (
          <div className="border-t border-[var(--color-ink-200)] pt-2 mt-2">
            <p className="text-[10px] text-[var(--color-ink-400)] mb-1.5">완료 · {completed.length}개</p>
            {completed.map(item => (
              <div key={item.id} className="flex items-center gap-2 p-1.5 opacity-40">
                <button
                  onClick={() => onToggle(item.id)}
                  className="w-[18px] h-[18px] rounded-[5px] bg-ok-500 border-2 border-ok-500 flex-shrink-0 flex items-center justify-center text-white text-[10px]"
                >✓</button>
                <span className="text-[12px] line-through text-[var(--color-ink-400)]">{item.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onAdd}
        className="w-full mt-2 p-2 border-[1.5px] border-dashed border-[var(--color-ink-200)] rounded-lg text-[12px] text-[var(--color-ink-400)] hover:border-[var(--color-ink-300)] transition-colors"
      >
        + 할 일 추가
      </button>
    </div>
  );
}
