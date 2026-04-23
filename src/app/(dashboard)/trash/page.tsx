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
import { useToast } from '@/contexts/ToastContext';

export default function TrashPage() {
  const toast = useToast();
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);

  // 휴지통 항목 로드 및 만료된 항목 자동 삭제
  useEffect(() => {
    const init = async () => {
      const deletedCount = await cleanupExpiredTrashItems(30);
      if (deletedCount > 0) {
      }
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
    // 휴지통에서 제거
    const restored = await deleteTrashItem(trashItem.id);
    if (!restored) return;

    // 원본 테이블에 재삽입
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
    toast.success('복구되었습니다!');
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
    toast.success(`${count}개 항목이 영구 삭제되었습니다.`);
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'project':
        return <Folder size={20} className="text-orange-500" />;
      case 'episode':
        return <Film size={20} className="text-orange-500" />;
      case 'client':
        return <Briefcase size={20} className="text-green-500" />;
      case 'partner':
        return <Users size={20} className="text-orange-500" />;
      default:
        return <Trash2 size={20} className="text-gray-500" />;
    }
  };

  const getItemTitle = (item: TrashItem): string => {
    if (item.type === 'project') {
      return (item.data as Project).title;
    } else if (item.type === 'episode') {
      const episode = item.data as Episode;
      return `${episode.episodeNumber}편${episode.title ? ` - ${episode.title}` : ''}`;
    } else if (item.type === 'client') {
      return (item.data as Client).name;
    } else if (item.type === 'partner') {
      return (item.data as Partner).name;
    }
    return 'Unknown';
  };

  const getItemTypeLabel = (type: string): string => {
    switch (type) {
      case 'project': return '프로젝트';
      case 'episode': return '회차';
      case 'client': return '클라이언트';
      case 'partner': return '파트너';
      default: return '항목';
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
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">휴지통</h1>
          <p className="text-gray-500 mt-1">삭제된 항목들은 30일 후 자동으로 영구 삭제됩니다</p>
        </div>
        {trashItems.length > 0 && (
          <button
            onClick={() => setConfirmEmptyTrash(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center"
          >
            <Trash2 size={16} className="mr-2" />
            휴지통 비우기
          </button>
        )}
      </div>

      {/* 경고 메시지 */}
      {trashItems.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start">
          <AlertTriangle size={20} className="text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">
              휴지통의 항목들은 {trashItems.length}개입니다
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              항목들은 삭제된 후 30일이 지나면 자동으로 영구 삭제됩니다.
            </p>
          </div>
        </div>
      )}

      {/* 휴지통 항목 목록 */}
      {trashItems.length === 0 ? (
        <div className="bg-white rounded-lg shadow">
          <EmptyTrash />
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow">
          <div className="divide-y divide-gray-200">
            {trashItems.map((item) => {
              const daysLeft = getDaysUntilExpiry(item.deletedAt);
              const isExpiringSoon = daysLeft <= 7;

              return (
                <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      <div className="flex-shrink-0">{getItemIcon(item.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3">
                          <h3 className="text-base font-semibold text-gray-900 truncate">
                            {getItemTitle(item)}
                          </h3>
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                            {getItemTypeLabel(item.type)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                          <div className="flex items-center">
                            <Calendar size={14} className="mr-1.5" />
                            <span>{new Date(item.deletedAt).toLocaleDateString('ko-KR')} 삭제</span>
                          </div>
                          <span className={isExpiringSoon ? 'text-orange-600 font-medium' : ''}>
                            {daysLeft}일 후 영구 삭제
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => handleRestore(item)}
                        className="px-4 py-2 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition-colors flex items-center"
                      >
                        <RotateCcw size={16} className="mr-2" />
                        복구
                      </button>
                      <button
                        onClick={() => setPermanentDeleteId(item.id)}
                        className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center"
                      >
                        <Trash2 size={16} className="mr-2" />
                        영구 삭제
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 휴지통 비우기 확인 모달 */}
      {confirmEmptyTrash && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmEmptyTrash(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 mb-2">휴지통 비우기</h3>
              <p className="text-gray-600 mb-6">
                휴지통의 모든 항목({trashItems.length}개)을 영구적으로 삭제하시겠습니까?
                <br />
                <span className="text-sm text-red-500">이 작업은 되돌릴 수 없습니다.</span>
              </p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setConfirmEmptyTrash(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">취소</button>
                <button onClick={handleEmptyTrash} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">영구 삭제</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 영구 삭제 확인 모달 */}
      {permanentDeleteId && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPermanentDeleteId(null)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-900 mb-2">영구 삭제</h3>
              <p className="text-gray-600 mb-6">
                이 항목을 영구적으로 삭제하시겠습니까?
                <br />
                <span className="text-sm text-red-500">이 작업은 되돌릴 수 없습니다.</span>
              </p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setPermanentDeleteId(null)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">취소</button>
                <button onClick={handlePermanentDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">영구 삭제</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
