'use client';

import { useState } from 'react';
import { X, Check, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Project, Episode, WorkContentType } from '@/types';

interface ProjectChecklistModalProps {
  project: Project;
  episodes: Episode[];
  isOpen: boolean;
  onClose: () => void;
  onEpisodeClick?: (episode: Episode) => void;
}

export default function ProjectChecklistModal({
  project,
  episodes,
  isOpen,
  onClose,
  onEpisodeClick,
}: ProjectChecklistModalProps) {
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  // 프로젝트 준비 상태 체크
  const isClientInfoComplete = !!project.client;
  const isPartnerAssigned = !!project.partnerId;
  const isProjectSetupComplete = isClientInfoComplete && isPartnerAssigned;

  // 회차별 진행률 계산
  const getEpisodeProgress = (episode: Episode): number => {
    const workTypes = episode.workContent || [];
    if (workTypes.length === 0) return 0;

    const completedCount = workTypes.filter(workType => {
      const workItem = episode.workItems?.find(item => item.type === workType);
      return workItem?.status === 'completed';
    }).length;

    return Math.round((completedCount / workTypes.length) * 100);
  };

  // 회차 상태 확인
  const isEpisodeCompleted = (episode: Episode): boolean => {
    return episode.status === 'completed';
  };

  // 작업 타입 상태 확인
  const getWorkTypeStatus = (episode: Episode, workType: WorkContentType): 'completed' | 'in_progress' | 'waiting' => {
    const workItem = episode.workItems?.find(item => item.type === workType);
    if (!workItem) return 'waiting';
    return workItem.status;
  };

  // 작업 타입 아이콘
  const getWorkTypeIcon = (status: 'completed' | 'in_progress' | 'waiting') => {
    if (status === 'completed') {
      return (
        <div className="w-4 h-4 rounded bg-orange-500 border-2 border-orange-500 flex items-center justify-center">
          <Check size={10} className="text-white" strokeWidth={3} />
        </div>
      );
    }
    return (
      <div className={`w-4 h-4 rounded border-2 ${
        status === 'in_progress' ? 'border-yellow-500 bg-yellow-50' : 'border-gray-300'
      }`} />
    );
  };

  // 전체 진행률 계산
  const totalProgress = episodes.length > 0
    ? Math.round(episodes.reduce((sum, ep) => sum + getEpisodeProgress(ep), 0) / episodes.length)
    : 0;

  const completedEpisodesCount = episodes.filter(ep => isEpisodeCompleted(ep)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 배경 */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 text-white">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xl font-bold">{project.title}</h3>
              <p className="text-sm text-orange-100 mt-1">
                {completedEpisodesCount}개 / {episodes.length}개 회차 완료
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* 전체 진행률 바 */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-orange-100">전체 진행률</span>
              <span className="text-sm font-bold">{totalProgress}%</span>
            </div>
            <div className="w-full bg-orange-400/30 rounded-full h-2">
              <div
                className="bg-white h-2 rounded-full transition-all duration-300"
                style={{ width: `${totalProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* 프로젝트 준비 */}
          <div className="p-6 border-b border-divider">
            <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              프로젝트 준비
            </h4>
            <div className="space-y-3">
              {/* 클라이언트 정보 */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {isClientInfoComplete ? (
                    <div className="w-5 h-5 rounded border-2 bg-orange-500 border-orange-500 flex items-center justify-center">
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded border-2 border-gray-300" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm ${isClientInfoComplete ? 'text-gray-400 line-through' : 'text-gray-900 font-medium'}`}>
                    클라이언트 정보 입력
                  </p>
                  {isClientInfoComplete && (
                    <p className="text-xs text-gray-400 mt-0.5">완료</p>
                  )}
                </div>
              </div>

              {/* 파트너 배정 */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {isPartnerAssigned ? (
                    <div className="w-5 h-5 rounded border-2 bg-orange-500 border-orange-500 flex items-center justify-center">
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded border-2 border-gray-300" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm ${isPartnerAssigned ? 'text-gray-400 line-through' : 'text-gray-900 font-medium'}`}>
                    파트너 배정
                  </p>
                  {isPartnerAssigned && (
                    <p className="text-xs text-gray-400 mt-0.5">완료</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 회차 제작 */}
          <div className="p-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
              회차 제작 진행 상황
            </h4>

            {episodes.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">아직 회차가 없습니다.</p>
                <p className="text-xs mt-1">프로젝트에 회차를 추가해보세요.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {episodes.map((episode) => {
                  const progress = getEpisodeProgress(episode);
                  const isCompleted = isEpisodeCompleted(episode);
                  const isExpanded = expandedEpisodes[episode.id];
                  const workTypes = episode.workContent || [];

                  return (
                    <div
                      key={episode.id}
                      className={`border rounded-lg transition-all ${
                        isCompleted ? 'border-green-200 bg-green-50/30' : 'border-divider bg-white'
                      }`}
                    >
                      {/* 회차 헤더 */}
                      <div
                        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                        onClick={() => setExpandedEpisodes(prev => ({ ...prev, [episode.id]: !prev[episode.id] }))}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {isExpanded ? (
                            <ChevronDown size={16} className="text-gray-400" />
                          ) : (
                            <ChevronRight size={16} className="text-gray-400" />
                          )}
                        </div>
                        <div className="flex-shrink-0 mt-0.5">
                          {isCompleted ? (
                            <div className="w-5 h-5 rounded border-2 bg-orange-500 border-orange-500 flex items-center justify-center">
                              <Check size={14} className="text-white" strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded border-2 border-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm font-medium truncate ${
                              isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'
                            }`}>
                              {episode.episodeNumber}편: {episode.title}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onEpisodeClick?.(episode);
                              }}
                              className="flex-shrink-0 p-1 hover:bg-orange-50 rounded transition-colors"
                              title="회차 상세 보기"
                            >
                              <ExternalLink size={14} className="text-orange-500" />
                            </button>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`text-xs font-semibold ${
                              progress === 100 ? 'text-green-600' :
                              progress > 0 ? 'text-orange-600' : 'text-gray-400'
                            }`}>
                              {progress}% 완료
                            </span>
                            {workTypes.length > 0 && (
                              <span className="text-xs text-gray-500">
                                {workTypes.filter(wt => getWorkTypeStatus(episode, wt) === 'completed').length}/{workTypes.length} 작업
                              </span>
                            )}
                            {episode.dueDate && (
                              <span className="text-xs text-gray-400">
                                마감: {new Date(episode.dueDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 작업 타입 리스트 (펼쳤을 때) */}
                      {isExpanded && workTypes.length > 0 && (
                        <div className="px-4 pb-4 pl-16 space-y-2">
                          {workTypes.map((workType) => {
                            const status = getWorkTypeStatus(episode, workType);
                            return (
                              <div key={workType} className="flex items-center gap-2">
                                {getWorkTypeIcon(status)}
                                <span className={`text-xs ${
                                  status === 'completed' ? 'text-gray-400 line-through' :
                                  status === 'in_progress' ? 'text-gray-900 font-medium' :
                                  'text-gray-500'
                                }`}>
                                  {workType}
                                  {status === 'in_progress' && (
                                    <span className="ml-1 text-yellow-600">(진행중)</span>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 bg-gray-50 border-t border-divider flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-md font-medium text-sm"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
