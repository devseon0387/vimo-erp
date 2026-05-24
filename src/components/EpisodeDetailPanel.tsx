'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Episode, Partner, EpisodeWorkItem, WorkContentType, Project, WorkStep, WorkTypeBudget } from '@/types';
import { Plus, Calendar, DollarSign, ChevronDown, ChevronRight, ArrowLeft, X, User } from 'lucide-react';
import { getProjects, getProjectEpisodes, getPartners, updateEpisodeFields } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import DateRangePicker from '@/components/DateRangePicker';
import DatePicker from '@/components/DatePicker';
import ShareLinkButton from '@/components/ShareLinkButton';
import { motion, AnimatePresence } from 'framer-motion';

// 모든 작업 타입 정의
const ALL_WORK_TYPES: WorkContentType[] = ['롱폼', '기획 숏폼', '본편 숏폼', '썸네일', 'OAP'];


interface EpisodeWithProjectId extends Episode {
  projectId: string;
}

interface EpisodeDetailPanelProps {
  projectId: string;
  episodeId: string;
  /** embedded 모드: 외곽 min-h-screen/max-w-5xl 레이아웃 생략 (마스터-디테일 내부용) */
  embedded?: boolean;
  /** 뒤로가기 동작 오버라이드 (embedded 모드에서 선택 해제 등). 미지정 시 프로젝트 페이지로 이동 */
  onBack?: () => void;
}

export default function EpisodeDetailPanel({ projectId, episodeId, embedded = false, onBack }: EpisodeDetailPanelProps) {
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const editingFieldRef = useRef<string | null>(null);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<WorkContentType | null>(null);
  const [mobileStepEdit, setMobileStepEdit] = useState<{ workType: WorkContentType; stepId: string } | null>(null);
  const [shortformModal, setShortformModal] = useState<{ workType: WorkContentType; count: number; mode: 'new' | 'add' } | null>(null);
  const [editedEpisode, setEditedEpisode] = useState<Episode | null>(null);

  // 초기 마운트 추적
  const isInitialMount = useRef(true);
  // 사용자가 실제로 수정했을 때만 저장하기 위한 플래그
  const isDirtyRef = useRef(false);

  // 사용자 수정용 setter (dirty 플래그 자동 설정)
  const editEpisode: typeof setEditedEpisode = (value) => {
    isDirtyRef.current = true;
    setEditedEpisode(value);
  };
  // 수정 후에만 주황→검정 애니메이션 재생
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());

  // 자동 저장 상태
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const echoTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Realtime: 로컬 저장 직후 echo 무시용
  const isLocalSaveRef = useRef(false);

  // 섹션 접기/펼치기 상태
  const [collapsedSections, setCollapsedSections] = useState({
    basicInfo: false,
    budget: false,
  });
  const [paymentStatusOpen, setPaymentStatusOpen] = useState(false);
  const paymentStatusRef = useRef<HTMLDivElement>(null);
  const [invoiceStatusOpen, setInvoiceStatusOpen] = useState(false);
  const invoiceStatusRef = useRef<HTMLDivElement>(null);

  // 각 작업 타입별 작업 단계들을 관리
  const [workSteps, setWorkSteps] = useState<Record<WorkContentType, WorkStep[]>>({
    '롱폼': [],
    '기획 숏폼': [],
    '본편 숏폼': [],
    '썸네일': [],
    'OAP': [],
  });

  const [prevWorkSteps, setPrevWorkSteps] = useState<Record<WorkContentType, WorkStep[] | null>>({
    '롱폼': null,
    '기획 숏폼': null,
    '본편 숏폼': null,
    '썸네일': null,
    'OAP': null,
  });

  // 각 작업 타입별 비용 관리
  const [workBudgets, setWorkBudgets] = useState<Record<WorkContentType, WorkTypeBudget>>({
    '롱폼': { partnerPayment: 0, managementFee: 0 },
    '기획 숏폼': { partnerPayment: 0, managementFee: 0 },
    '본편 숏폼': { partnerPayment: 0, managementFee: 0 },
    '썸네일': { partnerPayment: 0, managementFee: 0 },
    'OAP': { partnerPayment: 0, managementFee: 0 },
  });

  // 사용자 수정용 setter (dirty 플래그 자동 설정)
  const editWorkSteps: typeof setWorkSteps = (value) => {
    isDirtyRef.current = true;
    setWorkSteps(value);
  };
  const editWorkBudgets: typeof setWorkBudgets = (value) => {
    isDirtyRef.current = true;
    setWorkBudgets(value);
  };

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

  // 드래그 앤 드롭 상태
  const [draggedWorkType, setDraggedWorkType] = useState<WorkContentType | null>(null);
  const [dragOverWorkType, setDragOverWorkType] = useState<WorkContentType | null>(null);

  const scrollYRef = useRef(0);

  const handleDragStart = (workType: WorkContentType) => {
    scrollYRef.current = window.scrollY;
    setDraggedWorkType(workType);
  };

  const handleWorkTypeDrop = (targetWorkType: WorkContentType) => {
    if (!draggedWorkType || draggedWorkType === targetWorkType || !editedEpisode) return;
    const savedScroll = window.scrollY;
    const currentOrder = [...(editedEpisode.workContent || [])];
    const fromIdx = currentOrder.indexOf(draggedWorkType);
    const toIdx = currentOrder.indexOf(targetWorkType);
    if (fromIdx === -1 || toIdx === -1) return;
    currentOrder.splice(fromIdx, 1);
    currentOrder.splice(toIdx, 0, draggedWorkType);
    editEpisode(prev => prev ? { ...prev, workContent: currentOrder } : null);
    setDraggedWorkType(null);
    setDragOverWorkType(null);
    // 여러 프레임에 걸쳐 스크롤 고정
    const restore = () => window.scrollTo(0, savedScroll);
    restore();
    requestAnimationFrame(restore);
    requestAnimationFrame(() => requestAnimationFrame(restore));
  };

  // 작업 목록 모달 상태
  const [selectedWorkTypeModal, setSelectedWorkTypeModal] = useState<WorkContentType | null>(null);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [isTabSwitching, setIsTabSwitching] = useState(false);
  const [modalHeight, setModalHeight] = useState<number | null>(null);
  const modalCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tabSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modalContentRef = useRef<HTMLDivElement | null>(null);

  // 모달 닫기 함수
  const closeModal = () => {
    setIsModalClosing(true);
    if (modalCloseTimeoutRef.current) {
      clearTimeout(modalCloseTimeoutRef.current);
    }
    modalCloseTimeoutRef.current = setTimeout(() => {
      setSelectedWorkTypeModal(null);
      setIsModalClosing(false);
    }, 200);
  };

  // 탭 전환 함수
  const switchTab = (newWorkType: WorkContentType) => {
    if (newWorkType === selectedWorkTypeModal) return;
    if (!modalContentRef.current) return;

    // 1. 현재 높이 측정 및 고정
    const currentHeight = modalContentRef.current.offsetHeight;
    setModalHeight(currentHeight);

    setIsTabSwitching(true);
    if (tabSwitchTimeoutRef.current) {
      clearTimeout(tabSwitchTimeoutRef.current);
    }

    // 2. 콘텐츠 페이드 아웃 (200ms)
    setTimeout(() => {
      // 3. 콘텐츠 변경
      setSelectedWorkTypeModal(newWorkType);

      // 4. 높이를 auto로 임시 설정해서 진짜 높이 측정
      requestAnimationFrame(() => {
        if (modalContentRef.current) {
          // auto로 설정 (transition 없이)
          modalContentRef.current.style.transition = 'none';
          modalContentRef.current.style.height = 'auto';

          // 진짜 높이 측정
          const newHeight = modalContentRef.current.offsetHeight;

          // 현재 높이로 다시 설정 (transition 없이)
          modalContentRef.current.style.height = `${currentHeight}px`;

          // 다음 프레임에서 transition 재활성화 및 새 높이로 전환
          requestAnimationFrame(() => {
            if (modalContentRef.current) {
              modalContentRef.current.style.transition = 'height 600ms cubic-bezier(0.4, 0, 0.2, 1)';
              setModalHeight(newHeight);

              // 5. 페이드 인 시작
              setTimeout(() => {
                setIsTabSwitching(false);
                // 6. 애니메이션 완료 후 높이 auto로 복귀
                setTimeout(() => {
                  setModalHeight(null);
                  if (modalContentRef.current) {
                    modalContentRef.current.style.transition = '';
                  }
                }, 600);
              }, 50);
            }
          });
        }
      });
    }, 200);
  };

  // 토스트 알림 상태
  const [toast, setToast] = useState<{ message: string; show: boolean; isClosing: boolean }>({
    message: '',
    show: false,
    isClosing: false
  });
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 토스트 표시 함수
  const showToast = (message: string) => {
    // 기존 타이머 제거
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    if (toastCloseTimeoutRef.current) {
      clearTimeout(toastCloseTimeoutRef.current);
    }

    setToast({ message, show: true, isClosing: false });

    // 2.7초 후 닫힘 애니메이션 시작
    toastTimeoutRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, isClosing: true }));

      // 0.3초 후 완전히 숨김 (애니메이션 시간)
      toastCloseTimeoutRef.current = setTimeout(() => {
        setToast({ message: '', show: false, isClosing: false });
      }, 300);
    }, 2700);
  };

  // 데이터 로드
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (paymentStatusRef.current && !paymentStatusRef.current.contains(e.target as Node)) {
        setPaymentStatusOpen(false);
      }
      if (invoiceStatusRef.current && !invoiceStatusRef.current.contains(e.target as Node)) {
        setInvoiceStatusOpen(false);
      }
    };
    if (paymentStatusOpen || invoiceStatusOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [paymentStatusOpen, invoiceStatusOpen]);

  const loadData = useCallback(async () => {
    const [projects, episodes, partnersData] = await Promise.all([
      getProjects(),
      getProjectEpisodes(projectId),
      getPartners(),
    ]);

    const foundProject = projects.find(p => p.id === projectId);
    if (foundProject) setProject(foundProject);

    const foundEpisode = episodes.find(e => e.id === episodeId);
    if (foundEpisode) {
      setEpisode(foundEpisode);
      // 편집 중이면 editedEpisode를 덮어쓰지 않음 (입력값 유실 방지)
      if (!editingFieldRef.current) {
        setEditedEpisode(foundEpisode);
      }

      // 초기 로드 시 비용이 입력되어 있으면 비용 섹션 접기
      if (isInitialMount.current && foundEpisode.budget && foundEpisode.budget.totalAmount > 0) {
        setCollapsedSections(prev => ({ ...prev, budget: true }));
      }

      if (foundEpisode.workSteps) {
        setWorkSteps(foundEpisode.workSteps);
      }

      if (foundEpisode.workBudgets) {
        // 기존 저장된 비용이 있으면 사용하되, 비용이 0인 작업 타입은 프로젝트 비용으로 자동 채움
        const merged = { ...foundEpisode.workBudgets };
        if (foundProject?.workTypeCosts && foundEpisode.workContent) {
          foundEpisode.workContent.forEach(workType => {
            const existing = merged[workType];
            const hasBudget = existing && (existing.partnerPayment > 0 || existing.managementFee > 0);
            if (!hasBudget && foundProject.workTypeCosts![workType]) {
              merged[workType] = {
                partnerPayment: foundProject.workTypeCosts![workType].partnerCost,
                managementFee: foundProject.workTypeCosts![workType].managementCost,
              };
            }
          });
        }
        setWorkBudgets(merged);
      } else if (foundProject?.workTypeCosts && foundEpisode.workContent) {
        const newBudgets: Record<WorkContentType, WorkTypeBudget> = {
          '롱폼': { partnerPayment: 0, managementFee: 0 },
          '기획 숏폼': { partnerPayment: 0, managementFee: 0 },
          '본편 숏폼': { partnerPayment: 0, managementFee: 0 },
          '썸네일': { partnerPayment: 0, managementFee: 0 },
          'OAP': { partnerPayment: 0, managementFee: 0 },
        };
        foundEpisode.workContent.forEach(workType => {
          if (foundProject.workTypeCosts![workType]) {
            newBudgets[workType] = {
              partnerPayment: foundProject.workTypeCosts![workType].partnerCost,
              managementFee: foundProject.workTypeCosts![workType].managementCost,
            };
          }
        });
        setWorkBudgets(newBudgets);
      }
    }

    setPartners(partnersData);
    isInitialMount.current = false;
  }, [projectId, episodeId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime: 다른 사용자/비봇의 변경을 감지하여 re-fetch (자기 echo는 무시)
  const handleRealtimeRefresh = useCallback(() => {
    if (isLocalSaveRef.current) return; // 로컬 저장 직후 echo → 무시
    loadData();
  }, [loadData]);

  useSupabaseRealtime(['episodes'], handleRealtimeRefresh, {
    filter: { column: 'id', value: episodeId },
  });

  // 실시간 자동 저장 — 사용자가 수정했을 때만 실행
  useEffect(() => {
    if (!isDirtyRef.current || !editedEpisode) return;

    setSaveStatus('saving');

    // 이전 디바운스 타이머 취소
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);

    let cancelled = false;

    saveDebounceRef.current = setTimeout(async () => {
      isDirtyRef.current = false;
      isLocalSaveRef.current = true;

      const status = getOverallEpisodeStatus();

      // workBudgets 합계를 budget에 반영 (합산이 0이면 기존 값 유지)
      const activeTypes = editedEpisode.workContent || [];
      const stepCount = (wt: WorkContentType) => (wt === '기획 숏폼' || wt === '본편 숏폼') ? Math.max(1, (workSteps[wt] || []).length) : 1;
      const calcPartner = activeTypes.reduce((sum, wt) => sum + (workBudgets[wt]?.partnerPayment || 0) * stepCount(wt), 0);
      const calcManagement = activeTypes.reduce((sum, wt) => sum + (workBudgets[wt]?.managementFee || 0) * stepCount(wt), 0);
      const updatedEpisode = {
        ...editedEpisode,
        budget: {
          ...editedEpisode.budget!,
          partnerPayment: calcPartner > 0 ? calcPartner : editedEpisode.budget!.partnerPayment,
          managementFee: calcManagement > 0 ? calcManagement : editedEpisode.budget!.managementFee,
        },
      };

      let ok = false;
      try {
        ok = await updateEpisodeFields(episodeId, { ...updatedEpisode, status, workSteps, workBudgets });
      } catch {
        ok = false;
      }

      // unmount(또는 다른 회차로 이동) 후 setState 호출 방지
      if (cancelled) {
        isLocalSaveRef.current = false;
        return;
      }

      if (ok) {
        setSaveStatus('saved');
        if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
        saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
        if (echoTimeoutRef.current) clearTimeout(echoTimeoutRef.current);
        echoTimeoutRef.current = setTimeout(() => { isLocalSaveRef.current = false; }, 1000);
      } else {
        setSaveStatus('error');
        // 실패 시 echo 무시 풀어서 외부 변경 다시 받게 + 사용자가 재시도하면 다시 저장 가능하도록 dirty 복구
        isLocalSaveRef.current = false;
        isDirtyRef.current = true;
      }
    }, 500);

    return () => {
      cancelled = true;
      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
      if (echoTimeoutRef.current) clearTimeout(echoTimeoutRef.current);
    };
  }, [editedEpisode, workSteps, workBudgets, episodeId, projectId]);

  if (!episode || !editedEpisode || !project) {
    return (
      <div className="min-h-screen bg-[#f5f4f2] flex items-center justify-center">
        <div className="text-center bg-white rounded-xl border border-divider px-8 py-6">
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </div>
    );
  }

  const partner = partners.find(p => p.id === editedEpisode.assignee);
  const managerPartner = partners.find(p => p.id === editedEpisode.manager);

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

  // 숏폼 여부 판별 (개수 모달 대상)
  const isShortformType = (workType: WorkContentType) => workType === '기획 숏폼' || workType === '본편 숏폼';
  // 고정 카테고리 타입 (원본 전달/가편/종편 드롭다운 없이 자체 카테고리 사용)
  const isFixedCategoryType = (workType: WorkContentType) => isShortformType(workType) || workType === 'OAP';

  // 작업 추가 (비활성화 → 활성화) — 숏폼이면 개수 모달 표시
  const handleAddWorkType = (workType: WorkContentType) => {
    if (isShortformType(workType)) {
      setShortformModal({ workType, count: 1, mode: 'new' });
      return;
    }
    addWorkTypeWithCount(workType, 1);
  };

  // 실제 작업 타입 추가 로직 (count개 만큼 워크 스텝 생성)
  const addWorkTypeWithCount = (workType: WorkContentType, count: number) => {
    const updatedWorkContent = [...editedEpisode.workContent, workType];
    const newWorkItem: EpisodeWorkItem = {
      type: workType,
      status: 'waiting',
      startDate: editedEpisode.startDate,
      dueDate: editedEpisode.dueDate,
    };
    const updatedWorkItems = [...(editedEpisode.workItems || []), newWorkItem];

    editEpisode(prev => prev ? ({
      ...prev,
      workContent: updatedWorkContent,
      workItems: updatedWorkItems,
    }) : null);

    // 프로젝트의 비용 정보를 기반으로 작업별 비용 자동 설정
    if (project.workTypeCosts && project.workTypeCosts[workType]) {
      editWorkBudgets(prev => ({
        ...prev,
        [workType]: {
          partnerPayment: project.workTypeCosts![workType]!.partnerCost,
          managementFee: project.workTypeCosts![workType]!.managementCost,
        },
      }));
    }

    // 작업 단계 자동 생성
    const fixedCategory = isFixedCategoryType(workType);
    const newSteps: WorkStep[] = Array.from({ length: count }, (_, i) => ({
      id: `${workType}-${Date.now()}-${i}`,
      label: fixedCategory
        ? (workType === 'OAP'
          ? 'OAP 제작'
          : (count > 1 ? `${workType} ${i + 1}편` : workType))
        : '원본 전달',
      category: fixedCategory ? workType : '원본 전달',
      status: 'waiting' as const,
      startDate: editedEpisode.startDate,
      dueDate: editedEpisode.dueDate || '',
      assigneeId: editedEpisode.assignee || undefined,
    }));

    editWorkSteps(prev => ({
      ...prev,
      [workType]: newSteps,
    }));
  };

  // 작업 제거 (활성화 → 비활성화)
  const handleRemoveWorkType = (workType: WorkContentType) => {
    const updatedWorkContent = editedEpisode.workContent.filter(type => type !== workType);
    const updatedWorkItems = (editedEpisode.workItems || []).filter(item => item.type !== workType);

    editEpisode(prev => prev ? ({
      ...prev,
      workContent: updatedWorkContent,
      workItems: updatedWorkItems,
    }) : null);

    // 작업 단계도 초기화
    editWorkSteps(prev => ({
      ...prev,
      [workType]: [],
    }));
  };

  // 카테고리별 자동 label 생성
  const generateStepLabel = (category: string, workType: WorkContentType, existingSteps: WorkStep[], excludeStepId?: string) => {
    if (category === '원본 전달') return '원본 전달';
    const sameCategory = existingSteps.filter(s => s.category === category && s.id !== excludeStepId);
    const count = sameCategory.length + 1;
    return `${count}차 ${category}`;
  };

  // 작업 단계 추가 — 숏폼이면 개수 모달, 아니면 바로 1개 추가
  const handleAddWorkStep = (workType: WorkContentType) => {
    if (isShortformType(workType)) {
      setShortformModal({ workType, count: 1, mode: 'add' });
      return;
    }
    addWorkSteps(workType, 1);
  };

  // 실제 작업 단계 추가 로직 (count개)
  const addWorkSteps = (workType: WorkContentType, count: number) => {
    const existing = workSteps[workType] || [];
    const fixedCat = isFixedCategoryType(workType);

    const newSteps: WorkStep[] = [];
    for (let i = 0; i < count; i++) {
      const idx = existing.length + i;
      const category = fixedCat ? workType : (idx === 0 ? '원본 전달' : '가편');
      const label = fixedCat
        ? (workType === 'OAP' ? 'OAP 제작' : `${workType} ${idx + 1}편`)
        : generateStepLabel(category, workType, [...existing, ...newSteps]);
      newSteps.push({
        id: `${workType}-${Date.now()}-${i}`,
        label,
        category,
        status: 'waiting' as const,
        startDate: editedEpisode.startDate,
        dueDate: editedEpisode.dueDate || '',
        assigneeId: editedEpisode.assignee || undefined,
      });
    }

    editWorkSteps(prev => ({
      ...prev,
      [workType]: [...(prev[workType] || []), ...newSteps],
    }));
  };

  // 작업 단계 제거
  const handleRemoveWorkStep = (workType: WorkContentType, stepId: string) => {
    editWorkSteps(prev => ({
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
    editWorkSteps(prev => {
      const steps = prev[workType];
      if (field === 'category') {
        // 카테고리 변경 시 label 자동 갱신
        const label = generateStepLabel(value, workType, steps, stepId);
        return {
          ...prev,
          [workType]: steps.map(step =>
            step.id === stepId ? { ...step, category: value, label } : step
          ),
        };
      }
      let updated = steps.map(step =>
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
  // 금액 포맷: 550000 → "550,000"
  const formatCurrency = (v: number | undefined): string => {
    if (!v) return '';
    return v.toLocaleString();
  };
  // 콤마 제거 후 숫자 파싱
  const parseCurrency = (s: string): number => {
    return Number(s.replace(/,/g, '')) || 0;
  };

  const handleUpdateBudget = (
    workType: WorkContentType,
    field: 'partnerPayment' | 'managementFee',
    value: number
  ) => {
    editWorkBudgets(prev => ({
      ...prev,
      [workType]: {
        ...prev[workType],
        [field]: value,
      },
    }));
  };

  // 작업 타입별 편수 (숏폼만 work_steps 개수 반영, 나머지는 1)
  const getStepCount = (workType: WorkContentType): number => {
    if (workType === '기획 숏폼' || workType === '본편 숏폼') {
      return Math.max(1, (workSteps[workType] || []).length);
    }
    return 1;
  };

  // 작업 타입별 총 비용 계산 (단가 × 편수)
  const getTotalBudget = (workType: WorkContentType): number => {
    const budget = workBudgets[workType];
    if (!budget) return 0;
    const count = getStepCount(workType);
    return (budget.partnerPayment + budget.managementFee) * count;
  };


  // 모든 작업 단계를 완료로 표시
  const handleMarkAllComplete = (workType: WorkContentType) => {
    setPrevWorkSteps(prev => ({ ...prev, [workType]: workSteps[workType].map(s => ({ ...s })) }));
    editWorkSteps(prev => ({
      ...prev,
      [workType]: prev[workType].map(step => ({ ...step, status: 'completed' as const })),
    }));
  };

  // 되돌리기
  const handleUndoMarkAll = (workType: WorkContentType) => {
    const saved = prevWorkSteps[workType];
    if (!saved) return;
    editWorkSteps(prev => ({ ...prev, [workType]: saved }));
    setPrevWorkSteps(prev => ({ ...prev, [workType]: null }));
  };

  // 섹션 토글
  const toggleSection = (section: 'basicInfo' | 'budget') => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
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

    // 일부가 완료되고 나머지가 대기 중이면 진행 중으로 처리
    // (예: 1차 종편 완료, 2차 종편 대기 → 진행 중)
    if (steps.some(step => step.status === 'completed')) {
      return 'in_progress';
    }

    // 그 외는 대기 (모두 대기인 경우)
    return 'waiting';
  };

  // 전체 회차의 상태 계산 (모든 작업 타입의 상태를 기반으로)
  const getOverallEpisodeStatus = (): 'waiting' | 'in_progress' | 'review' | 'completed' => {
    if (activeWorkTypes.length === 0) return 'waiting';

    // 모든 작업 타입의 상태를 확인
    const workTypeStatuses = activeWorkTypes.map(workType => getWorkTypeStatus(workType));

    // 하나라도 진행 중이면 진행 중
    if (workTypeStatuses.some(status => status === 'in_progress')) {
      return 'in_progress';
    }

    // 모두 완료면 완료
    if (workTypeStatuses.every(status => status === 'completed')) {
      return 'completed';
    }

    // 일부 작업이 완료되고 나머지가 대기 중이면 진행 중으로 처리
    // (예: 롱폼 완료, 본편 숏폼 대기 → 진행 중)
    if (workTypeStatuses.some(status => status === 'completed')) {
      return 'in_progress';
    }

    // 그 외는 대기 (모든 작업이 대기 중인 경우)
    return 'waiting';
  };

  const handleFieldClick = (field: string) => {
    setEditingField(field);
    editingFieldRef.current = field;
  };

  const handleFieldChange = <K extends keyof Episode>(field: K, value: Episode[K]) => {
    editEpisode(prev => prev ? ({ ...prev, [field]: value }) : null);
    setEditedFields(prev => new Set(prev).add(field));
  };

  const handleFieldBlur = () => {
    setEditingField(null);
    editingFieldRef.current = null;
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

  const handleBackClick = () => {
    if (onBack) onBack();
    else router.push(`/projects/${projectId}`);
  };

  const OuterWrapper = embedded
    ? ({ children }: { children: React.ReactNode }) => <div className="w-full">{children}</div>
    : ({ children }: { children: React.ReactNode }) => (
        <div className="min-h-screen bg-[#f5f4f2]">
          <div className="max-w-5xl mx-auto py-4 sm:py-8 px-2 sm:px-4">{children}</div>
        </div>
      );

  return (
    <OuterWrapper>
        {/* 헤더 + 기본 정보 통합 */}
        <div data-tour="tour-episode-header" className="bg-white rounded-xl border border-divider mb-6">
          <div className="px-4 sm:px-6 py-4">
            {/* 뒤로가기 버튼 (embedded 모드에서는 숨김) */}
            {!embedded && (
            <button
              onClick={handleBackClick}
              className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 mb-3 sm:mb-4 transition-colors"
            >
              <ArrowLeft size={18} />
              <span className="text-xs sm:text-sm font-medium">프로젝트로 돌아가기</span>
            </button>
            )}

            {/* 제목 줄 */}
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-baseline gap-2 sm:gap-2.5 min-w-0 flex-wrap">
                {editingField === 'episodeNumber' ? (
                  <motion.div
                    className="flex items-center"
                    initial={{ scaleX: 0.9, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    style={{ originX: 0 }}
                  >
                    <input
                      type="number"
                      autoFocus
                      value={editedEpisode.episodeNumber}
                      onChange={(e) => handleFieldChange('episodeNumber', Number(e.target.value))}
                      onBlur={handleFieldBlur}
                      className="text-[13px] font-bold text-[#a8a29e] bg-orange-50/50 border-b-2 border-orange-400 border-t-0 border-l-0 border-r-0 rounded-none px-1 py-0.5 w-12 focus:outline-none focus:ring-0 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="text-[13px] font-bold text-[#a8a29e] ml-0.5">편</span>
                  </motion.div>
                ) : (
                  <motion.span
                    key={`ep-display-${editedEpisode.episodeNumber}`}
                    onClick={() => handleFieldClick('episodeNumber')}
                    className="text-[13px] font-bold text-[#a8a29e] cursor-pointer hover:text-gray-600 transition-colors"
                  >
                    {editedEpisode.episodeNumber}편
                  </motion.span>
                )}
                {editingField === 'title' ? (
                  <motion.div
                    initial={{ scaleX: 0.9, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    style={{ originX: 0 }}
                  >
                    <input
                      type="text"
                      autoFocus
                      value={editedEpisode.title}
                      placeholder="회차 제목을 입력하세요"
                      onChange={(e) => handleFieldChange('title', e.target.value)}
                      onBlur={handleFieldBlur}
                      className="text-[17px] sm:text-[21px] font-extrabold text-gray-900 bg-orange-50/50 border-b-2 border-orange-400 border-t-0 border-l-0 border-r-0 rounded-none px-1 py-0.5 focus:outline-none focus:ring-0 placeholder-gray-300 tracking-tight w-full"
                    />
                  </motion.div>
                ) : (
                  <motion.span
                    key={`title-display-${editedEpisode.title}`}
                    onClick={() => handleFieldClick('title')}
                    className="text-[17px] sm:text-[21px] font-extrabold cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5 -mx-1 tracking-tight"
                    initial={{ color: editedFields.has('title') ? '#f97316' : '#1c1917' }}
                    animate={{ color: '#1c1917' }}
                    transition={{ duration: 0.6, delay: 1, ease: 'easeOut' }}
                  >
                    {editedEpisode.title || <span className="text-gray-300">회차 제목을 입력하세요</span>}
                  </motion.span>
                )}
                {(() => {
                  const overallStatus = getOverallEpisodeStatus();
                  return (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${getStatusColor(overallStatus)}`}>
                      {getStatusLabel(overallStatus)}
                    </span>
                  );
                })()}
              </div>

              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                {/* 클라이언트 공유 (vibox) */}
                <ShareLinkButton episodeId={episodeId} episodeTitle={editedEpisode?.title} />
                {/* 아바타 그룹 */}
                {(partner || managerPartner) && (
                  <div className="flex items-center">
                    {partner && (
                      <div className="w-[30px] h-[30px] bg-[#f0ece9] rounded-full flex items-center justify-center text-[11px] font-bold text-[#78716c] border-[2.5px] border-white z-[2]">
                        {partner.name.charAt(0)}
                      </div>
                    )}
                    {managerPartner && (
                      <div className={`w-[30px] h-[30px] bg-[#f0ece9] rounded-full flex items-center justify-center text-[11px] font-bold text-[#78716c] border-[2.5px] border-white z-[1] ${partner ? '-ml-2.5' : ''}`}>
                        {managerPartner.name.charAt(0)}
                      </div>
                    )}
                  </div>
                )}
                {/* 자동 저장 표시 */}
                {saveStatus === 'saving' && (
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    저장 중...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="text-xs text-green-600 flex items-center gap-1 animate-fade-in">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    저장됨
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-xs text-red-600 flex items-center gap-1 animate-fade-in" title="네트워크/권한 오류로 저장하지 못했습니다. 수정 시 자동으로 재시도됩니다.">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75l-7-12a2 2 0 00-3.68 0l-7 12A2 2 0 005 19z" />
                    </svg>
                    저장 실패
                  </span>
                )}
              </div>
            </div>

            {/* 글래스 메타바 */}
            <div data-tour="tour-episode-info" className="flex items-center gap-2 sm:gap-3.5 px-3 sm:px-4 py-2.5 bg-[#fafaf9] rounded-[10px] flex-wrap">
              {/* 기간 */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[#a8a29e] font-semibold">기간</span>
                <span
                  onClick={() => handleFieldClick('startDate')}
                  className="font-semibold text-[#44403c] cursor-pointer hover:text-[#1c1917] transition-colors"
                >
                  {editedEpisode.startDate ? (() => { const [,m,d] = editedEpisode.startDate.split('T')[0].split('-').map(Number); return `${m}.${d}`; })() : '미정'}
                </span>
                <span className="text-[#d6d3d1]">→</span>
                <span
                  onClick={() => handleFieldClick('dueDate')}
                  className="font-bold text-[#f97316] cursor-pointer hover:text-orange-700 transition-colors"
                >
                  {editedEpisode.dueDate ? (() => { const [,m,d] = editedEpisode.dueDate.split('T')[0].split('-').map(Number); return `${m}.${d}`; })() : '미정'}
                </span>
              </div>
              <div className="w-px h-4 bg-[#ede9e6]" />
              {/* 실제 종료 */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[#a8a29e] font-semibold">실제 종료</span>
                {(() => {
                  const actualEndDate = calculateActualEndDate();
                  return actualEndDate ? (
                    <span className="font-semibold text-[#44403c]">
                      {(() => { const [,m,d] = actualEndDate.split('-').map(Number); return `${m}.${d}`; })()}
                    </span>
                  ) : (
                    <span className="text-[#d6d3d1] font-medium">—</span>
                  );
                })()}
              </div>
              <div className="w-px h-4 bg-[#ede9e6] hidden sm:block" />
              {/* 담당자 */}
              <div className="hidden sm:flex items-center gap-2 text-xs text-[#78716c]">
                {partner && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-[18px] h-[18px] bg-[#f0ece9] rounded-full flex items-center justify-center text-[8px] font-bold text-[#78716c]">
                      {partner.name.charAt(0)}
                    </div>
                    <span className="text-[#44403c] font-medium">{partner.name}</span>
                  </div>
                )}
                {partner && managerPartner && <span className="text-[#d6d3d1]">·</span>}
                {managerPartner && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-[18px] h-[18px] bg-[#f0ece9] rounded-full flex items-center justify-center text-[8px] font-bold text-[#78716c]">
                      {managerPartner.name.charAt(0)}
                    </div>
                    <span className="text-[#44403c] font-medium">{managerPartner.name}</span>
                  </div>
                )}
                {!partner && !managerPartner && <span className="text-[#d6d3d1]">담당자 없음</span>}
              </div>

              {/* 날짜 피커 (숨김 — 클릭 시 열림) */}
              <div className="hidden">
                <DateRangePicker
                  startDate={editedEpisode.startDate?.split('T')[0] ?? ''}
                  endDate={editedEpisode.dueDate?.split('T')[0] ?? ''}
                  onStartChange={(v) => handleFieldChange('startDate', v)}
                  onEndChange={(v) => handleFieldChange('dueDate', v === 'tbd' ? '' : v)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 본문 */}
        <div className="space-y-6">

          {/* 비용 정보 */}
          {editedEpisode.budget && (
            <div className="bg-white rounded-xl border border-divider">
              <div
                className={`flex items-center justify-between p-5 cursor-pointer hover:bg-gray-50 transition-colors ${collapsedSections.budget ? 'rounded-xl' : 'rounded-t-xl'}`}
                onClick={() => toggleSection('budget')}
              >
                {/* 인라인 비용 요약 */}
                {(() => {
                  const totalPartner = activeWorkTypes.reduce((sum, wt) => sum + (workBudgets[wt]?.partnerPayment || 0) * getStepCount(wt), 0);
                  const totalManagement = activeWorkTypes.reduce((sum, wt) => sum + (workBudgets[wt]?.managementFee || 0) * getStepCount(wt), 0);
                  const totalAmount = editedEpisode.budget!.totalAmount;
                  const reserve = totalAmount - totalPartner - totalManagement;
                  return (
                    <div className="w-full">
                      {collapsedSections.budget ? (
                        <>
                          {/* 첫 줄: 총 비용 + 태그 */}
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[11px] font-semibold text-[#a8a29e]">총 비용</span>
                              <span className="text-[18px] sm:text-[22px] font-extrabold tracking-tight">{totalAmount.toLocaleString()}</span>
                              <span className="text-[12px] sm:text-[13px] font-semibold text-[#78716c]">원</span>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 bg-[#fafaf9] rounded-lg border border-[#f0ece9] text-[10px] sm:text-xs">
                                <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${editedEpisode.paymentStatus === 'completed' ? 'bg-green-500' : 'bg-orange-400'}`} />
                                <span className="text-[#78716c]">{editedEpisode.paymentStatus === 'completed' ? '입금완료' : '입금전'}</span>
                              </div>
                              <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 bg-[#fafaf9] rounded-lg border border-[#f0ece9] text-[10px] sm:text-xs">
                                <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${editedEpisode.invoiceStatus === 'completed' ? 'bg-green-500' : 'bg-orange-400'}`} />
                                <span className="text-[#78716c]">{editedEpisode.invoiceStatus === 'completed' ? '발행완료' : '미발행'}</span>
                              </div>
                              <ChevronRight size={18} className="text-gray-400 ml-1" />
                            </div>
                          </div>
                          {/* 둘째 줄: 모바일에서 파트너/매니저/유보금 표시 */}
                          <div className="flex sm:hidden items-center gap-3 mt-2 text-[11px]">
                            <span><span className="text-[#a8a29e]">파트너</span> <span className="font-bold text-orange-600">{totalPartner.toLocaleString()}</span></span>
                            <span><span className="text-[#a8a29e]">매니저</span> <span className="font-bold text-orange-600">{totalManagement.toLocaleString()}</span></span>
                            <span><span className="text-[#a8a29e]">유보금</span> <span className="font-bold text-green-600">{reserve.toLocaleString()}</span></span>
                          </div>
                          {/* 데스크탑: 기존 인라인 표시 */}
                          <div className="hidden sm:flex items-center gap-3 text-[13px] mt-2">
                            <span><span className="text-[#a8a29e]">파트너</span> <span className="font-bold text-orange-600">{totalPartner.toLocaleString()}</span></span>
                            <span><span className="text-[#a8a29e]">매니저</span> <span className="font-bold text-orange-600">{totalManagement.toLocaleString()}</span></span>
                            <span><span className="text-[#a8a29e]">유보금</span> <span className="font-bold text-green-600">{reserve.toLocaleString()}</span></span>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-[15px] font-bold text-[#44403c]">회차별 비용</span>
                          <ChevronDown size={18} className="text-gray-400" />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className={`transition-all duration-300 ease-in-out ${!collapsedSections.budget ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                  {/* 총 제작비 */}
                  <div className="flex items-center justify-between sm:justify-start gap-2.5 pb-4 border-b border-[#f0ece9]">
                    <span className="text-[11px] font-semibold text-[#a8a29e]">총 제작비</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatCurrency(editedEpisode.budget?.totalAmount)}
                        onChange={(e) => editEpisode(prev => prev ? {
                          ...prev,
                          budget: {
                            totalAmount: parseCurrency(e.target.value),
                            partnerPayment: prev.budget?.partnerPayment || 0,
                            managementFee: prev.budget?.managementFee || 0,
                          },
                        } : prev)}
                        placeholder="0"
                        className="w-[160px] text-sm font-semibold px-3 py-2 border-[1.5px] border-divider rounded-[10px] bg-white text-right focus:border-[#44403c] focus:outline-none focus:ring-[3px] focus:ring-black/[0.04] transition-all"
                      />
                      <span className="text-xs text-[#a8a29e]">원</span>
                    </div>
                  </div>

                  {/* 입금/발행 상태 — 모바일: 세로 스택, 데스크탑: 가로 */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-4 border-b border-[#f0ece9]">
                    {/* 입금 */}
                    <div className="flex items-center justify-between sm:justify-start gap-2 px-3 sm:px-0 py-2.5 sm:py-0 bg-[#fafaf9] sm:bg-transparent rounded-[10px] sm:rounded-none border border-[#f0ece9] sm:border-0">
                      <button
                        type="button"
                        onClick={() => editEpisode(prev => prev ? { ...prev, paymentStatus: prev.paymentStatus === 'completed' ? 'pending' : 'completed' } : prev)}
                        className={`flex items-center gap-[5px] px-3 py-[5px] rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                          editedEpisode.paymentStatus === 'completed'
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-[#f0ece9] bg-white sm:bg-[#fafaf9] text-[#78716c] hover:border-[#d6d3d1]'
                        }`}
                      >
                        <span className={`w-[6px] h-[6px] rounded-full ${editedEpisode.paymentStatus === 'completed' ? 'bg-green-500' : 'bg-orange-400'}`} />
                        {editedEpisode.paymentStatus === 'completed' ? '입금 완료' : '입금 전'}
                      </button>
                      <DatePicker
                        value={editedEpisode.paymentDueDate || ''}
                        onChange={(val) => editEpisode(prev => prev ? { ...prev, paymentDueDate: val || undefined } : prev)}
                        placeholder="입금 예정일"
                      />
                    </div>
                    <div className="w-px h-4 bg-[#ede9e6] hidden sm:block" />
                    {/* 세금계산서 */}
                    <div className="flex items-center justify-between sm:justify-start gap-2 px-3 sm:px-0 py-2.5 sm:py-0 bg-[#fafaf9] sm:bg-transparent rounded-[10px] sm:rounded-none border border-[#f0ece9] sm:border-0">
                      <button
                        type="button"
                        onClick={() => editEpisode(prev => prev ? { ...prev, invoiceStatus: prev.invoiceStatus === 'completed' ? 'pending' : 'completed' } : prev)}
                        className={`flex items-center gap-[5px] px-3 py-[5px] rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                          editedEpisode.invoiceStatus === 'completed'
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-[#f0ece9] bg-white sm:bg-[#fafaf9] text-[#78716c] hover:border-[#d6d3d1]'
                        }`}
                      >
                        <span className={`w-[6px] h-[6px] rounded-full ${editedEpisode.invoiceStatus === 'completed' ? 'bg-green-500' : 'bg-orange-400'}`} />
                        {editedEpisode.invoiceStatus === 'completed' ? '발행 완료' : '미발행'}
                      </button>
                      <DatePicker
                        value={editedEpisode.invoiceDate || ''}
                        onChange={(val) => editEpisode(prev => prev ? { ...prev, invoiceDate: val || undefined } : prev)}
                        placeholder="발행일"
                      />
                    </div>
                  </div>

                  {/* 작업별 비용 — 모바일: 1열 요약 카드 + 펼침, 데스크탑: 2열 그리드 */}
                  {/* 모바일 레이아웃 */}
                  <div className="sm:hidden">
                    <span className="text-[11px] font-semibold text-[#a8a29e] block mt-4 mb-2">작업별 비용</span>
                    {activeWorkTypes.map((workType, idx) => {
                      const count = getStepCount(workType);
                      const isExpanded = expandedBudgets[workType];
                      const partnerPay = workBudgets[workType]?.partnerPayment || 0;
                      const mgmtFee = workBudgets[workType]?.managementFee || 0;
                      const total = getTotalBudget(workType);
                      return (
                        <div key={workType} className={`py-3 ${idx < activeWorkTypes.length - 1 ? 'border-b border-[#f5f4f2]' : ''}`}>
                          <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => toggleBudget(workType)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-bold">{workType}</span>
                              {count > 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#fef9c3] text-[#92400e] font-bold">{count}편</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <span className="text-[14px] font-bold">{total.toLocaleString()}</span>
                                <span className="text-[11px] text-[#78716c]">원</span>
                              </div>
                              {isExpanded ? (
                                <ChevronDown size={14} className="text-[#a8a29e]" />
                              ) : (
                                <ChevronRight size={14} className="text-[#a8a29e]" />
                              )}
                            </div>
                          </div>
                          {!isExpanded && (
                            <div className="text-[10px] text-[#a8a29e] mt-1">
                              파트너 {(partnerPay * count).toLocaleString()} · 매니징 {(mgmtFee * count).toLocaleString()}
                              {count > 1 && <> ({(partnerPay + mgmtFee).toLocaleString()} × {count})</>}
                            </div>
                          )}
                          {isExpanded && (
                            <div className="mt-3 space-y-2">
                              <div>
                                <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1">파트너 지급{count > 1 ? ' (단가)' : ''}</label>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={formatCurrency(partnerPay)}
                                    onChange={(e) => handleUpdateBudget(workType, 'partnerPayment', parseCurrency(e.target.value))}
                                    placeholder="0"
                                    className="w-full text-sm font-semibold px-3 py-2.5 border-[1.5px] border-divider rounded-[10px] bg-white focus:border-[#44403c] focus:outline-none focus:ring-[3px] focus:ring-black/[0.04] transition-all"
                                  />
                                  <span className="text-xs text-[#a8a29e]">원</span>
                                </div>
                              </div>
                              <div>
                                <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1">매니징 비용{count > 1 ? ' (단가)' : ''}</label>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={formatCurrency(mgmtFee)}
                                    onChange={(e) => handleUpdateBudget(workType, 'managementFee', parseCurrency(e.target.value))}
                                    placeholder="0"
                                    className="w-full text-sm font-semibold px-3 py-2.5 border-[1.5px] border-divider rounded-[10px] bg-white focus:border-[#44403c] focus:outline-none focus:ring-[3px] focus:ring-black/[0.04] transition-all"
                                  />
                                  <span className="text-xs text-[#a8a29e]">원</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* 총합 바 */}
                    {activeWorkTypes.length > 0 && (() => {
                      const totalPartner = activeWorkTypes.reduce((sum, wt) => sum + (workBudgets[wt]?.partnerPayment || 0) * getStepCount(wt), 0);
                      const totalManagement = activeWorkTypes.reduce((sum, wt) => sum + (workBudgets[wt]?.managementFee || 0) * getStepCount(wt), 0);
                      const totalAmount = editedEpisode.budget!.totalAmount;
                      const reserve = totalAmount - totalPartner - totalManagement;
                      return (
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center justify-between px-4 py-3 bg-[#fafaf9] rounded-[12px]">
                            <div>
                              <div className="text-[12px] font-semibold text-[#78716c]">작업 합계</div>
                              <div className="text-[10px] text-[#a8a29e] mt-0.5">파트너 {totalPartner.toLocaleString()} · 매니징 {totalManagement.toLocaleString()}</div>
                            </div>
                            <div className="text-[18px] font-extrabold tracking-tight">{(totalPartner + totalManagement).toLocaleString()}<span className="text-[12px] font-semibold text-[#78716c]">원</span></div>
                          </div>
                          <div className="flex items-center justify-between px-4 py-3 bg-[#f0fdf4] rounded-[12px] border border-[#dcfce7]">
                            <span className="text-[12px] font-semibold text-[#166534]">유보금</span>
                            <span className="text-[16px] font-extrabold text-[#166534]">{reserve.toLocaleString()}<span className="text-[11px] font-semibold">원</span></span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 데스크탑 레이아웃 (기존 2열 그리드) */}
                  <div className="hidden sm:grid grid-cols-2 gap-x-8">
                    {activeWorkTypes.map((workType, idx) => {
                      const count = getStepCount(workType);
                      const isLast = idx >= activeWorkTypes.length - 2;
                      return (
                        <div key={workType} className={`py-4 ${!isLast ? 'border-b border-[#f5f4f2]' : ''}`}>
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] font-bold">{workType}</span>
                              {count > 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#fef9c3] text-[#92400e] font-bold">{count}편</span>
                              )}
                            </div>
                            <span className="text-xs text-[#78716c]">
                              {count > 1
                                ? <>{((workBudgets[workType]?.partnerPayment || 0) + (workBudgets[workType]?.managementFee || 0)).toLocaleString()} × {count} = <b className="text-[#1c1917]">{getTotalBudget(workType).toLocaleString()}</b>원</>
                                : <>합계 <b className="text-[#1c1917]">{getTotalBudget(workType).toLocaleString()}</b>원</>
                              }
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1">파트너 지급{count > 1 ? ' (단가)' : ''}</label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={formatCurrency(workBudgets[workType]?.partnerPayment || 0)}
                                  onChange={(e) => handleUpdateBudget(workType, 'partnerPayment', parseCurrency(e.target.value))}
                                  placeholder="0"
                                  className="w-full text-sm font-semibold px-3 py-2 border-[1.5px] border-divider rounded-[10px] bg-white focus:border-[#44403c] focus:outline-none focus:ring-[3px] focus:ring-black/[0.04] transition-all"
                                />
                                <span className="text-xs text-[#a8a29e]">원</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1">매니징 비용{count > 1 ? ' (단가)' : ''}</label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={formatCurrency(workBudgets[workType]?.managementFee || 0)}
                                  onChange={(e) => handleUpdateBudget(workType, 'managementFee', parseCurrency(e.target.value))}
                                  placeholder="0"
                                  className="w-full text-sm font-semibold px-3 py-2 border-[1.5px] border-divider rounded-[10px] bg-white focus:border-[#44403c] focus:outline-none focus:ring-[3px] focus:ring-black/[0.04] transition-all"
                                />
                                <span className="text-xs text-[#a8a29e]">원</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 비용 정보 추가 버튼 (budget이 없을 때) */}
          {!editedEpisode.budget && (
            <button
              onClick={() => {
                editEpisode(prev => prev ? {
                  ...prev,
                  budget: { totalAmount: 0, partnerPayment: 0, managementFee: 0 }
                } : prev);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-white rounded-xl border border-dashed border-divider hover:border-gray-300 hover:bg-gray-50 transition-colors text-gray-500 hover:text-gray-700"
              type="button"
            >
              <DollarSign size={16} />
              <span className="text-sm font-medium">비용 정보 추가</span>
            </button>
          )}

          {/* 작업 체크리스트 */}
          <div data-tour="tour-episode-checklist" className="bg-white rounded-xl border border-divider p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">작업 체크리스트</h3>
            </div>

            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium text-gray-700">작업 목록</h4>
            </div>

            {/* 작업 진행도 파이프라인 */}
            <style>{`
              @keyframes pulse-dot {
                0%, 100% { opacity: 0.3; transform: scale(0.8); }
                50% { opacity: 1; transform: scale(1.2); }
              }
              @keyframes fade-in {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
              }
              @keyframes slide-up {
                from { opacity: 0; transform: translateY(20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
              @keyframes slide-out {
                from { opacity: 1; transform: translateY(0) scale(1); }
                to { opacity: 0; transform: translateY(20px) scale(0.95); }
              }
              @keyframes modal-overlay-in {
                from { opacity: 0; backdrop-filter: blur(0px); }
                to { opacity: 1; backdrop-filter: blur(4px); }
              }
              @keyframes modal-overlay-out {
                from { opacity: 1; backdrop-filter: blur(4px); }
                to { opacity: 0; backdrop-filter: blur(0px); }
              }
              @keyframes modal-content-in {
                from { opacity: 0; transform: scale(0.95) translateY(-20px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
              }
              @keyframes modal-content-out {
                from { opacity: 1; transform: scale(1) translateY(0); }
                to { opacity: 0; transform: scale(0.95) translateY(-20px); }
              }
              .pulse-dot { animation: pulse-dot 1.5s ease-in-out infinite; }
              .animate-fade-in { animation: fade-in 0.3s ease-out; }
              .animate-slide-up { animation: slide-up 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
              .animate-slide-out { animation: slide-out 0.3s cubic-bezier(0.36, 0, 0.66, -0.56); }
              .animate-modal-overlay { animation: modal-overlay-in 0.3s ease-out forwards; }
              .animate-modal-overlay-out { animation: modal-overlay-out 0.2s ease-in forwards; }
              .animate-modal-content { animation: modal-content-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
              .animate-modal-content-out { animation: modal-content-out 0.2s ease-in forwards; }
            `}</style>
            {(() => {
              const overallStatus = getOverallEpisodeStatus();
              let finalDueDate: string | null = null;
              activeWorkTypes.forEach(workType => {
                (workSteps[workType] || []).forEach(step => {
                  if (step.dueDate && (!finalDueDate || new Date(step.dueDate) > new Date(finalDueDate))) {
                    finalDueDate = step.dueDate;
                  }
                });
              });
              // 회차 dueDate도 고려
              if (editedEpisode.dueDate && (!finalDueDate || new Date(editedEpisode.dueDate) > new Date(finalDueDate))) {
                finalDueDate = editedEpisode.dueDate;
              }

              const pipelineItems = activeWorkTypes.length > 0 ? activeWorkTypes : [];

              return (
                <div className="mb-6 flex items-stretch rounded-2xl bg-[#fafaf9] border border-divider overflow-hidden">
                  {pipelineItems.length === 0 ? (
                    /* 작업 없을 때 */
                    <>
                      <div className="flex-1 flex flex-col items-center justify-center gap-2 py-5">
                        <div className="w-8 h-8 rounded-full border-2 border-gray-300 bg-white flex items-center justify-center">
                          <span className="text-xs font-bold text-gray-400">-</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-500">대기</span>
                        <span className="text-xs text-gray-400">작업을 추가하세요</span>
                      </div>
                      <div style={{ flex: 0.7 }} className="flex flex-col items-center justify-center gap-2 py-5 border-l border-divider">
                        <div className="w-8 h-8 rounded-full border-2 border-gray-300 bg-white flex items-center justify-center">
                          <Calendar size={14} className="text-gray-400" />
                        </div>
                        <span className="text-sm font-semibold text-gray-500">마감</span>
                        <span className="text-xs text-gray-400">미정</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {pipelineItems.map((workType, index) => {
                        const status = getWorkTypeStatus(workType);
                        const stepsCount = workSteps[workType]?.length || 0;
                        const completedCount = workSteps[workType]?.filter(s => s.status === 'completed').length || 0;
                        const isActive = status === 'in_progress' || (status === 'waiting' && activeWorkTypes.slice(0, index).some(wt => getWorkTypeStatus(wt) === 'completed'));

                        // 동적 flex: 진행 중 1.6, 완료/대기 0.7, 전부 완료 시 1
                        const flexValue = overallStatus === 'completed' ? 1
                          : isActive ? 1.6
                          : 0.7;

                        return (
                          <button
                            key={workType}
                            draggable
                            onDragStart={() => handleDragStart(workType)}
                            onDragEnd={() => { setDraggedWorkType(null); setDragOverWorkType(null); }}
                            onDragOver={(e) => { e.preventDefault(); setDragOverWorkType(workType); }}
                            onDragLeave={() => setDragOverWorkType(null)}
                            onDrop={(e) => { e.preventDefault(); handleWorkTypeDrop(workType); }}
                            onClick={() => setSelectedWorkTypeModal(workType)}
                            style={{ flex: flexValue, transition: 'flex 0.6s cubic-bezier(0.4,0,0.2,1), background-color 0.5s ease' }}
                            className={`flex flex-col items-center justify-center gap-2 py-5 cursor-grab active:cursor-grabbing relative ${
                              index > 0 ? 'border-l border-divider' : ''
                            } ${draggedWorkType === workType ? 'opacity-40' : ''
                            } ${dragOverWorkType === workType && draggedWorkType !== workType ? 'ring-2 ring-inset ring-orange-400' : ''
                            } ${status === 'completed'
                                ? 'bg-green-50/60'
                                : isActive
                                ? 'bg-yellow-50/80'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            {/* 원형 인디케이터 */}
                            <div className={`w-9 h-9 rounded-full border-[2.5px] flex items-center justify-center transition-all duration-500 ${
                              status === 'completed'
                                ? 'border-green-500 bg-green-500'
                                : isActive
                                ? 'border-yellow-400 bg-yellow-50 shadow-[0_0_0_4px_rgba(250,204,21,0.12)]'
                                : 'border-gray-300 bg-white'
                            }`}>
                              {status === 'completed' ? (
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <span className={`text-xs font-bold transition-colors duration-400 ${
                                  isActive ? 'text-yellow-700' : 'text-gray-400'
                                }`}>
                                  {index + 1}
                                </span>
                              )}
                            </div>
                            {/* 작업 이름 */}
                            <span className={`text-sm font-semibold transition-colors duration-400 ${
                              status === 'completed' ? 'text-green-800' : isActive ? 'text-gray-900' : 'text-gray-600'
                            }`}>
                              {workType}
                            </span>
                            {/* 상태/진행도 */}
                            <span className={`text-xs transition-colors duration-400 ${
                              status === 'completed' ? 'text-green-600' : isActive ? 'text-yellow-700' : 'text-gray-400'
                            }`}>
                              {status === 'completed' ? '완료'
                                : stepsCount > 0 ? `${completedCount}/${stepsCount} 단계`
                                : '대기'}
                            </span>
                          </button>
                        );
                      })}

                      {/* 마감 블록 */}
                      <div
                        style={{ flex: overallStatus === 'completed' ? 1 : 0.7, transition: 'flex 0.6s cubic-bezier(0.4,0,0.2,1), background-color 0.5s ease' }}
                        className={`flex flex-col items-center justify-center gap-2 py-5 border-l border-divider ${
                          overallStatus === 'completed' ? 'bg-green-50/60' : ''
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-full border-[2.5px] flex items-center justify-center transition-all duration-500 ${
                          overallStatus === 'completed'
                            ? 'border-green-500 bg-green-500'
                            : overallStatus === 'in_progress'
                            ? 'border-yellow-400 bg-white'
                            : 'border-gray-300 bg-white'
                        }`}>
                          {overallStatus === 'completed' ? (
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <Calendar size={14} className={`transition-colors duration-400 ${
                              overallStatus === 'in_progress' ? 'text-yellow-600' : 'text-gray-400'
                            }`} />
                          )}
                        </div>
                        <span className={`text-sm font-semibold transition-colors duration-400 ${
                          overallStatus === 'completed' ? 'text-green-800' : 'text-gray-600'
                        }`}>
                          마감
                        </span>
                        <span className={`text-xs font-medium transition-colors duration-400 ${
                          overallStatus === 'completed'
                            ? 'text-green-600'
                            : overallStatus === 'in_progress'
                            ? 'text-yellow-700'
                            : 'text-gray-400'
                        }`}>
                          {finalDueDate
                            ? new Date(finalDueDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
                            : '미정'}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* 활성화된 작업 */}
            {activeWorkTypes.length > 0 ? (<div data-tour="tour-episode-tasks">
              <AnimatePresence mode="popLayout">
                {(() => {
                  const allCompleted = activeWorkTypes.every(wt => getWorkTypeStatus(wt) === 'completed');
                  return activeWorkTypes.map((workType) => {
                  return (
                    <motion.div
                      key={workType}
                      draggable
                      onDragStart={() => handleDragStart(workType)}
                      onDragEnd={() => { setDraggedWorkType(null); setDragOverWorkType(null); }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverWorkType(workType); }}
                      onDragLeave={() => setDragOverWorkType(null)}
                      onDrop={(e) => { e.preventDefault(); handleWorkTypeDrop(workType); }}
                      initial={false}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className={`rounded-xl mb-3 cursor-grab active:cursor-grabbing ${
                        draggedWorkType === workType ? 'opacity-40' : ''
                      } ${dragOverWorkType === workType && draggedWorkType !== workType ? 'ring-2 ring-orange-400 ring-offset-2' : ''
                      } ${
                        getWorkTypeStatus(workType) === 'completed'
                          ? allCompleted
                            ? 'border border-divider'
                            : 'border border-divider opacity-50 hover:opacity-100'
                          : getWorkTypeStatus(workType) === 'in_progress'
                          ? 'border border-divider/50'
                          : 'border border-divider/50'
                      }`}
                    >
                      <div className="flex-1">
                        {/* 제목 & 상태 배지 & 비용 & 접기/펼치기 & 제거 버튼 */}
                        <div className={`flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50/50 transition-colors ${expandedWorkTypes[workType] ? 'rounded-t-xl' : 'rounded-xl'}`} onClick={() => setExpandedWorkTypes(prev => ({ ...prev, [workType]: !prev[workType] }))}>
                          <div className="flex items-center gap-2">
                            {expandedWorkTypes[workType] ? (
                              <ChevronDown size={16} className="text-gray-400" />
                            ) : (
                              <ChevronRight size={16} className="text-gray-400" />
                            )}

                            <span className={`font-medium text-base ${getWorkTypeStatus(workType) === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                              {workType}
                            </span>

                            {/* 상태 배지 */}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(getWorkTypeStatus(workType))}`}>
                              {getStatusLabel(getWorkTypeStatus(workType))}
                            </span>

                            {/* 작업 단계 개수 */}
                            {workSteps[workType]?.length > 0 && (
                              <span className="text-xs text-gray-500">
                                {workSteps[workType].filter(s => s.status === 'completed').length}/{workSteps[workType].length}
                              </span>
                            )}

                          </div>

                          {/* 제거 버튼 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmRemove(workType);
                            }}
                            className="p-1 hover:bg-red-50 rounded transition-colors group"
                            title="작업 제거"
                            type="button"
                          >
                            <X size={16} className="text-gray-400 group-hover:text-red-500" />
                          </button>
                        </div>

                        {/* 펼쳐진 상태일 때만 내용 표시 */}
                        <div className={`transition-all duration-300 ease-in-out ${
                          expandedWorkTypes[workType] ? 'max-h-[2000px] opacity-100 overflow-visible' : 'max-h-0 opacity-0 overflow-hidden'
                        }`}>
                          <div className="px-4 pb-4">
                            {/* 빠른 액션 버튼 */}
                            <div className="flex items-center gap-2 mb-4">
                              {workSteps[workType]?.length > 0 && (
                                <>
                                  <button
                                    onClick={() => handleMarkAllComplete(workType)}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50/40 hover:bg-green-50 rounded-md transition-colors"
                                    type="button"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    모두 완료로 표시
                                  </button>
                                  {prevWorkSteps[workType] && (
                                    <button
                                      onClick={() => handleUndoMarkAll(workType)}
                                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-100/60 hover:bg-gray-100 rounded-md transition-colors"
                                      type="button"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                                      </svg>
                                      되돌리기
                                    </button>
                                  )}
                                </>
                              )}
                            </div>

                            {/* 비용 상세는 회차별 비용 섹션으로 이동 */}

                            {/* 작업 단계 목록 */}
                            <div className="flex flex-col gap-1.5 px-1">
                              <style>{`
                                @keyframes slideInUp {
                                  from { opacity: 0; transform: translateY(10px); }
                                  to { opacity: 1; transform: translateY(0); }
                                }
                                .task-item-enter { animation: slideInUp 0.3s ease-out; }
                              `}</style>
                              {workSteps[workType]?.length > 0 ? (
                                workSteps[workType].map((step, index) => (
                                  <div
                                    key={step.id}
                                    className={`relative rounded-xl border transition-all duration-200 group task-item-enter ${
                                      step.status === 'completed'
                                        ? (workSteps[workType].every(s => s.status === 'completed')
                                          ? 'bg-[#fafaf9] border-[#f0ece9]'
                                          : 'bg-white border-[#f0ece9] opacity-35 hover:opacity-60')
                                        : step.status === 'in_progress'
                                        ? 'bg-[#fffef5] border-[#fde68a] shadow-[0_0_0_3px_rgba(253,224,71,0.08)]'
                                        : 'bg-white border-[#f0ece9] hover:border-[#d6d3d1] hover:bg-[#fafaf9]'
                                    }`}
                                    style={{
                                      animationDelay: `${index * 50}ms`
                                    }}
                                  >
                                    {/* 데스크탑: 5열 그리드 / 모바일: flex 압축 */}
                                    {/* 모바일 레이아웃 */}
                                    <div className="flex sm:hidden items-center gap-2 px-3 py-2.5 cursor-pointer active:bg-gray-50/50" onClick={() => setMobileStepEdit({ workType, stepId: step.id })}>
                                      {/* 상태 드롭다운 */}
                                      <div className="relative flex-shrink-0">
                                        <div
                                          onClick={(e) => { e.stopPropagation(); setEditingField(`${workType}-${step.id}-status`); }}
                                          className={`flex items-center gap-0.5 px-2 py-1 rounded-lg cursor-pointer font-bold text-[10px] ${getStatusColor(step.status)}`}
                                        >
                                          <span>{getStatusLabel(step.status)}</span>
                                          <ChevronDown size={9} className="opacity-40" />
                                        </div>
                                        <AnimatePresence>
                                          {editingField === `${workType}-${step.id}-status` && (
                                            <>
                                              <motion.div
                                                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                                transition={{ duration: 0.15 }}
                                                className="absolute top-full left-0 mt-1 z-10 w-[90px] bg-white border border-divider rounded-lg shadow-xl overflow-hidden"
                                              >
                                                {([
                                                  { value: 'waiting', label: '대기', color: 'bg-gray-100 text-gray-800' },
                                                  { value: 'in_progress', label: '진행중', color: 'bg-yellow-100 text-yellow-800' },
                                                  { value: 'completed', label: '완료', color: 'bg-green-100 text-green-800' },
                                                ] as const).map(opt => (
                                                  <button
                                                    key={opt.value}
                                                    onClick={() => { handleUpdateWorkStep(workType, step.id, 'status', opt.value); setEditingField(null); }}
                                                    className={`w-full px-2.5 py-2 text-[10px] font-semibold text-left hover:bg-gray-50 ${step.status === opt.value ? 'bg-gray-50' : ''}`}
                                                    type="button"
                                                  >
                                                    <span className={`px-1.5 py-0.5 rounded ${opt.color}`}>{opt.label}</span>
                                                  </button>
                                                ))}
                                              </motion.div>
                                              <div className="fixed inset-0 z-0" onClick={() => setEditingField(null)} />
                                            </>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                      {/* 카테고리 + 작업명 */}
                                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                        {isFixedCategoryType(workType) ? (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold flex-shrink-0">{workType}</span>
                                        ) : index === 0 ? (
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-semibold flex-shrink-0">원본전달</span>
                                        ) : (
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 cursor-pointer ${(step.category || '가편') === '가편' ? 'bg-yellow-50 text-yellow-700' : 'bg-blue-50 text-blue-700'}`}
                                            onClick={() => setEditingField(`${workType}-${step.id}-category`)}
                                          >{step.category || '가편'}</span>
                                        )}
                                        <span className={`text-[12px] font-medium truncate ${step.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                          {step.label || partners.find(p => p.id === step.assigneeId)?.name || '작업'}
                                        </span>
                                      </div>
                                      {/* 담당자 + 날짜 */}
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        {step.assigneeId && (
                                          <div className="w-4 h-4 bg-orange-100 rounded-full flex items-center justify-center text-[7px] font-bold text-orange-600">
                                            {partners.find(p => p.id === step.assigneeId)?.name?.charAt(0) || '?'}
                                          </div>
                                        )}
                                        {step.dueDate && (
                                          <span className={`text-[10px] font-semibold ${step.status === 'completed' ? 'text-gray-400' : 'text-orange-600'}`}>
                                            {(() => { const [,m,d] = step.dueDate.split('-').map(Number); return `${m}/${d}`; })()}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* 데스크탑 레이아웃 (기존) */}
                                    <div className="hidden sm:grid grid-cols-[80px_1fr_100px_72px_180px] gap-2.5 items-center px-3.5 py-2.5">
                                      {/* 카테고리 */}
                                      <div>
                                        {isFixedCategoryType(workType) ? (
                                          <div className="w-full text-[11px] py-1 bg-purple-50 rounded-md text-purple-700 font-semibold text-center">
                                            {workType}
                                          </div>
                                        ) : index === 0 ? (
                                          <div className="w-full text-[11px] py-1 bg-[#f0ece9] rounded-md text-[#78716c] font-semibold text-center">
                                            원본 전달
                                          </div>
                                        ) : (
                                          <div className="relative">
                                            <div
                                              onClick={() => setEditingField(`${workType}-${step.id}-category`)}
                                              className={`w-full flex items-center justify-center py-1 rounded-md cursor-pointer transition-colors ${
                                                (step.category || '가편') === '가편'
                                                  ? 'bg-yellow-50 hover:bg-yellow-100'
                                                  : 'bg-blue-50 hover:bg-blue-100'
                                              }`}
                                            >
                                              <span className={`text-[11px] font-semibold ${
                                                (step.category || '가편') === '가편' ? 'text-yellow-700' : 'text-blue-700'
                                              }`}>{step.category || '가편'}</span>
                                              <ChevronDown size={10} className="ml-0.5 text-gray-400" />
                                            </div>
                                            <AnimatePresence>
                                              {editingField === `${workType}-${step.id}-category` && (
                                                <>
                                                  <motion.div
                                                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                                    transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
                                                    className="absolute top-full left-0 mt-1 z-10 w-[120px] bg-white/95 backdrop-blur-xl border border-divider rounded-xl shadow-2xl overflow-hidden"
                                                  >
                                                    {['가편', '종편'].map(cat => {
                                                      const catStyle = cat === '가편'
                                                        ? { active: 'bg-yellow-50', text: 'text-yellow-700' }
                                                        : { active: 'bg-blue-50', text: 'text-blue-700' };
                                                      return (
                                                        <button
                                                          key={cat}
                                                          onClick={() => {
                                                            handleUpdateWorkStep(workType, step.id, 'category', cat);
                                                            setEditingField(null);
                                                          }}
                                                          className={`w-full flex items-center px-3 py-2.5 hover:bg-gray-50 transition-colors text-left ${(step.category || '가편') === cat ? catStyle.active : ''}`}
                                                          type="button"
                                                        >
                                                          <span className={`text-xs font-medium ${(step.category || '가편') === cat ? catStyle.text : 'text-gray-700'}`}>{cat}</span>
                                                        </button>
                                                      );
                                                    })}
                                                  </motion.div>
                                                  <div className="fixed inset-0 z-0" onClick={() => setEditingField(null)} />
                                                </>
                                              )}
                                            </AnimatePresence>
                                          </div>
                                        )}
                                      </div>

                                      {/* 작업 단계/메모 */}
                                      <div>
                                        <input
                                          type="text"
                                          value={step.label}
                                          onChange={(e) => handleUpdateWorkStep(workType, step.id, 'label', e.target.value)}
                                          placeholder="작업 단계"
                                          className={`w-full text-[13px] font-semibold px-2 py-1 rounded-lg border border-transparent bg-transparent hover:bg-white hover:border-divider focus:bg-white focus:border-gray-300 focus:outline-none transition-all ${
                                            step.status === 'completed' ? 'text-[#a8a29e] line-through font-normal' : 'text-[#1c1917]'
                                          }`}
                                        />
                                      </div>

                                      {/* 담당 파트너 */}
                                      <div className="relative">
                                        <div
                                          onClick={() => { setEditingField(`${workType}-${step.id}-assignee`); setPartnerSearch(''); }}
                                          className="w-full flex items-center px-2 py-1 rounded-lg cursor-pointer hover:bg-white transition-colors"
                                        >
                                          {step.assigneeId ? (
                                            <>
                                              <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mr-2">
                                                <User size={10} className="text-orange-500" />
                                              </div>
                                              <span className="text-sm text-gray-900 truncate">
                                                {partners.find(p => p.id === step.assigneeId)?.name}
                                              </span>
                                            </>
                                          ) : (
                                            <span className="text-sm text-gray-400">파트너</span>
                                          )}
                                        </div>
                                        <AnimatePresence>
                                          {editingField === `${workType}-${step.id}-assignee` && (
                                            <>
                                              <motion.div
                                                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                                transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
                                                className="absolute top-full left-0 mt-1 z-10 w-[220px] bg-white/95 backdrop-blur-xl border border-divider rounded-xl shadow-2xl max-h-80 overflow-hidden"
                                              >
                                                <div className="sticky top-0 p-2 border-b border-divider bg-white/95">
                                                  <input
                                                    type="text"
                                                    value={partnerSearch}
                                                    onChange={(e) => setPartnerSearch(e.target.value)}
                                                    placeholder="파트너 검색..."
                                                    className="w-full text-sm px-3 py-2 border border-divider rounded-lg focus:outline-none focus:border-gray-400 bg-white"
                                                    autoFocus
                                                    onClick={(e) => e.stopPropagation()}
                                                  />
                                                </div>
                                                <div className="max-h-64 overflow-auto">
                                                  <button
                                                    onClick={() => {
                                                      handleUpdateWorkStep(workType, step.id, 'assigneeId', '');
                                                      setEditingField(null);
                                                      setPartnerSearch('');
                                                    }}
                                                    className="w-full flex items-center px-3 py-2.5 hover:bg-gray-50 transition-colors text-left border-b border-divider/60"
                                                    type="button"
                                                  >
                                                    <span className="text-sm text-gray-500">선택 안함</span>
                                                  </button>
                                                  {partners.filter(p => p.status === 'active' && p.name.toLowerCase().includes(partnerSearch.toLowerCase())).map(p => (
                                                    <button
                                                      key={p.id}
                                                      onClick={() => {
                                                        handleUpdateWorkStep(workType, step.id, 'assigneeId', p.id);
                                                        setEditingField(null);
                                                        setPartnerSearch('');
                                                      }}
                                                      className="w-full flex items-center px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                                                      type="button"
                                                    >
                                                      <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-semibold mr-2 flex-shrink-0">
                                                        {p.name.charAt(0)}
                                                      </div>
                                                      <span className="text-sm text-gray-900 truncate">{p.name}</span>
                                                    </button>
                                                  ))}
                                                </div>
                                              </motion.div>
                                              <div className="fixed inset-0 z-0" onClick={() => { setEditingField(null); setPartnerSearch(''); }} />
                                            </>
                                          )}
                                        </AnimatePresence>
                                      </div>

                                      {/* 진행 사항 */}
                                      <div className="relative">
                                        <div
                                          onClick={() => setEditingField(`${workType}-${step.id}-status`)}
                                          className={`w-full flex items-center justify-center px-2.5 py-1 rounded-full cursor-pointer transition-colors font-semibold text-[11px] hover:brightness-95 ${getStatusColor(step.status)}`}
                                        >
                                          <span>{getStatusLabel(step.status)}</span>
                                          <ChevronDown size={10} className="ml-0.5 opacity-40" />
                                        </div>
                                        <AnimatePresence>
                                          {editingField === `${workType}-${step.id}-status` && (
                                            <>
                                              <motion.div
                                                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                                                transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
                                                className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-10 w-[110px] bg-white/95 backdrop-blur-xl border border-divider rounded-xl shadow-2xl overflow-hidden"
                                              >
                                                {([
                                                  { value: 'waiting', label: '대기', color: 'bg-gray-100 text-gray-800' },
                                                  { value: 'in_progress', label: '진행중', color: 'bg-yellow-100 text-yellow-800' },
                                                  { value: 'completed', label: '완료', color: 'bg-green-100 text-green-800' },
                                                ] as const).map(opt => (
                                                  <button
                                                    key={opt.value}
                                                    onClick={() => {
                                                      handleUpdateWorkStep(workType, step.id, 'status', opt.value);
                                                      setEditingField(null);
                                                    }}
                                                    className={`w-full flex items-center justify-center px-3 py-2.5 hover:bg-gray-50 transition-colors ${step.status === opt.value ? 'bg-gray-100' : ''}`}
                                                    type="button"
                                                  >
                                                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${opt.color}`}>{opt.label}</span>
                                                  </button>
                                                ))}
                                              </motion.div>
                                              <div className="fixed inset-0 z-0" onClick={() => setEditingField(null)} />
                                            </>
                                          )}
                                        </AnimatePresence>
                                      </div>

                                      {/* 시작일 · 마감일 */}
                                      <div>
                                        <DateRangePicker
                                          compact
                                          startDate={step.startDate}
                                          endDate={step.dueDate}
                                          onStartChange={(v) => handleUpdateWorkStep(workType, step.id, 'startDate', v)}
                                          onEndChange={(v) => handleUpdateWorkStep(workType, step.id, 'dueDate', v === 'tbd' ? '' : v)}
                                        />
                                      </div>

                                    </div>
                                    {/* 작업 단계 제거 버튼 — 우측 상단 오버레이 */}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleRemoveWorkStep(workType, step.id); }}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-50 bg-white/80 backdrop-blur-sm rounded-lg transition-all shadow-sm border border-transparent hover:border-red-200"
                                      title="작업 단계 제거"
                                      type="button"
                                    >
                                      <X size={13} className="text-gray-400 hover:text-red-500" />
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-4 text-gray-400 text-xs">
                                  작업 단계를 추가해보세요
                                </div>
                              )}

                              {/* 작업 단계 추가 버튼 */}
                              <button
                                onClick={() => handleAddWorkStep(workType)}
                                className="w-full flex items-center justify-center px-3 py-2 mt-2 border border-dashed border-divider rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors group text-sm"
                                type="button"
                              >
                                <Plus size={14} className="mr-1 text-gray-400 group-hover:text-gray-600" />
                                <span className="text-gray-500 group-hover:text-gray-700">작업 단계 추가</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                });
                })()}
              </AnimatePresence>
            </div>) : (
              <div data-tour="tour-episode-tasks" className="text-center py-8 text-gray-500">
                <p className="text-sm">아직 작업이 추가되지 않았습니다.</p>
                <p className="text-xs mt-1">아래에서 작업을 추가해보세요.</p>
              </div>
            )}

            {/* 비활성화된 작업 (작업 추가 영역) */}
            {inactiveWorkTypes.length > 0 && (
              <div className="border-t border-divider pt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-400">콘텐츠 추가</span>
                  <AnimatePresence mode="popLayout">
                    {inactiveWorkTypes.map((workType) => (
                      <motion.button
                        key={workType}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                        onClick={() => handleAddWorkType(workType)}
                        className="flex items-center gap-2 px-5 py-3.5 text-base font-medium text-gray-500 border border-dashed border-divider rounded-xl hover:border-gray-300 hover:bg-gray-50 hover:text-gray-700 hover:shadow-sm transition-all"
                        type="button"
                      >
                        <Plus size={16} />
                        {workType}
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>

        </div>

      {/* 모바일 작업 단계 수정 바텀시트 */}
      <AnimatePresence>
        {mobileStepEdit && (() => {
          const { workType: mwt, stepId: msid } = mobileStepEdit;
          const mStep = workSteps[mwt]?.find(s => s.id === msid);
          if (!mStep) return null;
          const mPartner = partners.find(p => p.id === mStep.assigneeId);
          const mIndex = workSteps[mwt]?.findIndex(s => s.id === msid) ?? 0;
          return (
            <>
              <motion.div
                className="fixed inset-0 z-[10000] bg-black/30"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setMobileStepEdit(null)}
              />
              <motion.div
                className="fixed bottom-0 left-0 right-0 z-[10001] bg-white rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                {/* 핸들 */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 bg-gray-300 rounded-full" />
                </div>
                <div className="px-5 pb-6 space-y-4">
                  {/* 헤더 */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-bold text-gray-900">{mwt} — 작업 단계 수정</h3>
                    <button onClick={() => setMobileStepEdit(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                      <X size={16} className="text-gray-400" />
                    </button>
                  </div>

                  {/* 카테고리 + 진행 상태 */}
                  <div className="flex gap-3">
                    {!isFixedCategoryType(mwt) && mIndex > 0 && (
                      <div className="flex-1">
                        <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1.5">카테고리</label>
                        <div className="flex gap-1.5">
                          {['가편', '종편'].map(cat => (
                            <button
                              key={cat}
                              onClick={() => handleUpdateWorkStep(mwt, msid, 'category', cat)}
                              className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors ${
                                (mStep.category || '가편') === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                              }`}
                              type="button"
                            >{cat}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className={!isFixedCategoryType(mwt) && mIndex > 0 ? 'flex-1' : 'w-full'}>
                      <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1.5">진행 상태</label>
                      <div className="flex gap-1.5">
                        {([
                          { value: 'waiting' as const, label: '대기', color: 'bg-gray-100 text-gray-700' },
                          { value: 'in_progress' as const, label: '진행중', color: 'bg-yellow-100 text-yellow-700' },
                          { value: 'completed' as const, label: '완료', color: 'bg-green-100 text-green-700' },
                        ]).map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => handleUpdateWorkStep(mwt, msid, 'status', opt.value)}
                            className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors ${
                              mStep.status === opt.value ? 'bg-orange-500 text-white' : opt.color
                            }`}
                            type="button"
                          >{opt.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 작업명 */}
                  <div>
                    <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1.5">작업명</label>
                    <input
                      type="text"
                      value={mStep.label}
                      onChange={(e) => handleUpdateWorkStep(mwt, msid, 'label', e.target.value)}
                      placeholder="작업 단계 이름"
                      className="w-full px-3 py-2.5 border-[1.5px] border-divider rounded-xl text-[14px] font-medium focus:border-orange-400 focus:outline-none"
                    />
                  </div>

                  {/* 담당자 */}
                  <div>
                    <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1.5">담당 파트너</label>
                    <div className="relative">
                      <div
                        onClick={() => setEditingField(editingField === `mobile-step-assignee` ? null : `mobile-step-assignee`)}
                        className="w-full flex items-center justify-between px-3 py-2.5 border-[1.5px] border-divider rounded-xl cursor-pointer hover:border-gray-300 transition-colors"
                      >
                        {mStep.assigneeId ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center text-[10px] font-bold text-orange-600 flex-shrink-0">
                              {partners.find(p => p.id === mStep.assigneeId)?.name?.charAt(0) || '?'}
                            </div>
                            <span className="text-[14px] font-medium text-gray-900">{partners.find(p => p.id === mStep.assigneeId)?.name}</span>
                          </div>
                        ) : (
                          <span className="text-[14px] text-gray-400">선택 안함</span>
                        )}
                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${editingField === 'mobile-step-assignee' ? 'rotate-180' : ''}`} />
                      </div>
                      <AnimatePresence>
                        {editingField === 'mobile-step-assignee' && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-divider rounded-xl shadow-xl max-h-52 overflow-y-auto"
                          >
                            <button
                              onClick={() => { handleUpdateWorkStep(mwt, msid, 'assigneeId', ''); setEditingField(null); }}
                              className={`w-full flex items-center px-3 py-2.5 hover:bg-gray-50 text-left border-b border-divider ${!mStep.assigneeId ? 'bg-orange-50' : ''}`}
                              type="button"
                            >
                              <span className="text-[13px] text-gray-500">선택 안함</span>
                            </button>
                            {partners.filter(p => p.status === 'active').map(p => (
                              <button
                                key={p.id}
                                onClick={() => { handleUpdateWorkStep(mwt, msid, 'assigneeId', p.id); setEditingField(null); }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 text-left ${mStep.assigneeId === p.id ? 'bg-orange-50' : ''}`}
                                type="button"
                              >
                                <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                  {p.name.charAt(0)}
                                </div>
                                <span className="text-[13px] font-medium text-gray-900">{p.name}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* 날짜 */}
                  <div>
                    <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1.5">기간</label>
                    <DateRangePicker
                      startDate={mStep.startDate}
                      endDate={mStep.dueDate}
                      onStartChange={(v) => handleUpdateWorkStep(mwt, msid, 'startDate', v)}
                      onEndChange={(v) => handleUpdateWorkStep(mwt, msid, 'dueDate', v === 'tbd' ? '' : v)}
                    />
                  </div>

                  {/* 삭제 버튼 */}
                  <button
                    onClick={() => {
                      handleRemoveWorkStep(mwt, msid);
                      setMobileStepEdit(null);
                    }}
                    className="w-full py-3 bg-red-50 text-red-500 rounded-xl text-[13px] font-semibold hover:bg-red-100 transition-colors"
                    type="button"
                  >
                    작업 단계 삭제
                  </button>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* 작업 삭제 확인 모달 */}
      <AnimatePresence>
        {confirmRemove && (
          <>
            <motion.div
              className="fixed inset-0 z-[10000] bg-black/30 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setConfirmRemove(null)}
            />
            <motion.div
              className="fixed z-[10001] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl border border-divider p-6 w-[360px] max-w-[90vw]"
              initial={{ opacity: 0, scale: 0.93, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 12 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <h3 className="text-base font-semibold text-gray-900 mb-2">작업 삭제</h3>
              <p className="text-sm text-gray-500 mb-5">
                <span className="font-medium text-gray-700">{confirmRemove}</span> 작업을 삭제하시겠습니까?<br />
                <span className="text-xs text-gray-400">포함된 작업 단계와 비용 정보가 모두 초기화됩니다.</span>
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmRemove(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                  type="button"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    handleRemoveWorkType(confirmRemove);
                    setConfirmRemove(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors"
                  type="button"
                >
                  삭제
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 숏폼 개수 입력 모달 */}
      <AnimatePresence>
        {shortformModal && (
          <>
            <motion.div
              className="fixed inset-0 z-[10000] bg-black/30 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setShortformModal(null)}
            />
            <motion.div
              className="fixed z-[10001] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl border border-divider p-6 w-[360px] max-w-[90vw]"
              initial={{ opacity: 0, scale: 0.93, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.93, y: 12 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <h3 className="text-base font-semibold text-gray-900 mb-1">{shortformModal.workType} {shortformModal.mode === 'add' ? '단계 추가' : '추가'}</h3>
              <p className="text-sm text-gray-500 mb-4">
                {shortformModal.mode === 'add' ? '추가할' : '생성할'} 숏폼 개수를 입력해주세요.
              </p>
              <div className="flex items-center gap-3 mb-5">
                <button
                  type="button"
                  onClick={() => setShortformModal(prev => prev && prev.count > 1 ? { ...prev, count: prev.count - 1 } : prev)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-divider text-gray-500 hover:bg-gray-50 transition-colors text-lg font-medium"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={shortformModal.count}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(50, parseInt(e.target.value) || 1));
                    setShortformModal(prev => prev ? { ...prev, count: v } : prev);
                  }}
                  className="w-16 text-center text-lg font-semibold text-gray-900 border border-divider rounded-xl py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                />
                <button
                  type="button"
                  onClick={() => setShortformModal(prev => prev && prev.count < 50 ? { ...prev, count: prev.count + 1 } : prev)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-divider text-gray-500 hover:bg-gray-50 transition-colors text-lg font-medium"
                >
                  +
                </button>
                <span className="text-sm text-gray-400">개</span>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShortformModal(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                  type="button"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    if (shortformModal.mode === 'new') {
                      addWorkTypeWithCount(shortformModal.workType, shortformModal.count);
                    } else {
                      addWorkSteps(shortformModal.workType, shortformModal.count);
                    }
                    setShortformModal(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-xl hover:bg-orange-600 transition-colors"
                  type="button"
                >
                  추가
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 작업 목록 모달 */}
      {selectedWorkTypeModal && (
        <div className={`fixed inset-0 z-50 overflow-y-auto ${isModalClosing ? 'animate-modal-overlay-out' : 'animate-modal-overlay'}`}>
          <div
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm"
            onClick={closeModal}
          />

          <div className="flex min-h-full items-center justify-center p-4">
            <div
              ref={modalContentRef}
              className={`relative bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/60 max-w-4xl w-full max-h-[80vh] ${isTabSwitching ? 'overflow-hidden' : 'overflow-y-auto'} ${isModalClosing ? 'animate-modal-content-out' : 'animate-modal-content'}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                height: modalHeight !== null ? `${modalHeight}px` : 'auto',
                transition: 'height 1600ms cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {/* 헤더 */}
              <div className="sticky top-0 bg-white/80 backdrop-blur-xl border-b border-divider/50 z-10">
                {/* 상단 헤더 바 */}
                <div className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-gray-900">작업 목록</h2>
                    {(() => {
                      const steps = workSteps[selectedWorkTypeModal] || [];
                      const completedCount = steps.filter(s => s.status === 'completed').length;
                      const status = getWorkTypeStatus(selectedWorkTypeModal);
                      return (
                        <>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : status === 'in_progress'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {status === 'completed' ? '완료' : status === 'in_progress' ? '진행중' : '대기'}
                          </span>
                          <span className="text-sm text-gray-600">
                            {completedCount}/{steps.length} 완료
                          </span>
                        </>
                      );
                    })()}
                  </div>
                  <button
                    onClick={closeModal}
                    className="p-2 hover:bg-white/80 rounded-full transition-colors"
                  >
                    <X size={20} className="text-gray-500" />
                  </button>
                </div>

                {/* 타임라인 겸 탭 */}
                <div className="px-6 pb-4 pt-2">
                  <style>{`
                    @keyframes tabPulse {
                      0%, 100% { transform: scale(1); }
                      50% { transform: scale(1.05); }
                    }
                    .tab-pulse {
                      animation: tabPulse 2s ease-in-out infinite;
                    }
                  `}</style>
                  <div className="p-4 bg-gray-50 rounded-xl border border-divider overflow-x-auto">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {/* 작업들 */}
                        {activeWorkTypes.map((workType, index) => {
                          const status = getWorkTypeStatus(workType);
                          const stepsCount = workSteps[workType]?.length || 0;
                          const completedCount = workSteps[workType]?.filter(s => s.status === 'completed').length || 0;
                          const hasPreviousCompleted = activeWorkTypes.slice(0, index).some(wt => getWorkTypeStatus(wt) === 'completed');
                          const isSelected = workType === selectedWorkTypeModal;

                          return (
                            <div key={workType} className="flex items-center gap-3">
                              {/* 작업 박스 (클릭 가능) */}
                              <button
                                onClick={() => switchTab(workType)}
                                className={`flex items-center gap-2 rounded-xl border-2 transition-all backdrop-blur-md cursor-pointer ${
                                isSelected
                                  ? status === 'completed'
                                    ? 'bg-green-100/70 border-green-400/80 px-5 py-3 min-w-[140px] shadow-xl ring-2 ring-green-300/50'
                                    : (status === 'in_progress' || (status === 'waiting' && hasPreviousCompleted))
                                    ? 'bg-yellow-100/80 border-yellow-400/90 px-5 py-3 min-w-[160px] shadow-2xl scale-110 ring-2 ring-yellow-300/50 tab-pulse'
                                    : 'bg-orange-100/70 border-orange-400/80 px-5 py-3 min-w-[140px] shadow-xl ring-2 ring-orange-300/50'
                                  : status === 'completed'
                                  ? 'bg-green-100/40 border-green-300/50 px-3 py-1.5 min-w-[120px] opacity-70 hover:opacity-100 hover:shadow-lg'
                                  : (status === 'in_progress' || (status === 'waiting' && hasPreviousCompleted))
                                  ? 'bg-yellow-100/50 border-yellow-300/60 px-4 py-2 min-w-[140px] shadow-md hover:shadow-xl scale-105'
                                  : 'bg-white/50 border-divider/60 px-3 py-1.5 min-w-[120px] hover:border-gray-300 hover:bg-gray-50 hover:shadow-md'
                              }`}>
                                <span className={`font-semibold text-sm ${
                                  isSelected
                                    ? status === 'completed'
                                      ? 'text-green-900'
                                      : (status === 'in_progress' || (status === 'waiting' && hasPreviousCompleted))
                                      ? 'text-yellow-900'
                                      : 'text-orange-900'
                                    : status === 'completed'
                                    ? 'text-green-800'
                                    : (status === 'in_progress' || (status === 'waiting' && hasPreviousCompleted))
                                    ? 'text-yellow-800'
                                    : 'text-gray-600'
                                }`}>
                                  {workType}
                                </span>
                                {stepsCount > 0 && (
                                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                                    isSelected
                                      ? status === 'completed'
                                        ? 'bg-green-200/60 text-green-900'
                                        : (status === 'in_progress' || (status === 'waiting' && hasPreviousCompleted))
                                        ? 'bg-yellow-200/60 text-yellow-900'
                                        : 'bg-orange-200/60 text-orange-900'
                                      : status === 'completed'
                                      ? 'bg-green-100 text-green-700'
                                      : (status === 'in_progress' || (status === 'waiting' && hasPreviousCompleted))
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {completedCount}/{stepsCount}
                                  </span>
                                )}
                              </button>

                              {/* 진행 표시 (3개의 점) - 모든 작업 뒤에 표시 */}
                              <div className="flex items-center gap-2 px-2">
                                {[0, 1, 2].map((dotIndex) => {
                                  const isActive = status === 'in_progress' || (status === 'waiting' && hasPreviousCompleted);
                                  const isFilled = status === 'completed';
                                  const isWaiting = status === 'waiting' && !hasPreviousCompleted;
                                  const dotDelay = `${dotIndex * 0.3}s`;

                                  return (
                                    <div
                                      key={dotIndex}
                                      className={`w-2 h-2 rounded-full transition-all ${
                                        isFilled
                                          ? 'bg-green-500'
                                          : isActive
                                          ? 'bg-yellow-500 pulse-dot'
                                          : isWaiting
                                          ? 'bg-gray-400 waiting-pulse'
                                          : 'bg-gray-300'
                                      }`}
                                      style={(isActive || isWaiting) ? { animationDelay: dotDelay } : {}}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                        {/* 최종 마감 */}
                        {(() => {
                        const overallStatus = getOverallEpisodeStatus();
                        let finalDueDate: string | null = null;
                        activeWorkTypes.forEach(workType => {
                          const steps = workSteps[workType] || [];
                          steps.forEach(step => {
                            if (step.dueDate) {
                              if (!finalDueDate || new Date(step.dueDate) > new Date(finalDueDate)) {
                                finalDueDate = step.dueDate;
                              }
                            }
                          });
                        });

                        return (
                          <div className="flex items-center gap-3">
                            {/* 마감 원 */}
                            <div className={`relative w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                              overallStatus === 'completed'
                                ? 'bg-green-500 border-green-600'
                                : overallStatus === 'in_progress'
                                ? 'bg-white border-yellow-400'
                                : 'bg-white border-gray-300'
                            }`}>
                              {overallStatus === 'completed' && (
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                              {overallStatus === 'in_progress' && (
                                <div className="w-2 h-2 bg-yellow-400 rounded-full pulse-dot" />
                              )}
                            </div>

                            {/* 마감일 표시 */}
                            <div className="flex flex-col text-xs">
                              <span className="text-gray-500 font-medium">마감</span>
                              {finalDueDate ? (
                                <span className={`font-bold text-sm ${
                                  overallStatus === 'completed'
                                    ? 'text-green-600'
                                    : overallStatus === 'in_progress'
                                    ? 'text-yellow-600'
                                    : 'text-gray-600'
                                }`}>
                                  {new Date(finalDueDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">미정</span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                      </div>

                      {/* 새 작업 추가 버튼 */}
                      <button
                        onClick={() => {
                          const currentSteps = workSteps[selectedWorkTypeModal] || [];
                          const newStep: WorkStep = {
                            id: Date.now().toString(),
                            label: `작업 ${currentSteps.length + 1}`,
                            status: 'waiting',
                            assigneeId: '',
                            startDate: '',
                            dueDate: '',
                          };
                          editWorkSteps({
                            ...workSteps,
                            [selectedWorkTypeModal]: [...currentSteps, newStep]
                          });
                          showToast(`새 작업이 추가되었습니다.`);
                        }}
                        className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all font-medium text-sm shadow-md flex items-center gap-1 flex-shrink-0"
                      >
                        <Plus size={16} />
                        새 작업
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 작업 단계 목록 */}
              <div className="p-6">
                <div
                  className={`${isTabSwitching ? 'opacity-0' : 'opacity-100'}`}
                  style={{
                    transition: 'opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {(() => {
                    const steps = workSteps[selectedWorkTypeModal] || [];

                    if (steps.length === 0) {
                      return (
                        <div className="text-center py-12">
                          <p className="text-gray-500 mb-4">작업 단계가 없습니다.</p>
                          <button
                            onClick={closeModal}
                            className="px-4 py-2 bg-orange-500/90 backdrop-blur-sm text-white rounded-xl hover:bg-orange-600 transition-colors shadow-md"
                          >
                            작업 단계 추가하기
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-3">
                      <style>{`
                        @keyframes fadeSlideIn {
                          from {
                            opacity: 0;
                            transform: translateY(15px) scale(0.95);
                          }
                          to {
                            opacity: 1;
                            transform: translateY(0) scale(1);
                          }
                        }
                        .modal-task-item {
                          animation: fadeSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                        }
                      `}</style>
                      {steps.map((step, index) => {
                        const partner = partners.find(p => p.id === step.assigneeId);

                        return (
                          <div
                            key={step.id}
                            className={`modal-task-item p-4 rounded-xl border-2 transition-all backdrop-blur-md shadow-md ${
                              step.status === 'completed'
                                ? 'bg-green-50/60 border-green-200/60'
                                : step.status === 'in_progress'
                                ? 'bg-yellow-50/60 border-yellow-200/60'
                                : 'bg-white/60 border-divider/60'
                            }`}
                            style={{
                              animationDelay: `${index * 60}ms`
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                {/* 순서 번호 */}
                                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                  step.status === 'completed'
                                    ? 'bg-green-500 text-white'
                                    : step.status === 'in_progress'
                                    ? 'bg-yellow-500 text-white'
                                    : 'bg-gray-300 text-gray-600'
                                }`}>
                                  {step.status === 'completed' ? (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : (
                                    index + 1
                                  )}
                                </div>

                                {/* 작업 정보 */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-semibold text-gray-900">{step.label || `작업 ${index + 1}`}</h4>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                      step.status === 'completed'
                                        ? 'bg-green-100 text-green-800'
                                        : step.status === 'in_progress'
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {step.status === 'completed' ? '완료' : step.status === 'in_progress' ? '진행중' : '대기'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-4 text-sm text-gray-600">
                                    {partner && (
                                      <div className="flex items-center gap-1">
                                        <div className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                          <User size={10} className="text-orange-500" />
                                        </div>
                                        <span>{partner.name}</span>
                                      </div>
                                    )}
                                    {step.startDate && (
                                      <div className="flex items-center gap-1">
                                        <Calendar size={14} />
                                        <span>시작: {step.startDate}</span>
                                      </div>
                                    )}
                                    {step.dueDate && (
                                      <div className="flex items-center gap-1">
                                        <Calendar size={14} />
                                        <span className="font-medium">마감: {step.dueDate}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 상태 변경 버튼 */}
                              <div className="flex items-center gap-2 ml-4">
                                {step.status !== 'completed' && (
                                  <button
                                    onClick={() => {
                                      const updatedSteps = [...steps];
                                      updatedSteps[index] = { ...step, status: 'completed' };
                                      editWorkSteps({ ...workSteps, [selectedWorkTypeModal]: updatedSteps });
                                      showToast(`"${step.label || `작업 ${index + 1}`}"을(를) 완료로 표시했습니다.`);
                                    }}
                                    className="px-3 py-1.5 bg-green-500/90 backdrop-blur-sm text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium shadow-sm"
                                  >
                                    완료로 표시
                                  </button>
                                )}
                                {step.status === 'completed' && (
                                  <button
                                    onClick={() => {
                                      const updatedSteps = [...steps];
                                      updatedSteps[index] = { ...step, status: 'in_progress' };
                                      editWorkSteps({ ...workSteps, [selectedWorkTypeModal]: updatedSteps });
                                      showToast(`"${step.label || `작업 ${index + 1}`}"을(를) 진행중으로 변경했습니다.`);
                                    }}
                                    className="px-3 py-1.5 bg-yellow-500/90 backdrop-blur-sm text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm font-medium shadow-sm"
                                  >
                                    진행중으로 변경
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 토스트 알림 */}
      {toast.show && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 ${toast.isClosing ? 'animate-slide-out' : 'animate-slide-up'}`}>
          <div className="bg-gradient-to-r from-green-500/95 to-green-600/95 backdrop-blur-xl text-white px-6 py-4 rounded-2xl shadow-2xl border border-white/20 flex items-center gap-3 min-w-[320px]">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">{toast.message}</p>
            </div>
            <button
              onClick={() => {
                if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                if (toastCloseTimeoutRef.current) clearTimeout(toastCloseTimeoutRef.current);
                setToast(prev => ({ ...prev, isClosing: true }));
                setTimeout(() => {
                  setToast({ message: '', show: false, isClosing: false });
                }, 300);
              }}
              className="flex-shrink-0 p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X size={18} className="text-white" />
            </button>
          </div>
        </div>
      )}
    </OuterWrapper>
  );
}
