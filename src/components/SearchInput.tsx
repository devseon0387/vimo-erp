'use client';

import { Search, X } from 'lucide-react';

/**
 * 공용 검색 입력 — 회색 pill 배경 + 검색 아이콘 + 클리어 버튼.
 * 색은 디자인 토큰(ink)만 사용. 마스터리스트/필터의 제각각 검색창을 통일.
 *   <SearchInput value={q} onChange={setQ} placeholder="파트너 검색..." />
 */
export function SearchInput({
  value,
  onChange,
  placeholder = '검색...',
  className = '',
  ariaLabel = '검색',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-ink-100 ${className}`}>
      <Search size={13} className="text-ink-400 flex-shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="flex-1 bg-transparent focus:outline-none text-[12.5px] text-ink-700 placeholder-ink-400"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-ink-400 hover:text-ink-500 flex-shrink-0"
          aria-label="검색어 지우기"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
