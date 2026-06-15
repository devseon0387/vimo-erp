'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Client, Project, Partner, Episode, WorkContentType } from '@/types';
import { ArrowLeft, Mail, Phone, Building2, MapPin, User, Plus, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { getClients, getClientById, getProjects, getPartners, getAllEpisodes, insertProject, insertClient, upsertEpisodes, updateClient } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { formatPhoneNumber } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { TabBar } from '@/components/TabBar';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import dynamic from 'next/dynamic';
const ProjectWizardModal = dynamic(() => import('@/components/ProjectWizardModal'), { ssr: false });

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [clientProjects, setClientProjects] = useState<Project[]>([]);
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const [episodes, setEpisodes] = useState<(Episode & { projectId: string })[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'in_progress' | 'completed' | 'planning'>('all');
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const loadData = useCallback(async () => {
    // 우선 이 client만 스코프 조회 → 나머지는 보조 데이터로 병렬 fetch (캐시 활용)
    const [foundClient, clients, projects, partners, episodesData] = await Promise.all([
      getClientById(clientId),
      getClients(),
      getProjects(),
      getPartners(),
      getAllEpisodes(),
    ]);
    setAllClients(clients);
    if (foundClient) {
      setClient(foundClient);
      setClientProjects(projects.filter(p => p.clientId === foundClient.id || p.client === foundClient.name));
    }
    setAllPartners(partners);
    setEpisodes(episodesData);
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  // realtime: 폴링 1회만 등록(filter는 폴링에서 무시됨 — 중복 등록 단일화로 포커스당 loadData 2회→1회).
  useSupabaseRealtime(['clients', 'projects', 'episodes'], loadData);

  if (!client) {
    return (
      <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center">
        <LoadingState label="로딩 중..." />
      </div>
    );
  }

  // 필터링된 프로젝트
  const filteredProjects = clientProjects.filter(project => {
    if (activeFilter === 'all') return true;
    return project.status === activeFilter;
  });

  // 통계 계산
  const totalProjects = clientProjects.length;
  const inProgressProjects = clientProjects.filter(p => p.status === 'in_progress').length;
  const completedProjects = clientProjects.filter(p => p.status === 'completed').length;
  const totalBudget = clientProjects.reduce((sum, p) => sum + p.budget.totalAmount, 0);

  const handleWizardComplete = async (data: any) => {
    // 클라이언트 처리
    let clientName = client?.name || '';
    if (data.client?.isNew && data.client.name) {
      const saved = await insertClient({
        name: data.client.name,
        contactPerson: data.client.contact,
        status: 'active',
      });
      if (saved) clientName = saved.name;
    } else if (data.client?.id) {
      const found = allClients.find(c => c.id === data.client!.id);
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

    if (saved) {
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
      }

      setClientProjects(prev => [saved, ...prev]);
    }

    setIsWizardOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#fafaf9]">
      <div className="max-w-7xl mx-auto py-8 px-4">
        {/* 헤더 */}
        <div className="bg-white rounded-2xl shadow-sm border border-divider mb-6">
          <div className="px-6 py-4 border-b border-divider">
            {/* 뒤로가기 버튼 */}
            <button
              onClick={() => router.push('/clients')}
              className="flex items-center gap-2 text-[#57534e] hover:text-[#1c1917] mb-4 transition-colors"
            >
              <ArrowLeft size={20} />
              <span className="text-sm font-medium">클라이언트 관리로 돌아가기</span>
            </button>

            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Building2 size={28} className="text-orange-500" />
                </div>
                <div>
                  <h1 className="text-page">{client.name}</h1>
                  {client.company && client.company !== client.name && (
                    <p className="text-[#78716c] flex items-center gap-1 mt-1">
                      <Building2 size={14} />
                      {client.company}
                    </p>
                  )}
                  <button
                    onClick={async () => {
                      const newStatus = client.status === 'active' ? 'inactive' : 'active';
                      const ok = await updateClient(client.id, { status: newStatus });
                      if (ok) {
                        setClient({ ...client, status: newStatus as 'active' | 'inactive' });
                      }
                    }}
                    className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                      client.status === 'active'
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : 'bg-[#f5f5f4] text-[#1c1917] hover:bg-gray-200'
                    }`}
                    title={client.status === 'active' ? '클릭하여 비활성으로 변경' : '클릭하여 활성으로 변경'}
                  >
                    {client.status === 'active' ? '활성' : '비활성'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 클라이언트 정보 */}
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {client.contactPerson && (
                <div>
                  <p className="text-sm text-[#78716c]">담당자</p>
                  <p className="text-base font-medium text-[#1c1917] mt-1">{client.contactPerson}</p>
                </div>
              )}
              {client.email && (
                <div>
                  <p className="text-sm text-[#78716c]">이메일</p>
                  <p className="text-base text-[#1c1917] mt-1 flex items-center gap-2">
                    <Mail size={14} className="text-[#a8a29e]" />
                    {client.email}
                  </p>
                </div>
              )}
              {client.phone && (
                <div>
                  <p className="text-sm text-[#78716c]">전화번호</p>
                  <p className="text-base text-[#1c1917] mt-1 flex items-center gap-2">
                    <Phone size={14} className="text-[#a8a29e]" />
                    {formatPhoneNumber(client.phone)}
                  </p>
                </div>
              )}
              {client.address && (
                <div>
                  <p className="text-sm text-[#78716c]">주소</p>
                  <p className="text-base text-[#1c1917] mt-1 flex items-start gap-2">
                    <MapPin size={14} className="text-[#a8a29e] mt-1" />
                    {client.address}
                  </p>
                </div>
              )}
            </div>
            {client.notes && (
              <div className="mt-4 pt-4 border-t border-divider">
                <p className="text-sm text-[#78716c]">메모</p>
                <p className="text-base text-[#44403c] mt-1">{client.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-2xl shadow p-4">
            <p className="text-sm font-medium text-[#57534e]">전체 프로젝트</p>
            <p className="text-3xl font-bold text-[#1c1917] mt-2">{totalProjects}</p>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <p className="text-sm font-medium text-[#57534e]">진행 중</p>
            <p className="text-3xl font-bold text-yellow-600 mt-2">{inProgressProjects}</p>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <p className="text-sm font-medium text-[#57534e]">완료</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{completedProjects}</p>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <p className="text-sm font-medium text-[#57534e]">총 금액</p>
            <p className="text-3xl font-bold text-orange-600 mt-2">
              {totalBudget.toLocaleString()}
              <span className="text-sm text-[#78716c]">원</span>
            </p>
          </div>
        </div>

        {/* 프로젝트 섹션 */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-xl font-bold text-[#1c1917]">프로젝트 목록</h2>
            <button
              onClick={() => setIsWizardOpen(true)}
              className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-sm font-medium flex items-center gap-1.5"
            >
              <Plus size={16} />
              새 프로젝트
            </button>
          </div>

          {/* 필터 탭 */}
          <TabBar<'all' | 'planning' | 'in_progress' | 'completed'>
            className="mb-4"
            items={[
              { key: 'all',         label: '전체',   count: clientProjects.length },
              { key: 'planning',    label: '시작 전', count: clientProjects.filter(p => p.status === 'planning').length },
              { key: 'in_progress', label: '진행 중', count: inProgressProjects },
              { key: 'completed',   label: '종료',   count: completedProjects },
            ]}
            active={activeFilter}
            onChange={setActiveFilter}
          />

          {/* 프로젝트 그리드 */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFilter}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              {filteredProjects.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState
                    icon={FolderOpen}
                    title="프로젝트가 없습니다"
                    description="해당 필터에 맞는 프로젝트가 없습니다"
                    size="compact"
                  />
                </div>
              ) : filteredProjects.map((project, cardIndex) => {
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
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: cardIndex * 0.03 }}
                  >
                    <Link
                      href={`/projects/${project.id}`}
                      className="group block bg-white rounded-2xl border border-divider hover:border-divider hover:shadow-sm transition-all duration-200 p-4"
                    >
                      {/* 클라이언트 + 상태 */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[#a8a29e] truncate">{project.client}</span>
                        <StatusBadge status={project.status} />
                      </div>

                      {/* 프로젝트명 */}
                      <h3 className="font-semibold text-[#1c1917] group-hover:text-orange-600 transition-colors text-sm leading-snug line-clamp-1 mb-3">
                        {project.title}
                      </h3>

                      {/* 하단: 파트너 + 회차 + 금액 */}
                      <div className="flex items-center gap-3 text-xs text-[#a8a29e]">
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
                        <span className="font-semibold text-[#44403c] flex-shrink-0">
                          {project.budget.totalAmount > 0
                            ? `${(project.budget.totalAmount / 10000).toFixed(0)}만원`
                            : '-'
                          }
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
        {/* 프로젝트 생성 위자드 */}
        <ProjectWizardModal
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          onComplete={handleWizardComplete}
          clients={allClients}
          partners={allPartners}
          defaultClientId={client.id}
        />
      </div>
    </div>
  );
}

// 상태 배지 컴포넌트
function StatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; color: string }> = {
    planning: { label: '시작 전', color: 'bg-orange-50 text-orange-600' },
    in_progress: { label: '진행 중', color: 'bg-green-50 text-green-600' },
    completed: { label: '종료', color: 'bg-[#f5f5f4] text-[#78716c]' },
    on_hold: { label: '보류', color: 'bg-orange-50 text-orange-500' },
  };

  const { label, color } = statusMap[status] || statusMap.on_hold;

  return (
    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 ${color}`}>
      {label}
    </span>
  );
}
