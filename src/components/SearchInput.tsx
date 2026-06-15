'use client';

import { Search, X } from 'lucide-react';

/**
 * 공용 검색 입력 — 회색 pill 배경 + 검색 아이콘 + 클리어 버튼.
 * 마스터리스트/필터의 제각각 검색창을 통일.
 *   <SearchInput value={q} onChange={setQ} placeholder="파트너 검색..." />
 */
export function SearchInput({
  value,
  onChange,
  placeholder = '검색...',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-[#f5f5f4] ${className}`}>
      <Search size={13} className="text-[#a8a29e] flex-shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent focus:outline-none text-[12.5px] text-[#44403c] placeholder-[#a8a29e]"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-[#a8a29e] hover:text-[#78716c] flex-shrink-0"
          aria-label="검색어 지우기"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
