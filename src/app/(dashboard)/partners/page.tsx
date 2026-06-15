'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { X, ChevronDown, UserPlus, ChevronRight, Send, Copy, Check, ArrowLeft, Users, AlertCircle } from 'lucide-react';
import { Partner, Project, Episode } from '@/types';
import { addToTrash } from '@/lib/trash';
import { formatPhoneNumber } from '@/lib/utils';
import { FloatingLabelInput } from '@/components/FloatingLabelInput';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { useToast } from '@/contexts/ToastContext';
import { getPartners, insertPartner, updatePartner, deletePartner, getProjects, getAllEpisodes, getMyProfile } from '@/lib/supabase/db';
import { getPendingPartnerSignups, createPartnerInvite } from '@/lib/supabase/db/partner_signups';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import PartnerEditModal from './PartnerEditModal';
import { PartnerMasterList, type EnrichedPartner, type PartnerGroupStatus } from './PartnerMasterList';
import { PartnerDetailView } from './PartnerDetailView';

const KR_BANKS = [
  { name: 'KB국민',    abbr: 'KB', bg: '#FFBC00', fg: '#2D2D2D' },
  { name: '신한',      abbr: '신',  bg: '#0046FF', fg: '#fff' },
  { name: '하나',      abbr: '하',  bg: '#009E60', fg: '#fff' },
  { name: '우리',      abbr: '우',  bg: '#0070C0', fg: '#fff' },
  { name: 'NH농협',    abbr: 'NH', bg: '#008751', fg: '#fff' },
  { name: 'IBK기업',   abbr: 'IB', bg: '#004B9B', fg: '#fff' },
  { name: 'KDB산업',   abbr: 'KD', bg: '#003087', fg: '#fff' },
  { name: 'SC제일',    abbr: 'SC', bg: '#00AA5E', fg: '#fff' },
  { name: '씨티',      abbr: 'C',  bg: '#003B8B', fg: '#fff' },
  { name: '대구',      abbr: '대',  bg: '#1B4F9A', fg: '#fff' },
  { name: '부산',      abbr: '부',  bg: '#005BAC', fg: '#fff' },
  { name: '광주',      abbr: '광',  bg: '#00833E', fg: '#fff' },
  { name: '제주',      abbr: '제',  bg: '#0068B7', fg: '#fff' },
  { name: '전북',      abbr: '전',  bg: '#003E8E', fg: '#fff' },
  { name: '경남',      abbr: '경',  bg: '#1D4B8E', fg: '#fff' },
  { name: '수협',      abbr: '수',  bg: '#005192', fg: '#fff' },
  { name: '카카오뱅크', abbr: 'K',  bg: '#FAE300', fg: '#2D2D2D' },
  { name: '토스뱅크',   abbr: 'T',  bg: '#0064FF', fg: '#fff' },
  { name: '케이뱅크',   abbr: 'K',  bg: '#7C4DFF', fg: '#fff' },
] as const;

/**
 * 파트너 상태 판정 — episodes 기반
 *   active   : 진행 중 에피소드 있음
 *   standby  : 최근 14일 이내 완료했지만 진행 중은 없음
 *   dormant  : 이전에 에피소드는 있지만 30일 이상 비활성
 *   inactive : 에피소드 없음 or 수동 비활성
 */
function computeStatus(
  partner: Partner,
  episodes: (Episode & { projectId: string })[],
): { status: PartnerGroupStatus; lastActivityDays: number | null } {
  const mine = episodes.filter((e) => e.assignee === partner.id);
  if (mine.length === 0) {
    return { status: 'inactive', lastActivityDays: null };
  }

  const hasInProgress = mine.some((e) => e.status === 'in_progress' || e.status === 'review');
  const latestTs = mine.reduce((latest, e) => {
    const d = e.completedAt || (e.status !== 'completed' ? (e.dueDate || e.startDate) : null);
    return d ? Math.max(latest, new Date(d).getTime()) : latest;
  }, 0);
  const days = latestTs > 0 ? Math.floor((Date.now() - latestTs) / (1000 * 60 * 60 * 24)) : null;

  if (partner.status === 'inactive' && !hasInProgress) {
    return { status: 'inactive', lastActivityDays: days };
  }
  if (hasInProgress) return { status: 'active', lastActivityDays: days };
  if (days !== null && days <= 14) return { status: 'standby', lastActivityDays: days };
  if (days !== null && days <= 90) return { status: 'dormant', lastActivityDays: days };
  return { status: 'inactive', lastActivityDays: days };
}

export default function PartnersPage() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [partners, setPartners] = useState<Partner[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allEpisodes, setAllEpisodes] = useState<(Episode & { projectId: string })[]>([]);
  const [pendingSignupsCount, setPendingSignupsCount] = useState(0);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // 파트너 초대·가입 승인은 관리자(대표) 전용 — 매니저에겐 막다른 진입점이 안 뜨도록 역할 확인.
  // 신규 가입 신청 카운트도 관리자만 (getPendingPartnerSignups는 비관리자에게 [] 반환).
  useEffect(() => {
    getMyProfile().then((p) => {
      const admin = p?.role === 'admin';
      setIsAdmin(admin);
      if (admin) getPendingPartnerSignups().then((s) => setPendingSignupsCount(s.length));
    });
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('selected'));

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [partnerToEdit, setPartnerToEdit] = useState<Partner | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [partnerToDelete, setPartnerToDelete] = useState<{ id: string; name: string } | null>(null);

  // Add form dropdowns
  const [isGenerationDropdownOpen, setIsGenerationDropdownOpen] = useState(false);
  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);
  const [newPartner, setNewPartner] = useState<Partial<Partner>>({
    name: '', phone: '', bank: '', bankAccount: '',
    partnerType: 'freelancer', role: 'partner', status: 'active', generation: 1,
  });

  const loadData = useCallback(() => {
    setLoadError(false);
    Promise.all([getPartners(), getProjects(), getAllEpisodes()])
      .then(([p, proj, eps]) => {
        setPartners(p);
        setAllProjects(proj);
        setAllEpisodes(eps);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useSupabaseRealtime(['partners', 'projects', 'episodes'], loadData);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === 'new-partner') setIsAddModalOpen(true);
    };
    window.addEventListener('fab:action', handler);
    return () => window.removeEventListener('fab:action', handler);
  }, []);

  // ── 파생 데이터 ────────────────────────────────────────────
  const enrichedPartners: EnrichedPartner[] = useMemo(() => {
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    return partners.map((p) => {
      const { status, lastActivityDays } = computeStatus(p, allEpisodes);
      const myEpisodes = allEpisodes.filter((e) => e.assignee === p.id);
      const activeEpisodeCount = myEpisodes.filter((e) => e.status === 'in_progress' || e.status === 'review').length;
      const myProjects = allProjects.filter(
        (proj) => proj.partnerIds?.includes(p.id) || proj.partnerId === p.id,
      );
      const totalRevenue = myEpisodes
        .filter((e) => e.status === 'completed')
        .reduce((s, e) => s + (e.budget?.partnerPayment || 0), 0);
      const thisMonthRevenue = myEpisodes
        .filter((e) => e.status === 'completed' && e.completedAt && new Date(e.completedAt) >= thisMonthStart)
        .reduce((s, e) => s + (e.budget?.partnerPayment || 0), 0);
      const needsContact =
        (status === 'active' || status === 'standby') &&
        lastActivityDays !== null &&
        lastActivityDays > 60;

      return {
        ...p,
        computedStatus: status,
        needsContact,
        projectCount: myProjects.length,
        activeEpisodeCount,
        totalRevenue,
        thisMonthRevenue,
        lastActivityDays,
      };
    });
  }, [partners, allProjects, allEpisodes]);

  // ── 검색 & 정렬 ───────────────────────────────────────────
  const filteredPartners = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? enrichedPartners.filter((p) =>
          p.name.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q) ||
          p.phone?.toLowerCase().includes(q) ||
          p.company?.toLowerCase().includes(q)
        )
      : enrichedPartners;

    const order: Record<PartnerGroupStatus, number> = { active: 0, standby: 1, dormant: 2, inactive: 3 };
    return [...filtered].sort((a, b) => {
      if (order[a.computedStatus] !== order[b.computedStatus]) {
        return order[a.computedStatus] - order[b.computedStatus];
      }
      if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [enrichedPartners, searchQuery]);

  // 선택 자동 복구
  useEffect(() => {
    if (filteredPartners.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredPartners.some((p) => p.id === selectedId)) {
      setSelectedId(filteredPartners[0].id);
    }
  }, [filteredPartners, selectedId]);

  // URL 동기화
  useEffect(() => {
    if (!selectedId) return;
    const current = searchParams.get('selected');
    if (current !== selectedId) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('selected', selectedId);
      router.replace(`/partners?${params.toString()}`, { scroll: false });
    }
  }, [selectedId, searchParams, router]);

  const selectedPartner = selectedId
    ? enrichedPartners.find((p) => p.id === selectedId) ?? null
    : null;

  const selectedProjects = useMemo(() => {
    if (!selectedPartner) return [];
    return allProjects.filter(
      (p) => p.partnerIds?.includes(selectedPartner.id) || p.partnerId === selectedPartner.id,
    );
  }, [selectedPartner, allProjects]);

  const selectedEpisodes = useMemo(() => {
    if (!selectedPartner) return [];
    return allEpisodes.filter((e) => e.assignee === selectedPartner.id);
  }, [selectedPartner, allEpisodes]);

  // ── 핸들러 ───────────────────────────────────────────────
  const handleAddPartner = async () => {
    if (!newPartner.name) {
      toast.warning('파트너 이름을 입력해주세요.');
      return;
    }
    const saved = await insertPartner({
      name: newPartner.name,
      email: newPartner.email,
      phone: newPartner.phone,
      company: newPartner.company,
      partnerType: newPartner.partnerType,
      generation: newPartner.generation,
      bank: newPartner.bank,
      bankAccount: newPartner.bankAccount,
      role: newPartner.role || 'partner',
      status: newPartner.status || 'active',
    });
    if (saved) {
      setPartners((prev) => [saved, ...prev]);
      setSelectedId(saved.id);
      setIsAddModalOpen(false);
      setNewPartner({ name: '', phone: '', bank: '', bankAccount: '', partnerType: 'freelancer', role: 'partner', status: 'active', generation: 1 });
      toast.success(`${saved.name} 파트너가 추가되었습니다!`);
    } else {
      toast.error('파트너 추가에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleEditPartner = (partner: Partner) => {
    setPartnerToEdit(partner);
    setIsEditModalOpen(true);
  };

  const handleCloseEdit = () => {
    setIsEditModalOpen(false);
    setPartnerToEdit(null);
  };

  const handleRequestDelete = (partner: Partner) => {
    setPartnerToDelete({ id: partner.id, name: partner.name });
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!partnerToDelete) return;
    const partner = partners.find((p) => p.id === partnerToDelete.id);
    if (partner) {
      await addToTrash('partner', partner);
      const deleted = await deletePartner(partnerToDelete.id);
      if (deleted) {
        setPartners((prev) => prev.filter((p) => p.id !== partnerToDelete.id));
        if (selectedId === partnerToDelete.id) setSelectedId(null);
        toast.success(`${partnerToDelete.name} 파트너가 휴지통으로 이동되었습니다.`);
      } else {
        toast.error('삭제에 실패했습니다. 다시 시도해주세요.');
      }
    }
    setIsDeleteModalOpen(false);
    setPartnerToDelete(null);
  };

  const handleDeactivatePartner = async () => {
    if (!partnerToDelete) return;
    await updatePartner(partnerToDelete.id, { status: 'inactive' });
    setPartners((prev) => prev.map((p) =>
      p.id === partnerToDelete.id ? { ...p, status: 'inactive' as const } : p
    ));
    toast.warning(`${partnerToDelete.name} 파트너가 비활성 상태로 변경되었습니다.`);
    setIsDeleteModalOpen(false);
    setPartnerToDelete(null);
  };

  // ── 렌더링 ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingState />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-64">
        <EmptyState
          icon={AlertCircle}
          title="파트너 정보를 불러오지 못했어요"
          description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
          action={{ label: '다시 시도', onClick: () => { setLoading(true); loadData(); } }}
        />
      </div>
    );
  }

  const activeCount = enrichedPartners.filter((p) => p.computedStatus === 'active').length;
  const standbyCount = enrichedPartners.filter((p) => p.computedStatus === 'standby').length;
  const dormantCount = enrichedPartners.filter((p) => p.computedStatus === 'dormant').length;
  const needsContactCount = enrichedPartners.filter((p) => p.needsContact).length;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-page">파트너</h1>
          <p className="text-caption mt-0.5">
            전체 <b>{partners.length}명</b>
            · 활성 {activeCount}
            · 대기 {standbyCount}
            · 휴면 {dormantCount}
            {needsContactCount > 0 && ` · 연락 필요 ${needsContactCount}`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setInviteModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-[13px] font-semibold transition-colors"
          >
            <Send size={14} />
            파트너 초대
          </button>
        )}
      </div>

      {isAdmin && inviteModalOpen && (
        <InvitePartnerModal
          partners={partners}
          onClose={() => setInviteModalOpen(false)}
        />
      )}

      {/* 신규 가입 신청 배너 */}
      {pendingSignupsCount > 0 && (
        <Link
          href="/partners/signups"
          className="flex items-center justify-between gap-3 px-5 py-3.5 rounded-2xl border border-orange-200 bg-orange-50 hover:bg-orange-100/70 hover:border-orange-300 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center flex-shrink-0">
              <UserPlus size={18} />
            </div>
            <div>
              <div className="text-[13.5px] font-bold text-orange-900">
                신규 파트너 가입 신청 {pendingSignupsCount}명
              </div>
              <div className="text-[11.5px] text-orange-700 mt-0.5">
                파트너 ERP에 가입한 신규 사용자가 검토를 기다리고 있어요
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[12px] font-semibold text-orange-700 group-hover:text-orange-900 transition-colors">
            검토하기 <ChevronRight size={14} />
          </div>
        </Link>
      )}

      {/* 마스터-디테일 — lg 이상에선 분할, 모바일에선 선택 시 디테일 전환 */}
      <div
        className="grid gap-3 lg:grid-cols-[300px_1fr]"
        style={{
          height: pendingSignupsCount > 0 ? 'calc(100vh - 272px)' : 'calc(100vh - 180px)',
          minHeight: '480px',
        }}
      >
        <div className={`${selectedId ? 'hidden lg:flex' : 'flex'} flex-col overflow-hidden`}>
          <PartnerMasterList
            partners={filteredPartners}
            selectedId={selectedId}
            onSelect={setSelectedId}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onAdd={() => setIsAddModalOpen(true)}
          />
        </div>

        <div className={`${selectedId ? 'flex' : 'hidden lg:flex'} flex-col overflow-hidden`}>
          {selectedPartner && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="lg:hidden mb-2 inline-flex items-center gap-1.5 self-start text-sm font-medium text-stone-600 hover:text-stone-900"
            >
              <ArrowLeft size={14} /> 목록으로
            </button>
          )}
          {selectedPartner ? (
            <PartnerDetailView
              partner={selectedPartner}
              projects={selectedProjects}
              episodes={selectedEpisodes}
              onEdit={handleEditPartner}
              onDelete={handleRequestDelete}
            />
          ) : (
            <div
              className="rounded-2xl flex items-center justify-center"
              style={{ background: 'white', border: '1px solid var(--color-ink-200)' }}
            >
              {partners.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="첫 파트너를 추가해 보세요"
                  description="비디오 작업을 함께할 파트너를 추가하면 여기에서 관리할 수 있어요."
                  action={{ label: '+ 새 파트너 추가', onClick: () => setIsAddModalOpen(true) }}
                  iconColor="text-orange-500"
                  iconBgColor="bg-orange-50"
                />
              ) : (
                <EmptyState
                  icon={Users}
                  title="왼쪽에서 파트너를 선택하세요"
                  description="목록에서 파트너를 선택하면 상세 정보가 여기에 표시됩니다."
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* 추가 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)} />
          <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="relative bg-white rounded-t-xl sm:rounded-xl shadow-2xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 sm:px-8 pt-8 pb-6">
                <button onClick={() => setIsAddModalOpen(false)} className="absolute right-6 top-6 p-2 hover:bg-[#f5f5f4] rounded-full transition-colors">
                  <X size={24} className="text-[#a8a29e]" />
                </button>
                <h2 className="text-base font-bold text-[#1c1917] mb-2">새 파트너를<br />추가할게요</h2>
                <p className="text-sm text-[#78716c]">파트너 정보를 입력해주세요</p>
              </div>
              <div className="px-6 sm:px-8 pb-8 space-y-5">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#1c1917]">기본 정보</h3>
                  <FloatingLabelInput
                    label="이름" required type="text" value={newPartner.name}
                    onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })}
                  />
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#1c1917]">연락처 정보</h3>
                  <FloatingLabelInput
                    label="전화번호" type="tel" value={formatPhoneNumber(newPartner.phone)}
                    onChange={(e) => setNewPartner({ ...newPartner, phone: formatPhoneNumber(e.target.value) })}
                  />
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-[#44403c]">계좌번호</label>
                    <div className="flex gap-2">
                      <div className="relative flex-shrink-0">
                        <button type="button" onClick={() => setIsBankDropdownOpen(!isBankDropdownOpen)}
                          className="h-11 px-3 border-2 border-divider rounded-xl bg-white flex items-center gap-2 hover:border-gray-300 transition-colors whitespace-nowrap min-w-[110px]">
                          {newPartner.bank ? (() => {
                            const b = KR_BANKS.find((b) => b.name === newPartner.bank);
                            return b ? (
                              <>
                                <span className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                                  style={{ background: b.bg, color: b.fg }}>{b.abbr}</span>
                                <span className="text-sm font-medium text-[#1c1917] truncate max-w-[68px]">{b.name}</span>
                              </>
                            ) : null;
                          })() : (
                            <span className="text-sm text-[#a8a29e]">은행 선택</span>
                          )}
                          <ChevronDown size={13} className="text-[#a8a29e] flex-shrink-0 ml-auto" />
                        </button>
                        {isBankDropdownOpen && (
                          <div className="absolute z-30 left-0 top-full mt-2 bg-white border-2 border-divider rounded-2xl shadow-2xl p-3" style={{ width: '320px' }}>
                            <p className="text-xs text-[#a8a29e] font-medium mb-2 px-1">은행 선택</p>
                            <div className="grid grid-cols-5 gap-1.5">
                              {KR_BANKS.map((bank) => {
                                const isSelected = newPartner.bank === bank.name;
                                return (
                                  <button key={bank.name} type="button"
                                    onClick={() => { setNewPartner({ ...newPartner, bank: bank.name }); setIsBankDropdownOpen(false); }}
                                    className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-colors ${
                                      isSelected ? 'bg-orange-50 ring-2 ring-orange-400' : 'hover:bg-[#fafaf9]'
                                    }`}>
                                    <span className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shadow-sm"
                                      style={{ background: bank.bg, color: bank.fg }}>{bank.abbr}</span>
                                    <span className="text-[10px] text-[#44403c] font-medium leading-tight text-center w-full truncate">{bank.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      <input type="text" placeholder="계좌번호 입력" value={newPartner.bankAccount || ''}
                        onChange={(e) => setNewPartner({ ...newPartner, bankAccount: e.target.value })}
                        className="flex-1 h-11 px-4 border-2 border-divider rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-sm text-[#1c1917] placeholder-[#a8a29e] transition-colors"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[#44403c]">파트너 유형</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setNewPartner({ ...newPartner, partnerType: 'freelancer' })}
                        className={`h-11 rounded-xl font-semibold transition-colors ${
                          newPartner.partnerType === 'freelancer'
                            ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                            : 'bg-[#f5f5f4] text-[#44403c] hover:bg-[#ede9e6]'
                        }`}>프리랜서</button>
                      <button type="button" onClick={() => setNewPartner({ ...newPartner, partnerType: 'business' })}
                        className={`h-11 rounded-xl font-semibold transition-colors ${
                          newPartner.partnerType === 'business'
                            ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                            : 'bg-[#f5f5f4] text-[#44403c] hover:bg-[#ede9e6]'
                        }`}>사업자</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[#44403c]">파트너 기수</label>
                    <div className="relative">
                      <button type="button" onClick={() => setIsGenerationDropdownOpen(!isGenerationDropdownOpen)}
                        className="w-full h-11 px-4 border-2 border-divider rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white text-left flex items-center justify-between transition-colors">
                        <span className="text-[#1c1917] font-medium">{newPartner.generation}기</span>
                        <ChevronDown size={20} className="text-[#a8a29e]" />
                      </button>
                      {isGenerationDropdownOpen && (
                        <div className="absolute z-20 w-full mt-2 bg-white border-2 border-divider rounded-xl shadow-2xl overflow-hidden">
                          {[1, 2, 3].map((gen) => (
                            <button key={gen} type="button"
                              onClick={() => { setNewPartner({ ...newPartner, generation: gen }); setIsGenerationDropdownOpen(false); }}
                              className="w-full px-4 py-3 hover:bg-orange-50 text-left transition-colors first:rounded-t-xl last:rounded-b-xl">
                              <span className="text-[#1c1917] font-medium">{gen}기</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="sticky bottom-0 bg-white px-6 sm:px-8 py-6 border-t border-divider rounded-b-xl">
                <div className="flex gap-3">
                  <button onClick={() => setIsAddModalOpen(false)} className="flex-1 h-11 text-[#44403c] font-semibold bg-[#f5f5f4] hover:bg-[#ede9e6] rounded-xl transition-colors">
                    취소
                  </button>
                  <button onClick={handleAddPartner} disabled={!newPartner.name}
                    className="flex-1 h-11 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors disabled:bg-[#ede9e6] disabled:text-[#a8a29e] disabled:cursor-not-allowed disabled:shadow-none shadow-lg shadow-orange-500/30">
                    파트너 추가하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {isEditModalOpen && partnerToEdit && (
        <PartnerEditModal
          partner={partnerToEdit}
          onClose={handleCloseEdit}
          onSaved={(updates) => {
            setPartners((prev) => prev.map((p) =>
              p.id === partnerToEdit.id ? { ...p, ...updates } : p
            ));
            handleCloseEdit();
          }}
        />
      )}

      {/* 삭제 확인 모달 */}
      {isDeleteModalOpen && partnerToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40"
            onClick={() => { setIsDeleteModalOpen(false); setPartnerToDelete(null); }} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-divider">
                <h2 className="text-base font-bold text-[#1c1917]">파트너 관리</h2>
              </div>
              <div className="p-4">
                <p className="text-[#44403c] text-center mb-2">
                  <span className="font-semibold text-[#1c1917]">&quot;{partnerToDelete.name}&quot;</span> 파트너를<br />
                  정말 삭제하시겠습니까?
                </p>
                <p className="text-sm text-orange-600 text-center">
                  휴지통으로 이동되며, 30일 이내에 복구할 수 있습니다.
                </p>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-divider flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                <button onClick={() => { setIsDeleteModalOpen(false); setPartnerToDelete(null); }}
                  className="px-4 py-2.5 sm:py-2 text-[#44403c] hover:bg-[#f5f5f4] rounded-lg transition-colors active:scale-[0.97] text-sm font-medium">취소</button>
                <button onClick={handleDeactivatePartner}
                  className="px-4 py-2.5 sm:py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors active:scale-[0.97] text-sm font-medium">비활성 등록</button>
                <button onClick={handleConfirmDelete}
                  className="px-4 py-2.5 sm:py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors active:scale-[0.97] text-sm font-medium">삭제</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────
// 파트너 초대 모달
// ─────────────────────────────────────
const PARTNER_ERP_BASE = process.env.NEXT_PUBLIC_PARTNER_ERP_URL ?? 'http://localhost:3010';

function InvitePartnerModal({ partners, onClose }: { partners: Partner[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [legacyHintId, setLegacyHintId] = useState<string>('');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [showPartnerList, setShowPartnerList] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredPartners = useMemo(() => {
    const q = partnerSearch.trim().toLowerCase();
    let list = partners.filter((p) => p.status === 'active');
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return list.slice(0, 8);
  }, [partners, partnerSearch]);

  const selectedLegacy = partners.find((p) => p.id === legacyHintId);

  const handleCreate = async () => {
    setError(null);
    if (!name.trim()) {
      setError('이름은 필수입니다.');
      return;
    }
    setCreating(true);
    const res = await createPartnerInvite({
      invitedName: name.trim(),
      invitedEmail: email.trim() || undefined,
      legacyHintId: legacyHintId || undefined,
    });
    setCreating(false);
    if (!res) {
      setError('초대 링크 생성에 실패했어요. 다시 시도해 주세요.');
      return;
    }
    setResult({
      url: `${PARTNER_ERP_BASE}/onboard?token=${res.token}`,
      expiresAt: res.expiresAt,
    });
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-[#fafaf9] rounded-lg shadow-xl max-w-md w-full p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px] font-bold">파트너 초대</h3>
            <button onClick={onClose} className="p-1.5 hover:bg-[#f5f5f4] rounded-lg text-[#78716c]">
              <X size={16} />
            </button>
          </div>

          {result ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-green-700 mb-1">
                  <Check size={14} /> 초대 링크가 생성됐어요
                </div>
                <p className="text-[12px] text-green-600">
                  이 링크를 카카오톡·이메일로 보내주세요. 7일 후 만료됩니다.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#78716c] mb-1.5">
                  초대 링크
                </label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={result.url}
                    onClick={(e) => e.currentTarget.select()}
                    className="flex-1 px-3 py-2.5 bg-white rounded-lg border border-[#ede9e6] text-[12px] text-[#44403c] font-mono"
                  />
                  <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1 px-3 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[12px] font-semibold transition-colors"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? '복사됨' : '복사'}
                  </button>
                </div>
              </div>

              <div className="text-[11px] text-[#78716c]">
                만료: {new Date(result.expiresAt).toLocaleString('ko-KR')}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setResult(null); setName(''); setEmail(''); setLegacyHintId(''); }}
                  className="px-4 py-2 bg-white border border-divider hover:border-[#d6d3d1] text-[#44403c] rounded-lg text-[13px] font-semibold transition-colors"
                >
                  새 초대
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[13px] font-semibold transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[12.5px] text-[#78716c]">
                파트너에게 보낼 초대 링크를 만들어요. 가입 시 자동으로 매핑할 기존 파트너도 선택할 수 있어요.
              </p>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#78716c] mb-1.5">
                  이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="홍길동"
                  className="w-full px-3 py-2.5 rounded-lg border border-[#ede9e6] bg-white text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#78716c] mb-1.5">
                  이메일 (선택)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="입력 시 해당 이메일로만 가입 허용"
                  className="w-full px-3 py-2.5 rounded-lg border border-[#ede9e6] bg-white text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                />
              </div>

              <div className="relative">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#78716c] mb-1.5">
                  기존 파트너로 자동 매핑 (선택)
                </label>
                <input
                  type="text"
                  value={selectedLegacy ? selectedLegacy.name : partnerSearch}
                  onChange={(e) => {
                    setLegacyHintId('');
                    setPartnerSearch(e.target.value);
                    setShowPartnerList(true);
                  }}
                  onFocus={() => setShowPartnerList(true)}
                  placeholder="파트너 이름 검색..."
                  className="w-full px-3 py-2.5 rounded-lg border border-[#ede9e6] bg-white text-[13px] outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                />
                {showPartnerList && filteredPartners.length > 0 && !selectedLegacy && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-[#ede9e6] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredPartners.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setLegacyHintId(p.id);
                          setPartnerSearch('');
                          setShowPartnerList(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-orange-50 text-[13px]"
                      >
                        <span className="font-semibold">{p.name}</span>
                        {p.email && <span className="text-[11px] text-[#78716c] ml-2">{p.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {selectedLegacy && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-orange-600 font-semibold">
                    <Check size={11} /> {selectedLegacy.name}와 자동 매핑
                    <button
                      type="button"
                      onClick={() => { setLegacyHintId(''); setPartnerSearch(''); }}
                      className="text-[#a8a29e] hover:text-red-500"
                    >
                      <X size={11} />
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div className="text-[12px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-[13px] text-[#44403c] hover:bg-[#f5f5f4] rounded-lg"
                >
                  취소
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !name.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-50"
                >
                  <Send size={14} />
                  {creating ? '생성 중...' : '초대 링크 만들기'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
