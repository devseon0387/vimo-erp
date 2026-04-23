'use client';

import Link from 'next/link';
import { X, Calendar } from 'lucide-react';
import type { Episode, Project, Partner, WorkContentType, WorkStep } from '@/types';

interface Props {
  ep: Episode & { projectId: string };
  projects: Project[];
  partners: Partner[];
  onClose: () => void;
  onStepStatusChange: (workType: WorkContentType, stepId: string, newStatus: string) => void;
}

export default function EpisodeQuickViewContent({ ep, projects, partners, onClose, onStepStatusChange }: Props) {
  const project = projects.find(p => p.id === ep.projectId);
  const assignee = partners.find(p => p.id === ep.assignee);
  const workSteps = (ep.workSteps || {}) as Record<WorkContentType, WorkStep[]>;
  // workContent가 비어있으면 workSteps 키에서 폴백 (과거 데이터 불일치 대응)
  const workContentRaw = (ep.workContent || []) as WorkContentType[];
  const stepKeys = (Object.keys(workSteps) as WorkContentType[]).filter(k => (workSteps[k] || []).length > 0);
  const workTypes: WorkContentType[] = workContentRaw.length > 0
    ? workContentRaw
    : stepKeys;


  const getWorkTypeStatus = (wt: WorkContentType) => {
    const steps = workSteps[wt] || [];
    if (steps.length === 0) return 'waiting';
    if (steps.every(s => s.status === 'completed')) return 'completed';
    if (steps.some(s => s.status === 'in_progress' || s.status === 'completed')) return 'in_progress';
    return 'waiting';
  };
  const overallCompleted = workTypes.length > 0 && workTypes.every(wt => getWorkTypeStatus(wt) === 'completed');

  let finalDueDate: string | null = ep.dueDate || null;
  workTypes.forEach(wt => (workSteps[wt] || []).forEach(s => {
    if (s.dueDate && (!finalDueDate || new Date(s.dueDate) > new Date(finalDueDate))) finalDueDate = s.dueDate;
  }));

  return (
    <>
      {/* 헤더 */}
      <div className="px-6 pt-5 pb-3 border-b border-[var(--color-ink-200)]">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-bold text-[var(--color-ink-400)]">{ep.episodeNumber === 0 ? '미정' : `${ep.episodeNumber}편`}</span>
              <h3 className="text-[17px] font-extrabold truncate">{ep.title || '제목 없음'}</h3>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[var(--color-ink-400)] flex-wrap">
              <span className="truncate">{project?.title}</span>
              {assignee && <><span className="text-[var(--color-ink-200)]">·</span><div className="w-[14px] h-[14px] bg-[var(--color-ink-200)] rounded-full flex items-center justify-center text-[6px] font-bold text-[var(--color-ink-500)]">{assignee.name.charAt(0)}</div><span>{assignee.name}</span></>}
              {finalDueDate && <><span className="text-[var(--color-ink-200)]">·</span><span>마감 {(() => { const d = new Date(finalDueDate!); return `${d.getMonth()+1}/${d.getDate()}`; })()}</span></>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors text-[var(--color-ink-400)] shrink-0 ml-2" aria-label="닫기">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 파이프라인 */}
      {workTypes.length > 0 && (
        <div className="mx-6 mt-4 flex items-stretch rounded-2xl bg-[var(--color-ink-50)] border border-ink-100">
          {workTypes.map((workType, index) => {
            const status = getWorkTypeStatus(workType);
            const stepsCount = (workSteps[workType] || []).length;
            const completedCount = (workSteps[workType] || []).filter(s => s.status === 'completed').length;
            const isActive = status === 'in_progress' || (status === 'waiting' && workTypes.slice(0, index).some(wt => getWorkTypeStatus(wt) === 'completed'));
            const flexValue = overallCompleted ? 1 : isActive ? 1.6 : 0.7;
            return (
              <div
                key={workType}
                style={{ flex: flexValue, transition: 'flex 0.6s cubic-bezier(0.4,0,0.2,1), background-color 0.5s ease' }}
                className={`flex flex-col items-center justify-center gap-1 py-3 min-w-0 ${
                  index > 0 ? 'border-l border-ink-100' : ''
                } ${status === 'completed' ? 'bg-ok-50/60' : isActive ? 'bg-warn-50/80' : ''}`}
              >
                <div className={`w-7 h-7 rounded-full border-[2.5px] flex items-center justify-center transition-all text-[10px] font-bold ${
                  status === 'completed' ? 'border-ok-500 bg-ok-500 text-white' : isActive ? 'border-yellow-400 bg-warn-50 text-warn-700' : 'border-ink-300 bg-white text-ink-400'
                }`}>
                  {status === 'completed' ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : index + 1}
                </div>
                <span className={`text-[11px] font-semibold ${status === 'completed' ? 'text-green-800' : isActive ? 'text-ink-900' : 'text-ink-500'}`}>{workType}</span>
                <span className={`text-[10px] ${status === 'completed' ? 'text-ok-600' : isActive ? 'text-warn-700' : 'text-ink-400'}`}>
                  {status === 'completed' ? '완료' : stepsCount > 0 ? `${completedCount}/${stepsCount}` : '대기'}
                </span>
              </div>
            );
          })}
          <div style={{ flex: overallCompleted ? 1 : 0.7, transition: 'flex 0.6s cubic-bezier(0.4,0,0.2,1)' }} className={`flex flex-col items-center justify-center gap-1 py-3 border-l border-ink-100 ${overallCompleted ? 'bg-ok-50/60' : ''}`}>
            <div className={`w-7 h-7 rounded-full border-[2.5px] flex items-center justify-center text-[11px] ${overallCompleted ? 'border-ok-500 bg-ok-500 text-white' : 'border-ink-300 bg-white'}`}>
              {overallCompleted ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : <Calendar size={12} className="text-ink-400" />}
            </div>
            <span className={`text-[11px] font-semibold ${overallCompleted ? 'text-green-800' : 'text-ink-500'}`}>마감</span>
            <span className={`text-[10px] ${overallCompleted ? 'text-ok-600' : 'text-ink-400'}`}>
              {finalDueDate ? (() => { const d = new Date(finalDueDate!); return `${d.getMonth()+1}월 ${d.getDate()}일`; })() : '미정'}
            </span>
          </div>
        </div>
      )}

      {/* 작업 타입별 체크리스트 */}
      <div className="px-6 py-4">
        {workTypes.length === 0 ? (
          <p className="text-center text-[13px] text-[var(--color-ink-400)] py-8">작업이 없습니다</p>
        ) : (
          <div className="space-y-5">
            {workTypes.map(workType => {
              const steps = workSteps[workType] || [];
              const completed = steps.filter(s => s.status === 'completed').length;
              const total = steps.length;
              const status = getWorkTypeStatus(workType);
              return (
                <div key={workType}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[14px] font-bold">{workType}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      status === 'completed' ? 'bg-ok-50 text-ok-600' : status === 'in_progress' ? 'bg-warn-50 text-warn-700' : 'bg-ink-100 text-ink-500'
                    }`}>{status === 'completed' ? '완료' : status === 'in_progress' ? '진행 중' : '대기'}</span>
                    {total > 0 && <span className="text-[11px] text-[var(--color-ink-400)]">{completed}/{total}</span>}
                  </div>
                  {total === 0 ? (
                    <p className="text-[12px] text-[var(--color-ink-300)] pl-1">단계 없음</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {steps.map(step => {
                        const stepPartner = partners.find(p => p.id === step.assigneeId);
                        return (
                          <div key={step.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                            step.status === 'completed' ? 'border-[var(--color-ink-200)] bg-white opacity-40' : step.status === 'in_progress' ? 'border-[#fde68a] bg-[#fffef5]' : 'border-[var(--color-ink-200)] bg-white'
                          }`}>
                            <button
                              onClick={() => {
                                const next = step.status === 'completed' ? 'waiting' : step.status === 'in_progress' ? 'completed' : 'in_progress';
                                onStepStatusChange(workType, step.id, next);
                              }}
                              className={`w-[20px] h-[20px] rounded-[6px] border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                                step.status === 'completed' ? 'bg-ok-500 border-ok-500 text-white text-[10px]' : step.status === 'in_progress' ? 'border-yellow-400 bg-warn-50' : 'border-[var(--color-ink-300)] hover:border-brand-500'
                              }`}
                            >
                              {step.status === 'completed' ? '✓' : step.status === 'in_progress' ? <div className="w-2 h-2 rounded-full bg-yellow-400" /> : ''}
                            </button>
                            <div className="flex-1 min-w-0">
                              <span className={`text-[12px] font-semibold ${step.status === 'completed' ? 'line-through text-[var(--color-ink-400)]' : ''}`}>{step.label}</span>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[var(--color-ink-400)]">
                                {stepPartner && <><div className="w-[14px] h-[14px] bg-[var(--color-ink-200)] rounded-full flex items-center justify-center text-[6px] font-bold text-[var(--color-ink-500)]">{stepPartner.name.charAt(0)}</div><span>{stepPartner.name}</span></>}
                                {step.startDate && <><span className="text-[var(--color-ink-200)]">·</span><span>{(() => { const d = new Date(step.startDate!); return `${d.getMonth()+1}/${d.getDate()}`; })()}</span></>}
                                {step.dueDate && <><span className="text-[var(--color-ink-300)]">→</span><span className="text-[var(--color-brand-600)] font-semibold">{(() => { const d = new Date(step.dueDate!); return `${d.getMonth()+1}/${d.getDate()}`; })()}</span></>}
                              </div>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                              step.status === 'completed' ? 'bg-ok-50 text-ok-600' : step.status === 'in_progress' ? 'bg-warn-50 text-warn-700' : 'bg-ink-100 text-ink-500'
                            }`}>
                              {step.status === 'completed' ? '완료' : step.status === 'in_progress' ? '진행' : '대기'}
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

      {/* 하단: 상세 보기 */}
      <div className="px-6 pb-5">
        <Link
          href={`/projects/${ep.projectId}/episodes/${ep.id}`}
          className="block w-full text-center py-2.5 bg-brand-500 text-white rounded-xl text-[13px] font-semibold hover:bg-brand-600 transition-colors"
          onClick={onClose}
        >
          상세 보기 →
        </Link>
      </div>
    </>
  );
}
