'use client';

import { useState } from 'react';
import { Episode, Partner, WorkContentType } from '@/types';
import { Calendar, User } from 'lucide-react';
import EpisodeDetailModal from './EpisodeDetailModal';

const workContentOptions: WorkContentType[] = ['롱폼', '기획 숏폼', '본편 숏폼', '썸네일', 'OAP'];

interface EpisodeTableProps {
  episodes: Episode[];
  partners: Partner[];
  managers: Partner[];
  onUpdate?: (episodeId: string, field: string, value: string) => void;
}

export default function EpisodeTable({ episodes: initialEpisodes, partners, managers, onUpdate }: EpisodeTableProps) {
  const [episodes, setEpisodes] = useState(initialEpisodes);
  const [editingCell, setEditingCell] = useState<{ episodeId: string; field: string } | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCellClick = (episodeId: string, field: string) => {
    setEditingCell({ episodeId, field });
  };

  const handleRowClick = (episode: Episode) => {
    // 편집 중이 아닐 때만 모달 열기
    if (!editingCell) {
      setSelectedEpisode(episode);
      setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedEpisode(null);
  };

  const handleSelectChange = (episodeId: string, field: string, value: string) => {
    setEditingCell(null);

    // 로컬 상태 업데이트
    setEpisodes(prevEpisodes =>
      prevEpisodes.map(ep =>
        ep.id === episodeId ? { ...ep, [field]: value } : ep
      )
    );

  };

  const handleWorkContentToggle = (episodeId: string, contentType: WorkContentType) => {
    setEpisodes(prevEpisodes =>
      prevEpisodes.map(ep => {
        if (ep.id === episodeId) {
          const currentContent = ep.workContent || [];
          const newContent = currentContent.includes(contentType)
            ? currentContent.filter(c => c !== contentType)
            : [...currentContent, contentType];
          return { ...ep, workContent: newContent };
        }
        return ep;
      })
    );
  };

  const getStatusColor = (status: string) => {
    const statusMap: Record<string, string> = {
      waiting: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      review: 'bg-orange-100 text-orange-800',
      completed: 'bg-green-100 text-green-800',
    };
    return statusMap[status] || statusMap.waiting;
  };

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      waiting: '대기',
      in_progress: '진행 중',
      review: '검토 중',
      completed: '완료',
    };
    return statusMap[status] || status;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-divider">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              회차
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              작업 내용
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              제목
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              진행사항
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              파트너
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              매니저
            </th>
            <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              작업 기간
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {episodes.map((episode) => {
            const assignee = partners.find(p => p.id === episode.assignee);
            const manager = managers.find(p => p.id === episode.manager);
            const isEditingAssignee = editingCell?.episodeId === episode.id && editingCell?.field === 'assignee';
            const isEditingManager = editingCell?.episodeId === episode.id && editingCell?.field === 'manager';
            const isEditingStatus = editingCell?.episodeId === episode.id && editingCell?.field === 'status';
            const isEditingWorkContent = editingCell?.episodeId === episode.id && editingCell?.field === 'workContent';

            return (
              <tr
                key={episode.id}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => handleRowClick(episode)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm font-medium text-gray-900">
                    {episode.episodeNumber}편
                  </span>
                </td>

                {/* 작업 내용 - 클릭하여 다중 선택 가능 */}
                <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                  {isEditingWorkContent ? (
                    <div
                      className="min-w-[200px] p-3 bg-white border border-orange-300 rounded shadow-lg"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <div className="space-y-2">
                        {workContentOptions.map((option) => (
                          <label
                            key={option}
                            className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={episode.workContent.includes(option)}
                              onChange={() => handleWorkContentToggle(episode.id, option)}
                              className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                            />
                            <span className="text-sm text-gray-700">{option}</span>
                          </label>
                        ))}
                      </div>
                      <button
                        onClick={() => setEditingCell(null)}
                        className="mt-2 w-full px-3 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600"
                      >
                        완료
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleCellClick(episode.id, 'workContent')}
                      className="flex flex-wrap gap-1 hover:bg-gray-100 rounded px-2 py-1 transition-colors min-h-[32px] items-center"
                    >
                      {episode.workContent.length > 0 ? (
                        episode.workContent.map((content) => (
                          <span
                            key={content}
                            className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium"
                          >
                            {content}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">+ 추가</span>
                      )}
                    </button>
                  )}
                </td>

                <td className="px-6 py-4">
                  <span className="text-sm text-gray-900">{episode.title}</span>
                </td>

                {/* 진행사항 - 클릭 가능 */}
                <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {isEditingStatus ? (
                    <select
                      autoFocus
                      className="text-xs px-3 py-1 rounded-full border border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      defaultValue={episode.status}
                      onChange={(e) => handleSelectChange(episode.id, 'status', e.target.value)}
                      onBlur={() => setEditingCell(null)}
                    >
                      <option value="waiting">대기</option>
                      <option value="in_progress">진행 중</option>
                      <option value="review">검토 중</option>
                      <option value="completed">완료</option>
                    </select>
                  ) : (
                    <button
                      onClick={() => handleCellClick(episode.id, 'status')}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(episode.status)} hover:opacity-80 transition-opacity`}
                    >
                      {getStatusLabel(episode.status)}
                    </button>
                  )}
                </td>

                {/* 담당자 - 클릭 가능 */}
                <td className="px-6 py-4 whitespace-nowrap relative" onClick={(e) => e.stopPropagation()}>
                  {isEditingAssignee ? (
                    <>
                      <div className="absolute z-20 bg-white border border-orange-300 rounded-lg shadow-lg max-h-60 overflow-auto min-w-[180px]">
                        {partners.map(partner => (
                          <button
                            key={partner.id}
                            onClick={() => handleSelectChange(episode.id, 'assignee', partner.id)}
                            className="w-full flex items-center px-3 py-2 hover:bg-orange-50 transition-colors text-left"
                          >
                            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mr-3">
                              <User size={16} className="text-orange-500" />
                            </div>
                            <span className="text-sm text-gray-900">{partner.name}</span>
                          </button>
                        ))}
                      </div>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setEditingCell(null)}
                      />
                    </>
                  ) : (
                    <button
                      onClick={() => handleCellClick(episode.id, 'assignee')}
                      className="flex items-center hover:bg-gray-100 rounded px-2 py-1 transition-colors"
                    >
                      <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-semibold mr-2">
                        {assignee?.name.charAt(0)}
                      </div>
                      <span className="text-sm text-gray-900">{assignee?.name}</span>
                    </button>
                  )}
                </td>

                {/* 매니저 - 클릭 가능 */}
                <td className="px-6 py-4 whitespace-nowrap relative" onClick={(e) => e.stopPropagation()}>
                  {isEditingManager ? (
                    <>
                      <div className="absolute z-20 bg-white border border-orange-300 rounded-lg shadow-lg max-h-60 overflow-auto min-w-[180px]">
                        {managers.map(mgr => (
                          <button
                            key={mgr.id}
                            onClick={() => handleSelectChange(episode.id, 'manager', mgr.id)}
                            className="w-full flex items-center px-3 py-2 hover:bg-orange-50 transition-colors text-left"
                          >
                            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-semibold mr-3">
                              {mgr.name.charAt(0)}
                            </div>
                            <span className="text-sm text-gray-900">{mgr.name}</span>
                          </button>
                        ))}
                      </div>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setEditingCell(null)}
                      />
                    </>
                  ) : (
                    <button
                      onClick={() => handleCellClick(episode.id, 'manager')}
                      className="flex items-center hover:bg-gray-100 rounded px-2 py-1 transition-colors"
                    >
                      <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-semibold mr-2">
                        {manager?.name.charAt(0)}
                      </div>
                      <span className="text-sm text-gray-900">{manager?.name}</span>
                    </button>
                  )}
                </td>

                {/* 작업 기간 */}
                <td className="px-6 py-4 whitespace-nowrap">
                  {(() => {
                    const isValidDate = (d: string) => d && !isNaN(new Date(d).getTime());
                    const fmt = (d: string) => new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
                    const hasDate = isValidDate(episode.startDate) || isValidDate(episode.endDate ?? '') || isValidDate(episode.dueDate ?? '');
                    if (!hasDate) {
                      return (
                        <span className="text-xs font-medium text-red-300">
                          마감 기한을 입력해 주세요!
                        </span>
                      );
                    }
                    return (
                      <div className="text-sm text-gray-900">
                        <div className="flex items-center text-gray-500">
                          <Calendar size={14} className="mr-1" />
                          {isValidDate(episode.startDate) ? fmt(episode.startDate) : ''}
                          {isValidDate(episode.endDate ?? '') && (
                            <>{isValidDate(episode.startDate) ? ' ~ ' : ''}{fmt(episode.endDate!)}</>
                          )}
                        </div>
                        {episode.dueDate && isValidDate(episode.dueDate) && !episode.endDate && (
                          <div className="text-xs text-orange-600 mt-1">
                            마감: {fmt(episode.dueDate)}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 회차 상세 모달 */}
      {selectedEpisode && (
        <EpisodeDetailModal
          episode={selectedEpisode}
          partner={partners.find(p => p.id === selectedEpisode.assignee)}
          partners={partners}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
