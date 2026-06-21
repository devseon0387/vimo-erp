'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X, ArrowLeft, Briefcase } from 'lucide-react';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { Client, Project, Episode } from '@/types';
import { addToTrash } from '@/lib/trash';
import { formatPhoneNumber } from '@/lib/utils';
import { FloatingLabelInput, FloatingLabelTextarea } from '@/components/FloatingLabelInput';
import { insertClient, updateClient, deleteClient } from '@/lib/supabase/db';
import { getClients, getProjects, getAllEpisodes } from '@/lib/supabase/db/cached';
import { invalidateTable } from '@/lib/supabase/cache';
import { useToast } from '@/contexts/ToastContext';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { getComputedProjectStatus } from '@/lib/utils';
import { ClientMasterList, type EnrichedClient, type ClientGroupStatus } from './ClientMasterList';
import { ClientDetailView } from './ClientDetailView';

/**
 * 클라이언트 관계 상태 판정 — 프로젝트 상태(getComputedProjectStatus) 기반
 *   우선순위: active(진행 중) > standby(대기) > dormant(휴면) > inactive
 *   "연락 필요"는 별도 플래그(needsContact)로 빠짐
 */
const STATUS_PRIORITY: Record<ClientGroupStatus, number> = {
  active: 3, standby: 2, dormant: 1, inactive: 0,
};

function combineStatuses(statuses: ClientGroupStatus[]): ClientGroupStatus {
  if (statuses.length === 0) return 'inactive';
  return statuses.reduce((best, s) =>
    STATUS_PRIORITY[s] > STATUS_PRIORITY[best] ? s : best,
    'inactive' as ClientGroupStatus,
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allEpisodes, setAllEpisodes] = useState<(Episode & { projectId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('selected'));

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isClientSuccess, setIsClientSuccess] = useState(false);
  const [newClient, setNewClient] = useState<Partial<Client>>({
    name: '', contactPerson: '', email: '', phone: '', company: '', address: '', notes: '', status: 'active', businessNumber: '', corpName: '', ceoName: '', bizType: '', bizItem: '', taxEmail: '',
  });

  const loadData = useCallback(() => {
    setError(false);
    setLoading(true);
    Promise.all([getClients(), getProjects(), getAllEpisodes()]).then(([c, p, e]) => {
      setClients(c);
      setAllProjects(p);
      setAllEpisodes(e);
      setLoading(false);
    }).catch(() => { setError(true); setLoading(false); });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useSupabaseRealtime(['clients', 'projects', 'episodes'], loadData);

  // FAB: 외부 "새 클라이언트" 트리거
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === 'new-client') setIsAddModalOpen(true);
    };
    window.addEventListener('fab:action', handler);
    return () => window.removeEventListener('fab:action', handler);
  }, []);

  // ── 파생 데이터: EnrichedClient ──────────────────────────
  const enrichedClients: EnrichedClient[] = useMemo(() => {
    return clients.map((c) => {
      const clientProjects = allProjects.filter((p) => p.clientId === c.id || p.client === c.name);
      let activeCount = 0;
      let totalRevenue = 0;
      let latestTimestamp = 0;
      const projectStatuses: ClientGroupStatus[] = [];
      for (const p of clientProjects) {
        const projEps = allEpisodes.filter((e) => e.projectId === p.id);
        const status = getComputedProjectStatus(projEps);
        projectStatuses.push(status);
        if (status === 'active' || status === 'standby') activeCount++;
        if (p.budget?.totalAmount) totalRevenue += p.budget.totalAmount;
        const t = new Date(p.updatedAt || p.createdAt).getTime();
        if (t > latestTimestamp) latestTimestamp = t;
      }
      const lastContactDays = latestTimestamp > 0
        ? Math.floor((Date.now() - latestTimestamp) / (1000 * 60 * 60 * 24))
        : null;

      // 사용자가 명시적으로 '비활성' 지정 + 활성 프로젝트 없음 → inactive 고정
      let computedStatus: ClientGroupStatus;
      if (c.status === 'inactive' && activeCount === 0) {
        computedStatus = 'inactive';
      } else {
        computedStatus = combineStatuses(projectStatuses);
      }

      const needsContact =
        (computedStatus === 'active' || computedStatus === 'standby') &&
        lastContactDays !== null &&
        lastContactDays > 60;

      return {
        ...c,
        projectCount: clientProjects.length,
        activeProjectCount: activeCount,
        totalRevenue,
        lastContactDays,
        computedStatus,
        needsContact,
      };
    });
  }, [clients, allProjects, allEpisodes]);

  // ── 검색 & 정렬 ───────────────────────────────────────────
  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? enrichedClients.filter((c) =>
          c.name.toLowerCase().includes(q) ||
          c.contactPerson?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q) ||
          c.address?.toLowerCase().includes(q)
        )
      : enrichedClients;

    const statusOrder: Record<ClientGroupStatus, number> = {
      active: 0, standby: 1, dormant: 2, inactive: 3,
    };
    return [...filtered].sort((a, b) => {
      if (statusOrder[a.computedStatus] !== statusOrder[b.computedStatus]) {
        return statusOrder[a.computedStatus] - statusOrder[b.computedStatus];
      }
      return a.name.localeCompare(b.name);
    });
  }, [enrichedClients, searchQuery]);

  // 선택 자동 복구: URL → 유효성 → 첫 항목
  useEffect(() => {
    if (filteredClients.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredClients.some((c) => c.id === selectedId)) {
      setSelectedId(filteredClients[0].id);
    }
  }, [filteredClients, selectedId]);

  // URL 동기화
  useEffect(() => {
    if (!selectedId) return;
    const current = searchParams.get('selected');
    if (current !== selectedId) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('selected', selectedId);
      router.replace(`/clients?${params.toString()}`, { scroll: false });
    }
  }, [selectedId, searchParams, router]);

  const selectedClient = selectedId
    ? enrichedClients.find((c) => c.id === selectedId) ?? null
    : null;

  const selectedProjects = useMemo(() => {
    if (!selectedClient) return [];
    return allProjects.filter((p) => p.clientId === selectedClient.id || p.client === selectedClient.name);
  }, [selectedClient, allProjects]);

  // ── 핸들러 ───────────────────────────────────────────────
  const handleAddClient = async () => {
    if (!newClient.name) {
      toast.error('클라이언트 이름을 입력해주세요.');
      return;
    }
    const saved = await insertClient({
      name: newClient.name,
      contactPerson: newClient.contactPerson,
      email: newClient.email,
      phone: newClient.phone,
      company: newClient.company,
      address: newClient.address,
      businessNumber: newClient.businessNumber,
      corpName: newClient.corpName,
      ceoName: newClient.ceoName,
      bizType: newClient.bizType,
      bizItem: newClient.bizItem,
      taxEmail: newClient.taxEmail,
      status: newClient.status || 'active',
      notes: newClient.notes,
    });
    if (saved) {
      invalidateTable('clients');
      setClients((prev) => [saved, ...prev]);
      setSelectedId(saved.id);
      setIsClientSuccess(true);
      setTimeout(() => {
        setIsAddModalOpen(false);
        setIsClientSuccess(false);
        setNewClient({ name: '', contactPerson: '', email: '', phone: '', company: '', address: '', notes: '', status: 'active', businessNumber: '', corpName: '', ceoName: '', bizType: '', bizItem: '', taxEmail: '' });
      }, 1200);
    } else {
      toast.error('클라이언트 추가에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setIsClientSuccess(false);
    setNewClient({ name: '', contactPerson: '', email: '', phone: '', company: '', address: '', notes: '', status: 'active', businessNumber: '', corpName: '', ceoName: '', bizType: '', bizItem: '', taxEmail: '' });
  };

  const handleEditClient = (client: Client) => {
    setEditingClient({ ...client });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingClient) return;
    const ok = await updateClient(editingClient.id, {
      name: editingClient.name,
      contactPerson: editingClient.contactPerson,
      email: editingClient.email,
      phone: editingClient.phone,
      company: editingClient.company,
      address: editingClient.address,
      businessNumber: editingClient.businessNumber,
      corpName: editingClient.corpName,
      ceoName: editingClient.ceoName,
      bizType: editingClient.bizType,
      bizItem: editingClient.bizItem,
      taxEmail: editingClient.taxEmail,
      notes: editingClient.notes,
      status: editingClient.status,
    });
    if (ok) {
      invalidateTable('clients');
      setClients((prev) => prev.map((c) =>
        c.id === editingClient.id ? { ...c, ...editingClient, updatedAt: new Date().toISOString() } : c
      ));
      setIsEditModalOpen(false);
      setEditingClient(null);
      toast.success('클라이언트 정보가 수정되었습니다.');
    } else {
      toast.error('수정에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleRequestDelete = (client: Client) => {
    setClientToDelete({ id: client.id, name: client.name });
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!clientToDelete) return;
    const client = clients.find((c) => c.id === clientToDelete.id);
    if (client) {
      await addToTrash('client', client);
      const deleted = await deleteClient(clientToDelete.id);
      if (deleted) {
        invalidateTable('clients');
        setClients((prev) => prev.filter((c) => c.id !== clientToDelete.id));
        if (selectedId === clientToDelete.id) setSelectedId(null);
      } else {
        toast.error('삭제에 실패했습니다. 다시 시도해주세요.');
      }
    }
    setIsDeleteModalOpen(false);
    setClientToDelete(null);
  };

  const handleDeactivateClient = async () => {
    if (!clientToDelete) return;
    const ok = await updateClient(clientToDelete.id, { status: 'inactive' });
    if (ok) {
      invalidateTable('clients');
      setClients((prev) => prev.map((c) =>
        c.id === clientToDelete.id
          ? { ...c, status: 'inactive' as const, updatedAt: new Date().toISOString() }
          : c
      ));
    } else {
      toast.error('상태 변경에 실패했습니다. 다시 시도해주세요.');
    }
    setIsDeleteModalOpen(false);
    setClientToDelete(null);
  };

  const handleNotesChange = async (clientId: string, notes: string) => {
    const ok = await updateClient(clientId, { notes });
    if (ok) {
      invalidateTable('clients');
      setClients((prev) => prev.map((c) =>
        c.id === clientId ? { ...c, notes, updatedAt: new Date().toISOString() } : c
      ));
      toast.success('메모가 저장됐어요');
    } else {
      toast.error('메모 저장에 실패했습니다.');
    }
  };

  const handleNewProject = (client: Client) => {
    // 임시: 프로젝트 페이지로 이동. Phase 2 에서 Wizard 직접 열기로 교체.
    router.push(`/projects?newForClient=${encodeURIComponent(client.id)}`);
  };

  // ── 렌더링 ────────────────────────────────────────────────
  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState onRetry={loadData} />;
  }

  return (
    <div className="space-y-5">
      <style jsx global>{`
        @keyframes clients-modal-content-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes clients-modal-sheet-in {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-clients-modal { animation: clients-modal-content-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .animate-clients-sheet { animation: clients-modal-sheet-in 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      `}</style>

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-page">클라이언트</h1>
          <p className="text-caption mt-0.5">
            전체 <b>{clients.length}개사</b>
            · 활성 {enrichedClients.filter((c) => c.computedStatus === 'active').length}
            · 대기 {enrichedClients.filter((c) => c.computedStatus === 'standby').length}
            · 휴면 {enrichedClients.filter((c) => c.computedStatus === 'dormant').length}
            {enrichedClients.filter((c) => c.needsContact).length > 0 &&
              ` · 연락 필요 ${enrichedClients.filter((c) => c.needsContact).length}`
            }
          </p>
        </div>
      </div>

      {/* 마스터-디테일 — md(768) 이상에선 분할, 모바일에선 선택 시 디테일 전환 */}
      <div className="grid gap-3 md:grid-cols-[260px_1fr] md:h-[calc(100vh-180px)] md:min-h-[480px]">
        <div className={`${selectedId ? 'hidden md:flex' : 'flex'} flex-col overflow-hidden`}>
          <ClientMasterList
            clients={filteredClients}
            selectedId={selectedId}
            onSelect={setSelectedId}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onAdd={() => setIsAddModalOpen(true)}
          />
        </div>

        <div className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-col overflow-hidden`}>
          {selectedClient && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="md:hidden mb-2 inline-flex items-center gap-1.5 self-start text-sm font-medium text-stone-600 hover:text-stone-900"
            >
              <ArrowLeft size={14} /> 목록으로
            </button>
          )}
          {selectedClient ? (
            <ClientDetailView
              client={selectedClient}
              projects={selectedProjects}
              episodes={allEpisodes}
              onEdit={handleEditClient}
              onDelete={handleRequestDelete}
              onNewProject={handleNewProject}
              onNotesChange={handleNotesChange}
            />
          ) : (
            <div
              className="rounded-2xl flex items-center justify-center"
              style={{ background: 'white', border: '1px solid var(--color-ink-200)', minHeight: '60vh' }}
            >
              {clients.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title="등록된 클라이언트가 없습니다"
                  description="첫 클라이언트를 추가해 보세요"
                  iconColor="text-orange-500"
                  iconBgColor="bg-orange-50"
                  action={{ label: '+ 새 클라이언트 추가', onClick: () => setIsAddModalOpen(true) }}
                />
              ) : (
                <EmptyState
                  icon={Briefcase}
                  title="클라이언트를 선택하세요"
                  description="왼쪽 목록에서 클라이언트를 선택하면 상세 정보가 표시됩니다."
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* 추가 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isClientSuccess && handleCloseAddModal()} />
          <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="relative bg-white rounded-t-xl sm:rounded-xl shadow-2xl max-w-2xl w-full animate-clients-sheet" onClick={(e) => e.stopPropagation()}>
              {isClientSuccess ? (
                <div className="px-6 sm:px-8 py-16 flex flex-col items-center justify-center">
                  <div className="w-24 h-24 bg-orange-500 rounded-full flex items-center justify-center mb-6">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <path d="M14 24L20 30L34 16" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <h2 className="text-base font-bold text-[#1c1917] mb-2">클라이언트 추가 완료</h2>
                  <p className="text-[#78716c]">새로운 클라이언트가 등록되었습니다</p>
                </div>
              ) : (
                <>
                  <div className="px-6 sm:px-8 pt-8 pb-6">
                    <button onClick={handleCloseAddModal} className="absolute right-6 top-6 p-2 hover:bg-[#f5f5f4] rounded-full transition-colors">
                      <X size={24} className="text-[#a8a29e]" />
                    </button>
                    <h2 className="text-page mb-2">새 클라이언트를<br />추가할게요</h2>
                    <p className="text-sm text-[#78716c]">클라이언트 정보를 입력해주세요</p>
                  </div>
                  <div className="px-6 sm:px-8 pb-8 space-y-5">
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-[#1c1917]">기본 정보</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FloatingLabelInput label="클라이언트 이름" required type="text" value={newClient.name}
                          onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
                        <FloatingLabelInput label="담당자 이름" type="text" value={newClient.contactPerson}
                          onChange={(e) => setNewClient({ ...newClient, contactPerson: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-[#1c1917]">연락처 정보</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FloatingLabelInput label="이메일" type="email" value={newClient.email}
                          onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
                        <FloatingLabelInput label="전화번호" type="tel" value={formatPhoneNumber(newClient.phone)}
                          onChange={(e) => setNewClient({ ...newClient, phone: formatPhoneNumber(e.target.value) })} />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-[#1c1917]">추가 정보</h3>
                      <FloatingLabelInput label="회사명" type="text" value={newClient.company}
                        onChange={(e) => setNewClient({ ...newClient, company: e.target.value })} />
                      <FloatingLabelInput label="주소" type="text" value={newClient.address}
                        onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} />
                      <FloatingLabelTextarea label="메모" value={newClient.notes}
                        onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })} rows={3} />
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-[#1c1917]">세금계산서 정보 <span className="text-[11px] font-normal text-[#a8a29e]">홈택스 발행용 · 선택</span></h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FloatingLabelInput label="사업자등록번호" type="text" value={newClient.businessNumber}
                          onChange={(e) => setNewClient({ ...newClient, businessNumber: e.target.value })} />
                        <FloatingLabelInput label="상호 (법인명)" type="text" value={newClient.corpName}
                          onChange={(e) => setNewClient({ ...newClient, corpName: e.target.value })} />
                        <FloatingLabelInput label="대표자" type="text" value={newClient.ceoName}
                          onChange={(e) => setNewClient({ ...newClient, ceoName: e.target.value })} />
                        <FloatingLabelInput label="세금계산서 이메일" type="email" value={newClient.taxEmail}
                          onChange={(e) => setNewClient({ ...newClient, taxEmail: e.target.value })} />
                        <FloatingLabelInput label="업태" type="text" value={newClient.bizType}
                          onChange={(e) => setNewClient({ ...newClient, bizType: e.target.value })} />
                        <FloatingLabelInput label="종목" type="text" value={newClient.bizItem}
                          onChange={(e) => setNewClient({ ...newClient, bizItem: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <div className="sticky bottom-0 bg-white px-6 sm:px-8 py-6 border-t border-divider rounded-b-xl">
                    <div className="flex gap-3">
                      <button onClick={handleCloseAddModal} className="flex-1 h-11 text-[#44403c] font-semibold bg-[#f5f5f4] hover:bg-[#ede9e6] rounded-xl transition-all active:scale-[0.98]">
                        취소
                      </button>
                      <button onClick={handleAddClient} disabled={!newClient.name}
                        className="flex-1 h-11 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-all disabled:bg-[#ede9e6] disabled:text-[#a8a29e] disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.98] shadow-lg shadow-orange-500/30">
                        클라이언트 추가하기
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {isEditModalOpen && editingClient && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setIsEditModalOpen(false); setEditingClient(null); }} />
          <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="relative bg-white rounded-t-xl sm:rounded-xl shadow-2xl max-w-2xl w-full animate-clients-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 sm:px-8 pt-8 pb-6">
                <button onClick={() => { setIsEditModalOpen(false); setEditingClient(null); }} className="absolute right-6 top-6 p-2 hover:bg-[#f5f5f4] rounded-full transition-colors">
                  <X size={24} className="text-[#a8a29e]" />
                </button>
                <h2 className="text-page mb-2">클라이언트 수정</h2>
                <p className="text-sm text-[#78716c]">클라이언트 정보를 수정합니다</p>
              </div>
              <div className="px-6 sm:px-8 pb-8 space-y-5">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#1c1917]">기본 정보</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FloatingLabelInput label="클라이언트 이름" required type="text" value={editingClient.name}
                      onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })} />
                    <FloatingLabelInput label="담당자 이름" type="text" value={editingClient.contactPerson || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, contactPerson: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#1c1917]">연락처 정보</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FloatingLabelInput label="이메일" type="email" value={editingClient.email || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })} />
                    <FloatingLabelInput label="전화번호" type="tel" value={formatPhoneNumber(editingClient.phone || '')}
                      onChange={(e) => setEditingClient({ ...editingClient, phone: formatPhoneNumber(e.target.value) })} />
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#1c1917]">추가 정보</h3>
                  <FloatingLabelInput label="회사명" type="text" value={editingClient.company || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, company: e.target.value })} />
                  <FloatingLabelInput label="주소" type="text" value={editingClient.address || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, address: e.target.value })} />
                  <FloatingLabelTextarea label="메모" value={editingClient.notes || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, notes: e.target.value })} rows={3} />
                </div>
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-[#1c1917]">세금계산서 정보 <span className="text-[11px] font-normal text-[#a8a29e]">홈택스 발행용 · 선택</span></h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FloatingLabelInput label="사업자등록번호" type="text" value={editingClient.businessNumber || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, businessNumber: e.target.value })} />
                    <FloatingLabelInput label="상호 (법인명)" type="text" value={editingClient.corpName || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, corpName: e.target.value })} />
                    <FloatingLabelInput label="대표자" type="text" value={editingClient.ceoName || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, ceoName: e.target.value })} />
                    <FloatingLabelInput label="세금계산서 이메일" type="email" value={editingClient.taxEmail || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, taxEmail: e.target.value })} />
                    <FloatingLabelInput label="업태" type="text" value={editingClient.bizType || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, bizType: e.target.value })} />
                    <FloatingLabelInput label="종목" type="text" value={editingClient.bizItem || ''}
                      onChange={(e) => setEditingClient({ ...editingClient, bizItem: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="sticky bottom-0 bg-white px-6 sm:px-8 py-6 border-t border-divider rounded-b-xl">
                <div className="flex gap-3">
                  <button onClick={() => { setIsEditModalOpen(false); setEditingClient(null); }} className="flex-1 h-11 text-[#44403c] font-semibold bg-[#f5f5f4] hover:bg-[#ede9e6] rounded-xl transition-all active:scale-[0.98]">
                    취소
                  </button>
                  <button onClick={handleSaveEdit} disabled={!editingClient.name}
                    className="flex-1 h-11 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-all disabled:bg-[#ede9e6] disabled:text-[#a8a29e] disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.98] shadow-lg shadow-orange-500/30">
                    저장하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {isDeleteModalOpen && clientToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setIsDeleteModalOpen(false); setClientToDelete(null); }} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full animate-clients-modal" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-divider">
                <h2 className="text-base font-bold text-[#1c1917]">클라이언트 관리</h2>
              </div>
              <div className="p-4">
                <p className="text-[#44403c] text-center mb-2">
                  <span className="font-semibold text-[#1c1917]">&quot;{clientToDelete.name}&quot;</span> 클라이언트를<br />
                  정말 삭제하시겠습니까?
                </p>
                <p className="text-sm text-orange-600 text-center">
                  휴지통으로 이동되며, 30일 이내에 복구할 수 있습니다.
                </p>
              </div>
              <div className="px-6 py-4 border-t border-divider flex flex-wrap justify-end gap-2">
                <button onClick={() => { setIsDeleteModalOpen(false); setClientToDelete(null); }}
                  className="px-4 py-2 text-[#44403c] hover:bg-[#f5f5f4] rounded-lg transition-colors active:scale-[0.97]">취소</button>
                <button onClick={handleDeactivateClient}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors active:scale-[0.97]">비활성 등록</button>
                <button onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors active:scale-[0.97]">삭제</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
