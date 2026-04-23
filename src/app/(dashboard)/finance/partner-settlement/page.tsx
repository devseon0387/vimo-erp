'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Receipt, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Project, Partner, Episode } from '@/types';
import { getProjects, getPartners, getAllEpisodes } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import Link from 'next/link';

interface SettlementRow {
  person: Partner;
  type: 'partner' | 'manager';
  episodeCount: number;
  projectNames: string[];
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  nearestDueDate: string | null;
  detailHref: string;
}

export default function SettlementPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [allEpisodes, setAllEpisodes] = useState<(Episode & { projectId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<'all' | 'partner' | 'manager'>('all');

  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  const prevMonth = () => {
    setSelectedDate(prev => prev.month === 1
      ? { year: prev.year - 1, month: 12 }
      : { year: prev.year, month: prev.month - 1 }
    );
  };

  const isMinMonth = selectedDate.year === 2026 && selectedDate.month === 3;

  const nextMonth = () => {
    setSelectedDate(prev => prev.month === 12
      ? { year: prev.year + 1, month: 1 }
      : { year: prev.year, month: prev.month + 1 }
    );
  };

  const loadData = useCallback(() => {
    setError(false);
    setLoading(true);
    Promise.all([getProjects(), getPartners(), getAllEpisodes()]).then(
      ([p, pa, ep]) => { setProjects(p); setPartners(pa); setAllEpisodes(ep); setLoading(false); }
    ).catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useSupabaseRealtime(['episodes', 'projects', 'partners'], loadData);

  const selectedYM = `${selectedDate.year}-${String(selectedDate.month).padStart(2, '0')}`;

  const episodesMap = useMemo(() => {
    const map: Record<string, (Episode & { projectId: string })[]> = {};
    allEpisodes.forEach(ep => {
      if (!map[ep.projectId]) map[ep.projectId] = [];
      map[ep.projectId].push(ep);
    });
    return map;
  }, [allEpisodes]);

  // 통합 정산 데이터 (아카이브 프로젝트 제외)
  const activeProjects = useMemo(() => projects.filter(p => p.status !== 'archived'), [projects]);

  const rows: SettlementRow[] = useMemo(() => {
    const result: SettlementRow[] = [];

    // 매니저 ID 목록 (매니저로 등록된 프로젝트가 있는 사람)
    const managerIds = new Set(
      partners.filter(p => activeProjects.some(proj => proj.managerIds?.includes(p.id))).map(p => p.id)
    );

    // 파트너 정산 — 매니저인 사람은 제외
    partners.forEach(partner => {
      if (managerIds.has(partner.id)) return; // 매니저는 파트너 행에서 제외

      const partnerProjects = activeProjects.filter(p => p.partnerIds?.includes(partner.id) || p.partnerId === partner.id);
      let totalAmount = 0, paidAmount = 0, episodeCount = 0;
      const projectIds = new Set<string>();
      const unpaidDueDates: string[] = [];

      partnerProjects.forEach(project => {
        const episodes = (episodesMap[project.id] || []).filter(
          ep => (ep.assignee === partner.id || ep.assignee === partner.name) && ep.paymentDueDate?.slice(0, 7) === selectedYM
        );
        if (episodes.length > 0) {
          episodeCount += episodes.length;
          projectIds.add(project.id);
          episodes.forEach(ep => {
            const amt = ep.budget?.partnerPayment ?? 0;
            totalAmount += amt;
            if (ep.paymentStatus === 'completed') paidAmount += amt;
            else if (ep.paymentDueDate) unpaidDueDates.push(ep.paymentDueDate);
          });
        }
      });

      if (episodeCount > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const sorted = unpaidDueDates.sort((a, b) => Math.abs(new Date(a).getTime() - new Date(today).getTime()) - Math.abs(new Date(b).getTime() - new Date(today).getTime()));
        const projectNames = [...projectIds].map(id => activeProjects.find(p => p.id === id)?.title || '').filter(Boolean);
        result.push({
          person: partner, type: 'partner', episodeCount,
          projectNames, totalAmount, paidAmount, unpaidAmount: totalAmount - paidAmount,
          nearestDueDate: sorted[0] ?? null,
          detailHref: `/finance/partner-settlement/${partner.id}?year=${selectedDate.year}&month=${selectedDate.month}`,
        });
      }
    });

    // 매니저 정산 — 매니징 비용 + 작업 비용(assignee) 통합
    partners.forEach(manager => {
      if (!managerIds.has(manager.id)) return;

      let managementTotal = 0, workTotal = 0, paidAmount = 0, episodeCount = 0;
      const projectIds = new Set<string>();
      const unpaidDueDates: string[] = [];

      // 매니징 비용 (manager로 배정된 에피소드)
      activeProjects.forEach(project => {
        const episodes = (episodesMap[project.id] || []).filter(
          ep => (ep.manager === manager.id || ep.manager === manager.name) && ep.paymentDueDate?.slice(0, 7) === selectedYM
        );
        if (episodes.length > 0) {
          episodeCount += episodes.length;
          projectIds.add(project.id);
          episodes.forEach(ep => {
            const amt = ep.budget?.managementFee ?? 0;
            managementTotal += amt;
            if (ep.paymentStatus === 'completed') paidAmount += amt;
            else if (ep.paymentDueDate) unpaidDueDates.push(ep.paymentDueDate);
          });
        }
      });

      // 작업 비용 (매니저가 assignee인 모든 에피소드)
      activeProjects.forEach(project => {
        const episodes = (episodesMap[project.id] || []).filter(
          ep => (ep.assignee === manager.id || ep.assignee === manager.name) && ep.paymentDueDate?.slice(0, 7) === selectedYM
        );
        episodes.forEach(ep => {
          const amt = ep.budget?.partnerPayment ?? 0;
          workTotal += amt;
          projectIds.add(project.id);
          if (ep.paymentStatus === 'completed') paidAmount += amt;
          else if (ep.paymentDueDate && !unpaidDueDates.includes(ep.paymentDueDate)) unpaidDueDates.push(ep.paymentDueDate);
        });
      });

      const totalAmount = managementTotal + workTotal;
      if (episodeCount > 0 || workTotal > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const sorted = unpaidDueDates.sort((a, b) => Math.abs(new Date(a).getTime() - new Date(today).getTime()) - Math.abs(new Date(b).getTime() - new Date(today).getTime()));
        const projectNames = [...projectIds].map(id => activeProjects.find(p => p.id === id)?.title || '').filter(Boolean);
        result.push({
          person: manager, type: 'manager', episodeCount,
          projectNames, totalAmount, paidAmount, unpaidAmount: totalAmount - paidAmount,
          nearestDueDate: sorted[0] ?? null,
          detailHref: `/finance/manager-settlement/${manager.id}?year=${selectedDate.year}&month=${selectedDate.month}`,
        });
      }
    });

    return result.sort((a, b) => {
      // 파트너 우선, 같은 구분이면 금액 높은 순
      if (a.type !== b.type) return a.type === 'partner' ? -1 : 1;
      return b.totalAmount - a.totalAmount;
    });
  }, [partners, activeProjects, episodesMap, selectedYM, selectedDate]);

  const filtered = filter === 'all' ? rows : rows.filter(r => r.type === filter);
  const grandTotal = filtered.reduce((s, r) => s + r.totalAmount, 0);
  const grandPaid = filtered.reduce((s, r) => s + r.paidAmount, 0);
  const grandUnpaid = grandTotal - grandPaid;
  const paidPct = grandTotal > 0 ? Math.round((grandPaid / grandTotal) * 100) : 0;
  const unpaidPct = 100 - paidPct;
  const unpaidCount = filtered.filter(r => r.unpaidAmount > 0).length;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-500">데이터를 불러오는데 실패했습니다.</p>
        <button onClick={loadData} className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-sm font-medium">다시 시도</button>
      </div>
    );
  }

  const tabs = [
    { key: 'all' as const, label: '전체' },
    { key: 'partner' as const, label: '파트너' },
    { key: 'manager' as const, label: '매니저' },
  ];

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="space-y-3">
        <div>
          <h1 className="text-page">정산 관리</h1>
          <p className="text-gray-500 mt-1 text-sm">{selectedDate.year}년 {selectedDate.month}월</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* 탭 */}
          <div className="inline-flex gap-0.5 sm:gap-1 p-1 bg-white border border-divider rounded-xl">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className="relative px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[12px] sm:text-[13px] font-semibold"
              >
                {filter === tab.key && (
                  <motion.div
                    layoutId="settlement-tab"
                    className="absolute inset-0 bg-orange-500 rounded-lg shadow-sm shadow-orange-500/20"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className={`relative z-10 ${filter === tab.key ? 'text-white' : 'text-[#78716c]'}`}>{tab.label}</span>
              </button>
            ))}
          </div>
          {/* 월 이동 */}
          <div className="flex items-center gap-1 bg-white border border-divider rounded-[10px] px-1 py-1">
            <button onClick={prevMonth} disabled={isMinMonth} className={`p-1.5 rounded-lg transition-colors ${isMinMonth ? 'invisible' : 'hover:bg-gray-100'}`}>
              <ChevronLeft size={14} className="text-[#a8a29e]" />
            </button>
            <div className="px-2.5 py-1 min-w-[90px] text-center overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={`${selectedDate.year}-${selectedDate.month}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="block text-[13px] font-semibold text-gray-800 tabular-nums"
                >
                  {String(selectedDate.year).slice(2)}년 {String(selectedDate.month).padStart(2, '0')}월
                </motion.span>
              </AnimatePresence>
            </div>
            <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight size={14} className="text-[#a8a29e]" />
            </button>
          </div>
        </div>
      </div>

      {/* 통합 카드: 통계 + 테이블 */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-divider" style={{ overflow: 'clip' }}>
        {/* 통계 바 */}
        <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-[#f0ece9]">
          <div className="flex items-baseline justify-between mb-1.5">
            <motion.span key={`label-${selectedYM}-${filter}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="text-[11px] sm:text-[13px] text-[#a8a29e]">
              총 지급 예정 · {filtered.length}명{unpaidCount > 0 ? ` 중 ${unpaidCount}명 미지급` : ''}
            </motion.span>
            <motion.span key={`total-${selectedYM}-${filter}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="text-[18px] sm:text-[22px] font-extrabold tracking-tight">
              {grandTotal.toLocaleString()}<span className="text-[11px] sm:text-[13px] text-[#78716c] font-medium ml-0.5">원</span>
            </motion.span>
          </div>
          <div className="h-[6px] bg-[#f0ece9] rounded-full overflow-hidden flex gap-0.5 mb-1.5">
            <motion.div
              initial={false}
              animate={{ width: grandTotal > 0 ? `${paidPct}%` : '0%' }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
              className="h-full bg-green-500 rounded-full"
            />
            <motion.div
              initial={false}
              animate={{ width: grandTotal > 0 ? `${unpaidPct}%` : '0%' }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
              className="h-full bg-orange-500 rounded-full"
            />
          </div>
          <motion.div key={`legend-${selectedYM}-${filter}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.1 }} className="flex justify-between text-[12px]">
            <div className="flex items-center gap-1.5"><div className="w-2 h-1 bg-green-500 rounded-sm" /><span className="text-green-600 font-semibold">완료 {grandPaid.toLocaleString()}</span><span className="text-[#a8a29e]">({paidPct}%)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-1 bg-orange-500 rounded-sm" /><span className="text-orange-500 font-semibold">대기 {grandUnpaid.toLocaleString()}</span><span className="text-[#a8a29e]">({unpaidPct}%)</span></div>
          </motion.div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
          </div>
        ) : (
          <div style={{ overflowX: 'clip' }}>
            <div>
              {/* 테이블 헤더 (데스크탑) */}
              <div className="hidden sm:grid grid-cols-[1fr_1fr_110px_110px_80px_70px] gap-3 px-5 py-2.5 text-[11px] font-semibold text-[#a8a29e] border-b border-[#f0ece9]">
                <span>이름</span>
                <span>프로젝트</span>
                <span className="text-right">정산 금액</span>
                <span className="text-right">대기 금액</span>
                <span className="text-right">가까운 정산일</span>
                <span className="text-right">상태</span>
              </div>
              {filtered.length === 0 ? (
                <div className="py-20 text-center text-gray-400">
                  <Receipt className="mx-auto mb-3 text-gray-200" size={36} />
                  <p className="font-medium text-gray-500">정산 내역이 없어요</p>
                  <p className="text-xs mt-1">{selectedDate.year}년 {selectedDate.month}월에 해당하는 내역이 없습니다</p>
                </div>
              ) : (
                <div className="divide-y divide-[#f8f7f6]">
                  {filtered.map((row, idx) => {
                    const projLabel = row.projectNames.length > 1
                      ? `${row.projectNames[0]} 외 ${row.projectNames.length - 1}`
                      : row.projectNames[0] || '';
                    return (
                      <motion.div
                        key={`${row.type}-${row.person.id}-${selectedYM}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05, ease: 'easeOut' }}
                      >
                      {/* 모바일: C안 카드형 */}
                      <Link
                        href={row.detailHref}
                        className="flex sm:hidden items-center justify-between px-4 py-3.5 hover:bg-[#fafaf9] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-[10px] min-w-0">
                          <div className={`w-[34px] h-[34px] rounded-full flex items-center justify-center flex-shrink-0 ${
                            row.type === 'manager' ? 'bg-purple-500' : 'bg-orange-500'
                          }`}>
                            <User size={16} className="text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-[6px]">
                              <span className="text-[15px] font-bold text-gray-900">{row.person.name}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                                row.type === 'manager' ? 'bg-purple-50 text-purple-600' : 'bg-[#fff7ed] text-orange-500'
                              }`}>
                                {row.type === 'manager' ? '매니저' : '파트너'}
                              </span>
                            </div>
                            <span className="text-[11px] text-[#a8a29e]">
                              {row.episodeCount > 0 && `${row.episodeCount}회차`}{row.episodeCount > 0 && projLabel && ' · '}{projLabel}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <div className={`text-[16px] font-extrabold tabular-nums ${row.unpaidAmount > 0 ? 'text-[#ea580c]' : 'text-[#16a34a]'}`}>
                            {row.unpaidAmount > 0 ? row.unpaidAmount.toLocaleString() : '0'}<span className={`text-[11px] font-medium ${row.unpaidAmount > 0 ? 'text-[#ea580c]' : 'text-[#16a34a]'}`}>원</span>
                          </div>
                          <div className={`text-[10px] ${row.unpaidAmount > 0 ? 'text-[#a8a29e]' : 'text-[#16a34a]'}`}>
                            {row.unpaidAmount > 0
                              ? row.nearestDueDate
                                ? `미지급 · ${(() => { const d = new Date(row.nearestDueDate); return `${d.getMonth()+1}.${d.getDate()}`; })()} 예정`
                                : '미지급'
                              : '완료'}
                          </div>
                        </div>
                      </Link>
                      {/* 데스크탑: 기존 테이블 행 */}
                      <Link
                        href={row.detailHref}
                        className="hidden sm:grid grid-cols-[1fr_1fr_110px_110px_80px_70px] gap-3 px-5 py-3.5 items-center hover:bg-[#fafaf9] transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                            row.type === 'manager' ? 'bg-purple-500' : 'bg-orange-500'
                          }`}>
                            <User size={14} className="text-white" />
                          </div>
                          <span className="text-[14px] font-semibold text-gray-900 truncate">{row.person.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                            row.type === 'manager' ? 'bg-purple-50 text-purple-600' : 'bg-[#fff7ed] text-orange-500'
                          }`}>
                            {row.type === 'manager' ? '매니저' : '파트너'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {projLabel && (
                            <span className="text-[12px] text-[#44403c] font-medium truncate">{projLabel}</span>
                          )}
                          <span className="text-[11px] text-[#a8a29e] flex-shrink-0">{row.episodeCount}회차</span>
                        </div>
                        <span className="text-[14px] font-semibold text-gray-900 text-right tabular-nums">{row.totalAmount.toLocaleString()}</span>
                        <span className={`text-[14px] text-right font-semibold tabular-nums ${row.unpaidAmount > 0 ? 'text-orange-500' : 'text-[#a8a29e]'}`}>
                          {row.unpaidAmount > 0 ? row.unpaidAmount.toLocaleString() : '0'}
                        </span>
                        <span className="text-[12px] text-right tabular-nums text-[#a8a29e]">
                          {row.nearestDueDate ? (() => { const d = new Date(row.nearestDueDate); return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; })() : '-'}
                        </span>
                        <div className="text-right">
                          {row.unpaidAmount > 0 ? (
                            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#fff7ed] text-orange-500 font-semibold">미지급</span>
                          ) : (
                            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#f0fdf4] text-green-600 font-semibold">완료</span>
                          )}
                        </div>
                      </Link>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
