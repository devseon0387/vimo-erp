'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Receipt, FolderOpen, Briefcase, TrendingUp, ClipboardCheck, Wallet, ArrowRight, ChevronDown } from 'lucide-react';
import { Project, Partner, Client, Episode } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { getProjects, getPartners, getClients, getAllEpisodes } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { groupByClient, groupByPartner, calculateManagerTotal } from '@/lib/settlement';

const statusConfig: Record<string, { label: string; dot: string; badge: string }> = {
  planning:    { label: '시작 전', dot: 'bg-orange-400',   badge: 'bg-orange-50 text-orange-600' },
  in_progress: { label: '진행 중', dot: 'bg-yellow-400', badge: 'bg-yellow-50 text-yellow-700' },
  completed:   { label: '종료',   dot: 'bg-gray-300',   badge: 'bg-gray-100 text-gray-500' },
};

export default function SettlementPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState<'client' | 'partner' | 'manager'>('client');
  const [tabDirection, setTabDirection] = useState(1);
  const [openClients, setOpenClients] = useState<Record<string, boolean>>({});
  const toggleClient = (name: string) => setOpenClients(prev => ({ ...prev, [name]: !prev[name] }));
  const isClientOpen = (name: string) => openClients[name] !== false; // 기본 열림

  const [openPartners, setOpenPartners] = useState<Record<string, boolean>>({});
  const togglePartner = (id: string) => setOpenPartners(prev => ({ ...prev, [id]: !prev[id] }));
  const isPartnerOpen = (id: string) => openPartners[id] !== false; // 기본 열림

  const [episodesMap, setEpisodesMap] = useState<Record<string, (Episode & { projectId: string })[]>>({});
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});
  const toggleProject = (id: string) => setOpenProjects(prev => ({ ...prev, [id]: !prev[id] }));
  const isProjectOpen = (id: string) => openProjects[id] !== false; // 기본 열림

  const TAB_ORDER = ['client', 'partner', 'manager'] as const;
  const switchTab = (tab: 'client' | 'partner' | 'manager') => {
    setTabDirection(TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(activeTab) ? 1 : -1);
    setActiveTab(tab);
  };

  const loadData = useCallback(() => {
    setError(false);
    setLoading(true);
    Promise.all([getProjects(), getPartners(), getClients(), getAllEpisodes()]).then(
      ([projectsData, partnersData, clientsData, allEpisodes]) => {
        setProjects(projectsData);
        setPartners(partnersData);
        setClients(clientsData);

        // 에피소드를 projectId 기준으로 그룹핑
        const epMap: Record<string, typeof allEpisodes> = {};
        allEpisodes.forEach(ep => {
          if (!epMap[ep.projectId]) epMap[ep.projectId] = [];
          epMap[ep.projectId].push(ep);
        });
        setEpisodesMap(epMap);
        setLoading(false);
      }
    ).catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useSupabaseRealtime(['episodes', 'projects', 'partners'], loadData);

  // 이번 달 프로젝트만 필터링
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthProjects = projects.filter(p => {
    const ym = p.createdAt.slice(0, 7);
    return ym === currentYM;
  });

  // 클라이언트 정산
  const clientSettlements = groupByClient(thisMonthProjects, clients);
  const clientGrandTotal = clientSettlements.reduce((s, cs) => s + cs.totalAmount, 0);

  // 파트너 정산
  const partnerSettlements = groupByPartner(thisMonthProjects, partners);
  const partnerGrandTotal = partnerSettlements.reduce((s, ps) => s + ps.totalAmount, 0);

  // 매니저 정산
  const managerTotal = calculateManagerTotal(thisMonthProjects);
  const avgMarginRate = thisMonthProjects.length > 0
    ? (thisMonthProjects.reduce((s, p) => s + p.budget.marginRate, 0) / thisMonthProjects.length).toFixed(1)
    : '0';
  const margin = clientGrandTotal - partnerGrandTotal - managerTotal;

  // 입금/지급 현황 (에피소드 paymentStatus 기준)
  const allThisMonthEpisodes = thisMonthProjects.flatMap(p => episodesMap[p.id] || []);
  const paidEpisodes = allThisMonthEpisodes.filter(ep => ep.paymentStatus === 'completed').length;
  const unpaidEpisodes = allThisMonthEpisodes.length - paidEpisodes;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-500">데이터를 불러오는데 실패했습니다.</p>
        <button onClick={loadData} className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-sm font-medium">
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 sm:gap-3">
            <h1 className="text-page">이번 달 정산</h1>
            <span className="px-2 sm:px-3 py-0.5 sm:py-1 bg-orange-100 text-orange-600 text-xs sm:text-sm rounded-full font-semibold">
              {new Date().getMonth() + 1}월
            </span>
          </div>
          <p className="text-gray-500 mt-1 text-sm hidden sm:block">클라이언트 수금 후 파트너와 매니저에게 지급하세요</p>
        </div>
        <a
          href="/settlement/history"
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-white border border-divider rounded-xl text-xs sm:text-sm font-medium text-gray-600 hover:border-gray-300 transition-all flex-shrink-0"
        >
          <Receipt size={14} />
          <span className="hidden sm:inline">월별 정산 내역</span>
          <span className="sm:hidden">월별</span>
        </a>
      </div>

      {/* 정산 흐름 요약 */}
      <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-divider p-4 sm:p-5">
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-3 sm:gap-3 sm:flex-wrap">
          <div className="sm:flex-1 sm:min-w-[100px]">
            <p className="text-[11px] sm:text-xs text-gray-400 mb-1 flex items-center gap-1.5">
              <Briefcase size={11} className="text-orange-400" />클라이언트 수금
            </p>
            <p className="text-lg sm:text-xl font-bold text-orange-600">{(clientGrandTotal / 10000).toFixed(0)}<span className="text-xs sm:text-sm font-medium text-orange-300 ml-0.5">만원</span></p>
          </div>
          <ArrowRight size={14} className="text-gray-200 flex-shrink-0 hidden sm:block" />
          <div className="sm:flex-1 sm:min-w-[100px]">
            <p className="text-[11px] sm:text-xs text-gray-400 mb-1 flex items-center gap-1.5">
              <Users size={11} className="text-orange-400" />파트너 지급
            </p>
            <p className="text-lg sm:text-xl font-bold text-orange-600">{(partnerGrandTotal / 10000).toFixed(0)}<span className="text-xs sm:text-sm font-medium text-orange-300 ml-0.5">만원</span></p>
          </div>
          <ArrowRight size={14} className="text-gray-200 flex-shrink-0 hidden sm:block" />
          <div className="sm:flex-1 sm:min-w-[100px]">
            <p className="text-[11px] sm:text-xs text-gray-400 mb-1 flex items-center gap-1.5">
              <ClipboardCheck size={11} className="text-orange-400" />매니저 지급
            </p>
            <p className="text-lg sm:text-xl font-bold text-orange-500">{(managerTotal / 10000).toFixed(0)}<span className="text-xs sm:text-sm font-medium text-orange-300 ml-0.5">만원</span></p>
          </div>
          <ArrowRight size={14} className="text-gray-200 flex-shrink-0 hidden sm:block" />
          <div className="sm:flex-1 sm:min-w-[100px]">
            <p className="text-[11px] sm:text-xs text-gray-400 mb-1 flex items-center gap-1.5">
              <Wallet size={11} className="text-emerald-400" />유보금
            </p>
            <p className="text-lg sm:text-xl font-bold text-emerald-600">{(margin / 10000).toFixed(0)}<span className="text-xs sm:text-sm font-medium text-emerald-300 ml-0.5">만원</span></p>
          </div>
        </div>
        {allThisMonthEpisodes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-divider flex items-center gap-4 text-xs">
            <span className="text-gray-400">입금 현황</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-gray-600">완료 {paidEpisodes}건</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              <span className="text-gray-600">대기 {unpaidEpisodes}건</span>
            </span>
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
        </div>
      )}

      {/* 탭 네비게이션 */}
      <div className="bg-white rounded-xl sm:rounded-2xl p-1 sm:p-2 shadow-sm border border-divider flex sm:inline-flex gap-0.5 sm:gap-2 w-full sm:w-auto">
        {([
          { key: 'client'  as const, icon: Briefcase,     label: '클라이언트', labelFull: '클라이언트 정산' },
          { key: 'partner' as const, icon: Users,          label: '파트너', labelFull: '파트너 정산' },
          { key: 'manager' as const, icon: ClipboardCheck, label: '매니저', labelFull: '매니저 정산' },
        ]).map(({ key, icon: Icon, label, labelFull }) => (
          <button key={key} onClick={() => switchTab(key)} className="relative flex-1 sm:flex-initial px-2 py-2.5 sm:px-6 sm:py-3 rounded-lg sm:rounded-xl font-semibold">
            {activeTab === key && (
              <motion.div
                layoutId="settlement-tab-pill"
                className="absolute inset-0 bg-orange-500 rounded-lg sm:rounded-xl shadow-lg shadow-orange-500/30"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <div className={`relative flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-base transition-colors duration-200 ${activeTab === key ? 'text-white' : 'text-gray-600 hover:text-gray-900'}`}>
              <Icon size={14} className="sm:w-[18px] sm:h-[18px]" />
              <span className="sm:hidden">{label}</span>
              <span className="hidden sm:inline">{labelFull}</span>
            </div>
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <div style={{ overflowX: 'clip' }}>
        <AnimatePresence mode="wait" custom={tabDirection}>
          <motion.div
            key={activeTab}
            custom={tabDirection}
            variants={{
              enter: (dir: number) => ({ x: dir > 0 ? 50 : -50, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit:  (dir: number) => ({ x: dir > 0 ? -50 : 50, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
          >

          {/* 클라이언트 정산 */}
          {activeTab === 'client' && (
            <div className="bg-white rounded-2xl shadow-sm border border-divider overflow-hidden">
              <div className="px-5 py-4 border-b border-divider flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase size={16} className="text-orange-500" />
                  <h2 className="font-semibold text-gray-900">클라이언트별 정산 내역</h2>
                </div>
                {clientSettlements.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-bold">{clientSettlements.length}개</span>
                )}
              </div>

              {clientSettlements.length === 0 ? (
                <div className="py-20 text-center text-gray-400">
                  <Receipt className="mx-auto mb-3 text-gray-200" size={36} />
                  <p className="font-medium text-gray-500">정산 내역이 없어요</p>
                  <p className="text-xs mt-1">프로젝트를 추가하면 표시됩니다</p>
                </div>
              ) : (
                <>
                  {clientSettlements.map(({ clientName, clientInfo, projects: cp, totalAmount }) => (
                    <div key={clientName} className="divide-y divide-gray-50">
                      {/* 클라이언트 그룹 헤더 */}
                      <button
                        onClick={() => toggleClient(clientName)}
                        className="w-full px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <ChevronDown
                            size={14}
                            className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ${isClientOpen(clientName) ? '' : '-rotate-90'}`}
                          />
                          <span className="text-sm font-semibold text-gray-800">{clientName}</span>
                          {clientInfo?.company && <span className="text-xs text-gray-400">{clientInfo.company}</span>}
                          <span className="text-xs text-gray-400">·</span>
                          <span className="text-xs text-gray-400">{cp.length}건</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{(totalAmount / 10000).toFixed(0)}만원</span>
                      </button>
                      {/* 프로젝트 서브 행 (모바일 숨김) */}
                      <div className="hidden sm:block">
                      <AnimatePresence initial={false}>
                        {isClientOpen(clientName) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                            style={{ overflow: 'hidden' }}
                          >
                            {cp.map(project => {
                              const sc = statusConfig[project.status] ?? statusConfig.planning;
                              const episodes = (episodesMap[project.id] || []) as Episode[];
                              return (
                                <div key={project.id}>
                                  <button
                                    onClick={() => episodes.length > 0 && toggleProject(project.id)}
                                    className={`w-full pl-10 pr-5 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between border-t border-gray-50 ${episodes.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      {episodes.length > 0 && (
                                        <ChevronDown size={12} className={`text-gray-300 transition-transform duration-200 flex-shrink-0 ${isProjectOpen(project.id) ? '' : '-rotate-90'}`} />
                                      )}
                                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                                      <span className="text-sm text-gray-600 truncate">{project.title}</span>
                                      <span className="text-xs text-gray-400 flex-shrink-0">{sc.label}</span>
                                      {episodes.length > 0 && (
                                        <span className="text-xs text-gray-300 flex-shrink-0">{episodes.length}회차</span>
                                      )}
                                    </div>
                                    <span className="text-sm text-gray-700 ml-4 flex-shrink-0">{(project.budget.totalAmount / 10000).toFixed(0)}만원</span>
                                  </button>
                                  <AnimatePresence initial={false}>
                                    {isProjectOpen(project.id) && episodes.length > 0 && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        style={{ overflow: 'hidden' }}
                                      >
                                        {episodes.map(ep => (
                                          <div key={ep.id} className="pl-16 pr-5 py-2.5 flex items-center justify-between border-t border-gray-50 bg-gray-50/50">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="text-xs text-orange-400 font-semibold flex-shrink-0">{ep.episodeNumber}편</span>
                                              <span className="text-sm text-gray-600 truncate">{ep.title}</span>
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                                ep.paymentStatus === 'completed'
                                                  ? 'bg-green-50 text-green-600'
                                                  : 'bg-orange-50 text-orange-500'
                                              }`}>
                                                {ep.paymentStatus === 'completed' ? '입금완료' : '입금대기'}
                                              </span>
                                            </div>
                                            {ep.budget && (
                                              <span className="text-xs text-gray-500 ml-3 flex-shrink-0">{(ep.budget.totalAmount / 10000).toFixed(0)}만원</span>
                                            )}
                                          </div>
                                        ))}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      </div>
                    </div>
                  ))}
                  <div className="px-5 py-4 border-t border-divider flex items-center justify-between">
                    <span className="text-sm text-gray-500">총 수금 예정</span>
                    <span className="text-sm font-semibold text-gray-800">{(clientGrandTotal / 10000).toFixed(0)}만원</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 파트너 정산 */}
          {activeTab === 'partner' && (
            <div className="bg-white rounded-2xl shadow-sm border border-divider overflow-hidden">
              <div className="px-5 py-4 border-b border-divider flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-orange-500" />
                  <h2 className="font-semibold text-gray-900">파트너별 정산 내역</h2>
                </div>
                {partnerSettlements.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-bold">{partnerSettlements.length}명</span>
                )}
              </div>

              {partnerSettlements.length === 0 ? (
                <div className="py-20 text-center text-gray-400">
                  <Receipt className="mx-auto mb-3 text-gray-200" size={36} />
                  <p className="font-medium text-gray-500">정산 내역이 없어요</p>
                  <p className="text-xs mt-1">프로젝트에 파트너를 연결하면 표시됩니다</p>
                </div>
              ) : (
                <>
                  {partnerSettlements.map(({ partner, partnerProjects, totalAmount, projectCount }) => (
                    <div key={partner.id} className="divide-y divide-gray-50">
                      {/* 파트너 그룹 헤더 */}
                      <button
                        onClick={() => togglePartner(partner.id)}
                        className="w-full px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <ChevronDown
                            size={14}
                            className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ${isPartnerOpen(partner.id) ? '' : '-rotate-90'}`}
                          />
                          <span className="text-sm font-semibold text-gray-800">{partner.name}</span>
                          {partner.email && <span className="text-xs text-gray-400">{partner.email}</span>}
                          <span className="text-xs text-gray-400">·</span>
                          <span className="text-xs text-gray-400">{projectCount}건</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{(totalAmount / 10000).toFixed(0)}만원</span>
                      </button>
                      {/* 프로젝트 서브 행 (모바일 숨김) */}
                      <div className="hidden sm:block">
                      <AnimatePresence initial={false}>
                        {isPartnerOpen(partner.id) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                            style={{ overflow: 'hidden' }}
                          >
                            {partnerProjects.map(project => {
                              const sc = statusConfig[project.status] ?? statusConfig.planning;
                              const episodes = (episodesMap[project.id] || []) as Episode[];
                              return (
                                <div key={project.id}>
                                  <button
                                    onClick={() => episodes.length > 0 && toggleProject(`p-${project.id}`)}
                                    className={`w-full pl-10 pr-5 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between border-t border-gray-50 ${episodes.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      {episodes.length > 0 && (
                                        <ChevronDown size={12} className={`text-gray-300 transition-transform duration-200 flex-shrink-0 ${isProjectOpen(`p-${project.id}`) ? '' : '-rotate-90'}`} />
                                      )}
                                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                                      <span className="text-sm text-gray-600 truncate">{project.title}</span>
                                      <span className="text-xs text-gray-400 flex-shrink-0">{project.client}</span>
                                      {episodes.length > 0 && (
                                        <span className="text-xs text-gray-300 flex-shrink-0">{episodes.length}회차</span>
                                      )}
                                    </div>
                                    <span className="text-sm text-gray-700 ml-4 flex-shrink-0">{(project.budget.partnerPayment / 10000).toFixed(0)}만원</span>
                                  </button>
                                  <AnimatePresence initial={false}>
                                    {isProjectOpen(`p-${project.id}`) && episodes.length > 0 && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        style={{ overflow: 'hidden' }}
                                      >
                                        {episodes.map(ep => (
                                          <div key={ep.id} className="pl-16 pr-5 py-2.5 flex items-center justify-between border-t border-gray-50 bg-gray-50/50">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="text-xs text-orange-400 font-semibold flex-shrink-0">{ep.episodeNumber}편</span>
                                              <span className="text-sm text-gray-600 truncate">{ep.title}</span>
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                                ep.paymentStatus === 'completed'
                                                  ? 'bg-green-50 text-green-600'
                                                  : 'bg-orange-50 text-orange-500'
                                              }`}>
                                                {ep.paymentStatus === 'completed' ? '지급완료' : '지급대기'}
                                              </span>
                                            </div>
                                            {ep.budget && (
                                              <span className="text-xs text-gray-500 ml-3 flex-shrink-0">{(ep.budget.partnerPayment / 10000).toFixed(0)}만원</span>
                                            )}
                                          </div>
                                        ))}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      </div>
                    </div>
                  ))}
                  <div className="px-5 py-4 border-t border-divider flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-500">총 지급 예정</span>
                    <span className="text-base font-bold text-orange-600">{(partnerGrandTotal / 10000).toFixed(0)}만원</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 매니저 정산 */}
          {activeTab === 'manager' && (
            <div className="bg-white rounded-2xl shadow-sm border border-divider overflow-hidden">
              <div className="px-5 py-4 border-b border-divider flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={16} className="text-orange-500" />
                  <h2 className="font-semibold text-gray-900">프로젝트별 매니징 비용</h2>
                </div>
                <span className="text-xs text-gray-400">평균 마진율 {avgMarginRate}%</span>
              </div>

              {thisMonthProjects.length === 0 ? (
                <div className="py-20 text-center text-gray-400">
                  <Receipt className="mx-auto mb-3 text-gray-200" size={36} />
                  <p className="font-medium text-gray-500">정산 내역이 없어요</p>
                </div>
              ) : (
                <div>
                  <div>
                  {/* 컬럼 헤더 */}
                  <div className="px-3 sm:px-5 py-2.5 bg-gray-50 grid grid-cols-[1fr_70px_80px] sm:grid-cols-[1fr_72px_84px_60px] gap-2 sm:gap-3 text-[10px] sm:text-xs font-semibold text-gray-400 border-b border-divider">
                    <span>프로젝트</span>
                    <span className="text-right hidden sm:block">총 매출</span>
                    <span className="text-right">매니징 비용</span>
                    <span className="text-right hidden sm:block">마진율</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {thisMonthProjects.map(project => {
                      const sc = statusConfig[project.status] ?? statusConfig.planning;
                      return (
                        <div key={project.id} className="px-3 sm:px-5 py-3 sm:py-3.5 hover:bg-gray-50 transition-colors grid grid-cols-[1fr_70px_80px] sm:grid-cols-[1fr_72px_84px_60px] gap-2 sm:gap-3 items-center">
                          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                            <div className="min-w-0">
                              <p className="text-[13px] sm:text-sm font-medium text-gray-900 truncate">{project.title}</p>
                              <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">{project.client}</p>
                            </div>
                          </div>
                          <p className="text-[13px] sm:text-sm text-gray-600 text-right hidden sm:block">{(project.budget.totalAmount / 10000).toFixed(0)}만</p>
                          <p className="text-[13px] sm:text-sm font-semibold text-orange-500 text-right">{(project.budget.managementFee / 10000).toFixed(0)}만원</p>
                          <p className="text-[13px] sm:text-sm font-semibold text-emerald-600 text-right hidden sm:block">{project.budget.marginRate}%</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-3 sm:px-5 py-3 sm:py-4 border-t border-divider grid grid-cols-[1fr_70px_80px] sm:grid-cols-[1fr_72px_84px_60px] gap-2 sm:gap-3 items-center">
                    <span className="text-[13px] sm:text-sm font-semibold text-gray-500">총 매니징 비용</span>
                    <span className="text-[13px] sm:text-sm text-gray-400 text-right hidden sm:block">{(clientGrandTotal / 10000).toFixed(0)}만</span>
                    <span className="text-[14px] sm:text-base font-bold text-orange-500 text-right">{(managerTotal / 10000).toFixed(0)}만원</span>
                    <span className="text-sm font-semibold text-emerald-600 text-right">{avgMarginRate}%</span>
                  </div>
                  </div>
                </div>
              )}
            </div>
          )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
