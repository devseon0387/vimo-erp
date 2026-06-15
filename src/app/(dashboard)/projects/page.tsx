'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getProjects, insertProject, insertClient, getClients as fetchClients, getAllEpisodes, getPartners, upsertEpisodes } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { Calendar, User, X, ChevronDown, ArrowRight, Plus, Building2 } from 'lucide-react';
import { calculateReserve, getComputedProjectStatus, compareProjects, ComputedProjectStatus } from '@/lib/utils';
import Link from 'next/link';
import { Project, Client, Episode, WorkContentType, Partner } from '@/types';
import { updateEpisodeFields } from '@/lib/supabase/db';
import { FloatingLabelInput } from '@/components/FloatingLabelInput';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
// 대형 마법사 모달(1.4k줄)은 라우트 초기 청크에서 분리 — 열릴 때 로드(닫힌 상태는 동일하게 무표시).
const ProjectWizardModal = dynamic(() => import('@/components/ProjectWizardModal'), { ssr: false });
import { useToast } from '@/contexts/ToastContext';
import { TabBar } from '@/components/TabBar';
import { StatusBadge as StatusChip } from '@/components/StatusBadge';
import { SearchInput } from '@/components/SearchInput';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { Inbox } from 'lucide-react';


interface EpisodeWithProjectId extends Episode {
  projectId: string;
}

export default function ProjectsPage() {
  // Supabase에서 프로젝트 데이터 로드
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Supabase에서 클라이언트 데이터 로드
  const [clients, setClients] = useState<Client[]>([]);

  // Supabase에서 회차 데이터 로드
  const [episodes, setEpisodes] = useState<EpisodeWithProjectId[]>([]);

  // Supabase에서 파트너 데이터 로드
  const [allPartners, setAllPartners] = useState<Partner[]>([]);

  const loadData = useCallback(async () => {
    const [projectsData, clientsData, episodesData, partnersData] = await Promise.all([
      getProjects(),
      fetchClients(),
      getAllEpisodes(),
      getPartners(),
    ]);
    setProjects(projectsData);
    setClients(clientsData);
    setEpisodes(episodesData);
    setAllPartners(partnersData);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useSupabaseRealtime(['projects', 'episodes', 'clients', 'partners'], loadData);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === 'new-project') setIsAddModalOpen(true);
    };
    window.addEventListener('fab:action', handler);
    return () => window.removeEventListener('fab:action', handler);
  }, []);
  const [activeFilter, setActiveFilter] = useState<'all' | ComputedProjectStatus | 'standby_dormant' | 'archived'>('active');
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'amount' | 'name'>('recent');

  // 작업 타입 모달 상태
  const [selectedWorkTypeModal, setSelectedWorkTypeModal] = useState<{ episodeId: string; workType: WorkContentType } | null>(null);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const modalCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const globalToast = useToast();
  // 이 useEffect를 제거했습니다 - localStorage 덮어쓰기 문제 해결

  // ⚠️ 회차 자동 저장 제거 - 모달에서 상태 변경 시에만 저장
  // episodes 상태가 바뀔 때마다 저장하면 다른 회차가 삭제될 수 있습니다.

  // 모달 닫기 함수
  const closeModal = () => {
    setIsModalClosing(true);
    if (modalCloseTimeoutRef.current) {
      clearTimeout(modalCloseTimeoutRef.current);
    }
    modalCloseTimeoutRef.current = setTimeout(() => {
      setSelectedWorkTypeModal(null);
      setIsModalClosing(false);
    }, 200);
  };

  // 프로젝트별 에피소드 & 계산된 상태 — 데이터 변경 시에만 재계산(검색 타이핑마다 Map 재생성 방지).
  const { projectEpisodesMap, projectStatusMap } = useMemo(() => {
    const projectEpisodesMap = new Map<string, Episode[]>();
    const projectStatusMap = new Map<string, ComputedProjectStatus>();
    projects.forEach(project => {
      const projectEpisodes = episodes.filter(e => e.projectId === project.id);
      projectEpisodesMap.set(project.id, projectEpisodes);
      projectStatusMap.set(project.id, getComputedProjectStatus(projectEpisodes));
    });
    return { projectEpisodesMap, projectStatusMap };
  }, [projects, episodes]);

  // 필터링 및 정렬된 프로젝트 목록 — 필터/검색/정렬·데이터 변경 시에만.
  const filteredAndSortedProjects = useMemo(() => projects
    .filter(project => {
      // 필터 적용
      // 아카이브 필터
      if (activeFilter === 'archived') {
        return project.status === 'archived';
      }
      // 아카이브 프로젝트는 '전체'에서도 제외
      if (project.status === 'archived') return false;

      if (activeFilter === 'standby_dormant') {
        const s = projectStatusMap.get(project.id);
        if (s !== 'standby' && s !== 'dormant') return false;
      } else if (activeFilter !== 'all' && projectStatusMap.get(project.id) !== activeFilter) return false;

      // 검색 적용
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          project.title.toLowerCase().includes(query) ||
          project.client.toLowerCase().includes(query)
        );
      }

      return true;
    })
    .sort((a, b) => {
      // 정렬 적용
      if (sortBy === 'recent') {
        return compareProjects(
          projectEpisodesMap.get(a.id)!, projectStatusMap.get(a.id)!,
          projectEpisodesMap.get(b.id)!, projectStatusMap.get(b.id)!,
        );
      } else if (sortBy === 'amount') {
        return b.budget.totalAmount - a.budget.totalAmount;
      } else if (sortBy === 'name') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    }), [projects, episodes, projectEpisodesMap, projectStatusMap, activeFilter, searchQuery, sortBy]);

  // 통계 계산
  const stats = useMemo(() => ({
    total: projects.length,
    inProgress: projects.filter(p => p.status === 'in_progress').length,
    totalRevenue: projects.reduce((sum, p) => sum + p.budget.totalAmount, 0),
    avgMargin: projects.length > 0
      ? projects.reduce((sum, p) => sum + p.budget.marginRate, 0) / projects.length
      : 0,
  }), [projects]);

  // 오늘 전달할 회차 계산
  const todayDeliveries = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return episodes.filter(episode => episode.dueDate === today)
      .map(episode => {
        const project = projects.find(p => p.id === episode.projectId);
        return { episode, project };
      })
      .filter(item => item.project); // 프로젝트가 있는 것만
  }, [episodes, projects]);

  const handleWizardComplete = async (data: any) => {
    try {
      // 클라이언트 처리
      let clientName = '';
      if (data.client?.isNew && data.client.name) {
        const saved = await insertClient({
          name: data.client.name,
          contactPerson: data.client.contact,
          status: 'active',
        });
        if (saved) {
          clientName = saved.name;
          setClients(prev => [saved, ...prev]);
        }
      } else if (data.client?.id) {
        const found = clients.find(c => c.id === data.client.id);
        if (found) clientName = found.name;
      }

      // 프로젝트 생성
      const saved = await insertProject({
        title: data.project.title,
        description: data.project.description || '',
        client: clientName,
        partnerId: data.project.partnerIds[0] || '',
        partnerIds: data.project.partnerIds,
        managerIds: [],
        category: data.project.category,
        status: 'planning',
        budget: { totalAmount: 0, partnerPayment: 0, managementFee: 0, marginRate: 0 },
        workContent: [],
        tags: [],
      });

      if (!saved) {
        globalToast.error('프로젝트 생성에 실패했습니다. 다시 시도해주세요.');
        return;
      }

      // 회차 생성
      if (data.episodes.shouldCreate && data.episodes.count) {
        const newEpisodes = Array.from({ length: data.episodes.count }, (_, i) => ({
          id: crypto.randomUUID(),
          projectId: saved.id,
          episodeNumber: i + 1,
          title: '',
          workContent: [] as WorkContentType[],
          status: 'waiting' as const,
          assignee: data.project.partnerIds[0] || '',
          manager: '',
          startDate: data.episodes.dates?.[i]?.startDate || new Date().toISOString(),
          dueDate: data.episodes.dates?.[i]?.endDate || undefined,
          budget: { totalAmount: 0, partnerPayment: 0, managementFee: 0 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        await upsertEpisodes(newEpisodes);
        setEpisodes(prev => [...prev, ...newEpisodes]);
      }
      setProjects(prev => [saved, ...prev]);
      globalToast.success('프로젝트가 생성되었습니다!');
      setIsAddModalOpen(false);
    } catch (err) {
      console.error('[ProjectWizard] 프로젝트 생성 오류:', err);
      globalToast.error('프로젝트 생성 중 오류가 발생했습니다: ' + String(err));
    }
  };

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-4">
      <style jsx global>{`
        @keyframes modal-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modal-overlay-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes modal-content-in {
          from { opacity: 0; transform: scale(0.95) translateY(-16px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes modal-content-out {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to { opacity: 0; transform: scale(0.95) translateY(-16px); }
        }
        .animate-modal-overlay { animation: modal-overlay-in 0.2s ease-out forwards; }
        .animate-modal-overlay-out { animation: modal-overlay-out 0.2s ease-in forwards; }
        .animate-modal-content { animation: modal-content-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .animate-modal-content-out { animation: modal-content-out 0.2s ease-in forwards; }
        @keyframes checkmark { 100% { stroke-dashoffset: 0; } }
        @keyframes circle-scale {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .checkmark-circle { animation: circle-scale 0.5s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .checkmark-check {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: checkmark 0.5s 0.3s cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }
      `}</style>

      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-page">프로젝트</h1>
          <p className="text-ink-500 mt-1 text-sm hidden sm:block">진행 중인 프로젝트를 한눈에 관리하세요</p>
        </div>
        <button
          data-tour="tour-proj-new"
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors flex-shrink-0 inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
        >
          <Plus size={16} />
          새 프로젝트
        </button>
      </div>

      {/* 필터 탭 + 정렬 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <TabBar
          data-tour="tour-proj-filters"
          items={isMobile ? [
            { key: 'all' as const,              label: '전체',       count: projects.length },
            { key: 'active' as const,           label: '진행 중',    count: projects.filter(p => projectStatusMap.get(p.id) === 'active').length },
            { key: 'standby_dormant' as const,  label: '대기·휴면',  count: projects.filter(p => { const s = projectStatusMap.get(p.id); return s === 'standby' || s === 'dormant'; }).length },
            { key: 'inactive' as const,         label: '비활성',     count: projects.filter(p => p.status !== 'archived' && projectStatusMap.get(p.id) === 'inactive').length },
            { key: 'archived' as const,         label: '아카이브',   count: projects.filter(p => p.status === 'archived').length },
          ] : [
            { key: 'all' as const,      label: '전체',   count: projects.filter(p => p.status !== 'archived').length },
            { key: 'active' as const,   label: '진행 중', count: projects.filter(p => p.status !== 'archived' && projectStatusMap.get(p.id) === 'active').length },
            { key: 'standby' as const,  label: '대기',   count: projects.filter(p => p.status !== 'archived' && projectStatusMap.get(p.id) === 'standby').length },
            { key: 'dormant' as const,  label: '휴면',   count: projects.filter(p => p.status !== 'archived' && projectStatusMap.get(p.id) === 'dormant').length },
            { key: 'inactive' as const, label: '비활성', count: projects.filter(p => p.status !== 'archived' && projectStatusMap.get(p.id) === 'inactive').length },
            { key: 'archived' as const, label: '아카이브', count: projects.filter(p => p.status === 'archived').length },
          ]}
          active={activeFilter}
          onChange={setActiveFilter}
        />

        {/* 검색 + 정렬 */}
        <div data-tour="tour-proj-search" className="flex items-center gap-2 w-full sm:w-auto">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="검색..."
            className="flex-1 sm:flex-initial sm:w-44"
          />
          <div className="relative flex items-center rounded-lg bg-[#f5f5f4] flex-shrink-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'recent' | 'amount' | 'name')}
              className="appearance-none bg-transparent pl-3 pr-7 py-2.5 sm:py-1.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 text-[12.5px] text-ink-600 cursor-pointer"
            >
              <option value="recent">일정순</option>
              <option value="amount">금액순</option>
              <option value="name">이름순</option>
            </select>
            <ChevronDown size={13} className="absolute right-2 text-ink-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 프로젝트 그리드 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeFilter + '|' + searchQuery + '|' + sortBy}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          {filteredAndSortedProjects.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                icon={Inbox}
                title="프로젝트가 없습니다"
                description="조건에 맞는 프로젝트가 없습니다."
                size="compact"
              />
            </div>
          ) : filteredAndSortedProjects.map((project, cardIndex) => {
            const partner = allPartners.find(p => p.id === project.partnerId);
            const projectEpisodes = episodes.filter(e => e.projectId === project.id);
            const completedEpisodes = projectEpisodes.filter(ep => {
              const allTypes = ep.workContent || [];
              if (allTypes.length === 0) return false;
              return allTypes.every(wt => {
                const steps = ep.workSteps?.[wt] || [];
                return steps.length > 0 && steps.every(s => s.status === 'completed');
              });
            }).length;

            return (
              <motion.div
                key={project.id}
                {...(cardIndex === 0 ? { 'data-tour': 'tour-proj-grid' } : {})}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: cardIndex * 0.03 }}
              >
                <Link
                  href={`/projects/${project.id}`}
                  className="group block bg-white rounded-2xl border border-divider hover:border-ink-300 hover:shadow-sm transition-all duration-200 p-3.5"
                >
                  {/* 클라이언트 + 상태 */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-ink-500 truncate">{project.client}</span>
                    {(() => {
                      const cs = projectStatusMap.get(project.id) || 'inactive';
                      const map: Record<string, { tone: 'ok' | 'info' | 'warn' | 'neutral'; label: string }> = {
                        active: { tone: 'ok', label: '진행 중' },
                        standby: { tone: 'info', label: '대기' },
                        dormant: { tone: 'warn', label: '휴면' },
                        inactive: { tone: 'neutral', label: '비활성' },
                      };
                      const { tone, label } = map[cs] || map.inactive;
                      return <StatusChip tone={tone}>{label}</StatusChip>;
                    })()}
                  </div>

                  {/* 프로젝트명 */}
                  <h3 className="font-semibold text-ink-900 group-hover:text-orange-600 transition-colors text-[15px] leading-snug line-clamp-1 mb-2.5">
                    {project.title}
                  </h3>

                  {/* 파트너 */}
                  {(partner || projectEpisodes.length > 0) && (
                    <div className="flex items-center gap-3 text-xs text-ink-400 mb-2">
                      {partner ? (
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <div className="w-4 h-4 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <User size={8} className="text-orange-500" />
                          </div>
                          <span className="truncate">{partner.name}</span>
                        </div>
                      ) : (
                        <div className="flex-1" />
                      )}
                      {projectEpisodes.length > 0 && (
                        <span className="flex-shrink-0">{completedEpisodes}/{projectEpisodes.length}회차</span>
                      )}
                    </div>
                  )}

                  {/* 작업 현황 */}
                  {projectEpisodes.length > 0 && (() => {
                    const inProgressLong = projectEpisodes.filter(ep =>
                      ep.workContent.includes('롱폼') &&
                      (ep.workSteps?.['롱폼'] || []).some(s => s.status === 'in_progress')
                    ).length;
                    const inProgressShort = projectEpisodes.filter(ep =>
                      (ep.workContent.includes('기획 숏폼') || ep.workContent.includes('본편 숏폼')) &&
                      ((ep.workSteps?.['기획 숏폼'] || []).some(s => s.status === 'in_progress') ||
                       (ep.workSteps?.['본편 숏폼'] || []).some(s => s.status === 'in_progress'))
                    ).length;
                    const totalLong = projectEpisodes.filter(ep => ep.workContent.includes('롱폼')).length;
                    const totalShort = projectEpisodes.filter(ep =>
                      ep.workContent.includes('기획 숏폼') || ep.workContent.includes('본편 숏폼')
                    ).length;

                    return (
                      <div className="pt-2 border-t border-divider space-y-1 text-[11px]">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="w-1 h-1 rounded-full bg-green-500 flex-shrink-0" />
                          <span className="text-ink-500 truncate min-w-0">작업 진행 중</span>
                          <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium flex-shrink-0">롱폼 {inProgressLong}개</span>
                          <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium flex-shrink-0">숏폼 {inProgressShort}개</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="w-1 h-1 rounded-full bg-ink-300 flex-shrink-0" />
                          <span className="text-ink-400 truncate min-w-0">누적 작업 수</span>
                          <span className="px-1.5 py-0.5 rounded bg-ink-100 text-ink-500 font-medium flex-shrink-0">롱폼 {totalLong}개</span>
                          <span className="px-1.5 py-0.5 rounded bg-ink-100 text-ink-500 font-medium flex-shrink-0">숏폼 {totalShort}개</span>
                        </div>
                      </div>
                    );
                  })()}
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </AnimatePresence>

      {/* 프로젝트 추가 위자드 */}
      <ProjectWizardModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onComplete={handleWizardComplete}
        clients={clients}
        partners={allPartners}
      />

      {/* 작업 목록 모달 */}
      {selectedWorkTypeModal && (() => {
        const selectedEpisode = episodes.find(e => e.id === selectedWorkTypeModal.episodeId);
        if (!selectedEpisode) return null;

        const workType = selectedWorkTypeModal.workType;
        const steps = selectedEpisode.workSteps?.[workType] || [];
        const completedCount = steps.filter(s => s.status === 'completed').length;

        const getWorkTypeStatus = (wt: WorkContentType): 'waiting' | 'in_progress' | 'completed' => {
          const stps = selectedEpisode.workSteps?.[wt] || [];
          if (stps.length === 0) return 'waiting';
          if (stps.some(step => step.status === 'in_progress')) return 'in_progress';
          if (stps.every(step => step.status === 'completed')) return 'completed';
          return 'waiting';
        };

        const status = getWorkTypeStatus(workType);

        return (
          <div className={`fixed inset-0 z-50 overflow-y-auto ${isModalClosing ? 'animate-modal-overlay-out' : 'animate-modal-overlay'}`}>
            <div
              className="fixed inset-0 bg-black/40"
              onClick={closeModal}
            />

            <div className="flex min-h-full items-center justify-center p-4">
              <div
                className={`relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-y-auto ${isModalClosing ? 'animate-modal-content-out' : 'animate-modal-content'}`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 헤더 */}
                <div className="sticky top-0 bg-white px-6 py-4 border-b border-divider flex items-center justify-between z-10">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-bold text-[#1c1917]">{workType} 작업 목록</h2>
                    <StatusChip tone={status === 'completed' ? 'ok' : status === 'in_progress' ? 'warn' : 'neutral'}>
                      {status === 'completed' ? '완료' : status === 'in_progress' ? '진행중' : '대기'}
                    </StatusChip>
                    <span className="text-sm text-[#57534e]">
                      {completedCount}/{steps.length} 완료
                    </span>
                  </div>
                  <button
                    onClick={closeModal}
                    className="p-2 hover:bg-[#f5f5f4] rounded-full transition-colors"
                  >
                    <X size={20} className="text-[#78716c]" />
                  </button>
                </div>

                {/* 작업 단계 목록 */}
                <div className="p-6">
                  {steps.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-[#78716c] mb-4">작업 단계가 없습니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {steps.map((step, index) => {
                        const partner = allPartners.find(p => p.id === step.assigneeId);

                        return (
                          <div
                            key={step.id}
                            className={`p-4 rounded-lg border transition-all ${
                              step.status === 'completed'
                                ? 'bg-green-50 border-green-200'
                                : step.status === 'in_progress'
                                ? 'bg-amber-50 border-amber-200'
                                : 'bg-[#fafafa] border-divider'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                {/* 순서 번호 */}
                                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                  step.status === 'completed'
                                    ? 'bg-green-500 text-white'
                                    : step.status === 'in_progress'
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-[#e7e5e4] text-[#57534e]'
                                }`}>
                                  {index + 1}
                                </div>

                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-[#1c1917]">{step.label}</span>
                                    <StatusChip tone={step.status === 'completed' ? 'ok' : step.status === 'in_progress' ? 'warn' : 'neutral'}>
                                      {step.status === 'completed' ? '완료' : step.status === 'in_progress' ? '진행중' : '대기'}
                                    </StatusChip>
                                  </div>

                                  <div className="flex items-center gap-4 text-sm text-[#57534e]">
                                    {partner && (
                                      <div className="flex items-center gap-1">
                                        <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                          <User size={10} className="text-orange-500" />
                                        </div>
                                        <span>{partner.name}</span>
                                      </div>
                                    )}
                                    {step.startDate && (
                                      <div className="flex items-center gap-1">
                                        <Calendar size={14} />
                                        <span>시작: {step.startDate}</span>
                                      </div>
                                    )}
                                    {step.dueDate && (
                                      <div className="flex items-center gap-1">
                                        <Calendar size={14} />
                                        <span className="font-medium">마감: {step.dueDate}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 상태 변경 버튼 */}
                              <div className="flex items-center gap-2 ml-4">
                                {step.status !== 'completed' && (
                                  <button
                                    onClick={async () => {
                                      const prevEpisodes = episodes;
                                      const updatedEpisodes = episodes.map(ep => {
                                        if (ep.id === selectedWorkTypeModal.episodeId) {
                                          const updatedSteps = [...steps];
                                          updatedSteps[index] = { ...step, status: 'completed' };
                                          return {
                                            ...ep,
                                            workSteps: { ...ep.workSteps, [workType]: updatedSteps }
                                          } as EpisodeWithProjectId;
                                        }
                                        return ep;
                                      });
                                      setEpisodes(updatedEpisodes);
                                      const updatedEpisode = updatedEpisodes.find(e => e.id === selectedWorkTypeModal.episodeId);
                                      if (updatedEpisode) {
                                        const ok = await updateEpisodeFields(updatedEpisode.id, { workSteps: updatedEpisode.workSteps });
                                        if (!ok) {
                                          setEpisodes(prevEpisodes);
                                          globalToast.error('저장에 실패했습니다. 다시 시도해주세요.');
                                          return;
                                        }
                                      }
                                      globalToast.success(`"${step.label || `작업 ${index + 1}`}"을(를) 완료로 표시했습니다.`);
                                    }}
                                    className="px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
                                  >
                                    완료로 표시
                                  </button>
                                )}
                                {step.status === 'completed' && (
                                  <button
                                    onClick={async () => {
                                      const prevEpisodes = episodes;
                                      const updatedEpisodes = episodes.map(ep => {
                                        if (ep.id === selectedWorkTypeModal.episodeId) {
                                          const updatedSteps = [...steps];
                                          updatedSteps[index] = { ...step, status: 'in_progress' };
                                          return {
                                            ...ep,
                                            workSteps: { ...ep.workSteps, [workType]: updatedSteps }
                                          } as EpisodeWithProjectId;
                                        }
                                        return ep;
                                      });
                                      setEpisodes(updatedEpisodes);
                                      const updatedEpisode = updatedEpisodes.find(e => e.id === selectedWorkTypeModal.episodeId);
                                      if (updatedEpisode) {
                                        const ok = await updateEpisodeFields(updatedEpisode.id, { workSteps: updatedEpisode.workSteps });
                                        if (!ok) {
                                          setEpisodes(prevEpisodes);
                                          globalToast.error('저장에 실패했습니다. 다시 시도해주세요.');
                                          return;
                                        }
                                      }
                                      globalToast.success(`"${step.label || `작업 ${index + 1}`}"을(를) 진행중으로 변경했습니다.`);
                                    }}
                                    className="px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium"
                                  >
                                    진행중으로 변경
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 푸터 */}
                <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-divider flex justify-end">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-[#f5f5f4] text-[#57534e] rounded-lg hover:bg-[#e7e5e4] transition-colors font-medium"
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

