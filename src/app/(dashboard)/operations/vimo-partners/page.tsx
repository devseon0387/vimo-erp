'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Phone, User, Mail, AlertTriangle } from 'lucide-react';
import { Partner } from '@/types';
import { getPartners } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { formatPhoneNumber } from '@/lib/utils';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';

export default function VimoPartnersPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | number>('all');

  const loadData = useCallback(() => {
    setLoadError(false);
    getPartners()
      .then((p) => {
        setPartners(p);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useSupabaseRealtime(['partners'], loadData);

  // 기수별 최대 기수 계산 (데이터 기반으로 탭 동적 생성)
  const allGenerations = Array.from(
    new Set(partners.map((p) => p.generation).filter((g): g is number => !!g))
  ).sort((a, b) => a - b);

  const tabs = [
    { key: 'all' as const, label: '전체' },
    ...allGenerations.map((g) => ({ key: g as number, label: `${g}기` })),
  ];

  const filtered =
    activeTab === 'all'
      ? partners
      : partners.filter((p) => p.generation === activeTab);

  if (loading) {
    return <LoadingState />;
  }

  if (loadError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="불러오지 못했습니다"
        description="파트너 정보를 불러오는 중 문제가 발생했어요."
        action={{ label: '다시 시도', onClick: loadData }}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div>
        <button
          onClick={() => router.push('/operations')}
          className="flex items-center gap-2 text-ink-500 hover:text-ink-900 mb-4 transition-colors text-sm font-medium"
        >
          <ArrowLeft size={18} />
          운영으로 돌아가기
        </button>
        <h1 className="text-page">파트너</h1>
        <p className="text-ink-500 mt-2">기수별 파트너 멤버를 확인해요</p>
      </div>

      {/* 기수별 통계 카드 */}
      {allGenerations.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {allGenerations.map((gen) => {
            const count = partners.filter((p) => p.generation === gen).length;
            const active = partners.filter((p) => p.generation === gen && p.status === 'active').length;
            return (
              <button
                key={gen}
                onClick={() => setActiveTab(gen)}
                className={`bg-white rounded-2xl border p-4 text-left transition-all hover:shadow-md ${
                  activeTab === gen ? 'border-ink-700 shadow-sm' : 'border-divider'
                }`}
              >
                <p className="text-2xl font-bold text-ink-900">{gen}기</p>
                <p className="text-sm text-ink-500 mt-1">{count}명</p>
                <p className="text-xs text-green-600 mt-0.5">활성 {active}명</p>
              </button>
            );
          })}
        </div>
      )}

      {/* 탭 + 파트너 목록 */}
      <div className="bg-white rounded-2xl border border-divider overflow-hidden">
        {/* 탭 */}
        <div className="flex items-center border-b border-divider px-4 sm:px-6 gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={String(tab.key)}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.key
                  ? 'border-ink-900 text-ink-900'
                  : 'border-transparent text-ink-500 hover:text-ink-700'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-ink-400">
                ({tab.key === 'all' ? partners.length : partners.filter((p) => p.generation === tab.key).length})
              </span>
            </button>
          ))}
        </div>

        {/* 파트너 그리드 */}
        <div className="p-4">
          {filtered.length === 0 ? (
            <EmptyState
              icon={User}
              size="compact"
              title={activeTab === 'all' ? '등록된 파트너가 없습니다' : `${activeTab}기 파트너가 없습니다`}
              description="기수별 파트너 멤버가 여기에 표시됩니다."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.map((partner) => (
                <PartnerCard key={partner.id} partner={partner} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PartnerCard({ partner }: { partner: Partner }) {
  return (
    <div className="bg-white rounded-2xl border border-divider p-4 hover:border-ink-300 hover:shadow-sm transition-all">
      {/* 상단: 아이콘 + 기수 배지 */}
      <div className="flex items-start justify-between mb-3">
        <div className="w-11 h-11 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
          <User size={22} className="text-orange-500" />
        </div>
        <div className="flex flex-col items-end gap-1">
          {partner.generation && (
            <StatusBadge tone="neutral">{partner.generation}기</StatusBadge>
          )}
          <StatusBadge tone={partner.status === 'active' ? 'ok' : 'neutral'}>
            {partner.status === 'active' ? '활성' : '비활성'}
          </StatusBadge>
        </div>
      </div>

      {/* 이름 */}
      <p className="text-sm font-semibold text-ink-900 truncate">{partner.name}</p>

      {/* 파트너 유형 */}
      {partner.partnerType && (
        <p className="text-xs text-ink-500 mt-0.5">
          {partner.partnerType === 'freelancer' ? '프리랜서' : '사업자'}
        </p>
      )}

      {/* 연락처 */}
      <div className="mt-3 pt-3 border-t border-divider space-y-1">
        {partner.phone && (
          <div className="flex items-center gap-1.5 text-xs text-ink-500">
            <Phone size={11} className="flex-shrink-0" />
            <span className="truncate">{formatPhoneNumber(partner.phone)}</span>
          </div>
        )}
        {partner.email && (
          <div className="flex items-center gap-1.5 text-xs text-ink-500">
            <Mail size={11} className="flex-shrink-0" />
            <span className="truncate">{partner.email}</span>
          </div>
        )}
      </div>
    </div>
  );
}
