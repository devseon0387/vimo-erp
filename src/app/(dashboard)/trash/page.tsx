'use client';

import { useState, useEffect } from 'react';
import { TrashItem, Project, Episode, Client, Partner } from '@/types';
import { getDaysUntilExpiry } from '@/lib/trash';
import {
  getTrash,
  deleteTrashItem,
  permanentDeleteTrash,
  emptyTrashAll,
  cleanupExpiredTrashItems,
  restoreProjectToTable,
  restoreClientToTable,
  restorePartnerToTable,
  restoreEpisodeToTable,
} from '@/lib/supabase/db';
import { Trash2, RotateCcw, AlertTriangle, Calendar, Folder, Film, Briefcase, Users } from 'lucide-react';
import { EmptyTrash } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { useToast } from '@/contexts/ToastContext';

export default function TrashPage() {
  const toast = useToast();
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      await cleanupExpiredTrashItems(30);
      await loadTrashItems();
    };
    init();
  }, []);

  const loadTrashItems = async () => {
    const items = await getTrash();
    setTrashItems(items);
    setLoading(false);
  };

  const handleRestore = async (trashItem: TrashItem) => {
    const restored = await deleteTrashItem(trashItem.id);
    if (!restored) return;

    if (restored.type === 'project') {
      await restoreProjectToTable(restored.data as Project);
    } else if (restored.type === 'episode') {
      const ep = {
        ...(restored.data as Episode),
        projectId: (restored.data as Episode & { projectId?: string }).projectId ?? restored.originalProjectId ?? '',
      };
      await restoreEpisodeToTable(ep);
    } else if (restored.type === 'client') {
      await restoreClientToTable(restored.data as Client);
    } else if (restored.type === 'partner') {
      await restorePartnerToTable(restored.data as Partner);
    }

    await loadTrashItems();
    toast.success('복구되었습니다');
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteId) return;
    const success = await permanentDeleteTrash(permanentDeleteId);
    if (success) {
      await loadTrashItems();
      setPermanentDeleteId(null);
    }
  };

  const handleEmptyTrash = async () => {
    const count = trashItems.length;
    await emptyTrashAll();
    await loadTrashItems();
    setConfirmEmptyTrash(false);
    toast.success(`${count}개 항목이 영구 삭제되었습니다`);
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'project':  return <Folder size={16} className="text-orange-500" />;
      case 'episode':  return <Film size={16} className="text-orange-500" />;
      case 'client':   return <Briefcase size={16} className="text-green-500" />;
      case 'partner':  return <Users size={16} className="text-orange-500" />;
      default:         return <Trash2 size={16} className="text-[#78716c]" />;
    }
  };

  const getItemTitle = (item: TrashItem): string => {
    if (item.type === 'project') return (item.data as Project).title;
    if (item.type === 'episode') {
      const e = item.data as Episode;
      return `${e.episodeNumber}편${e.title ? ` - ${e.title}` : ''}`;
    }
    if (item.type === 'client')  return (item.data as Client).name;
    if (item.type === 'partner') return (item.data as Partner).name;
    return 'Unknown';
  };

  const getItemTypeLabel = (type: string): string => {
    switch (type) {
      case 'project': return '프로젝트';
      case 'episode': return '회차';
      case 'client':  return '클라이언트';
      case 'partner': return '파트너';
      default:        return '항목';
    }
  };

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-page">휴지통</h1>
          <p className="text-[#78716c] mt-1 text-sm">삭제된 항목은 30일 후 자동으로 영구 삭제됩니다</p>
        </div>
        {trashItems.length > 0 && (
          <button
            onClick={() => setConfirmEmptyTrash(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[13px] font-semibold transition-colors"
          >
            <Trash2 size={14} />
            휴지통 비우기
          </button>
        )}
      </div>

      {/* 안내 배너 */}
      {trashItems.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-amber-900">휴지통에 {trashItems.length}개 항목이 있습니다</p>
            <p className="text-[12px] text-amber-800 mt-0.5">
              30일이 지나면 자동으로 영구 삭제됩니다.
            </p>
          </div>
        </div>
      )}

      {/* 휴지통 항목 목록 */}
      {trashItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-ink-100">
          <EmptyTrash />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-ink-100">
          {trashItems.map((item, idx) => {
            const daysLeft = getDaysUntilExpiry(item.deletedAt);
            const isExpiringSoon = daysLeft <= 7;

            return (
              <div
                key={item.id}
                className={`flex items-center justify-between px-6 py-4 hover:bg-[#fafaf9] transition-colors ${
                  idx < trashItems.length - 1 ? 'border-b border-[#f8f7f6]' : ''
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[var(--color-ink-50)] flex items-center justify-center flex-shrink-0">
                    {getItemIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-[#1c1917] truncate">
                        {getItemTitle(item)}
                      </h3>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--color-ink-100)] text-[var(--color-ink-600)] flex-shrink-0">
                        {getItemTypeLabel(item.type)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-[var(--color-ink-400)]">
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {new Date(item.deletedAt).toLocaleDateString('ko-KR')} 삭제
                      </span>
                      <span className={isExpiringSoon ? 'text-red-500 font-semibold' : ''}>
                        {daysLeft}일 후 영구 삭제
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <button
                    onClick={() => handleRestore(item)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-lg text-[12px] font-semibold transition-colors"
                  >
                    <RotateCcw size={13} />
                    복구
                  </button>
                  <button
                    onClick={() => setPermanentDeleteId(item.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[12px] font-semibold transition-colors"
                  >
                    <Trash2 size={13} />
                    영구 삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 휴지통 비우기 확인 모달 */}
      {confirmEmptyTrash && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setConfirmEmptyTrash(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-[#1c1917] mb-2">휴지통 비우기</h3>
            <p className="text-[13px] text-[#44403c] mb-5">
              휴지통의 모든 항목({trashItems.length}개)을 영구적으로 삭제하시겠어요?
              <br />
              <span className="text-[12px] text-red-500 mt-1 inline-block">이 작업은 되돌릴 수 없습니다.</span>
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmEmptyTrash(false)}
                className="px-4 py-2 rounded-lg border border-divider bg-white text-[13px] font-semibold text-[#44403c] hover:bg-[#fafaf9]"
              >
                취소
              </button>
              <button
                onClick={handleEmptyTrash}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[13px] font-semibold transition-colors"
              >
                영구 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 영구 삭제 확인 모달 */}
      {permanentDeleteId && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPermanentDeleteId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-[#1c1917] mb-2">영구 삭제</h3>
            <p className="text-[13px] text-[#44403c] mb-5">
              이 항목을 영구적으로 삭제하시겠어요?
              <br />
              <span className="text-[12px] text-red-500 mt-1 inline-block">이 작업은 되돌릴 수 없습니다.</span>
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPermanentDeleteId(null)}
                className="px-4 py-2 rounded-lg border border-divider bg-white text-[13px] font-semibold text-[#44403c] hover:bg-[#fafaf9]"
              >
                취소
              </button>
              <button
                onClick={handlePermanentDelete}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[13px] font-semibold transition-colors"
              >
                영구 삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
