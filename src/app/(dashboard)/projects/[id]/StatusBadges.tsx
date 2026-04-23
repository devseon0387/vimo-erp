// 프로젝트·회차 상태 배지 컴포넌트
// projects/[id]/page.tsx 에서 추출 (2026-04-23 리팩토링)

export function StatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; color: string; bgColor: string }> = {
    active:   { label: '진행 중', color: 'text-green-700',  bgColor: 'bg-green-100'  },
    standby:  { label: '대기',    color: 'text-blue-700',   bgColor: 'bg-blue-100'   },
    dormant:  { label: '휴면',    color: 'text-orange-700', bgColor: 'bg-orange-100' },
    inactive: { label: '비활성',  color: 'text-gray-700',   bgColor: 'bg-gray-100'   },
  };

  const { label, color, bgColor } = statusMap[status] || statusMap.inactive;

  return (
    <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${color} ${bgColor}`}>
      {label}
    </span>
  );
}

export function EpisodeStatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; color: string; bgColor: string }> = {
    waiting:     { label: '대기',    color: 'text-gray-700',   bgColor: 'bg-gray-100'   },
    in_progress: { label: '진행 중', color: 'text-gray-600',   bgColor: 'bg-orange-100' },
    review:      { label: '검토',    color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
    completed:   { label: '완료',    color: 'text-gray-600',   bgColor: 'bg-green-100'  },
  };

  const { label, color, bgColor } = statusMap[status] || statusMap.waiting;

  return (
    <span className={`inline-flex items-center justify-center w-[52px] py-1 rounded-full text-[10px] font-semibold ${color} ${bgColor}`}>
      {label}
    </span>
  );
}
