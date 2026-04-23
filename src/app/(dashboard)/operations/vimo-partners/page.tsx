'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Phone, User, Mail } from 'lucide-react';
import { Partner } from '@/types';
import { getPartners } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { formatPhoneNumber } from '@/lib/utils';

const GENERATIONS = [1, 2, 3];

export default function VimoPartnersPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | number>('all');

  const loadData = useCallback(() => {
    getPartners().then((p) => {
      setPartners(p);
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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div>
        <button
          onClick={() => router.push('/operations')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4 transition-colors text-sm font-medium"
        >
          <ArrowLeft size={18} />
          운영으로 돌아가기
        </button>
        <h1 className="text-3xl font-bold text-gray-900">비모 파트너</h1>
        <p className="text-gray-500 mt-2">기수별 파트너 멤버를 확인해요</p>
      </div>

      {/* 기수별 통계 카드 */}
      {allGenerations.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {allGenerations.map((gen) => {
            const count = partners.filter((p) => p.generation === gen).length;
            const active = partners.filter((p) => p.generation === gen && p.status === 'active').length;
            return (
              <button
                key={gen}
                onClick={() => setActiveTab(gen)}
                className={`bg-white rounded-2xl border p-5 text-left transition-all hover:shadow-md ${
                  activeTab === gen ? 'border-gray-800 shadow-sm' : 'border-divider'
                }`}
              >
                <p className="text-2xl font-bold text-gray-900">{gen}기</p>
                <p className="text-sm text-gray-500 mt-1">{count}명</p>
                <p className="text-xs text-green-600 mt-0.5">활성 {active}명</p>
              </button>
            );
          })}
        </div>
      )}

      {/* 탭 + 파트너 목록 */}
      <div className="bg-white rounded-2xl border border-divider overflow-hidden">
        {/* 탭 */}
        <div className="flex items-center border-b border-divider px-6 gap-1">
          {tabs.map((tab) => (
            <button
              key={String(tab.key)}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-gray-400">
                ({tab.key === 'all' ? partners.length : partners.filter((p) => p.generation === tab.key).length})
              </span>
            </button>
          ))}
        </div>

        {/* 파트너 그리드 */}
        <div className="p-6">
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <User size={48} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">
                {activeTab === 'all' ? '등록된 파트너가 없습니다' : `${activeTab}기 파트너가 없습니다`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
    <div className="bg-white rounded-xl border border-divider p-4 hover:border-gray-300 hover:shadow-sm transition-all">
      {/* 상단: 아이콘 + 기수 배지 */}
      <div className="flex items-start justify-between mb-3">
        <div className="w-11 h-11 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
          <User size={22} className="text-orange-500" />
        </div>
        <div className="flex flex-col items-end gap-1">
          {partner.generation && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-full">
              {partner.generation}기
            </span>
          )}
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
            partner.status === 'active'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {partner.status === 'active' ? '활성' : '비활성'}
          </span>
        </div>
      </div>

      {/* 이름 */}
      <p className="text-sm font-semibold text-gray-900 truncate">{partner.name}</p>

      {/* 파트너 유형 */}
      {partner.partnerType && (
        <p className="text-xs text-gray-500 mt-0.5">
          {partner.partnerType === 'freelancer' ? '프리랜서' : '사업자'}
        </p>
      )}

      {/* 연락처 */}
      <div className="mt-3 pt-3 border-t border-divider space-y-1">
        {partner.phone && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Phone size={11} className="flex-shrink-0" />
            <span className="truncate">{formatPhoneNumber(partner.phone)}</span>
          </div>
        )}
        {partner.email && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Mail size={11} className="flex-shrink-0" />
            <span className="truncate">{partner.email}</span>
          </div>
        )}
      </div>
    </div>
  );
}
