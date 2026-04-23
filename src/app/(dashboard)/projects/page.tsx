'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getProjects, insertProject, insertClient, getClients as fetchClients, getAllEpisodes, getPartners, upsertEpisodes } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { Calendar, User, X, ChevronDown, Search, ArrowRight, Plus, Building2 } from 'lucide-react';
import { calculateReserve, getComputedProjectStatus, compareProjects, ComputedProjectStatus } from '@/lib/utils';
import Link from 'next/link';
import { Project, Client, Episode, WorkContentType, Partner } from '@/types';
import { updateEpisodeFields } from '@/lib/supabase/db';
import { FloatingLabelInput } from '@/components/FloatingLabelInput';
import { motion, AnimatePresence } from 'framer-motion';
import ProjectWizardModal from '@/components/ProjectWizardModal';
import { useToast } from '@/contexts/ToastContext';


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

  // 프로젝트별 에피소드 & 계산된 상태 캐싱
  const projectEpisodesMap = new Map<string, Episode[]>();
  const projectStatusMap = new Map<string, ComputedProjectStatus>();
  projects.forEach(project => {
    const projectEpisodes = episodes.filter(e => e.projectId === project.id);
    projectEpisodesMap.set(project.id, projectEpisodes);
    projectStatusMap.set(project.id, getComputedProjectStatus(projectEpisodes));
  });

  // 필터링 및 정렬된 프로젝트 목록
  const filteredAndSortedProjects = projects
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
    });

  // 통계 계산
  const stats = {
    total: projects.length,
    inProgress: projects.filter(p => p.status === 'in_progress').length,
    totalRevenue: projects.reduce((sum, p) => sum + p.budget.totalAmount, 0),
    avgMargin: projects.length > 0
      ? projects.reduce((sum, p) => sum + p.budget.marginRate, 0) / projects.length
      : 0,
  };

  // 오늘 전달할 회차 계산
  const today = new Date().toISOString().split('T')[0];
  const todayDeliveries = episodes.filter(episode => episode.dueDate === today)
    .map(episode => {
      const project = projects.find(p => p.id === episode.projectId);
      return { episode, project };
    })
    .filter(item => item.project); // 프로젝트가 있는 것만

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
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-page">프로젝트</h1>
          <p className="text-gray-500 mt-1 text-sm">진행 중인 프로젝트를 한눈에 관리하세요</p>
        </div>
        <button
          data-tour="tour-proj-new"
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-colors flex-shrink-0"
        >
          + 새 프로젝트
        </button>
      </div>

      {/* 필터 탭 + 정렬 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div data-tour="tour-proj-filters" className="flex sm:inline-flex gap-1 p-1 bg-white border border-divider rounded-xl w-full sm:w-fit">
          {(isMobile ? [
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
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className="relative flex-1 sm:flex-initial px-2 sm:px-5 py-2 sm:py-2.5 rounded-lg text-[12px] sm:text-[14px] font-semibold"
            >
              {activeFilter === key && (
                <motion.div
                  layoutId="project-filter-pill"
                  className="absolute inset-0 bg-orange-500 rounded-lg shadow-sm shadow-orange-500/20"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <div className={`relative flex items-center justify-center gap-1 sm:gap-1.5 transition-colors duration-200 ${
                activeFilter === key ? 'text-white' : 'text-[#78716c]'
              }`}>
                <span>{label}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full transition-colors duration-200 ${
                  activeFilter === key ? 'bg-white/22 text-white' : 'bg-gray-100 text-[#78716c]'
                }`}>
                  {count}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* 검색 + 정렬 */}
        <div data-tour="tour-proj-search" className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex-1 sm:flex-initial flex items-center gap-2 bg-white border border-divider rounded-xl px-3 py-2.5">
            <Search size={15} className="text-gray-400 flex-shrink-0" />
            <input
              type="text"
              placeholder="검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent focus:outline-none text-sm text-gray-700 placeholder-gray-400 w-full sm:w-36"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-gray-300 hover:text-gray-500">
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'recent' | 'amount' | 'name')}
            className="px-3 py-2.5 bg-white border border-divider rounded-xl focus:outline-none text-xs text-gray-600"
          >
            <option value="recent">일정순</option>
            <option value="amount">금액순</option>
            <option value="name">이름순</option>
          </select>
        </div>
      </div>

      {/* 프로젝트 그리드 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeFilter + '|' + searchQuery + '|' + sortBy}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          {filteredAndSortedProjects.length === 0 ? (
            <div className="col-span-full py-20 text-center text-gray-400 text-sm">
              프로젝트가 없습니다
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
                  className="group block bg-white rounded-xl border border-divider hover:border-divider hover:shadow-sm transition-all duration-200 p-4"
                >
                  {/* 클라이언트 + 상태 */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500 truncate">{project.client}</span>
                    <StatusBadge status={projectStatusMap.get(project.id) || 'inactive'} />
                  </div>

                  {/* 프로젝트명 */}
                  <h3 className="font-semibold text-gray-900 group-hover:text-orange-600 transition-colors text-lg leading-snug line-clamp-1 mb-3">
                    {project.title}
                  </h3>

                  {/* 파트너 */}
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
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
                      <div className="pt-2 border-t border-gray-50 space-y-1 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-green-500 flex-shrink-0" />
                          <span className="text-gray-500">작업 진행 중</span>
                          <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">롱폼 {inProgressLong}개</span>
                          <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-medium">숏폼 {inProgressShort}개</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
                          <span className="text-gray-400">누적 작업 수</span>
                          <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-600 font-medium">롱폼 {totalLong}개</span>
                          <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 font-medium">숏폼 {totalShort}개</span>
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
                    <h2 className="text-xl font-bold text-gray-900">{workType} 작업 목록</h2>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : status === 'in_progress'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {status === 'completed' ? '완료' : status === 'in_progress' ? '진행중' : '대기'}
                    </span>
                    <span className="text-sm text-gray-600">
                      {completedCount}/{steps.length} 완료
                    </span>
                  </div>
                  <button
                    onClick={closeModal}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-gray-500" />
                  </button>
                </div>

                {/* 작업 단계 목록 */}
                <div className="p-6">
                  {steps.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-500 mb-4">작업 단계가 없습니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {steps.map((step, index) => {
                        const partner = allPartners.find(p => p.id === step.assigneeId);

                        return (
                          <div
                            key={step.id}
                            className={`p-4 rounded-lg border-2 transition-all ${
                              step.status === 'completed'
                                ? 'bg-green-50 border-green-200'
                                : step.status === 'in_progress'
                                ? 'bg-yellow-50 border-yellow-200'
                                : 'bg-gray-50 border-divider'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                {/* 순서 번호 */}
                                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                  step.status === 'completed'
                                    ? 'bg-green-500 text-white'
                                    : step.status === 'in_progress'
                                    ? 'bg-yellow-500 text-white'
                                    : 'bg-gray-300 text-gray-700'
                                }`}>
                                  {index + 1}
                                </div>

                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-gray-900">{step.label}</span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      step.status === 'completed'
                                        ? 'bg-green-100 text-green-800'
                                        : step.status === 'in_progress'
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {step.status === 'completed' ? '완료' : step.status === 'in_progress' ? '진행중' : '대기'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-4 text-sm text-gray-600">
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
                                    className="px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm font-medium"
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
                                    className="px-3 py-1.5 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors text-sm font-medium"
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
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
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

// 탭 버튼 컴포넌트
function TabButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 font-medium text-sm transition-colors ${
        active
          ? 'text-orange-600 border-b-2 border-orange-600'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}

// 상태 배지 컴포넌트
function StatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; color: string }> = {
    active: { label: '진행 중', color: 'bg-green-50 text-green-600' },
    standby: { label: '대기', color: 'bg-blue-50 text-blue-700' },
    dormant: { label: '휴면', color: 'bg-orange-50 text-orange-600' },
    inactive: { label: '비활성', color: 'bg-gray-100 text-gray-500' },
  };

  const { label, color } = statusMap[status] || statusMap.inactive;

  return (
    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 ${color}`}>
      {label}
    </span>
  );
}
