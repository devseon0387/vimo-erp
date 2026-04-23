'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft, Briefcase, Users, ClipboardCheck, Wallet, ChevronDown, Receipt, Calendar } from 'lucide-react';
import { Project, Partner, Client } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { getProjects, getPartners, getClients } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { groupByClient, groupByPartner } from '@/lib/settlement';
import Link from 'next/link';

const statusConfig: Record<string, { label: string; dot: string }> = {
  planning:    { label: '시작 전', dot: 'bg-orange-400' },
  in_progress: { label: '진행 중', dot: 'bg-yellow-400' },
  completed:   { label: '종료',   dot: 'bg-gray-300' },
};

function getYearMonth(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatYearMonth(ym: string) {
  const [year, month] = ym.split('-');
  return `${year}년 ${parseInt(month)}월`;
}

export default function SettlementHistoryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (id: string) => setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  const isGroupOpen = (id: string) => openGroups[id] === true;

  const loadData = useCallback(() => {
    Promise.all([getProjects(), getPartners(), getClients()]).then(
      ([p, pa, c]) => {
        setProjects(p);
        setPartners(pa);
        setClients(c);
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useSupabaseRealtime(['episodes', 'projects', 'partners'], loadData);

  // 월별로 프로젝트 그룹핑 (createdAt 기준)
  const monthlyData = useMemo(() => {
    const grouped: Record<string, Project[]> = {};
    projects.forEach(p => {
      const ym = getYearMonth(p.createdAt);
      if (!grouped[ym]) grouped[ym] = [];
      grouped[ym].push(p);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a)) // 최신순
      .map(([ym, projs]) => {
        const clientTotal = projs.reduce((s, p) => s + p.budget.totalAmount, 0);
        const partnerTotal = projs.reduce((s, p) => s + p.budget.partnerPayment, 0);
        const managerTotal = projs.reduce((s, p) => s + p.budget.managementFee, 0);
        const margin = clientTotal - partnerTotal - managerTotal;
        return { yearMonth: ym, projects: projs, clientTotal, partnerTotal, managerTotal, margin };
      });
  }, [projects]);

  const currentMonthData = selectedMonth
    ? monthlyData.find(m => m.yearMonth === selectedMonth)
    : null;

  // 선택된 월의 정산 계산
  const filteredProjects = currentMonthData?.projects ?? [];

  const clientSettlements = useMemo(() => groupByClient(filteredProjects, clients).filter(s => s.totalAmount > 0), [filteredProjects, clients]);

  const partnerSettlements = useMemo(() => groupByPartner(filteredProjects, partners).filter(s => s.totalAmount > 0), [filteredProjects, partners]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
      </div>
    );
  }

  // 월 선택 전 → 월별 목록 표시
  if (!selectedMonth) {
    return (
      <div className="space-y-8">
        <div>
          <Link
            href="/settlement"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-4"
          >
            <ArrowLeft size={14} />
            이번 달 정산으로
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">월별 정산 내역</h1>
          <p className="text-gray-500 mt-2">월별로 정산 내역을 확인하세요</p>
        </div>

        {monthlyData.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-divider py-20 text-center">
            <Receipt className="mx-auto mb-3 text-gray-200" size={36} />
            <p className="font-medium text-gray-500">정산 내역이 없어요</p>
            <p className="text-xs text-gray-400 mt-1">프로젝트를 추가하면 표시됩니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {monthlyData.map(({ yearMonth, projects: mp, clientTotal, partnerTotal, managerTotal, margin }) => (
              <button
                key={yearMonth}
                onClick={() => setSelectedMonth(yearMonth)}
                className="w-full bg-white rounded-2xl shadow-sm border border-divider p-5 hover:border-orange-200 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                      <Calendar size={18} className="text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{formatYearMonth(yearMonth)}</h3>
                      <p className="text-xs text-gray-400">{mp.length}개 프로젝트</p>
                    </div>
                  </div>
                  <ChevronDown size={16} className="-rotate-90 text-gray-300 group-hover:text-orange-400 transition-colors" />
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-[80px]">
                    <p className="text-xs text-gray-400 mb-0.5">클라이언트</p>
                    <p className="text-sm font-semibold text-gray-700">{(clientTotal / 10000).toFixed(0)}만원</p>
                  </div>
                  <div className="flex-1 min-w-[80px]">
                    <p className="text-xs text-gray-400 mb-0.5">파트너</p>
                    <p className="text-sm font-semibold text-gray-700">{(partnerTotal / 10000).toFixed(0)}만원</p>
                  </div>
                  <div className="flex-1 min-w-[80px]">
                    <p className="text-xs text-gray-400 mb-0.5">매니저</p>
                    <p className="text-sm font-semibold text-gray-700">{(managerTotal / 10000).toFixed(0)}만원</p>
                  </div>
                  <div className="flex-1 min-w-[80px]">
                    <p className="text-xs text-gray-400 mb-0.5">유보금</p>
                    <p className="text-sm font-semibold text-emerald-600">{(margin / 10000).toFixed(0)}만원</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 월 선택 후 → 상세 정산 표시
  const md = currentMonthData!;
  const partnerPct = md.clientTotal > 0 ? Math.round((md.partnerTotal / md.clientTotal) * 100) : 0;
  const managerPct = md.clientTotal > 0 ? Math.round((md.managerTotal / md.clientTotal) * 100) : 0;
  const marginPct = md.clientTotal > 0 ? Math.round((md.margin / md.clientTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* 뒤로가기 + 헤더 */}
      <div>
        <button
          onClick={() => setSelectedMonth(null)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors mb-4"
        >
          <ArrowLeft size={14} />
          월별 목록으로
        </button>
        <h1 className="text-2xl font-extrabold text-gray-900">{formatYearMonth(selectedMonth)} 정산</h1>
        <p className="text-sm text-gray-400 mt-0.5">{md.projects.length}개 프로젝트</p>
      </div>

      {/* 사이드바 + 본문 분할 레이아웃 */}
      <div className="flex gap-5">
        {/* 왼쪽: 고정 요약 사이드바 */}
        <div className="w-[240px] flex-shrink-0 space-y-3 sticky top-6 self-start">
          {/* 총 수금 */}
          <div className="bg-white rounded-2xl border border-divider p-5">
            <p className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-wider mb-3">총 수금</p>
            <p className="text-[32px] font-extrabold text-gray-900 tracking-tight leading-none">
              {(md.clientTotal / 10000).toFixed(0)}<span className="text-[14px] text-gray-400 font-semibold ml-0.5">만원</span>
            </p>
          </div>

          {/* 지출 구성 */}
          <div className="bg-white rounded-2xl border border-divider p-5 space-y-4">
            <p className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-wider">지출 구성</p>
            <div>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-[12px] text-gray-600 font-medium flex items-center gap-1.5"><Users size={11} className="text-orange-400" />파트너</span>
                <span className="text-[14px] font-bold text-gray-900">{(md.partnerTotal / 10000).toFixed(0)}만</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${partnerPct}%` }} transition={{ duration: 0.6 }} className="h-full bg-orange-400 rounded-full" />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{partnerPct}% · {partnerSettlements.length}명</p>
            </div>
            <div>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-[12px] text-gray-600 font-medium flex items-center gap-1.5"><ClipboardCheck size={11} className="text-amber-400" />매니저</span>
                <span className="text-[14px] font-bold text-gray-900">{(md.managerTotal / 10000).toFixed(0)}만</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${managerPct}%` }} transition={{ duration: 0.6, delay: 0.1 }} className="h-full bg-amber-400 rounded-full" />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">{managerPct}%</p>
            </div>
            <div className="pt-3 border-t border-divider">
              <div className="flex justify-between items-baseline">
                <span className="text-[12px] text-emerald-600 font-semibold flex items-center gap-1.5"><Wallet size={11} />유보금</span>
                <span className="text-[18px] font-extrabold text-emerald-600">{(md.margin / 10000).toFixed(0)}만</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">마진율 {marginPct}%</p>
            </div>
          </div>
        </div>

        {/* 오른쪽: 상세 내역 */}
        <div className="flex-1 space-y-4 min-w-0">
          {/* 클라이언트 섹션 */}
          <div className="bg-white rounded-2xl border border-divider overflow-hidden">
            <div className="px-5 py-4 border-b border-divider flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-orange-50 flex items-center justify-center">
                  <Briefcase size={12} className="text-orange-500" />
                </div>
                <h2 className="text-[14px] font-bold text-gray-900">클라이언트별 수금</h2>
              </div>
              {clientSettlements.length > 0 && (
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 font-bold">{clientSettlements.length}개사</span>
              )}
            </div>

            {clientSettlements.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Receipt className="mx-auto mb-3 text-gray-200" size={36} />
                <p className="font-medium text-gray-500">클라이언트 정산 내역이 없어요</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {clientSettlements.map(({ clientName, clientInfo, projects: cp, totalAmount }) => (
                  <div key={clientName}>
                    <button
                      onClick={() => toggleGroup(`c-${clientName}`)}
                      className="w-full px-5 py-3.5 hover:bg-orange-50/30 transition-colors flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center text-[11px] font-extrabold text-orange-600 flex-shrink-0">
                          {clientName.charAt(0)}
                        </div>
                        <div className="text-left">
                          <p className="text-[13px] font-semibold text-gray-900 group-hover:text-orange-600 transition-colors">{clientName}</p>
                          <p className="text-[11px] text-gray-400">
                            {cp.length}건{clientInfo?.company ? ` · ${clientInfo.company}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-gray-900">{(totalAmount / 10000).toFixed(0)}만원</span>
                        <ChevronDown size={14} className={`text-gray-300 transition-transform duration-200 ${isGroupOpen(`c-${clientName}`) ? '' : '-rotate-90'}`} />
                      </div>
                    </button>
                    <AnimatePresence initial={false}>
                      {isGroupOpen(`c-${clientName}`) && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                          {cp.map(project => {
                            const sc = statusConfig[project.status] ?? statusConfig.planning;
                            return (
                              <div key={project.id} className="pl-[60px] pr-5 py-2.5 hover:bg-gray-50 transition-colors flex items-center justify-between border-t border-gray-50">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                                  <span className="text-[13px] text-gray-600 truncate">{project.title}</span>
                                  <span className="text-[11px] text-gray-400 flex-shrink-0">{sc.label}</span>
                                </div>
                                <span className="text-[13px] text-gray-700 ml-4 flex-shrink-0">{(project.budget.totalAmount / 10000).toFixed(0)}만원</span>
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
                <div className="px-5 py-4 bg-gray-50/50 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-500">총 수금 예정</span>
                  <span className="text-[14px] font-extrabold text-gray-900">{(md.clientTotal / 10000).toFixed(0)}만원</span>
                </div>
              </div>
            )}
          </div>

          {/* 파트너 섹션 */}
          <div className="bg-white rounded-2xl border border-divider overflow-hidden">
            <div className="px-5 py-4 border-b border-divider flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Users size={12} className="text-blue-500" />
                </div>
                <h2 className="text-[14px] font-bold text-gray-900">파트너별 지급</h2>
              </div>
              {partnerSettlements.length > 0 && (
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 font-bold">{partnerSettlements.length}명</span>
              )}
            </div>

            {partnerSettlements.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Receipt className="mx-auto mb-3 text-gray-200" size={36} />
                <p className="font-medium text-gray-500">파트너 정산 내역이 없어요</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {partnerSettlements.map(({ partner, partnerProjects, totalAmount, projectCount }) => (
                  <div key={partner.id}>
                    <button
                      onClick={() => toggleGroup(`p-${partner.id}`)}
                      className="w-full px-5 py-3.5 hover:bg-blue-50/30 transition-colors flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-[11px] font-bold text-gray-600 flex-shrink-0">
                          {partner.name.charAt(0)}
                        </div>
                        <div className="text-left">
                          <p className="text-[13px] font-semibold text-gray-900">{partner.name}</p>
                          <p className="text-[11px] text-gray-400">{projectCount}건{partner.email ? ` · ${partner.email}` : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-gray-900">{(totalAmount / 10000).toFixed(0)}만원</span>
                        <ChevronDown size={14} className={`text-gray-300 transition-transform duration-200 ${isGroupOpen(`p-${partner.id}`) ? '' : '-rotate-90'}`} />
                      </div>
                    </button>
                    <AnimatePresence initial={false}>
                      {isGroupOpen(`p-${partner.id}`) && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                          {partnerProjects.map(project => {
                            const sc = statusConfig[project.status] ?? statusConfig.planning;
                            return (
                              <div key={project.id} className="pl-[60px] pr-5 py-2.5 hover:bg-gray-50 transition-colors flex items-center justify-between border-t border-gray-50">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                                  <span className="text-[13px] text-gray-600 truncate">{project.title}</span>
                                  <span className="text-[11px] text-gray-400 flex-shrink-0">{project.client}</span>
                                </div>
                                <span className="text-[13px] text-gray-700 ml-4 flex-shrink-0">{(project.budget.partnerPayment / 10000).toFixed(0)}만원</span>
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
                <div className="px-5 py-4 bg-gray-50/50 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-gray-500">총 지급 예정</span>
                  <span className="text-[14px] font-extrabold text-orange-600">{(md.partnerTotal / 10000).toFixed(0)}만원</span>
                </div>
              </div>
            )}
          </div>

          {/* 매니저 섹션 */}
          <div className="bg-white rounded-2xl border border-divider overflow-hidden">
            <div className="px-5 py-4 border-b border-divider flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center">
                  <ClipboardCheck size={12} className="text-amber-500" />
                </div>
                <h2 className="text-[14px] font-bold text-gray-900">프로젝트별 매니징 비용</h2>
              </div>
            </div>

            {filteredProjects.filter(p => p.budget.managementFee > 0).length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <Receipt className="mx-auto mb-3 text-gray-200" size={36} />
                <p className="font-medium text-gray-500">매니저 정산 내역이 없어요</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[380px]">
                  <div className="px-5 py-2.5 bg-gray-50 grid grid-cols-[1fr_72px_84px_60px] gap-3 text-[10px] font-bold text-gray-400 border-b border-divider">
                    <span>프로젝트</span>
                    <span className="text-right">총 매출</span>
                    <span className="text-right">매니징 비용</span>
                    <span className="text-right">마진율</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {filteredProjects.filter(p => p.budget.managementFee > 0).map(project => {
                      const sc = statusConfig[project.status] ?? statusConfig.planning;
                      return (
                        <div key={project.id} className="px-5 py-3.5 hover:bg-gray-50 transition-colors grid grid-cols-[1fr_72px_84px_60px] gap-3 items-center">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-gray-900 truncate">{project.title}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">{project.client}</p>
                            </div>
                          </div>
                          <p className="text-[13px] text-gray-600 text-right">{(project.budget.totalAmount / 10000).toFixed(0)}만</p>
                          <p className="text-[13px] font-semibold text-orange-500 text-right">{(project.budget.managementFee / 10000).toFixed(0)}만원</p>
                          <p className="text-[13px] font-semibold text-emerald-600 text-right">{project.budget.marginRate}%</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-5 py-4 bg-gray-50/50 grid grid-cols-[1fr_72px_84px_60px] gap-3 items-center">
                    <span className="text-[13px] font-semibold text-gray-500">총 매니징 비용</span>
                    <span className="text-[13px] text-gray-400 text-right">{(md.clientTotal / 10000).toFixed(0)}만</span>
                    <span className="text-[14px] font-extrabold text-orange-500 text-right">{(md.managerTotal / 10000).toFixed(0)}만원</span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
