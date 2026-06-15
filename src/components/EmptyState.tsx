'use client';

import {
  LucideIcon, FolderOpen, Film, Users, Briefcase, SearchX, Trash2, CheckCircle, Calendar,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  iconColor?: string;
  iconBgColor?: string;
  /** default = 풀페이지/섹션, compact = 테이블·작은 패널 빈 행 */
  size?: 'default' | 'compact';
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  iconColor = 'text-[#a8a29e]',
  iconBgColor = 'bg-[#f5f5f4]',
  size = 'default',
}: EmptyStateProps) {
  const compact = size === 'compact';
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex flex-col items-center justify-center px-4 ${compact ? 'py-8' : 'py-14'}`}
    >
      <div
        className={`${iconBgColor} rounded-full flex items-center justify-center ${compact ? 'w-12 h-12 mb-3' : 'w-16 h-16 mb-5'}`}
      >
        <Icon size={compact ? 22 : 30} className={iconColor} />
      </div>
      <div className="text-center max-w-md">
        <h3 className={`font-semibold text-[#1c1917] ${compact ? 'text-sm mb-1' : 'text-base mb-1.5'}`}>{title}</h3>
        <p className={`text-[#78716c] ${compact ? 'text-xs' : 'text-[13px]'} ${action ? (compact ? 'mb-4' : 'mb-5') : ''}`}>
          {description}
        </p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}

// 프리셋 빈 상태 컴포넌트들 (브랜드/상태 색은 의도적으로 유지)
export function EmptyProjects({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={FolderOpen}
      title="프로젝트가 없습니다"
      description="새 프로젝트를 추가하여 비디오 작업을 시작하세요. 프로젝트를 통해 클라이언트, 파트너, 회차를 관리할 수 있습니다."
      action={onAdd ? { label: '+ 프로젝트 추가하기', onClick: onAdd } : undefined}
      iconColor="text-orange-500"
      iconBgColor="bg-orange-50"
    />
  );
}

export function EmptyEpisodes({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={Film}
      title="회차가 없습니다"
      description="프로젝트에 회차를 추가하여 작업을 시작하세요. 각 회차는 개별적으로 관리됩니다."
      action={onAdd ? { label: '+ 회차 추가하기', onClick: onAdd } : undefined}
      iconColor="text-orange-500"
      iconBgColor="bg-orange-50"
    />
  );
}

export function EmptyPartners({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={Users}
      title="등록된 파트너가 없습니다"
      description="비디오 작업을 함께할 파트너를 추가하세요. 편집자, 촬영감독 등 다양한 전문가를 관리할 수 있습니다."
      action={onAdd ? { label: '+ 파트너 추가하기', onClick: onAdd } : undefined}
      iconColor="text-green-500"
      iconBgColor="bg-green-50"
    />
  );
}

export function EmptyClients({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={Briefcase}
      title="등록된 클라이언트가 없습니다"
      description="프로젝트를 의뢰하는 클라이언트를 추가하세요. 클라이언트별로 프로젝트를 관리할 수 있습니다."
      action={onAdd ? { label: '+ 클라이언트 추가하기', onClick: onAdd } : undefined}
      iconColor="text-orange-500"
      iconBgColor="bg-orange-50"
    />
  );
}

export function EmptySearch({ query }: { query: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title="검색 결과가 없습니다"
      description={`"${query}"에 대한 검색 결과를 찾을 수 없습니다. 다른 키워드로 검색해보세요.`}
    />
  );
}

export function EmptyTrash() {
  return (
    <EmptyState
      icon={Trash2}
      title="휴지통이 비어있습니다"
      description="삭제된 항목이 없습니다. 삭제한 프로젝트나 회차가 여기에 표시됩니다."
    />
  );
}

export function EmptyReviews() {
  return (
    <EmptyState
      icon={CheckCircle}
      title="검수 대기 중인 작업이 없습니다"
      description="모든 작업이 완료되었거나 아직 검수 단계에 도달하지 않았습니다."
      iconColor="text-green-500"
      iconBgColor="bg-green-50"
    />
  );
}

export function EmptyDeadlines() {
  return (
    <EmptyState
      icon={Calendar}
      title="다가오는 마감일이 없습니다"
      description="7일 이내에 마감되는 작업이 없습니다. 여유롭게 작업을 진행하세요."
      iconColor="text-orange-500"
      iconBgColor="bg-orange-50"
    />
  );
}
