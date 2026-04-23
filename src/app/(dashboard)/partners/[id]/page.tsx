'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Phone, User, Trash2, Edit, TrendingUp, Folder, Film, DollarSign, Calendar, Activity, ChevronDown, Clock, ArrowRight, Plus, Users, CreditCard, MessageSquare, UserCircle, RefreshCw, Copy, Check } from 'lucide-react';
import Link from 'next/link';
import { Partner, Project, Episode } from '@/types';
import { addToTrash } from '@/lib/trash';
import DatePicker from '@/components/DatePicker';
import { formatPhoneNumber } from '@/lib/utils';
import { useToast } from '@/contexts/ToastContext';
import { getPartners, updatePartner, deletePartner, getProjects, getAllEpisodes } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import PartnerEditModal from '../PartnerEditModal';

interface PartnerHistoryEntry {
  id: string;
  generation: number;
  startDate: string;
  endDate?: string;
}

interface PartnerIssueEntry {
  id: string;
  content: string;
  createdAt: string;
}

const TAB_KEYS = ['info', 'episodes', 'projects', 'history', 'issue'] as const;
type TabKey = typeof TAB_KEYS[number];

function computePartnerStats(
  partnerId: string,
  projects: Project[],
  allEpisodes: (Episode & { projectId: string })[]
) {
  const partnerProjects = projects.filter(p => p.partnerIds?.includes(partnerId) || p.partnerId === partnerId);
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const partnerEpisodes = allEpisodes.filter(e => e.assignee === partnerId);
  const completedEpisodes = partnerEpisodes.filter(e => e.status === 'completed');
  const inProgressEpisodes = partnerEpisodes.filter(e => e.status === 'in_progress');
  const thisMonthEpisodes = completedEpisodes.filter(e =>
    e.updatedAt && new Date(e.updatedAt) >= thisMonthStart
  );

  const totalRevenue = partnerEpisodes.reduce((sum, e) => sum + (e.budget?.partnerPayment || 0), 0);
  const thisMonthRevenue = thisMonthEpisodes.reduce((sum, e) => sum + (e.budget?.partnerPayment || 0), 0);

  const lastActivityDate = partnerEpisodes.length > 0
    ? partnerEpisodes.reduce((latest, e) => {
        const d = new Date(e.updatedAt || e.createdAt);
        return d > latest ? d : latest;
      }, new Date(0))
    : null;

  return {
    totalProjects: partnerProjects.length,
    inProgressProjects: partnerProjects.filter(p => p.status === 'in_progress').length,
    completedProjects: partnerProjects.filter(p => p.status === 'completed').length,
    totalEpisodes: partnerEpisodes.length,
    completedEpisodes: completedEpisodes.length,
    inProgressEpisodes: inProgressEpisodes.length,
    thisMonthEpisodes: thisMonthEpisodes.length,
    totalRevenue,
    thisMonthRevenue,
    avgRevenuePerEpisode: partnerEpisodes.length > 0 ? totalRevenue / partnerEpisodes.length : 0,
    lastActivity: lastActivityDate && lastActivityDate.getTime() > 0 ? lastActivityDate.toISOString() : null,
    projects: partnerProjects,
  };
}

// 스켈레톤 UI
function DetailSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6 animate-pulse">
      {/* 헤더 스켈레톤 */}
      <div className="bg-white rounded-2xl shadow-sm border border-divider p-4 sm:p-6">
        <div className="h-4 w-32 sm:w-40 bg-gray-200 rounded mb-4" />
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-200 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="h-5 sm:h-6 w-28 sm:w-32 bg-gray-200 rounded mb-2" />
            <div className="h-4 w-36 sm:w-48 bg-gray-200 rounded mb-2" />
            <div className="h-5 w-16 bg-gray-200 rounded-full" />
          </div>
        </div>
      </div>
      {/* 탭 + 콘텐츠 스켈레톤 */}
      <div className="bg-white rounded-2xl shadow-sm border border-divider">
        <div className="border-b border-divider px-4 sm:px-6 py-3 flex gap-3 sm:gap-4 overflow-hidden">
          {[60, 70, 60, 55, 40].map((w, i) => (
            <div key={i} className="h-5 bg-gray-200 rounded flex-shrink-0" style={{ width: w }} />
          ))}
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          <div className="h-5 w-24 bg-gray-200 rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-200 rounded flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-3 w-16 bg-gray-200 rounded mb-1" />
                  <div className="h-4 w-24 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
          <div className="h-5 w-24 bg-gray-200 rounded mt-6" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-gray-100 rounded-lg p-3 sm:p-4">
                <div className="h-4 w-8 bg-gray-200 rounded mb-2" />
                <div className="h-6 sm:h-7 w-12 bg-gray-200 rounded mb-1" />
                <div className="h-3 w-16 sm:w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PartnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const partnerId = params.id as string;

  const [partner, setPartner] = useState<Partner | null>(null);
  const [allProjectsData, setAllProjectsData] = useState<Project[]>([]);
  const [allEpisodesData, setAllEpisodesData] = useState<(Episode & { projectId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataChanged, setDataChanged] = useState(false);

  // URL 쿼리 파라미터로 탭 상태 유지
  const tabParam = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey = tabParam && TAB_KEYS.includes(tabParam) ? tabParam : 'info';

  const setActiveTab = (tab: TabKey) => {
    const url = new URL(window.location.href);
    if (tab === 'info') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', tab);
    }
    router.replace(url.pathname + url.search, { scroll: false });
  };

  // 히스토리
  const [partnerHistories, setPartnerHistories] = useState<PartnerHistoryEntry[]>([]);
  const [isAddingHistory, setIsAddingHistory] = useState(false);
  const [newHistoryEntry, setNewHistoryEntry] = useState({ generation: 1, startDate: '', endDate: '' });
  const [isHistoryGenerationDropdownOpen, setIsHistoryGenerationDropdownOpen] = useState(false);

  // 이슈
  const [partnerIssues, setPartnerIssues] = useState<PartnerIssueEntry[]>([]);
  const [newIssueText, setNewIssueText] = useState('');

  // 수정 모달
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // 삭제 모달
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // 복사 상태
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast.success(`${fieldName} 복사되었습니다`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error('복사에 실패했습니다');
    }
  };

  // ESC 키로 삭제 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDeleteModalOpen) {
        setIsDeleteModalOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDeleteModalOpen]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [partners, proj, eps] = await Promise.all([getPartners(), getProjects(), getAllEpisodes()]);
      const found = partners.find(p => p.id === partnerId);
      if (found) {
        setPartner(found);
        setNewHistoryEntry(prev => ({ ...prev, generation: found.generation || 1 }));

        // 히스토리 로드
        const stored = localStorage.getItem(`partner_history_${found.id}`);
        let history: PartnerHistoryEntry[] = [];
        if (stored) {
          try { history = JSON.parse(stored); } catch { /* ignore */ }
        }
        if (history.length === 0 && found.generation) {
          const initialEntry = {
            id: crypto.randomUUID(),
            generation: found.generation,
            startDate: found.createdAt ? found.createdAt.split('T')[0] : '',
            endDate: undefined,
          };
          history = [initialEntry];
          localStorage.setItem(`partner_history_${found.id}`, JSON.stringify(history));
        }
        setPartnerHistories(history);

        // 이슈 로드
        const storedIssues = localStorage.getItem(`partner_issues_${found.id}`);
        let issues: PartnerIssueEntry[] = [];
        if (storedIssues) {
          try { issues = JSON.parse(storedIssues); } catch { /* ignore */ }
        }
        setPartnerIssues(issues);
      }
      setAllProjectsData(proj);
      setAllEpisodesData(eps);
    } catch (err) {
      setError('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useSupabaseRealtime(['partners', 'episodes'], loadData);

  // #1 로딩: 스켈레톤 UI
  if (loading) {
    return <DetailSkeleton />;
  }

  // #5 에러: 재시도 UI
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-500">{error}</p>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          <RefreshCw size={16} />
          다시 시도
        </button>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-500">파트너를 찾을 수 없습니다.</p>
        <button
          onClick={() => router.push('/partners')}
          className="text-orange-500 hover:text-orange-600 font-medium"
        >
          파트너 목록으로 돌아가기
        </button>
      </div>
    );
  }

  const stats = computePartnerStats(partner.id, allProjectsData, allEpisodesData);
  const inProgressEpisodesCount = allEpisodesData.filter(e => e.assignee === partner.id && e.status === 'in_progress').length;

  // 히스토리 핸들러
  const handleAddHistory = () => {
    if (!newHistoryEntry.startDate) return;
    const entry = {
      id: crypto.randomUUID(),
      generation: newHistoryEntry.generation,
      startDate: newHistoryEntry.startDate,
      endDate: newHistoryEntry.endDate || undefined,
    };
    const updated = [...partnerHistories, entry].sort((a, b) => a.generation - b.generation);
    setPartnerHistories(updated);
    localStorage.setItem(`partner_history_${partner.id}`, JSON.stringify(updated));
    setIsAddingHistory(false);
    setNewHistoryEntry({ generation: newHistoryEntry.generation + 1, startDate: '', endDate: '' });
  };

  const handleDeleteHistory = (entryId: string) => {
    const updated = partnerHistories.filter(e => e.id !== entryId);
    setPartnerHistories(updated);
    localStorage.setItem(`partner_history_${partner.id}`, JSON.stringify(updated));
  };

  // 이슈 핸들러
  const handleAddIssue = () => {
    if (!newIssueText.trim()) return;
    const entry: PartnerIssueEntry = {
      id: crypto.randomUUID(),
      content: newIssueText.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated = [entry, ...partnerIssues];
    setPartnerIssues(updated);
    localStorage.setItem(`partner_issues_${partner.id}`, JSON.stringify(updated));
    setNewIssueText('');
  };

  const handleDeleteIssue = (issueId: string) => {
    const updated = partnerIssues.filter(e => e.id !== issueId);
    setPartnerIssues(updated);
    localStorage.setItem(`partner_issues_${partner.id}`, JSON.stringify(updated));
  };

  // 상태 토글
  const handleToggleStatus = async () => {
    const newStatus = partner.status === 'active' ? 'inactive' : 'active';
    const ok = await updatePartner(partner.id, { status: newStatus });
    if (ok) {
      setPartner(prev => prev ? { ...prev, status: newStatus as 'active' | 'inactive' } : prev);
      setDataChanged(true);
      toast.success(`${partner.name} 파트너가 ${newStatus === 'active' ? '활성' : '비활성'} 상태로 변경되었습니다.`);
    } else {
      toast.error('상태 변경에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // #2 뒤로가기 시 데이터 동기화
  const handleBack = () => {
    if (dataChanged) {
      router.push('/partners');
      router.refresh();
    } else {
      router.push('/partners');
    }
  };

  // 삭제 핸들러
  const handleConfirmDelete = async () => {
    await addToTrash('partner', partner);
    const deleted = await deletePartner(partner.id);
    if (deleted) {
      toast.success(`${partner.name} 파트너가 휴지통으로 이동되었습니다.`);
      router.push('/partners');
      router.refresh();
    } else {
      toast.error('삭제에 실패했습니다. 다시 시도해주세요.');
    }
    setIsDeleteModalOpen(false);
  };

  const handleDeactivatePartner = async () => {
    await updatePartner(partner.id, { status: 'inactive' });
    setPartner(prev => prev ? { ...prev, status: 'inactive' as const } : prev);
    setDataChanged(true);
    toast.warning(`${partner.name} 파트너가 비활성 상태로 변경되었습니다.`);
    setIsDeleteModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* 헤더 - #1 모바일 대응 */}
      <div className="bg-white rounded-2xl shadow-sm border border-divider">
        <div className="px-4 sm:px-6 py-4 border-b border-divider">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="text-sm font-medium">파트너 목록으로 돌아가기</span>
          </button>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                <User size={24} className="text-orange-500 sm:hidden" />
                <User size={28} className="text-orange-500 hidden sm:block" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{partner.name}</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {[partner.email, partner.phone ? formatPhoneNumber(partner.phone) : ''].filter(Boolean).join(' · ') || '-'}
                </p>
                <button
                  onClick={handleToggleStatus}
                  className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                    partner.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                  title={partner.status === 'active' ? '클릭하여 비활성으로 변경' : '클릭하여 활성으로 변경'}
                >
                  {partner.status === 'active' ? '활성' : '비활성'}
                </button>
              </div>
            </div>
            {/* 모바일: 아이콘만 / 데스크톱: 텍스트 포함 */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="p-2 sm:px-4 sm:py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
              >
                <Edit size={16} />
                <span className="hidden sm:inline">수정</span>
              </button>
              <button
                onClick={() => setIsDeleteModalOpen(true)}
                className="p-2 sm:px-4 sm:py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
              >
                <Trash2 size={16} />
                <span className="hidden sm:inline">삭제</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 탭 메뉴 - #4 URL 쿼리 파라미터 연동 */}
      <div className="bg-white rounded-2xl shadow-sm border border-divider">
        <div className="border-b border-divider">
          <div className="flex overflow-x-auto scrollbar-hide space-x-1 px-4 sm:px-6">
            {([
              { key: 'info' as const, label: '기본정보', count: 0 },
              { key: 'episodes' as const, label: '진행 회차', count: inProgressEpisodesCount },
              { key: 'projects' as const, label: '프로젝트', count: stats.projects.length },
              { key: 'history' as const, label: '히스토리', count: partnerHistories.length },
              { key: 'issue' as const, label: '이슈', count: partnerIssues.length },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 sm:px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    activeTab === tab.key
                      ? 'bg-orange-100 text-orange-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 탭 내용 */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* 기본정보 탭 */}
          {activeTab === 'info' && (
            <>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">기본 정보</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-3">
                    <Phone size={16} className="text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">전화번호</p>
                      {partner.phone ? (
                        <button
                          onClick={() => copyToClipboard(partner.phone!, '전화번호')}
                          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-orange-600 transition-colors group/copy"
                        >
                          {formatPhoneNumber(partner.phone)}
                          {copiedField === '전화번호' ? (
                            <Check size={13} className="text-green-500" />
                          ) : (
                            <Copy size={13} className="text-gray-300 group-hover/copy:text-orange-400 transition-colors" />
                          )}
                        </button>
                      ) : (
                        <p className="text-sm font-medium text-gray-900">-</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Activity size={16} className="text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500 mb-1">상태</p>
                      <button
                        onClick={handleToggleStatus}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                          partner.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {partner.status === 'active' ? '활성' : '비활성'}
                        <span className="text-[10px] opacity-60">변경</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <UserCircle size={16} className="text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">파트너 유형</p>
                      <p className="text-sm font-medium text-gray-900">
                        {partner.partnerType === 'business' ? '사업자' : partner.partnerType === 'freelancer' ? '프리랜서' : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Users size={16} className="text-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">파트너 기수</p>
                      <p className="text-sm font-medium text-gray-900">
                        {partner.generation ? `${partner.generation}기` : '-'}
                      </p>
                    </div>
                  </div>
                  {(partner.bank || partner.bankAccount) && (
                    <div className="col-span-1 sm:col-span-2 flex items-center space-x-3">
                      <CreditCard size={16} className="text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">계좌번호</p>
                        <button
                          onClick={() => copyToClipboard(
                            [partner.bank, partner.bankAccount].filter(Boolean).join(' '),
                            '계좌번호'
                          )}
                          className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-orange-600 transition-colors group/copy"
                        >
                          {[partner.bank, partner.bankAccount].filter(Boolean).join('  ')}
                          {copiedField === '계좌번호' ? (
                            <Check size={13} className="text-green-500" />
                          ) : (
                            <Copy size={13} className="text-gray-300 group-hover/copy:text-orange-400 transition-colors" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 통계 요약 */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">통계 요약</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                  <div className="bg-orange-50 rounded-lg p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <Folder size={18} className="text-orange-500 sm:hidden" />
                      <Folder size={20} className="text-orange-500 hidden sm:block" />
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.totalProjects}</p>
                    <p className="text-[10px] sm:text-xs text-gray-600 mt-1">전체 프로젝트</p>
                    <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-gray-500">
                      진행중 {stats.inProgressProjects} · 완료 {stats.completedProjects}
                    </div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <Film size={18} className="text-orange-500 sm:hidden" />
                      <Film size={20} className="text-orange-500 hidden sm:block" />
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.totalEpisodes}</p>
                    <p className="text-[10px] sm:text-xs text-gray-600 mt-1">담당 회차</p>
                    <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-gray-500">
                      완료 {stats.completedEpisodes} · 진행중 {stats.inProgressEpisodes}
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <Calendar size={18} className="text-green-500 sm:hidden" />
                      <Calendar size={20} className="text-green-500 hidden sm:block" />
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.thisMonthEpisodes}</p>
                    <p className="text-[10px] sm:text-xs text-gray-600 mt-1">이번 달 완료</p>
                    <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-gray-500">
                      {new Date().toLocaleDateString('ko-KR', { month: 'long' })}
                    </div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <Activity size={18} className="text-orange-500 sm:hidden" />
                      <Activity size={20} className="text-orange-500 hidden sm:block" />
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-gray-900">
                      {stats.lastActivity
                        ? new Date(stats.lastActivity).toLocaleDateString('ko-KR')
                        : '-'}
                    </p>
                    <p className="text-[10px] sm:text-xs text-gray-600 mt-1">최근 활동일</p>
                  </div>
                </div>
              </div>

              {/* 수익 정보 */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">수익 정보</h3>
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                    <div className="flex items-center space-x-1.5 sm:space-x-2 mb-1.5 sm:mb-2">
                      <DollarSign size={14} className="text-gray-500 flex-shrink-0" />
                      <p className="text-[10px] sm:text-xs text-gray-600">총 수익</p>
                    </div>
                    <p className="text-sm sm:text-xl font-bold text-gray-900">
                      ₩{stats.totalRevenue.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                    <div className="flex items-center space-x-1.5 sm:space-x-2 mb-1.5 sm:mb-2">
                      <TrendingUp size={14} className="text-gray-500 flex-shrink-0" />
                      <p className="text-[10px] sm:text-xs text-gray-600">이번 달</p>
                    </div>
                    <p className="text-sm sm:text-xl font-bold text-gray-900">
                      ₩{stats.thisMonthRevenue.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                    <div className="flex items-center space-x-1.5 sm:space-x-2 mb-1.5 sm:mb-2">
                      <Film size={14} className="text-gray-500 flex-shrink-0" />
                      <p className="text-[10px] sm:text-xs text-gray-600">회차 평균</p>
                    </div>
                    <p className="text-sm sm:text-xl font-bold text-gray-900">
                      ₩{Math.round(stats.avgRevenuePerEpisode).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 진행 중인 회차 탭 */}
          {activeTab === 'episodes' && (() => {
            const inProgressEpisodes = allEpisodesData
              .filter(e => e.assignee === partner.id && e.status === 'in_progress')
              .map(e => ({ ...e, project: allProjectsData.find(p => p.id === e.projectId) }))
              .filter((e): e is typeof e & { project: Project } => !!e.project);

            return (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  진행 중인 회차 ({inProgressEpisodes.length})
                </h3>
                {inProgressEpisodes.length === 0 ? (
                  <div className="text-center py-12">
                    <Film size={48} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">진행 중인 회차가 없습니다</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {inProgressEpisodes.map(({ project, ...episode }) => (
                      <Link
                        key={episode.id}
                        href={`/projects/${project.id}/episodes/${episode.id}`}
                        className="block p-4 bg-gradient-to-r from-orange-50 to-orange-50 rounded-lg hover:shadow-md transition-shadow border-l-4 border-orange-500"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h4 className="font-semibold text-gray-900">{project.title}</h4>
                              <ArrowRight size={14} className="text-gray-400" />
                              <span className="text-gray-700">{episode.episodeNumber}회차</span>
                            </div>
                            <p className="text-sm text-gray-600">{episode.title}</p>
                          </div>
                          <span className="px-2.5 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium whitespace-nowrap ml-2">
                            진행중
                          </span>
                        </div>
                        {episode.endDate && (
                          <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
                            <Clock size={14} />
                            <span>마감: {new Date(episode.endDate).toLocaleDateString('ko-KR')}</span>
                          </div>
                        )}
                        {episode.workContent && episode.workContent.length > 0 && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-gray-500">작업:</span>
                            <div className="flex gap-1 flex-wrap">
                              {episode.workContent.map((work: string) => (
                                <span key={work} className="px-2 py-0.5 bg-white rounded text-xs text-gray-600">
                                  {work === 'filming' ? '촬영' : work === 'editing' ? '편집' : work === 'audio' ? '오디오' : work === 'color' ? '색보정' : work === 'graphics' ? '그래픽' : work}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

          {/* 담당 프로젝트 탭 */}
          {activeTab === 'projects' && (
            <>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                담당 프로젝트 ({stats.projects.length})
              </h3>
              {stats.projects.length === 0 ? (
                <div className="text-center py-12">
                  <Folder size={48} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">담당 프로젝트가 없습니다</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {stats.projects.map((project) => {
                    const projectEpisodes = allEpisodesData.filter(e => e.projectId === project.id);
                    return (
                      <Link
                        key={project.id}
                        href={`/projects/${project.id}`}
                        className="block p-4 bg-white rounded-lg border-2 border-divider hover:border-orange-400 hover:shadow-lg transition-[border-color,box-shadow]"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 truncate">{project.title}</h4>
                            <p className="text-sm text-gray-500 mt-1">{project.client}</p>
                          </div>
                          <span
                            className={`ml-2 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                              project.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : project.status === 'in_progress'
                                ? 'bg-orange-100 text-orange-800'
                                : project.status === 'on_hold'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {project.status === 'completed'
                              ? '완료'
                              : project.status === 'in_progress'
                              ? '진행중'
                              : project.status === 'on_hold'
                              ? '보류'
                              : '기획'}
                          </span>
                        </div>
                        {projectEpisodes.length > 0 && (
                          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-divider">
                            <div className="bg-gray-50 rounded p-2">
                              <p className="text-xs text-gray-500">총 회차</p>
                              <p className="text-lg font-semibold text-gray-900">{projectEpisodes.length}</p>
                            </div>
                            <div className="bg-gray-50 rounded p-2">
                              <p className="text-xs text-gray-500">진행중</p>
                              <p className="text-lg font-semibold text-orange-600">
                                {projectEpisodes.filter(e => e.status === 'in_progress').length}
                              </p>
                            </div>
                          </div>
                        )}
                        {project.budget && project.budget.totalAmount > 0 && (
                          <div className="mt-3 pt-3 border-t border-divider">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-500">예산</span>
                              <span className="font-semibold text-gray-900">
                                {(project.budget.totalAmount / 10000).toFixed(0)}만원
                              </span>
                            </div>
                          </div>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* 이슈 탭 */}
          {activeTab === 'issue' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">이슈 메모</h3>
                <span className="text-xs text-gray-400">{partnerIssues.length}개</span>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-5">
                <textarea
                  value={newIssueText}
                  onChange={e => setNewIssueText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddIssue();
                  }}
                  placeholder="이슈나 특이사항을 메모하세요... (Cmd+Enter로 저장)"
                  rows={3}
                  className="w-full bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none resize-none leading-relaxed"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleAddIssue}
                    disabled={!newIssueText.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed active:scale-[0.97]"
                  >
                    <Plus size={14} />
                    저장
                  </button>
                </div>
              </div>

              {partnerIssues.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare size={48} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">기록된 이슈가 없습니다</p>
                  <p className="text-gray-400 text-xs mt-1">파트너 관련 이슈나 특이사항을 메모해 두세요</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {partnerIssues.map(issue => (
                    <div key={issue.id} className="group flex items-start gap-3 bg-white border border-divider rounded-xl p-4 hover:border-gray-300 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{issue.content}</p>
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(issue.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteIssue(issue.id)}
                        className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 히스토리 탭 */}
          {activeTab === 'history' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">활동 히스토리</h3>
                {!isAddingHistory && (
                  <button
                    onClick={() => setIsAddingHistory(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <Plus size={14} />
                    기록 추가
                  </button>
                )}
              </div>

              {isAddingHistory && (
                <div className="bg-white border border-divider rounded-xl p-4 mb-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-900 mb-2">새 활동 기록</p>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">
                      기수
                      {partner.generation && (
                        <span className="ml-1.5 text-gray-400">(현재 {partner.generation}기)</span>
                      )}
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsHistoryGenerationDropdownOpen(!isHistoryGenerationDropdownOpen)}
                        className="w-full h-11 px-4 bg-white border-2 border-divider rounded-xl text-left flex items-center justify-between hover:border-orange-300 focus:outline-none focus:border-orange-400 transition-colors"
                      >
                        <span className="text-sm font-semibold text-gray-900">{newHistoryEntry.generation}기</span>
                        <ChevronDown
                          size={16}
                          className={`text-gray-400 transition-transform duration-200 ${isHistoryGenerationDropdownOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {isHistoryGenerationDropdownOpen && (
                        <div className="absolute z-30 w-full mt-1.5 bg-white border-2 border-divider rounded-xl shadow-xl overflow-hidden">
                          <div className="max-h-44 overflow-y-auto">
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((gen) => (
                              <button
                                key={gen}
                                type="button"
                                onClick={() => {
                                  setNewHistoryEntry(prev => ({ ...prev, generation: gen }));
                                  setIsHistoryGenerationDropdownOpen(false);
                                }}
                                className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center justify-between ${
                                  newHistoryEntry.generation === gen
                                    ? 'bg-orange-50 text-orange-700 font-semibold'
                                    : 'text-gray-800 hover:bg-gray-50'
                                }`}
                              >
                                <span>{gen}기</span>
                                {partner.generation === gen && (
                                  <span className="text-xs text-orange-400 font-medium">현재</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">
                        시작일 <span className="text-red-500">*</span>
                      </label>
                      <DatePicker
                        value={newHistoryEntry.startDate}
                        onChange={(v) => setNewHistoryEntry(prev => ({ ...prev, startDate: v }))}
                        placeholder="시작일 선택"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">
                        종료일 <span className="text-gray-400 font-normal">(없으면 활동 중)</span>
                      </label>
                      <DatePicker
                        value={newHistoryEntry.endDate}
                        onChange={(v) => setNewHistoryEntry(prev => ({ ...prev, endDate: v }))}
                        placeholder="종료일 선택"
                        minDate={newHistoryEntry.startDate || undefined}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingHistory(false)}
                      className="flex-1 py-2 text-sm text-gray-600 bg-white border border-divider rounded-lg hover:bg-gray-50 transition-colors active:scale-[0.97]"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleAddHistory}
                      disabled={!newHistoryEntry.startDate}
                      className="flex-1 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors active:scale-[0.97]"
                    >
                      추가
                    </button>
                  </div>
                </div>
              )}

              {partnerHistories.length === 0 ? (
                <div className="text-center py-12">
                  <Clock size={48} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">활동 기록이 없습니다</p>
                  <p className="text-gray-400 text-xs mt-1">기록 추가 버튼으로 활동 히스토리를 쌓아보세요</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />
                  <div className="space-y-4">
                    {partnerHistories.map((entry) => (
                      <div key={entry.id} className="relative flex items-start gap-4 group">
                        <div className={`relative z-10 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
                          !entry.endDate ? 'bg-gray-800 text-white' : 'bg-white border-2 border-gray-300 text-gray-600'
                        }`}>
                          {entry.generation}기
                        </div>
                        <div className="flex-1 bg-white border border-divider rounded-xl p-4 group-hover:border-gray-300 transition-colors">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold text-gray-900">{entry.generation}기 활동</span>
                                {!entry.endDate && (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">활동 중</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">
                                {new Date(entry.startDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                                {' ~ '}
                                {entry.endDate
                                  ? new Date(entry.endDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
                                  : '현재'}
                              </p>
                              {entry.endDate && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {Math.round((new Date(entry.endDate).getTime() - new Date(entry.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30))}개월
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteHistory(entry.id)}
                              className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 삭제 확인 모달 */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setIsDeleteModalOpen(false)}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="relative bg-white rounded-lg shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-divider">
                <h2 className="text-xl font-bold text-gray-900">파트너 관리</h2>
              </div>
              <div className="p-6">
                <p className="text-gray-700 text-center mb-2">
                  <span className="font-semibold text-gray-900">&quot;{partner.name}&quot;</span> 파트너를<br />
                  정말 삭제하시겠습니까?
                </p>
                <p className="text-sm text-orange-600 text-center">
                  휴지통으로 이동되며, 30일 이내에 복구할 수 있습니다.
                </p>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-divider flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2.5 sm:py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors active:scale-[0.97] text-sm font-medium"
                >
                  취소
                </button>
                <button
                  onClick={handleDeactivatePartner}
                  className="px-4 py-2.5 sm:py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors active:scale-[0.97] text-sm font-medium"
                >
                  비활성 등록
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-2.5 sm:py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors active:scale-[0.97] text-sm font-medium"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* #3 수정 모달 - 컴포넌트 분리 */}
      {isEditModalOpen && (
        <PartnerEditModal
          partner={partner}
          onClose={() => setIsEditModalOpen(false)}
          onSaved={(updates) => {
            setPartner(prev => prev ? { ...prev, ...updates } : prev);
            setDataChanged(true);
          }}
        />
      )}
    </div>
  );
}
