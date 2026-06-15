'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Phone, User, Mail, Plus, X, Trash2, AlertTriangle } from 'lucide-react';
import { Partner } from '@/types';
import { getPartners, insertPartner, deletePartner } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { addToTrash } from '@/lib/trash';
import { FloatingLabelInput } from '@/components/FloatingLabelInput';
import { formatPhoneNumber } from '@/lib/utils';
import { useToast } from '@/contexts/ToastContext';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { KPICard } from '@/components/KPICard';
import { StatusBadge } from '@/components/StatusBadge';

export default function ManagersPage() {
  const router = useRouter();
  const toast = useToast();
  const [managers, setManagers] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null);
  const [newMember, setNewMember] = useState<Partial<Partner>>({
    name: '', email: '', phone: '', jobTitle: '', jobRank: '',
    role: 'admin', position: 'manager', status: 'active',
  });

  const loadData = useCallback(() => {
    setLoadError(false);
    getPartners()
      .then((all) => {
        setManagers(all.filter((p) => p.position === 'manager'));
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useSupabaseRealtime(['partners'], loadData);

  const handleAdd = async () => {
    if (!newMember.name) {
      toast.error('이름을 입력해주세요.');
      return;
    }
    if (saving) return;
    setSaving(true);
    const saved = await insertPartner({
      name: newMember.name,
      email: newMember.email,
      phone: newMember.phone,
      jobTitle: newMember.jobTitle,
      jobRank: newMember.jobRank,
      role: newMember.role || 'admin',
      position: 'manager',
      status: 'active',
    });
    if (saved) {
      setManagers(prev => [saved, ...prev]);
      setIsAddModalOpen(false);
      setNewMember({ name: '', email: '', phone: '', jobTitle: '', jobRank: '', role: 'admin', position: 'manager', status: 'active' });
      toast.success(`${saved.name} 매니저가 추가되었습니다.`);
    } else {
      toast.error('추가에 실패했습니다. 다시 시도해주세요.');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await addToTrash('partner', deleteTarget);
    const deleted = await deletePartner(deleteTarget.id);
    if (deleted) {
      setManagers(prev => prev.filter(p => p.id !== deleteTarget.id));
      toast.success(`${deleteTarget.name} 매니저가 삭제되었습니다.`);
    } else {
      toast.error('삭제에 실패했습니다. 다시 시도해주세요.');
    }
    setDeleteTarget(null);
  };

  if (loading) {
    return <LoadingState />;
  }

  if (loadError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="불러오지 못했습니다"
        description="매니저 정보를 불러오는 중 문제가 발생했어요."
        action={{ label: '다시 시도', onClick: loadData }}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <button
            onClick={() => router.push('/operations')}
            className="flex items-center gap-2 text-ink-500 hover:text-ink-900 mb-4 transition-colors text-sm font-medium"
          >
            <ArrowLeft size={18} />
            운영으로 돌아가기
          </button>
          <h1 className="text-page">운영 매니저</h1>
          <p className="text-ink-500 mt-2">운영 매니저 정보를 확인하고 관리해요</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-full sm:w-auto justify-center px-5 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-colors shadow-lg shadow-orange-500/30 font-semibold flex items-center gap-2 text-sm"
        >
          <Plus size={18} />
          매니저 추가
        </button>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KPICard label="전체" value={managers.length} />
        <KPICard label="활성" value={managers.filter((p) => p.status === 'active').length} tone="ok" />
        <KPICard label="비활성" value={managers.filter((p) => p.status !== 'active').length} />
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-2xl border border-divider overflow-hidden">
        <div className="p-4">
          {managers.length === 0 ? (
            <EmptyState
              icon={User}
              title="등록된 매니저가 없습니다"
              description="매니저를 추가하여 운영 인력을 관리하세요."
              size="compact"
              action={{ label: '매니저 추가하기', onClick: () => setIsAddModalOpen(true) }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {managers.map((partner) => (
                <MemberCard key={partner.id} partner={partner} onDelete={setDeleteTarget} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 추가 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsAddModalOpen(false)}
          />
          <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="relative bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 sm:px-8 pt-8 pb-6">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="absolute right-6 top-6 p-2 hover:bg-ink-100 rounded-full transition-colors"
                >
                  <X size={24} className="text-ink-400" />
                </button>
                <h2 className="text-page mb-2">새 매니저를 추가할게요</h2>
                <p className="text-sm text-ink-500">매니저 정보를 입력해주세요</p>
              </div>

              <div className="px-6 sm:px-8 pb-8 space-y-5">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-ink-900">기본 정보</h3>
                  <FloatingLabelInput
                    label="이름"
                    required
                    type="text"
                    value={newMember.name}
                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                  />
                  <FloatingLabelInput
                    label="직책 (예: 팀장, PM)"
                    type="text"
                    value={newMember.jobTitle}
                    onChange={(e) => setNewMember({ ...newMember, jobTitle: e.target.value })}
                  />
                  <FloatingLabelInput
                    label="직급 (예: 부장, 과장)"
                    type="text"
                    value={newMember.jobRank}
                    onChange={(e) => setNewMember({ ...newMember, jobRank: e.target.value })}
                  />
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-ink-900">연락처 정보</h3>
                  <FloatingLabelInput
                    label="이메일"
                    type="email"
                    value={newMember.email}
                    onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                  />
                  <FloatingLabelInput
                    label="전화번호"
                    type="tel"
                    value={formatPhoneNumber(newMember.phone)}
                    onChange={(e) => setNewMember({ ...newMember, phone: formatPhoneNumber(e.target.value) })}
                  />
                </div>
              </div>

              <div className="sticky bottom-0 bg-white px-6 sm:px-8 py-6 border-t border-divider rounded-b-[28px]">
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 h-14 text-ink-700 font-semibold bg-ink-100 hover:bg-ink-200 rounded-xl transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={!newMember.name || saving}
                    className="flex-1 h-14 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors disabled:bg-ink-200 disabled:text-ink-400 disabled:cursor-not-allowed disabled:shadow-none shadow-lg shadow-orange-500/30"
                  >
                    {saving ? '추가 중...' : '매니저 추가하기'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="relative bg-white rounded-lg shadow-xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-divider">
                <h2 className="text-xl font-bold text-ink-900">매니저 삭제</h2>
              </div>
              <div className="p-4">
                <p className="text-ink-700 text-center mb-2">
                  <span className="font-semibold text-ink-900">&quot;{deleteTarget.name}&quot;</span> 매니저를<br />
                  정말 삭제하시겠습니까?
                </p>
                <p className="text-sm text-orange-600 text-center">
                  휴지통으로 이동되며, 30일 이내에 복구할 수 있습니다.
                </p>
              </div>
              <div className="px-6 py-4 border-t border-divider flex flex-wrap justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2.5 text-ink-700 hover:bg-ink-100 rounded-lg transition-colors text-sm font-medium"
                >
                  취소
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberCard({ partner, onDelete }: { partner: Partner; onDelete: (p: Partner) => void }) {
  return (
    <div className="bg-white rounded-2xl border border-divider p-4 hover:border-ink-300 hover:shadow-sm transition-all group relative">
      <button
        onClick={() => onDelete(partner)}
        className="absolute top-2.5 right-2.5 p-2 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-50 transition-all"
        title="삭제"
      >
        <Trash2 size={16} className="text-ink-400 hover:text-red-500" />
      </button>

      <div className="flex items-start justify-between mb-3">
        <div className="w-11 h-11 bg-ink-100 rounded-full flex items-center justify-center flex-shrink-0">
          <User size={22} className="text-ink-700" />
        </div>
        <StatusBadge tone={partner.status === 'active' ? 'ok' : 'neutral'}>
          {partner.status === 'active' ? '활성' : '비활성'}
        </StatusBadge>
      </div>

      <p className="text-sm font-semibold text-ink-900 truncate">{partner.name}</p>

      {(partner.jobTitle || partner.jobRank) && (
        <p className="text-xs text-ink-500 mt-0.5 truncate">
          {[partner.jobTitle, partner.jobRank].filter(Boolean).join(' · ')}
        </p>
      )}

      <div className="mt-3 pt-3 border-t border-divider space-y-1">
        {partner.phone && (
          <div className="flex items-center gap-1.5 text-xs text-ink-500">
            <Phone size={11} className="flex-shrink-0" />
            <span className="truncate">{formatPhoneNumber(partner.phone)}</span>
          </div>
        )}
        {partner.email && (
          <div className="flex items-center gap-1.5 text-xs text-ink-500">
            <Mail size={11} className="flex-shrink-0" />
            <span className="truncate">{partner.email}</span>
          </div>
        )}
      </div>
    </div>
  );
}
