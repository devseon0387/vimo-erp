'use client';

/**
 * 공용 세그먼트 탭바 (시안8) — 흰 컨테이너 + 오렌지 pill 활성 + 선택적 카운트 배지.
 * 반응형: 넓으면 균등(fullWidthMobile)·자연폭, 좁으면 2줄로 깨지지 않고 가로 스크롤(no-scrollbar).
 * framer-motion pill의 layoutId는 useId로 인스턴스마다 고유화 → 한 페이지에 여러 탭바가 있어도 충돌 없음.
 *
 * 사용:
 *   <TabBar items={[{key:'all',label:'전체',count:24}, ...]} active={tab} onChange={setTab} />
 *  - URL 바인딩 탭은 onChange에서 router.push 등으로 처리(흡수).
 *  - 정적이던 탭도 pill 애니메이션으로 통일됨.
 */
import { useId } from 'react';
import { motion } from 'framer-motion';

export interface TabItem<K extends string = string> {
  key: K;
  label: string;
  count?: number;
  icon?: React.ElementType;
}

export interface TabBarProps<K extends string> {
  items: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  /** 모바일에서 탭을 가로로 균등 분배(기본 true). false면 항상 자연폭. 둘 다 넘치면 가로 스크롤(2줄 방지). */
  fullWidthMobile?: boolean;
  className?: string;
  'data-tour'?: string;
}

export function TabBar<K extends string>({
  items,
  active,
  onChange,
  fullWidthMobile = true,
  className = '',
  'data-tour': dataTour,
}: TabBarProps<K>) {
  const pid = useId();
  return (
    <div
      data-tour={dataTour}
      className={`flex gap-1 p-1 bg-white border border-divider rounded-lg overflow-x-auto no-scrollbar ${
        fullWidthMobile ? 'w-full sm:w-fit' : 'w-fit'
      } ${className}`}
    >
      {items.map(({ key, label, count, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`relative min-w-fit px-3 sm:px-4 py-1.5 sm:py-2 rounded-md text-[12px] sm:text-[13px] font-semibold whitespace-nowrap ${
              fullWidthMobile ? 'flex-1 sm:flex-initial' : 'flex-initial'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId={`tabbar-pill-${pid}`}
                className="absolute inset-0 bg-orange-500 rounded-md shadow-sm shadow-orange-500/20"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span
              className={`relative flex items-center justify-center gap-1 sm:gap-1.5 transition-colors duration-200 ${
                isActive ? 'text-white' : 'text-[#78716c]'
              }`}
            >
              {Icon && <Icon size={14} className="flex-shrink-0" />}
              <span>{label}</span>
              {count != null && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors duration-200 ${
                    isActive ? 'bg-white/22 text-white' : 'bg-[#f5f5f4] text-[#78716c]'
                  }`}
                >
                  {count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
