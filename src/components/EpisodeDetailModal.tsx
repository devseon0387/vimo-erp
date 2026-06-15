'use client';

import { useState, useEffect } from 'react';
import { Episode, Partner, EpisodeWorkItem, WorkContentType } from '@/types';
import { X, Edit2, Plus, Calendar, DollarSign, ChevronDown, ChevronRight, User } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/StatusBadge';

// 모든 작업 타입 정의
const ALL_WORK_TYPES: WorkContentType[] = ['롱폼', '기획 숏폼', '본편 숏폼', '썸네일', 'OAP'];

interface EpisodeDetailModalProps {
  episode: Episode;
  partner: Partner | undefined;
  partners: Partner[];
  projectWorkTypeCosts?: Record<WorkContentType, { partnerCost: number; managementCost: number }>;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (episode: Episode) => void;
}

// 작업 단계 타입 정의
interface WorkStep {
  id: string;
  label: string;
  status: 'waiting' | 'in_progress' | 'completed';
  startDate: string;
  dueDate: string;
  assigneeId?: string; // 담당 파트너 ID
}

// 작업 타입별 비용 정의
interface WorkTypeBudget {
  partnerPayment: number;
  managementFee: number;
}

export default function EpisodeDetailModal({
  episode,
  partner: initialPartner,
  partners,
  projectWorkTypeCosts,
  isOpen,
  onClose,
  onSave,
}: EpisodeDetailModalProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editedEpisode, setEditedEpisode] = useState(episode);

  // 각 작업 타입별 작업 단계들을 관리
  const [workSteps, setWorkSteps] = useState<Record<WorkContentType, WorkStep[]>>({
    '롱폼': [],
    '기획 숏폼': [],
    '본편 숏폼': [],
    '썸네일': [],
    'OAP': [],
  });

  // 각 작업 타입별 비용 관리
  const [workBudgets, setWorkBudgets] = useState<Record<WorkContentType, WorkTypeBudget>>({
    '롱폼': { partnerPayment: 0, managementFee: 0 },
    '기획 숏폼': { partnerPayment: 0, managementFee: 0 },
    '본편 숏폼': { partnerPayment: 0, managementFee: 0 },
    '썸네일': { partnerPayment: 0, managementFee: 0 },
    'OAP': { partnerPayment: 0, managementFee: 0 },
  });

  // 비용 상세 펼침/접힘 상태
  const [expandedBudgets, setExpandedBudgets] = useState<Record<WorkContentType, boolean>>({
    '롱폼': false,
    '기획 숏폼': false,
    '본편 숏폼': false,
    '썸네일': false,
    'OAP': false,
  });

  // 작업 타입 펼침/접힘 상태
  const [expandedWorkTypes, setExpandedWorkTypes] = useState<Record<WorkContentType, boolean>>({
    '롱폼': true,
    '기획 숏폼': true,
    '본편 숏폼': true,
    '썸네일': true,
    'OAP': true,
  });

  // episode prop이 바뀌면 편집 상태 초기화
  useEffect(() => {
    setEditedEpisode(episode);
  }, [episode]);

  // episode나 projectWorkTypeCosts가 바뀌면 작업별 비용 자동 설정
  useEffect(() => {
    if (!projectWorkTypeCosts || !episode.workContent) return;
    setWorkBudgets(prev => {
      const next = { ...prev };
      episode.workContent.forEach(workType => {
        if (projectWorkTypeCosts[workType]) {
          next[workType] = {
            partnerPayment: projectWorkTypeCosts[workType].partnerCost,
            managementFee: projectWorkTypeCosts[workType].managementCost,
          };
        }
      });
      return next;
    });
  }, [episode, projectWorkTypeCosts]);

  const partner = partners.find(p => p.id === editedEpisode.assignee) || initialPartner;

  // 전체 작업 단계 개수 계산
  const getTotalStepsCount = (): number => {
    return activeWorkTypes.reduce((total, workType) => {
      return total + (workSteps[workType]?.length || 0);
    }, 0);
  };

  // 완료된 작업 단계 개수 계산
  const getCompletedStepsCount = (): number => {
    return activeWorkTypes.reduce((total, workType) => {
      const completedSteps = workSteps[workType]?.filter(step => step.status === 'completed').length || 0;
      return total + completedSteps;
    }, 0);
  };

  // 진행률 계산 (작업 단계 기준)
  const calculateProgress = () => {
    const totalSteps = getTotalStepsCount();
    if (totalSteps === 0) return 0;
    const completedSteps = getCompletedStepsCount();
    return Math.round((completedSteps / totalSteps) * 100);
  };

  // 실제 종료일 계산 (모든 작업 단계의 마감일 중 가장 늦은 날짜)
  const calculateActualEndDate = (): string | null => {
    let latestDate: string | null = null;

    activeWorkTypes.forEach(workType => {
      const steps = workSteps[workType] || [];
      steps.forEach(step => {
        if (step.dueDate) {
          if (!latestDate || new Date(step.dueDate) > new Date(latestDate)) {
            latestDate = step.dueDate;
          }
        }
      });
    });

    return latestDate;
  };

  // 활성화된 작업 타입 목록
  const activeWorkTypes = editedEpisode.workContent || [];

  // 비활성화된 작업 타입 목록
  const inactiveWorkTypes = ALL_WORK_TYPES.filter(type => !activeWorkTypes.includes(type));

  // 작업 추가 (비활성화 → 활성화)
  const handleAddWorkType = (workType: WorkContentType) => {
    const updatedWorkContent = [...editedEpisode.workContent, workType];
    const newWorkItem: EpisodeWorkItem = {
      type: workType,
      status: 'waiting',
      startDate: editedEpisode.startDate,
      dueDate: editedEpisode.dueDate,
    };
    const updatedWorkItems = [...(editedEpisode.workItems || []), newWorkItem];

    setEditedEpisode(prev => ({
      ...prev,
      workContent: updatedWorkContent,
      workItems: updatedWorkItems,
    }));

    // 프로젝트의 비용 정보를 기반으로 작업별 비용 자동 설정
    if (projectWorkTypeCosts && projectWorkTypeCosts[workType]) {
      setWorkBudgets(prev => ({
        ...prev,
        [workType]: {
          partnerPayment: projectWorkTypeCosts[workType].partnerCost,
          managementFee: projectWorkTypeCosts[workType].managementCost,
        },
      }));
    }
  };

  // 작업 제거 (활성화 → 비활성화)
  const handleRemoveWorkType = (workType: WorkContentType) => {
    const updatedWorkContent = editedEpisode.workContent.filter(type => type !== workType);
    const updatedWorkItems = (editedEpisode.workItems || []).filter(item => item.type !== workType);

    setEditedEpisode(prev => ({
      ...prev,
      workContent: updatedWorkContent,
      workItems: updatedWorkItems,
    }));

    // 작업 단계도 초기화
    setWorkSteps(prev => ({
      ...prev,
      [workType]: [],
    }));

  };

  // 작업 단계 추가
  const handleAddWorkStep = (workType: WorkContentType) => {
    const newStep: WorkStep = {
      id: `${workType}-${Date.now()}`,
      label: '',
      status: 'waiting',
      startDate: editedEpisode.startDate,
      dueDate: editedEpisode.dueDate || '',
      assigneeId: editedEpisode.assignee || undefined, // 회차의 담당 파트너를 기본값으로
    };

    setWorkSteps(prev => ({
      ...prev,
      [workType]: [...(prev[workType] || []), newStep],
    }));

  };

  // 작업 단계 제거
  const handleRemoveWorkStep = (workType: WorkContentType, stepId: string) => {
    setWorkSteps(prev => ({
      ...prev,
      [workType]: prev[workType].filter(step => step.id !== stepId),
    }));

  };

  // 작업 단계 업데이트
  const handleUpdateWorkStep = (
    workType: WorkContentType,
    stepId: string,
    field: keyof WorkStep,
    value: string
  ) => {
    setWorkSteps(prev => {
      let updated = prev[workType].map(step =>
        step.id === stepId ? { ...step, [field]: value } : step
      );
      // 단계 완료 시 다음 단계를 자동으로 '진행 중'으로 전환
      if (field === 'status' && value === 'completed') {
        const idx = updated.findIndex(s => s.id === stepId);
        if (idx >= 0 && idx < updated.length - 1) {
          const next = updated[idx + 1];
          if (next.status === 'waiting') {
            updated = updated.map((s, i) => i === idx + 1 ? { ...s, status: 'in_progress' } : s);
          }
        }
      }
      return {
        ...prev,
        [workType]: updated,
      };
    });
  };

  // 비용 토글
  const toggleBudget = (workType: WorkContentType) => {
    setExpandedBudgets(prev => ({
      ...prev,
      [workType]: !prev[workType],
    }));
  };

  // 비용 업데이트
  const handleUpdateBudget = (
    workType: WorkContentType,
    field: 'partnerPayment' | 'managementFee',
    value: number
  ) => {
    setWorkBudgets(prev => ({
      ...prev,
      [workType]: {
        ...prev[workType],
        [field]: value,
      },
    }));
  };

  // 작업 타입별 총 비용 계산
  const getTotalBudget = (workType: WorkContentType): number => {
    const budget = workBudgets[workType];
    return budget.partnerPayment + budget.managementFee;
  };

  // 작업 타입의 전체 상태 계산 (작업 단계들의 상태를 기반으로)
  const getWorkTypeStatus = (workType: WorkContentType): 'waiting' | 'in_progress' | 'completed' => {
    const steps = workSteps[workType] || [];

    // 작업 단계가 없으면 대기
    if (steps.length === 0) return 'waiting';

    // 하나라도 진행 중이면 진행 중
    if (steps.some(step => step.status === 'in_progress')) {
      return 'in_progress';
    }

    // 모두 완료면 완료
    if (steps.every(step => step.status === 'completed')) {
      return 'completed';
    }

    // 그 외는 대기
    return 'waiting';
  };

  if (!isOpen) return null;

  const handleFieldClick = (field: string) => {
    setEditingField(field);
  };

  const handleFieldChange = (field: string, value: any) => {
    setEditedEpisode(prev => ({ ...prev, [field]: value }));
  };

  const handleFieldBlur = () => {
    setEditingField(null);
  };

  const handleClose = () => {
    if (onSave) {
      onSave({
        ...editedEpisode,
        workSteps: workSteps as Episode['workSteps'],
        workBudgets: workBudgets as Episode['workBudgets'],
      });
    }
    onClose();
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

  // status → StatusBadge tone (대기/검토 중=warn, 진행 중=brand, 완료=ok)
  const getStatusTone = (status: string): StatusTone => {
    const toneMap: Record<string, StatusTone> = {
      waiting: 'warn',
      in_progress: 'brand',
      review: 'warn',
      completed: 'ok',
    };
    return toneMap[status] || 'neutral';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 bg-gray-900/20 backdrop-blur-md transition-all duration-300"
        onClick={handleClose}
      />

      {/* 모달 */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-white rounded-lg shadow-2xl ring-1 ring-gray-900/10 max-w-3xl w-full max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="sticky top-0 bg-white border-b border-divider px-6 py-4 z-20">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-bold text-gray-900">
                  {episode.episodeNumber}편
                </h2>
                <StatusBadge tone={getStatusTone(episode.status)} className="px-3 py-1 text-xs">
                  {getStatusLabel(episode.status)}
                </StatusBadge>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {/* 기본 정보 요약 */}
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{editedEpisode.title}</span>
              </div>
              {editedEpisode.dueDate && (
                <div className="flex items-center gap-1">
                  <Calendar size={14} />
                  <span>마감: {new Date(editedEpisode.dueDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</span>
                </div>
              )}
              {episode.budget && (
                <div className="flex items-center gap-1">
                  <DollarSign size={14} />
                  <span>총 {episode.budget.totalAmount.toLocaleString()}원</span>
                </div>
              )}
            </div>
          </div>

          {/* 본문 */}
          <div className="p-6 space-y-6">
            {/* 작업 체크리스트 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">작업 체크리스트</h3>
              </div>

              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-medium text-gray-700">작업 목록</h4>
                {/* 진행률 표시 */}
                {getTotalStepsCount() > 0 && (
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-500">
                      {getCompletedStepsCount()} / {getTotalStepsCount()} 완료
                    </span>
                    <span className="text-sm font-semibold text-orange-600">
                      {calculateProgress()}%
                    </span>
                  </div>
                )}
              </div>

              {/* 진행률 바 */}
              {getTotalStepsCount() > 0 && (
                <div className="mb-4">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-orange-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${calculateProgress()}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 활성화된 작업 */}
              {activeWorkTypes.length > 0 ? (
                <div className="space-y-3 mb-6">
                  {activeWorkTypes.map((workType) => {
                    return (
                      <div
                        key={workType}
                        className="border border-divider rounded-lg bg-white"
                      >
                        <div className="flex-1">
                          {/* 제목 & 상태 배지 & 비용 & 접기/펼치기 & 제거 버튼 */}
                          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setExpandedWorkTypes(prev => ({ ...prev, [workType]: !prev[workType] }))}>
                            <div className="flex items-center gap-2">
                              {expandedWorkTypes[workType] ? (
                                <ChevronDown size={16} className="text-gray-400" />
                              ) : (
                                <ChevronRight size={16} className="text-gray-400" />
                              )}

                              <span className={`font-medium text-base ${getWorkTypeStatus(workType) === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                                {workType}
                              </span>

                              {/* 상태 배지 (작업 단계들의 상태에 따라 자동 계산) */}
                              <StatusBadge tone={getStatusTone(getWorkTypeStatus(workType))} className="text-xs">
                                {getStatusLabel(getWorkTypeStatus(workType))}
                              </StatusBadge>

                              {/* 작업 단계 개수 */}
                              {workSteps[workType]?.length > 0 && (
                                <span className="text-xs text-gray-500">
                                  {workSteps[workType].filter(s => s.status === 'completed').length}/{workSteps[workType].length}
                                </span>
                              )}

                              {/* 비용 표시 (클릭하여 상세 보기) */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBudget(workType);
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded transition-colors"
                                title="비용 상세"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>{getTotalBudget(workType).toLocaleString()}원</span>
                              </button>
                            </div>

                            {/* 제거 버튼 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveWorkType(workType);
                              }}
                              className="p-1 hover:bg-red-50 rounded transition-colors group"
                              title="작업 제거"
                            >
                              <X size={16} className="text-gray-400 group-hover:text-red-500" />
                            </button>
                          </div>

                          {/* 펼쳐진 상태일 때만 내용 표시 */}
                          {expandedWorkTypes[workType] && (
                            <div className="px-4 pb-4">
                              {/* 비용 상세 입력 폼 (펼쳐졌을 때만 표시) */}
                              {expandedBudgets[workType] && (
                                <div className="mb-3 p-3 bg-orange-50 rounded-lg border border-orange-100">
                                  <h4 className="text-xs font-semibold text-gray-700 mb-2">비용 상세</h4>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="text-xs text-gray-600 block mb-1">파트너 지급</label>
                                      <div className="flex items-center">
                                        <input
                                          type="number"
                                          value={workBudgets[workType].partnerPayment || ''}
                                          onChange={(e) => handleUpdateBudget(workType, 'partnerPayment', Number(e.target.value))}
                                          placeholder="0"
                                          className="w-full text-sm px-2 py-1 border border-gray-300 rounded focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                                        />
                                        <span className="ml-1 text-xs text-gray-600">원</span>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="text-xs text-gray-600 block mb-1">매니징 비용</label>
                                      <div className="flex items-center">
                                        <input
                                          type="number"
                                          value={workBudgets[workType].managementFee || ''}
                                          onChange={(e) => handleUpdateBudget(workType, 'managementFee', Number(e.target.value))}
                                          placeholder="0"
                                          className="w-full text-sm px-2 py-1 border border-gray-300 rounded focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                                        />
                                        <span className="ml-1 text-xs text-gray-600">원</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-2 pt-2 border-t border-orange-200">
                                    <div className="flex justify-between items-center">
                                      <span className="text-xs font-medium text-gray-700">합계</span>
                                      <span className="text-sm font-bold text-orange-600">
                                        {getTotalBudget(workType).toLocaleString()}원
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 작업 단계 목록 */}
                              <div className="space-y-2">
                            {workSteps[workType]?.length > 0 ? (
                              workSteps[workType].map((step) => (
                                <div key={step.id} className="relative border border-divider rounded-lg p-3 bg-gray-50">
                                  {/* 1줄: 작업 단계 + 담당 파트너 */}
                                  <div className="grid grid-cols-2 gap-3 mb-3">
                                    {/* 작업 단계/메모 */}
                                    <div>
                                      <label className="text-xs text-gray-500 block mb-1">작업 단계</label>
                                      <input
                                        type="text"
                                        value={step.label}
                                        onChange={(e) => handleUpdateWorkStep(workType, step.id, 'label', e.target.value)}
                                        placeholder="예: 1차 종편"
                                        className="w-full text-sm px-3 py-2 border border-divider rounded focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white"
                                      />
                                    </div>

                                    {/* 담당 파트너 */}
                                    <div>
                                      <label className="text-xs text-gray-500 block mb-1">담당 파트너</label>
                                      {editingField === `${workType}-${step.id}-assignee` ? (
                                        <div className="relative">
                                          <div className="absolute z-10 w-full mt-1 bg-white border border-orange-300 rounded-lg shadow-lg max-h-48 overflow-auto">
                                            <button
                                              onClick={() => {
                                                handleUpdateWorkStep(workType, step.id, 'assigneeId', '');
                                                setEditingField(null);
                                              }}
                                              className="w-full flex items-center px-3 py-2 hover:bg-gray-50 transition-colors text-left border-b border-divider"
                                            >
                                              <span className="text-sm text-gray-500">선택 안함</span>
                                            </button>
                                            {partners.map(p => (
                                              <button
                                                key={p.id}
                                                onClick={() => {
                                                  handleUpdateWorkStep(workType, step.id, 'assigneeId', p.id);
                                                  setEditingField(null);
                                                }}
                                                className="w-full flex items-center px-3 py-2 hover:bg-orange-50 transition-colors text-left"
                                              >
                                                <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-semibold mr-2 flex-shrink-0">
                                                  {p.name.charAt(0)}
                                                </div>
                                                <span className="text-sm text-gray-900 truncate">{p.name}</span>
                                              </button>
                                            ))}
                                          </div>
                                          <div
                                            className="fixed inset-0 z-0"
                                            onClick={() => setEditingField(null)}
                                          />
                                        </div>
                                      ) : (
                                        <div
                                          onClick={() => setEditingField(`${workType}-${step.id}-assignee`)}
                                          className="w-full flex items-center px-3 py-2 border border-divider rounded cursor-pointer hover:border-orange-300 transition-colors bg-white"
                                        >
                                          {step.assigneeId ? (
                                            <>
                                              <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mr-2">
                                                <User size={12} className="text-orange-500" />
                                              </div>
                                              <span className="text-sm text-gray-900 truncate">
                                                {partners.find(p => p.id === step.assigneeId)?.name}
                                              </span>
                                            </>
                                          ) : (
                                            <span className="text-sm text-gray-400">선택 안함</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* 2줄: 진행 사항 + 시작일 + 마감일 */}
                                  <div className="grid grid-cols-3 gap-3">
                                    {/* 진행 사항 */}
                                    <div>
                                      <label className="text-xs text-gray-500 block mb-1">진행 사항</label>
                                      <select
                                        value={step.status}
                                        onChange={(e) => handleUpdateWorkStep(workType, step.id, 'status', e.target.value)}
                                        className={`w-full text-sm px-3 py-2 rounded border-0 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer font-medium ${getStatusColor(step.status)}`}
                                      >
                                        <option value="waiting">대기</option>
                                        <option value="in_progress">진행 중</option>
                                        <option value="completed">완료</option>
                                      </select>
                                    </div>

                                    {/* 시작일 */}
                                    <div>
                                      <label className="text-xs text-gray-500 block mb-1">시작일</label>
                                      <input
                                        type="date"
                                        value={step.startDate}
                                        onChange={(e) => handleUpdateWorkStep(workType, step.id, 'startDate', e.target.value)}
                                        className="w-full text-sm px-3 py-2 border border-divider rounded focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white"
                                      />
                                    </div>

                                    {/* 마감일 */}
                                    <div>
                                      <label className="text-xs text-gray-500 block mb-1">마감일</label>
                                      <input
                                        type="date"
                                        value={step.dueDate}
                                        onChange={(e) => handleUpdateWorkStep(workType, step.id, 'dueDate', e.target.value)}
                                        className="w-full text-sm px-3 py-2 border border-divider rounded focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white"
                                      />
                                    </div>
                                  </div>

                                  {/* 작업 단계 제거 버튼 */}
                                  <button
                                    onClick={() => handleRemoveWorkStep(workType, step.id)}
                                    className="absolute right-2 top-2 p-1.5 bg-white hover:bg-red-50 rounded-full transition-colors group border border-divider shadow-sm"
                                    title="작업 단계 제거"
                                  >
                                    <X size={14} className="text-gray-400 group-hover:text-red-500" />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <div className="text-center py-4 text-gray-400 text-xs border border-dashed border-divider rounded">
                                작업 단계를 추가해보세요
                              </div>
                            )}

                            {/* 작업 단계 추가 버튼 */}
                            <button
                              onClick={() => handleAddWorkStep(workType)}
                              className="w-full flex items-center justify-center px-3 py-2 border border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors group text-sm"
                            >
                              <Plus size={14} className="mr-1 text-gray-400 group-hover:text-orange-500" />
                              <span className="text-gray-500 group-hover:text-orange-600">작업 단계 추가</span>
                            </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">아직 작업이 추가되지 않았습니다.</p>
                  <p className="text-xs mt-1">아래에서 작업을 추가해보세요.</p>
                </div>
              )}

              {/* 비활성화된 작업 (작업 추가 영역) */}
              {inactiveWorkTypes.length > 0 && (
                <div className="border-t border-divider pt-4">
                  <h4 className="text-sm font-medium text-gray-500 mb-3">추가 가능한 작업</h4>
                  <div className="space-y-2">
                    {inactiveWorkTypes.map((workType) => (
                      <button
                        key={workType}
                        onClick={() => handleAddWorkType(workType)}
                        className="w-full flex items-center justify-between px-4 py-3 border border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 transition-colors group"
                      >
                        <span className="text-sm text-gray-500 group-hover:text-orange-600">
                          {workType}
                        </span>
                        <div className="flex items-center space-x-1 text-xs text-gray-400 group-hover:text-orange-500">
                          <Plus size={14} />
                          <span>작업 추가</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 기본 정보 */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">기본 정보</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-500">제목</label>
                  {editingField === 'title' ? (
                    <input
                      type="text"
                      autoFocus
                      value={editedEpisode.title}
                      onChange={(e) => handleFieldChange('title', e.target.value)}
                      onBlur={handleFieldBlur}
                      className="text-base font-medium text-gray-900 w-full border border-orange-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  ) : (
                    <p
                      onClick={() => handleFieldClick('title')}
                      className="text-base font-medium text-gray-900 cursor-pointer hover:bg-gray-50 rounded px-2 py-1 -mx-2"
                    >
                      {editedEpisode.title}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">시작일</label>
                    {editingField === 'startDate' ? (
                      <input
                        type="date"
                        autoFocus
                        value={editedEpisode.startDate}
                        onChange={(e) => handleFieldChange('startDate', e.target.value)}
                        onBlur={handleFieldBlur}
                        className="w-full border border-orange-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    ) : (
                      <p
                        onClick={() => handleFieldClick('startDate')}
                        className="text-base text-gray-900 cursor-pointer hover:bg-gray-50 rounded px-2 py-1 -mx-2"
                      >
                        {new Date(editedEpisode.startDate).toLocaleDateString('ko-KR')}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">예정 종료일</label>
                    {editingField === 'dueDate' ? (
                      <input
                        type="date"
                        autoFocus
                        value={editedEpisode.dueDate || ''}
                        onChange={(e) => handleFieldChange('dueDate', e.target.value)}
                        onBlur={handleFieldBlur}
                        className="w-full border border-orange-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    ) : (
                      <p
                        onClick={() => handleFieldClick('dueDate')}
                        className="text-base text-gray-900 cursor-pointer hover:bg-gray-50 rounded px-2 py-1 -mx-2 min-h-[28px]"
                      >
                        {editedEpisode.dueDate ? new Date(editedEpisode.dueDate).toLocaleDateString('ko-KR') : '날짜 추가'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm text-gray-500 flex items-center gap-1">
                      실제 종료일
                      <span className="text-xs text-gray-400">(자동 계산)</span>
                    </label>
                    <p className="text-base text-gray-900 px-2 py-1 bg-gray-50 rounded min-h-[28px]">
                      {(() => {
                        const actualEndDate = calculateActualEndDate();
                        return actualEndDate
                          ? new Date(actualEndDate).toLocaleDateString('ko-KR')
                          : '작업 마감일 필요';
                      })()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 비용 정보 */}
            {episode.budget && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">회차별 비용</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">총 비용</p>
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        {episode.budget.totalAmount.toLocaleString()}원
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">파트너 지급</p>
                      <p className="text-xl font-bold text-orange-600 mt-1">
                        {episode.budget.partnerPayment.toLocaleString()}원
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">매니징 비용</p>
                      <p className="text-xl font-bold text-orange-600 mt-1">
                        {episode.budget.managementFee.toLocaleString()}원
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-divider">
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-gray-500">유보금</p>
                      <p className="text-lg font-bold text-green-600">
                        {(episode.budget.totalAmount - episode.budget.partnerPayment - episode.budget.managementFee).toLocaleString()}원
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 푸터 */}
          <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-divider flex justify-between items-center">
            <p className="text-sm text-gray-500">
              <Edit2 size={14} className="inline mr-1" />
              항목을 클릭하여 수정할 수 있습니다
            </p>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-orange-600 text-white hover:bg-orange-700 rounded-lg transition-colors font-medium"
            >
              저장하고 닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
