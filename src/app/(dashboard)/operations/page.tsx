'use client';

import Link from 'next/link';
import { Users, ChevronRight, Crown, Briefcase } from 'lucide-react';

const operationBlocks = [
  {
    href: '/operations/executives',
    icon: Crown,
    title: '임원',
    description: '임원진 정보를 확인하고 관리해요',
    badge: null,
  },
  {
    href: '/operations/managers',
    icon: Briefcase,
    title: '운영 매니저',
    description: '운영 매니저 정보를 확인하고 관리해요',
    badge: null,
  },
  {
    href: '/operations/vimo-partners',
    icon: Users,
    title: '파트너',
    description: '기수별 파트너 멤버를 확인하고 관리해요',
    badge: null,
  },
];

export default function OperationsPage() {
  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div>
        <h1 className="text-page">운영</h1>
        <p className="text-ink-500 mt-2">비모 운영 관련 정보를 관리해요</p>
      </div>

      {/* 블록 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {operationBlocks.map((block) => {
          const Icon = block.icon;
          return (
            <Link
              key={block.href}
              href={block.href}
              className="group bg-white rounded-2xl border border-divider p-4 hover:border-ink-300 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 bg-ink-100 rounded-xl flex items-center justify-center group-hover:bg-ink-200 transition-colors">
                  <Icon size={24} className="text-ink-700" />
                </div>
                <ChevronRight size={18} className="text-ink-300 group-hover:text-ink-500 transition-colors mt-1" />
              </div>
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-ink-900">{block.title}</h2>
                  {block.badge && (
                    <span className="px-2 py-0.5 bg-ink-100 text-ink-500 text-xs rounded-full">{block.badge}</span>
                  )}
                </div>
                <p className="text-sm text-ink-500 mt-1">{block.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
