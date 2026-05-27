'use client';

import { memo } from 'react';
import { User, UserCircle, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { Episode, Partner } from '@/types';
import DateRangePicker from '@/components/DateRangePicker';
import { EpisodeStatusBadge } from './StatusBadges';

/** 부모 페이지에서 쓰는 편집 임시 객체 shape (부분 필드만) */
export interface EpisodeEditDraft {
  id: string;
  episodeNumber: number;
  title: string;
  assignee: string;
  manager: string;
  startDate: string;
  dueDate: string;
}

interface Props {
  episode: Episode;
  isSelected: boolean;
  /** 편집 모드 진입 여부 (true면 인풋·드롭다운 노출, false면 디스플레이) */
  isEditMode: boolean;
  /** 편집 모드일 때 사용할 임시 episode 객체 (없으면 원본 episode 사용) */
  editingEpisode?: EpisodeEditDraft;
  /** 어느 카드의 어느 필드 드롭다운이 열려 있는지 (전역 상태) */
  editDropdown: { episodeId: string; field: 'assignee' | 'manager' } | null;
  setEditDropdown: (v: { episodeId: string; field: 'assignee' | 'manager' } | null) => void;
  /** 편집 모드 입력 변경 — partial draft patch */
  onEditChange: (id: string, patch: Partial<EpisodeEditDraft>) => void;
  allPartners: Partner[];
  partnersById: Map<string, Partner>;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

/** 프로젝트 상세 페이지 좌측 회차 카드. 진행중 탭 / 회차 탭 양쪽이 같은 카드를 사용. */
function EpisodeListItemImpl({
  episode, isSelected, isEditMode, editingEpisode,
  editDropdown, setEditDropdown, onEditChange,
  allPartners, partnersById, onSelect, onDelete,
}: Props) {
  const assignee = partnersById.get(episode.assignee);
  const totalBudget = episode.budget?.totalAmount ?? 0;
  const isCompleted = episode.status === 'completed';

  return (
    <div className="relative group">
      <div
        onClick={() => { if (!isEditMode) onSelect(episode.id); }}
        className={`w-full text-left bg-white rounded-xl p-3 sm:p-4 transition-all ${
          isSelected
            ? 'border-2 border-orange-400 shadow-sm shadow-orange-500/10'
            : 'border border-divider'
        } ${
          isEditMode ? 'cursor-default' : 'cursor-pointer hover:border-[#d6d3d1] hover:shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex-1 min-w-0">
            {/* 첫 번째 줄: 편 수, 회차 이름 + 금액 */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2 min-w-0">
                {isEditMode ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex items-center flex-shrink-0">
                      <input
                        type="number"
                        min={0}
                        value={editingEpisode?.episodeNumber ?? episode.episodeNumber}
                        onChange={(e) => {
                          const num = e.target.value === '' ? 0 : parseInt(e.target.value);
                          if (!isNaN(num)) onEditChange(episode.id, { episodeNumber: num });
                        }}
                        className="w-14 text-lg font-bold text-gray-900 bg-white border border-gray-300 rounded-lg px-2 py-1 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-lg font-bold text-gray-900 ml-0.5">편</span>
                    </div>
                    <input
                      type="text"
                      value={editingEpisode?.title ?? episode.title}
                      placeholder="회차 이름 입력"
                      onChange={(e) => onEditChange(episode.id, { title: e.target.value })}
                      className="flex-1 min-w-[120px] text-base font-semibold text-gray-900 bg-white border border-gray-300 rounded-lg px-3 py-1 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 placeholder-gray-300"
                    />
                  </div>
                ) : (
                  <>
                    <span className="text-[13px] font-bold text-[#a8a29e]">
                      {episode.episodeNumber === 0 ? '미정' : `${episode.episodeNumber}편`}
                    </span>
                    <h3 className="text-[15px] font-bold text-gray-900 truncate">
                      {episode.title || '제목 없음'}
                    </h3>
                  </>
                )}
              </div>
              {/* 금액 */}
              {!isEditMode && totalBudget > 0 && (
                <span className="text-[12px] sm:text-[14px] font-bold flex-shrink-0">
                  {totalBudget.toLocaleString()}
                  <span className="text-[10px] sm:text-[11px] text-[#78716c] font-medium ml-0.5">원</span>
                </span>
              )}
            </div>

            {/* 프로그레스 미니바 (완료가 아닐 때만) */}
            {!isEditMode && !isCompleted && episode.workSteps && (() => {
              const allSteps = Object.values(episode.workSteps).flat() as Array<{ status?: string }>;
              const total = allSteps.length;
              const completed = allSteps.filter((s) => s.status === 'completed').length;
              const inProgress = allSteps.filter((s) => s.status === 'in_progress').length;
              if (total === 0) return null;
              const completedPct = (completed / total) * 100;
              const inProgressPct = (inProgress / total) * 100;
              return (
                <div className="h-[3px] bg-[#f0ece9] rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${completedPct + inProgressPct}%`,
                      background: inProgressPct > 0
                        ? `linear-gradient(90deg, #22c55e ${(completedPct / (completedPct + inProgressPct)) * 100}%, #facc15 ${(completedPct / (completedPct + inProgressPct)) * 100}%)`
                        : '#22c55e',
                    }}
                  />
                </div>
              );
            })()}

            {/* 메타 줄 */}
            {isEditMode ? (
              <div className="flex items-center flex-wrap gap-2 text-sm">
                {/* 담당 파트너 */}
                {(() => {
                  const selectedPartner = allPartners.find(p => p.id === editingEpisode?.assignee);
                  const isOpen = editDropdown?.episodeId === episode.id && editDropdown?.field === 'assignee';
                  return (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setEditDropdown(isOpen ? null : { episodeId: episode.id, field: 'assignee' })}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:border-orange-400 transition-colors"
                      >
                        <div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                          <User size={10} className="text-orange-500" />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{selectedPartner?.name || '파트너 선택'}</span>
                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="absolute z-50 left-0 top-full mt-1 w-48 bg-white border border-divider rounded-xl shadow-xl max-h-52 overflow-y-auto">
                          {allPartners.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                onEditChange(episode.id, { assignee: p.id });
                                setEditDropdown(null);
                              }}
                              className={`w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-orange-50 transition-colors text-left ${editingEpisode?.assignee === p.id ? 'bg-orange-50' : ''}`}
                            >
                              <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                                <User size={11} className="text-orange-500" />
                              </div>
                              <span className="text-sm font-medium text-gray-900">{p.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* 담당 매니저 */}
                {(() => {
                  const selectedManager = allPartners.find(p => p.id === editingEpisode?.manager);
                  const isOpen = editDropdown?.episodeId === episode.id && editDropdown?.field === 'manager';
                  return (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setEditDropdown(isOpen ? null : { episodeId: episode.id, field: 'manager' })}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 rounded-lg hover:border-orange-400 transition-colors"
                      >
                        <UserCircle size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900">{selectedManager?.name || '매니저 선택'}</span>
                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="absolute z-50 left-0 top-full mt-1 w-48 bg-white border border-divider rounded-xl shadow-xl max-h-52 overflow-y-auto">
                          {allPartners.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                onEditChange(episode.id, { manager: p.id });
                                setEditDropdown(null);
                              }}
                              className={`w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-orange-50 transition-colors text-left ${editingEpisode?.manager === p.id ? 'bg-orange-50' : ''}`}
                            >
                              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <UserCircle size={12} className="text-gray-500" />
                              </div>
                              <span className="text-sm font-medium text-gray-900">{p.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* 시작일 · 마감일 */}
                <DateRangePicker
                  startDate={editingEpisode?.startDate?.split('T')[0] ?? ''}
                  endDate={editingEpisode?.dueDate?.split('T')[0] ?? ''}
                  onStartChange={(v) => onEditChange(episode.id, { startDate: v ? new Date(v).toISOString() : '' })}
                  onEndChange={(v) => onEditChange(episode.id, { dueDate: v && v !== 'tbd' ? new Date(v).toISOString() : '' })}
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] text-[#78716c] mt-1 flex-wrap">
                <EpisodeStatusBadge status={episode.status} />
                <div className="flex items-center gap-1">
                  <div className="w-[16px] h-[16px] bg-[#f0ece9] rounded-full flex items-center justify-center text-[7px] font-bold text-[#78716c]">
                    {assignee?.name?.charAt(0) || '?'}
                  </div>
                  <span>{assignee?.name || '미정'}</span>
                </div>
                <span className="text-[#ede9e6] hidden sm:inline">·</span>
                <span className="tabular-nums">
                  {episode.startDate && !isNaN(new Date(episode.startDate).getTime())
                    ? (() => { const d = new Date(episode.startDate); return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; })()
                    : '미정'}
                  {episode.dueDate && (
                    <> <span className="text-[#d6d3d1]">→</span> <span className="text-[#f97316] font-semibold">{(() => { const d = new Date(episode.dueDate); return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; })()}</span></>
                  )}
                </span>
                {episode.workContent.length > 0 && (
                  <div className="hidden sm:flex items-center gap-1">
                    {episode.workContent.map((work) => (
                      <span key={work} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                        isCompleted
                          ? 'bg-[#f5f5f4] border-divider text-[#78716c]'
                          : 'bg-[#fff7ed] border-[#fed7aa] text-[#f97316]'
                      }`}>
                        {work}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {!isEditMode && (
            <ChevronRight size={18} className="text-gray-400 group-hover:text-orange-500 transition-colors flex-shrink-0 ml-2 sm:ml-4 hidden sm:block" />
          )}
        </div>
      </div>

      {/* 삭제 버튼 */}
      {!isEditMode && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(episode.id); }}
          className="absolute top-2 right-2 p-2 sm:opacity-0 sm:group-hover:opacity-100 bg-gray-50 rounded-lg shadow-md hover:bg-red-50 hover:text-red-600 transition-all"
          title="회차 삭제"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

export default memo(EpisodeListItemImpl);
