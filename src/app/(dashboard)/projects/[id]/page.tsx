'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Project, Client, Episode, Partner, WorkContentType, WorkStep, WorkTypeBudget } from '@/types';
import { ArrowLeft, Calendar, User, DollarSign, Tag, Edit, Trash2, TrendingUp, ChevronRight, X, UserCircle, FileText, Users, Video, Palette, Image, CheckCircle2, Clock, Pause, Target, ChevronDown, ClipboardCheck, Building2, Tv, Youtube, Monitor, Camera, Film, FileX, Plus } from 'lucide-react';
import { addToTrash } from '@/lib/trash';
import { getProjectById, updateProject, deleteProject, getClients as fetchClients, getProjectEpisodes, getPartners, upsertEpisode, updateEpisodeFields, deleteEpisode, deleteProjectEpisodes } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import Link from 'next/link';
import { getComputedProjectStatus } from '@/lib/utils';
import { FloatingLabelInput } from '@/components/FloatingLabelInput';
import ProjectChecklistModal from '@/components/ProjectChecklistModal';
import EpisodeDetailModal from '@/components/EpisodeDetailModal';
import dynamic from 'next/dynamic';
// 대형 회차 상세 패널(2.8k줄·framer-motion)은 초기 청크에서 분리 — 회차 열 때 로드.
const EpisodeDetailPanel = dynamic(() => import('@/components/EpisodeDetailPanel'), { ssr: false });
import EpisodeListItem, { type EpisodeEditDraft } from './EpisodeListItem';
import DateRangePicker from '@/components/DateRangePicker';
import { motion, AnimatePresence } from 'framer-motion';
import { useTutorial } from '@/components/tutorial/useTutorial';
import { useToast } from '@/contexts/ToastContext';
import { StatusBadge, EpisodeStatusBadge } from './StatusBadges';
import { TabBar } from '@/components/TabBar';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

interface EpisodeWithProjectId extends Episode {
  projectId: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [episodes, setEpisodes] = useState<EpisodeWithProjectId[]>([]);
  const [partnerIds, setPartnerIds] = useState<string[]>([]);
  const [isPartnerDropdownOpen, setIsPartnerDropdownOpen] = useState(false);
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [isManagerDropdownOpen, setIsManagerDropdownOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const [workTypeCosts, setWorkTypeCosts] = useState({
    '롱폼': { partnerCost: 0, managementCost: 0 },
    '기획 숏폼': { partnerCost: 0, managementCost: 0 },
    '본편 숏폼': { partnerCost: 0, managementCost: 0 },
    '썸네일': { partnerCost: 0, managementCost: 0 },
    'OAP': { partnerCost: 0, managementCost: 0 },
  });
  const [totalAmount, setTotalAmount] = useState<number>(0);
  // 통합 프로젝트 수정 모달
  const [isProjectEditModalOpen, setIsProjectEditModalOpen] = useState(false);
  const [activeEditTab, setActiveEditTab] = useState<'basic' | 'workers' | 'budget'>('basic');

  // 기본 정보 임시 상태
  const [tempEditedProject, setTempEditedProject] = useState<Partial<Project>>({});
  const [tempEditTags, setTempEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [tempSelectedClient, setTempSelectedClient] = useState<string>('');
  const [tempManagerIds, setTempManagerIds] = useState<string[]>([]);
  const [tempPartnerIds, setTempPartnerIds] = useState<string[]>([]);
  const [tempSelectedCategory, setTempSelectedCategory] = useState<string>('');
  const [tempChannels, setTempChannels] = useState<string[]>([]);
  const [tempWorkContent, setTempWorkContent] = useState<WorkContentType[]>([]);

  // 비용 정보 임시 상태
  const [tempTotalAmount, setTempTotalAmount] = useState<number>(0);
  const [tempWorkTypeCosts, setTempWorkTypeCosts] = useState({
    '롱폼': { partnerCost: 0, managementCost: 0 },
    '기획 숏폼': { partnerCost: 0, managementCost: 0 },
    '본편 숏폼': { partnerCost: 0, managementCost: 0 },
    '썸네일': { partnerCost: 0, managementCost: 0 },
    'OAP': { partnerCost: 0, managementCost: 0 },
  });

  const [deleteEpisodeId, setDeleteEpisodeId] = useState<string | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState<'in-progress' | 'episodes' | 'overview'>('in-progress');
  const [tabDirection, setTabDirection] = useState(1);
  const TAB_ORDER = ['in-progress', 'episodes', 'overview'] as const;
  const switchTab = (tab: 'in-progress' | 'episodes' | 'overview') => {
    setTabDirection(TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(activeTab) ? 1 : -1);
    setActiveTab(tab);
  };

  // 토스트 알림
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // 체크리스트 모달
  const [isChecklistModalOpen, setIsChecklistModalOpen] = useState(false);
  const [selectedEpisodeForDetail, setSelectedEpisodeForDetail] = useState<Episode | null>(null);

  // 마스터-디테일: 우측 패널에 표시할 회차 ID (URL ?ep=<id> 로도 동기화)
  const searchParams = useSearchParams();
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  // URL 쿼리 초기 반영 (최초 1회)
  useEffect(() => {
    const ep = searchParams.get('ep');
    if (ep) setSelectedEpisodeId(ep);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 선택 변경 시 URL 동기화 (리로드 방지, history.replaceState)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedEpisodeId) url.searchParams.set('ep', selectedEpisodeId);
    else url.searchParams.delete('ep');
    window.history.replaceState({}, '', url.toString());
  }, [selectedEpisodeId]);

  const [isEpisodeEditMode, setIsEpisodeEditMode] = useState(false);
  const [editingEpisodes, setEditingEpisodes] = useState<{ id: string; episodeNumber: number; title: string; assignee: string; manager: string; startDate: string; dueDate: string }[]>([]);
  const [editDropdown, setEditDropdown] = useState<{ episodeId: string; field: 'assignee' | 'manager' } | null>(null);

  // 드롭다운 외부 클릭 감지를 위한 ref
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const managerDropdownRef = useRef<HTMLDivElement>(null);
  const partnerDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const channelDropdownRef = useRef<HTMLDivElement>(null);
  const workContentDropdownRef = useRef<HTMLDivElement>(null);
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);
  const [isWorkContentDropdownOpen, setIsWorkContentDropdownOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoadError(false);
      const [foundProject, clientsData, partnersData, eps] = await Promise.all([
        getProjectById(projectId),
        fetchClients(),
        getPartners(),
        getProjectEpisodes(projectId),
      ]);
      setProject(foundProject);
      if (foundProject) {
        setPartnerIds(foundProject.partnerIds);
        setManagerIds(foundProject.managerIds);
        setSelectedClient(foundProject.client || '');
        setSelectedCategory(foundProject.category || '');
        const defaultCosts = {
          '롱폼': { partnerCost: 0, managementCost: 0 },
          '기획 숏폼': { partnerCost: 0, managementCost: 0 },
          '본편 숏폼': { partnerCost: 0, managementCost: 0 },
          '썸네일': { partnerCost: 0, managementCost: 0 },
          'OAP': { partnerCost: 0, managementCost: 0 },
        };
        const costs = foundProject.workTypeCosts ? { ...defaultCosts, ...foundProject.workTypeCosts } : defaultCosts;
        setWorkTypeCosts(costs);
        setTotalAmount(foundProject.budget.totalAmount);
        setTempWorkContent(foundProject.workContent || []);
      }
      setClients(clientsData);
      setAllPartners(partnersData);
      setEpisodes(eps);
    } catch (e) {
      // 네트워크/권한 실패를 '존재하지 않음'으로 오인시키지 않도록 에러 상태 분리
      console.error('프로젝트 상세 로드 실패', e);
      setLoadError(true);
    } finally {
      setIsLoadingProject(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // realtime: 폴링 1회만 등록(filter는 폴링에서 무시됨 — 3회 등록은 포커스당 loadData 3중 호출이라 단일화).
  useSupabaseRealtime(['projects', 'episodes', 'partners', 'clients'], loadData);

  // 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
      if (managerDropdownRef.current && !managerDropdownRef.current.contains(event.target as Node)) {
        setIsManagerDropdownOpen(false);
      }
      if (partnerDropdownRef.current && !partnerDropdownRef.current.contains(event.target as Node)) {
        setIsPartnerDropdownOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
      if (channelDropdownRef.current && !channelDropdownRef.current.contains(event.target as Node)) {
        setIsChannelDropdownOpen(false);
      }
      if (workContentDropdownRef.current && !workContentDropdownRef.current.contains(event.target as Node)) {
        setIsWorkContentDropdownOpen(false);
      }
    };

    if (isStatusDropdownOpen || isClientDropdownOpen || isManagerDropdownOpen || isPartnerDropdownOpen || isCategoryDropdownOpen || isChannelDropdownOpen || isWorkContentDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isStatusDropdownOpen, isClientDropdownOpen, isManagerDropdownOpen, isPartnerDropdownOpen, isCategoryDropdownOpen, isChannelDropdownOpen, isWorkContentDropdownOpen]);

  // 튜토리얼 탭 자동 전환
  const { isActive: tutorialActive, steps: tutorialSteps, currentStepIndex: tutorialStepIdx } = useTutorial();
  useEffect(() => {
    if (!tutorialActive) return;
    const target = tutorialSteps[tutorialStepIdx]?.target;
    if (target === 'tour-detail-add-episode') {
      if (activeTab !== 'episodes') switchTab('episodes');
    }
  }, [tutorialActive, tutorialStepIdx, tutorialSteps, activeTab]);

  // ⚠️ 회차 자동 저장 제거 - 개별 액션에서만 저장
  // 이전에는 episodes 상태가 바뀔 때마다 저장했지만,
  // 이로 인해 다른 프로젝트의 회차가 삭제되는 문제가 있었습니다.

  const handleEpisodeStatusChange = async (episodeId: string, newStatus: Episode['status']) => {
    const episode = episodes.find(e => e.id === episodeId);
    if (!episode) return;
    const updated = {
      ...episode,
      status: newStatus,
      completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined,
    };
    setEpisodes(prev => prev.map(e => e.id === episodeId ? updated : e));
    const ok = await updateEpisodeFields(episodeId, { status: newStatus, completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined });
    if (!ok) {
      setEpisodes(prev => prev.map(e => e.id === episodeId ? episode : e));
      showToastMessage('상태 변경에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleDelete = async () => {
    if (!project) return;

    // 회차를 먼저 휴지통으로 이전 (프로젝트 삭제 전에 해야 조회 가능)
    const eps = await getProjectEpisodes(projectId);
    await Promise.all(eps.map(ep => addToTrash('episode', ep, projectId)));
    await deleteProjectEpisodes(projectId);

    // 프로젝트 휴지통 이전 후 삭제
    await addToTrash('project', project);
    const deleted = await deleteProject(project.id);
    if (!deleted) {
      showToastMessage('프로젝트 삭제에 실패했습니다. 다시 시도해주세요.');
      return;
    }

    router.push('/projects');
  };

  const handleAddPartner = (partnerId: string) => {
    if (!partnerIds.includes(partnerId)) {
      const prevIds = partnerIds;
      const newPartnerIds = [...partnerIds, partnerId];
      setPartnerIds(newPartnerIds);
      updateProjectPartners(prevIds, newPartnerIds);
    }
    setIsPartnerDropdownOpen(false);
  };

  const handleRemovePartner = (partnerId: string) => {
    const prevIds = partnerIds;
    const newPartnerIds = partnerIds.filter(id => id !== partnerId);
    setPartnerIds(newPartnerIds);
    updateProjectPartners(prevIds, newPartnerIds);
  };

  const updateProjectPartners = async (prevIds: string[], newPartnerIds: string[]) => {
    const ok = await updateProject(projectId, { partnerIds: newPartnerIds });
    if (!ok) {
      setPartnerIds(prevIds);
      showToastMessage('파트너 저장에 실패했습니다.');
    }
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setIsCategoryDropdownOpen(false);
    updateProjectCategory(category);
  };

  const updateProjectCategory = async (category: string) => {
    const ok = await updateProject(projectId, { category });
    if (!ok) showToastMessage('카테고리 저장에 실패했습니다.');
  };

  const handleClientSelect = (clientName: string) => {
    setSelectedClient(clientName);
    setIsClientDropdownOpen(false);
    updateProjectClient(clientName);
  };

  const updateProjectClient = async (clientName: string) => {
    const ok = await updateProject(projectId, { client: clientName });
    if (ok) {
      if (project) setProject({ ...project, client: clientName });
    } else {
      showToastMessage('클라이언트 저장에 실패했습니다.');
    }
  };

  const handleAddManager = (managerId: string) => {
    if (!managerIds.includes(managerId)) {
      const prevIds = managerIds;
      const newManagerIds = [...managerIds, managerId];
      setManagerIds(newManagerIds);
      updateProjectManagers(prevIds, newManagerIds);
    }
    setIsManagerDropdownOpen(false);
  };

  const handleRemoveManager = (managerId: string) => {
    const prevIds = managerIds;
    const newManagerIds = managerIds.filter(id => id !== managerId);
    setManagerIds(newManagerIds);
    updateProjectManagers(prevIds, newManagerIds);
  };

  const updateProjectManagers = async (prevIds: string[], newManagerIds: string[]) => {
    const ok = await updateProject(projectId, { managerIds: newManagerIds });
    if (!ok) {
      setManagerIds(prevIds);
      showToastMessage('매니저 저장에 실패했습니다.');
    }
  };

  // 토스트 표시 함수
  const showToastMessage = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  const updateTempWorkTypeCost = (workType: string, costType: 'partnerCost' | 'managementCost', value: string) => {
    const numericValue = parseInt(value.replace(/,/g, '')) || 0;
    setTempWorkTypeCosts({
      ...tempWorkTypeCosts,
      [workType]: {
        ...tempWorkTypeCosts[workType as keyof typeof tempWorkTypeCosts],
        [costType]: numericValue,
      },
    });

    // 비용이 0보다 크면 작업 내용에 자동으로 추가
    if (numericValue > 0) {
      const workTypeValue = workType as WorkContentType;
      if (!tempWorkContent.includes(workTypeValue)) {
        setTempWorkContent([...tempWorkContent, workTypeValue]);
      }
    }
  };

  // 통합 프로젝트 수정 모달 열기
  const openProjectEditModal = (tab: 'basic' | 'workers' | 'budget' = 'basic') => {
    if (!project) return;

    // 기본 정보 초기화
    setTempEditedProject({
      title: project.title,
      description: project.description,
      status: project.status,
      client: project.client,
    });
    setTempEditTags(project.tags || []);
    setTempSelectedClient(selectedClient);
    setTempManagerIds(managerIds);
    setTempPartnerIds(partnerIds);
    setTempSelectedCategory(selectedCategory);
    setTempChannels(project?.channels || []);
    setTempWorkContent(project?.workContent || []);

    // 비용 정보 초기화
    setTempTotalAmount(totalAmount);
    setTempWorkTypeCosts(workTypeCosts);

    setActiveEditTab(tab);
    setIsProjectEditModalOpen(true);
  };

  const handleDeleteEpisode = async () => {
    if (!deleteEpisodeId) return;
    const episodeToDelete = episodes.find(ep => ep.id === deleteEpisodeId);
    if (episodeToDelete) {
      // 휴지통 백업을 먼저 — 백업 실패 시 삭제하지 않아 영구 유실 방지
      const backedUp = await addToTrash('episode', episodeToDelete, projectId);
      if (!backedUp) {
        showToastMessage('휴지통 백업에 실패해 삭제를 취소했습니다. 다시 시도해주세요.');
        setDeleteEpisodeId(null);
        return;
      }
      const deleted = await deleteEpisode(deleteEpisodeId);
      if (!deleted) {
        showToastMessage('회차 삭제에 실패했습니다. 다시 시도해주세요.');
        setDeleteEpisodeId(null);
        return;
      }
      setEpisodes(episodes.filter(ep => ep.id !== deleteEpisodeId));
    }
    setDeleteEpisodeId(null);
  };


  const formatCurrency = (value: number) => {
    return value.toLocaleString('ko-KR');
  };

  const updateTempTotalAmount = (value: string) => {
    const numericValue = parseInt(value.replace(/,/g, '')) || 0;
    setTempTotalAmount(numericValue);
  };

  // Calculate total partner payment from work types
  const getTotalPartnerPayment = () => {
    return Object.values(workTypeCosts).reduce((sum, cost) => sum + cost.partnerCost, 0);
  };

  // Calculate total management fee from work types
  const getTotalManagementFee = () => {
    return Object.values(workTypeCosts).reduce((sum, cost) => sum + cost.managementCost, 0);
  };

  // Calculate reserve
  const getReserveAmount = () => {
    const partnerPayment = getTotalPartnerPayment();
    const managementFee = getTotalManagementFee();
    return totalAmount - partnerPayment - managementFee;
  };

  // Calculate margin rate
  const getMarginRate = () => {
    if (totalAmount === 0) return 0;
    const reserve = getReserveAmount();
    return ((reserve / totalAmount) * 100).toFixed(1);
  };


  // partners 조회용 Map (O(1) lookup) — `.find()` O(N) 매 row마다 호출하던 패턴 제거
  const partnersById = useMemo(() => new Map(allPartners.map(p => [p.id, p])), [allPartners]);
  const partners = useMemo(
    () => partnerIds.map(id => partnersById.get(id)).filter(Boolean),
    [partnerIds, partnersById]
  );
  const managers = useMemo(
    () => managerIds.map(id => partnersById.get(id)).filter(Boolean),
    [managerIds, partnersById]
  );
  const activeEpisodes = useMemo(
    () => episodes.filter(ep => ep.status === 'in_progress' || ep.status === 'waiting'),
    [episodes]
  );
  const availablePartners = useMemo(
    () => allPartners.filter(p => !partnerIds.includes(p.id)),
    [allPartners, partnerIds]
  );
  const availableManagers = useMemo(
    () => allPartners.filter(p => !managerIds.includes(p.id)),
    [allPartners, managerIds]
  );

  // 정렬된 회차 — `episodes.sort()` 는 in-place 변형이라 state 뮤테이션. spread 후 sort로 안전 처리.
  const activeEpisodesSorted = useMemo(
    () => [...activeEpisodes].sort((a, b) => b.episodeNumber - a.episodeNumber),
    [activeEpisodes]
  );
  const episodesSorted = useMemo(
    () => [...episodes].sort((a, b) => b.episodeNumber - a.episodeNumber),
    [episodes]
  );

  // 편집 중 episode O(1) 조회용 Map (각 카드가 본인 임시 데이터를 빠르게 lookup)
  const editingEpisodesById = useMemo(
    () => new Map(editingEpisodes.map(e => [e.id, e])),
    [editingEpisodes]
  );
  // 편집 모드 partial patch — useCallback 으로 ref 안정화 (EpisodeListItem memo가 유효)
  const handleEpisodeEditChange = useCallback(
    (id: string, patch: Partial<EpisodeEditDraft>) =>
      setEditingEpisodes(prev => prev.map(ed => ed.id === id ? { ...ed, ...patch } : ed)),
    []
  );

  // Calculate budget values
  const calculatedPartnerPayment = getTotalPartnerPayment();
  const calculatedManagementFee = getTotalManagementFee();
  const calculatedReserve = getReserveAmount();
  const calculatedMarginRate = getMarginRate();

  // 작업 카운트·납품일·마감 회차 — 한 번 순회로 묶고 episodes 변경 시에만 재계산
  const workCounts = useMemo(() => {
    const total = { '롱폼': 0, '본편 숏폼': 0, '기획 숏폼': 0 };
    const inProgress = { '롱폼': 0, '본편 숏폼': 0, '기획 숏폼': 0 };
    for (const ep of episodes) {
      for (const work of ep.workContent) {
        if (work === '롱폼' || work === '본편 숏폼' || work === '기획 숏폼') {
          total[work]++;
          if (ep.status === 'in_progress') inProgress[work]++;
        }
      }
    }
    return { total, inProgress };
  }, [episodes]);
  const getTotalWorkCount = useCallback(() => workCounts.total, [workCounts]);
  const getInProgressWorkCount = useCallback(() => workCounts.inProgress, [workCounts]);

  const lastDeliveryDate = useMemo(() => {
    let maxMs = -Infinity;
    for (const ep of episodes) {
      if (!ep.endDate) continue;
      const ms = new Date(ep.endDate).getTime();
      if (ms > maxMs) maxMs = ms;
    }
    return maxMs === -Infinity ? null : new Date(maxMs);
  }, [episodes]);
  const getLastDeliveryDate = useCallback(() => lastDeliveryDate, [lastDeliveryDate]);

  // 오늘/이번주 마감 — episodes 또는 날짜 경계만 바뀌면 재계산
  const { todayDue, thisWeekDue } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() + (7 - today.getDay()) % 7);
    sunday.setHours(23, 59, 59, 999);
    const sundayMs = sunday.getTime();
    const todayList: Episode[] = [];
    const weekList: Episode[] = [];
    for (const ep of episodes) {
      if (!ep.dueDate || ep.status === 'completed') continue;
      const due = new Date(ep.dueDate);
      due.setHours(0, 0, 0, 0);
      const dueMs = due.getTime();
      if (dueMs === todayMs) todayList.push(ep);
      else if (dueMs > todayMs && dueMs <= sundayMs) weekList.push(ep);
    }
    return { todayDue: todayList, thisWeekDue: weekList };
  }, [episodes]);
  const getTodayDueEpisodes = useCallback(() => todayDue, [todayDue]);
  const getThisWeekDueEpisodes = useCallback(() => thisWeekDue, [thisWeekDue]);

  // 편집 모달 열기
  // 통합 모달 취소
  const cancelProjectEditModal = () => {
    setIsProjectEditModalOpen(false);
    setTempEditedProject({});
    setTempEditTags([]);
    setNewTag('');
  };

  // 통합 모달 저장
  const saveProjectEditModal = async () => {
    if (isSavingProject) return;
    if (!project || !tempEditedProject.title) {
      toast.warning('프로젝트 이름을 입력해주세요.');
      return;
    }
    setIsSavingProject(true);

    const partnerPayment = Object.values(tempWorkTypeCosts).reduce((s, c) => s + c.partnerCost, 0);
    const managementFee = Object.values(tempWorkTypeCosts).reduce((s, c) => s + c.managementCost, 0);
    const marginRate = tempTotalAmount > 0
      ? Math.round(((tempTotalAmount - partnerPayment - managementFee) / tempTotalAmount) * 100 * 10) / 10
      : 0;

    const updates: Partial<Project> = {
      ...tempEditedProject,
      tags: tempEditTags,
      client: tempSelectedClient,
      partnerIds: tempPartnerIds,
      managerIds: tempManagerIds,
      category: tempSelectedCategory,
      channels: tempChannels,
      workContent: tempWorkContent,
      workTypeCosts: tempWorkTypeCosts,
      budget: {
        totalAmount: tempTotalAmount,
        partnerPayment,
        managementFee,
        marginRate,
      },
    };

    const success = await updateProject(projectId, updates);
    setIsSavingProject(false);
    if (success) {
      setProject({
        ...project,
        ...updates,
        updatedAt: new Date().toISOString()
      });
      setSelectedClient(tempSelectedClient);
      setManagerIds(tempManagerIds);
      setPartnerIds(tempPartnerIds);
      setSelectedCategory(tempSelectedCategory);
      setTotalAmount(tempTotalAmount);
      setWorkTypeCosts(tempWorkTypeCosts);
      showToastMessage('프로젝트가 저장되었습니다!');
      cancelProjectEditModal();
    } else {
      showToastMessage('저장에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // 태그 추가
  const addTag = () => {
    if (newTag.trim() && !tempEditTags.includes(newTag.trim())) {
      setTempEditTags([...tempEditTags, newTag.trim()]);
      setNewTag('');
    }
  };

  // 태그 제거
  const removeTag = (tagToRemove: string) => {
    setTempEditTags(tempEditTags.filter(tag => tag !== tagToRemove));
  };

  const totalWorkCount = getTotalWorkCount();
  const inProgressWorkCount = getInProgressWorkCount();
  // lastDeliveryDate 는 위에서 useMemo로 정의됨 (중복 선언 제거)
  const todayDueEpisodes = getTodayDueEpisodes();
  const thisWeekDueEpisodes = getThisWeekDueEpisodes();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleAddEpisode = useCallback(async () => {
    const nextEpisodeNumber = episodes.length > 0
      ? Math.max(...episodes.map(ep => ep.episodeNumber)) + 1
      : 1;

    const defaultAssignee = partnerIds.length > 0 ? partnerIds[0] : (allPartners[0]?.id || '');
    const defaultManager = managerIds.length > 0 ? managerIds[0] : (allPartners[0]?.id || '');

    // 프로젝트의 작업 타입과 비용 정보를 회차에 자동 적용
    const projectWorkContent = project?.workContent || [];
    const episodeWorkBudgets: Record<string, { partnerPayment: number; managementFee: number }> = {};
    let episodePartnerTotal = 0;
    let episodeManagementTotal = 0;
    projectWorkContent.forEach(wt => {
      const cost = workTypeCosts[wt as keyof typeof workTypeCosts];
      if (cost) {
        episodeWorkBudgets[wt] = {
          partnerPayment: cost.partnerCost,
          managementFee: cost.managementCost,
        };
        episodePartnerTotal += cost.partnerCost;
        episodeManagementTotal += cost.managementCost;
      }
    });

    // 각 작업 타입에 "원본 전달" 작업 단계 자동 생성
    const episodeWorkSteps: Record<string, { id: string; label: string; category: string; status: string; startDate: string; dueDate: string; assigneeId?: string }[]> = {};
    const now = new Date().toISOString();
    projectWorkContent.forEach(wt => {
      episodeWorkSteps[wt] = [{
        id: `${wt}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: '원본 전달',
        category: '원본 전달',
        status: 'waiting',
        startDate: now,
        dueDate: '',
        assigneeId: defaultAssignee || undefined,
      }];
    });

    const newEpisode: EpisodeWithProjectId = {
      id: crypto.randomUUID(),
      projectId: projectId,
      episodeNumber: nextEpisodeNumber,
      title: '',
      clientId: project?.clientId,
      client: project?.client,
      workContent: projectWorkContent,
      status: 'waiting',
      assignee: defaultAssignee,
      manager: defaultManager,
      startDate: now,
      budget: {
        totalAmount: episodePartnerTotal + episodeManagementTotal,
        partnerPayment: episodePartnerTotal,
        managementFee: episodeManagementTotal,
      },
      workBudgets: episodeWorkBudgets as Record<WorkContentType, WorkTypeBudget>,
      workSteps: episodeWorkSteps as Record<WorkContentType, WorkStep[]>,
      createdAt: now,
      updatedAt: now,
    };

    const ok = await upsertEpisode(newEpisode);
    if (!ok) {
      showToastMessage('회차 추가에 실패했습니다. 다시 시도해주세요.');
      return;
    }
    setEpisodes(prev => [...prev, newEpisode]);
    router.push(`/projects/${projectId}/episodes/${newEpisode.id}`);
  }, [episodes, partnerIds, allPartners, managerIds, projectId, project, workTypeCosts, router]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === 'new-episode') handleAddEpisode();
    };
    window.addEventListener('fab:action', handler);
    return () => window.removeEventListener('fab:action', handler);
  }, [handleAddEpisode]);

  if (isLoadingProject) {
    return <LoadingState />;
  }

  if (loadError) {
    return (
      <EmptyState
        icon={FileX}
        title="프로젝트를 불러오지 못했습니다"
        description="일시적인 오류로 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
        action={{ label: '다시 시도', onClick: () => { setIsLoadingProject(true); loadData(); } }}
      />
    );
  }

  if (!project) {
    return (
      <EmptyState
        icon={FileX}
        title="프로젝트를 찾을 수 없습니다"
        description="요청하신 프로젝트가 존재하지 않습니다."
        action={{ label: '프로젝트 목록으로 돌아가기', onClick: () => router.push('/projects') }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <style jsx global>{`
        @keyframes modal-overlay-in {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to { opacity: 1; backdrop-filter: blur(4px); }
        }
        @keyframes modal-content-in {
          from { opacity: 0; transform: scale(0.95) translateY(-20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-modal-overlay {
          animation: modal-overlay-in 0.3s ease-out forwards;
        }
        .animate-modal-content {
          animation: modal-content-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
      {/* 헤더 */}
      <div data-tour="tour-detail-header" className="bg-white rounded-2xl border border-divider px-4 sm:px-6 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              href="/projects"
              className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0"
            >
              <ArrowLeft size={18} className="text-gray-400 sm:w-5 sm:h-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-[21px] font-extrabold tracking-tight truncate">{project.title}</h1>
                <StatusBadge status={getComputedProjectStatus(episodes)} />
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 mt-1 text-[11px] sm:text-xs text-[#a8a29e] flex-wrap">
                <span>{selectedClient || '클라이언트 미설정'}</span>
                <span className="w-px h-3 bg-[#ede9e6]" />
                <span>회차 <b className="text-[#1c1917]">{episodes.length}</b>개</span>
                <span className="w-px h-3 bg-[#ede9e6] hidden sm:inline" />
                <span className="hidden sm:inline">총 <b className="text-[#1c1917]">{episodes.reduce((sum, ep) => sum + (ep.budget?.totalAmount || 0), 0).toLocaleString()}</b>원</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={() => setIsChecklistModalOpen(true)}
              className="p-1.5 sm:p-2 text-orange-500 hover:bg-orange-50 rounded-xl transition-colors"
              title="체크리스트"
            >
              <ClipboardCheck size={16} />
            </button>
            <button
              onClick={() => openProjectEditModal('basic')}
              className="p-1.5 sm:p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors"
              title="수정"
            >
              <Edit size={16} />
            </button>
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="p-1.5 sm:p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-xl transition-colors"
              title="삭제"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 탭 네비게이션 — 매니지먼트 스타일 */}
      <TabBar<'in-progress' | 'episodes' | 'overview'>
        data-tour="tour-detail-tabs"
        fullWidthMobile={false}
        items={[
          { key: 'in-progress', label: '진행 중인 회차', count: activeEpisodes.length },
          { key: 'episodes', label: '회차 관리', count: episodes.length },
          { key: 'overview', label: '프로젝트 개요' },
        ]}
        active={activeTab}
        onChange={switchTab}
      />

      {/* 탭 컨텐츠 */}
      <div style={{ overflowX: 'clip' }}>
      <AnimatePresence mode="wait" custom={tabDirection}>
      <motion.div
        key={activeTab}
        custom={tabDirection}
        variants={{
          initial: (dir: number) => ({ opacity: 0, x: dir > 0 ? 48 : -48 }),
          animate: { opacity: 1, x: 0 },
          exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -48 : 48 }),
        }}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 기본 정보 */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-divider p-4 sm:p-6 space-y-5 sm:space-y-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">기본 정보</h2>
              <button
                onClick={() => openProjectEditModal('basic')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="기본 정보 수정"
              >
                <Edit size={16} className="text-gray-600" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 클라이언트, 매니저, 담당 파트너 - 한 줄로 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 클라이언트 */}
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">클라이언트</p>
                  {selectedClient ? (
                    <div className="flex items-center p-2">
                      <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-semibold mr-2 flex-shrink-0">
                        {selectedClient.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-gray-900 truncate">{selectedClient}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">미설정</p>
                  )}
                </div>

                {/* 매니저 */}
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">매니저</p>
                  {managers.length > 0 ? (
                    <div className="space-y-2">
                      {managers.map((manager) => manager && (
                        <div key={manager.id} className="flex items-center p-2">
                          <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-semibold mr-2 flex-shrink-0">
                            {manager.name.charAt(0)}
                          </div>
                          <p className="text-sm font-medium text-gray-900 truncate">{manager.name}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">미설정</p>
                  )}
                </div>

                {/* 담당 파트너 */}
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">담당 파트너</p>
                  {partners.length > 0 ? (
                    <div className="space-y-2">
                      {partners.map((partner) => partner && (
                        <div key={partner.id} className="flex items-center p-2">
                          <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mr-2">
                            <User size={16} className="text-orange-500" />
                          </div>
                          <p className="text-sm font-medium text-gray-900 truncate">{partner.name}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">미설정</p>
                  )}
                </div>
              </div>

              {/* 분류와 작업 내용 - 한 줄로 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 분류 */}
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">분류</p>
                  {selectedCategory ? (
                    <div className="p-2 bg-orange-50 rounded-lg inline-block">
                      <span className="text-sm font-medium text-gray-600">{selectedCategory}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">미설정</p>
                  )}
                </div>

                {/* 작업 내용 */}
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">작업 내용</p>
                  {project?.workContent && project.workContent.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {project.workContent.map((work, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-orange-50 text-orange-600 rounded text-xs font-medium"
                        >
                          {work}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">미설정</p>
                  )}
                </div>
              </div>

              {/* 마감 예정 - 오늘 & 이번 주 */}
              <div className="pt-4 border-t border-divider">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* 오늘 마감 */}
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-3">오늘 마감</p>
                      {todayDueEpisodes.length > 0 ? (
                        <div className="space-y-2">
                          {todayDueEpisodes.map((episode) => (
                            <button
                              key={episode.id}
                              onClick={() => router.push(`/projects/${projectId}/episodes/${episode.id}`)}
                              className="w-full flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                              type="button"
                            >
                              <div className="flex items-center space-x-2">
                                <div className="w-7 h-7 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                  {episode.episodeNumber}
                                </div>
                                <div className="text-left">
                                  <p className="text-sm font-semibold text-gray-900">{episode.title}</p>
                                  {episode.workContent.length > 0 && (
                                    <div className="flex gap-1 mt-0.5">
                                      {episode.workContent.map((work, idx) => (
                                        <span key={idx} className="text-xs text-red-700">
                                          {work}{idx < episode.workContent.length - 1 ? ',' : ''}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <ChevronRight size={14} className="text-red-600 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">마감 없음</p>
                      )}
                    </div>

                    {/* 이번 주 마감 */}
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-3">이번 주 마감</p>
                      {thisWeekDueEpisodes.length > 0 ? (
                        <div className="space-y-2">
                          {thisWeekDueEpisodes.map((episode) => (
                            <button
                              key={episode.id}
                              onClick={() => router.push(`/projects/${projectId}/episodes/${episode.id}`)}
                              className="w-full flex items-center justify-between p-3 bg-orange-50 border border-divider rounded-lg hover:bg-orange-100 transition-colors"
                              type="button"
                            >
                              <div className="flex items-center space-x-2">
                                <div className="w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                  {episode.episodeNumber}
                                </div>
                                <div className="text-left">
                                  <p className="text-sm font-semibold text-gray-900">{episode.title}</p>
                                  {episode.dueDate && (
                                    <p className="text-xs text-gray-600">
                                      {new Date(episode.dueDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' })}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <ChevronRight size={14} className="text-orange-600 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">마감 없음</p>
                      )}
                    </div>
                  </div>
                </div>

              {/* 진행 중인 작업 & 누적 작업 수 - 한 줄로 */}
              <div className="pt-4 border-t border-divider">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* 진행 중인 작업 */}
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-3">진행 중인 작업</p>
                    <div className="flex divide-x divide-gray-200">
                      <div className="flex-1 text-center py-2">
                        <p className="text-xs text-gray-500 font-medium">롱폼</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{inProgressWorkCount['롱폼']}</p>
                      </div>
                      <div className="flex-1 text-center py-2">
                        <p className="text-xs text-gray-500 font-medium">본편 숏폼</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{inProgressWorkCount['본편 숏폼']}</p>
                      </div>
                      <div className="flex-1 text-center py-2">
                        <p className="text-xs text-gray-500 font-medium">기획 숏폼</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{inProgressWorkCount['기획 숏폼']}</p>
                      </div>
                    </div>
                  </div>

                  {/* 누적 작업 수 */}
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-3">누적 작업 수</p>
                    <div className="flex divide-x divide-gray-200">
                      <div className="flex-1 text-center py-2">
                        <p className="text-xs text-gray-500 font-medium">롱폼</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{totalWorkCount['롱폼']}</p>
                      </div>
                      <div className="flex-1 text-center py-2">
                        <p className="text-xs text-gray-500 font-medium">본편 숏폼</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{totalWorkCount['본편 숏폼']}</p>
                      </div>
                      <div className="flex-1 text-center py-2">
                        <p className="text-xs text-gray-500 font-medium">기획 숏폼</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{totalWorkCount['기획 숏폼']}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 최종 납품일 */}
              {lastDeliveryDate && (
                <div className="pt-4 border-t border-divider">
                  <div className="flex items-start">
                    <Calendar size={20} className="text-gray-400 mr-3 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-500">최종 납품일</p>
                      <p className="text-base text-gray-900 mt-1">
                        {lastDeliveryDate.toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {project.description && (
                <div className="pt-4 border-t border-divider">
                  <p className="text-sm font-medium text-gray-500 mb-2">설명</p>
                  <p className="text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {project.description}
                  </p>
                </div>
              )}

              {project.tags && project.tags.length > 0 && (
                <div className="pt-4 border-t border-divider">
                  <p className="text-sm font-medium text-gray-500 mb-2">태그</p>
                  <div className="flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-orange-50 text-orange-600 rounded-full text-sm"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 비용 정보 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-divider p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 flex items-center">
                <DollarSign size={18} className="mr-2" />
                비용 정보
              </h2>
              <button
                onClick={() => openProjectEditModal('budget')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="비용 수정"
              >
                <Edit size={16} className="text-gray-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">전체 비용</p>
                <p className={`text-2xl font-bold ${totalAmount === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                  {formatCurrency(totalAmount)}원
                </p>
              </div>

              {/* 파트너 지급, 매니징 비용 - 한 줄로 */}
              <div className="pt-3 border-t border-divider">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">파트너 지급 (합산)</p>
                    <p className={`text-lg font-semibold ${calculatedPartnerPayment === 0 ? 'text-gray-400' : 'text-orange-600'}`}>
                      {formatCurrency(calculatedPartnerPayment)}원
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">매니징 비용 (합산)</p>
                    <p className={`text-lg font-semibold ${calculatedManagementFee === 0 ? 'text-gray-400' : 'text-orange-600'}`}>
                      {formatCurrency(calculatedManagementFee)}원
                    </p>
                  </div>
                </div>
              </div>

              {/* 유보금, 마진율 - 한 줄로 */}
              <div className="pt-3 border-t border-divider">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">유보금</p>
                    <p className={`text-lg font-semibold ${calculatedReserve === 0 ? 'text-gray-400' : 'text-orange-600'}`}>
                      {formatCurrency(calculatedReserve)}원
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1 flex items-center">
                      <TrendingUp size={12} className="mr-1" />
                      마진율
                    </p>
                    <p className={`text-lg font-semibold ${Number(calculatedMarginRate) === 0 ? 'text-gray-400' : 'text-green-600'}`}>
                      {calculatedMarginRate}%
                    </p>
                  </div>
                </div>
              </div>

              {/* 작업별 비용 */}
              <div className="pt-3 border-t border-divider">
                <p className="text-sm font-medium text-gray-700 mb-3">작업별 비용</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {/* 롱폼 */}
                  <div className={`rounded-lg p-3 ${workTypeCosts['롱폼'].partnerCost === 0 && workTypeCosts['롱폼'].managementCost === 0 ? 'bg-gray-50' : 'bg-orange-50'}`}>
                    <p className={`text-xs font-semibold mb-2 ${workTypeCosts['롱폼'].partnerCost === 0 && workTypeCosts['롱폼'].managementCost === 0 ? 'text-gray-400' : 'text-gray-600'}`}>롱폼</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-600">파트너 비용</label>
                        <p className={`text-sm font-semibold mt-1 ${workTypeCosts['롱폼'].partnerCost === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                          {formatCurrency(workTypeCosts['롱폼'].partnerCost)}원
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">매니징 비용</label>
                        <p className={`text-sm font-semibold mt-1 ${workTypeCosts['롱폼'].managementCost === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                          {formatCurrency(workTypeCosts['롱폼'].managementCost)}원
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 기획 숏폼 */}
                  <div className={`rounded-lg p-3 ${workTypeCosts['기획 숏폼'].partnerCost === 0 && workTypeCosts['기획 숏폼'].managementCost === 0 ? 'bg-gray-50' : 'bg-green-50'}`}>
                    <p className={`text-xs font-semibold mb-2 ${workTypeCosts['기획 숏폼'].partnerCost === 0 && workTypeCosts['기획 숏폼'].managementCost === 0 ? 'text-gray-400' : 'text-gray-600'}`}>기획 숏폼</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-600">파트너 비용</label>
                        <p className={`text-sm font-semibold mt-1 ${workTypeCosts['기획 숏폼'].partnerCost === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                          {formatCurrency(workTypeCosts['기획 숏폼'].partnerCost)}원
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">매니징 비용</label>
                        <p className={`text-sm font-semibold mt-1 ${workTypeCosts['기획 숏폼'].managementCost === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                          {formatCurrency(workTypeCosts['기획 숏폼'].managementCost)}원
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 본편 숏폼 */}
                  <div className={`rounded-lg p-3 ${workTypeCosts['본편 숏폼'].partnerCost === 0 && workTypeCosts['본편 숏폼'].managementCost === 0 ? 'bg-gray-50' : 'bg-orange-50'}`}>
                    <p className={`text-xs font-semibold mb-2 ${workTypeCosts['본편 숏폼'].partnerCost === 0 && workTypeCosts['본편 숏폼'].managementCost === 0 ? 'text-gray-400' : 'text-gray-600'}`}>본편 숏폼</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-600">파트너 비용</label>
                        <p className={`text-sm font-semibold mt-1 ${workTypeCosts['본편 숏폼'].partnerCost === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                          {formatCurrency(workTypeCosts['본편 숏폼'].partnerCost)}원
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">매니징 비용</label>
                        <p className={`text-sm font-semibold mt-1 ${workTypeCosts['본편 숏폼'].managementCost === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                          {formatCurrency(workTypeCosts['본편 숏폼'].managementCost)}원
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 썸네일 */}
                  <div className={`rounded-lg p-3 ${workTypeCosts['썸네일'].partnerCost === 0 && workTypeCosts['썸네일'].managementCost === 0 ? 'bg-gray-50' : 'bg-orange-50'}`}>
                    <p className={`text-xs font-semibold mb-2 ${workTypeCosts['썸네일'].partnerCost === 0 && workTypeCosts['썸네일'].managementCost === 0 ? 'text-gray-400' : 'text-gray-600'}`}>썸네일</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-600">파트너 비용</label>
                        <p className={`text-sm font-semibold mt-1 ${workTypeCosts['썸네일'].partnerCost === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                          {formatCurrency(workTypeCosts['썸네일'].partnerCost)}원
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">매니징 비용</label>
                        <p className={`text-sm font-semibold mt-1 ${workTypeCosts['썸네일'].managementCost === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                          {formatCurrency(workTypeCosts['썸네일'].managementCost)}원
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* OAP */}
                  <div className={`rounded-lg p-3 ${workTypeCosts['OAP'].partnerCost === 0 && workTypeCosts['OAP'].managementCost === 0 ? 'bg-gray-50' : 'bg-purple-50'}`}>
                    <p className={`text-xs font-semibold mb-2 ${workTypeCosts['OAP'].partnerCost === 0 && workTypeCosts['OAP'].managementCost === 0 ? 'text-gray-400' : 'text-gray-600'}`}>OAP</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-600">파트너 비용</label>
                        <p className={`text-sm font-semibold mt-1 ${workTypeCosts['OAP'].partnerCost === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                          {formatCurrency(workTypeCosts['OAP'].partnerCost)}원
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">매니징 비용</label>
                        <p className={`text-sm font-semibold mt-1 ${workTypeCosts['OAP'].managementCost === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                          {formatCurrency(workTypeCosts['OAP'].managementCost)}원
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* 진행 중인 회차 탭 */}
      {activeTab === 'in-progress' && (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(420px,480px)_1fr] gap-4 lg:h-[calc(100vh-220px)] lg:min-h-[620px]">
      <div data-tour="tour-detail-inprogress" className="bg-white rounded-2xl border border-divider lg:overflow-y-auto">
        <div className="px-4 sm:px-6 py-4 border-b border-divider flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-[#1c1917] flex items-center gap-2">
              진행 중인 회차
              <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full text-xs font-semibold">
                {activeEpisodes.length}개
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => {
                if (isEpisodeEditMode) {
                  // 저장
                  const activeEpisodeIds = new Set(episodes.filter(ep => ep.status === 'in_progress' || ep.status === 'waiting').map(ep => ep.id));
                  Promise.all(editingEpisodes.filter(edit => activeEpisodeIds.has(edit.id)).map(async (edit) => {
                    const ep = episodes.find(e => e.id === edit.id);
                    if (!ep) return;
                    const changed = ep.episodeNumber !== edit.episodeNumber || ep.title !== edit.title
                      || ep.assignee !== edit.assignee || ep.manager !== edit.manager
                      || ep.startDate !== edit.startDate || (ep.dueDate || '') !== edit.dueDate;
                    if (!changed) return;
                    const updated = { ...ep, episodeNumber: edit.episodeNumber, title: edit.title, assignee: edit.assignee, manager: edit.manager, startDate: edit.startDate, dueDate: edit.dueDate || undefined, updatedAt: new Date().toISOString() };
                    setEpisodes(prev => prev.map(e => e.id === edit.id ? updated : e));
                    await updateEpisodeFields(edit.id, { episodeNumber: edit.episodeNumber, title: edit.title, assignee: edit.assignee, manager: edit.manager, startDate: edit.startDate, dueDate: edit.dueDate || undefined });
                  }));
                  setIsEpisodeEditMode(false);
                  showToastMessage('회차 정보가 저장되었습니다.');
                } else {
                  setEditingEpisodes(episodes.map(ep => ({ id: ep.id, episodeNumber: ep.episodeNumber, title: ep.title, assignee: ep.assignee, manager: ep.manager, startDate: ep.startDate, dueDate: ep.dueDate || '' })));
                  setIsEpisodeEditMode(true);
                }
              }}
              className={`px-3 sm:px-4 py-2 rounded-xl transition-colors text-xs sm:text-sm font-medium ${
                isEpisodeEditMode
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {isEpisodeEditMode ? '저장' : '수정'}
            </button>
            <button
              onClick={handleAddEpisode}
              className="px-3 sm:px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs sm:text-sm inline-flex items-center gap-1.5"
            >
              <Plus size={15} />회차 추가
            </button>
          </div>
        </div>

        {activeEpisodes.length === 0 ? (
          <EmptyState
            icon={Film}
            title="진행 중인 회차가 없습니다"
            description="회차 관리 탭에서 회차를 추가해주세요"
            size="compact"
          />
        ) : (
          <div className="p-4 space-y-2">
            {activeEpisodesSorted.map((episode) => (
              <EpisodeListItem
                key={episode.id}
                episode={episode}
                isSelected={selectedEpisodeId === episode.id}
                isEditMode={isEpisodeEditMode}
                editingEpisode={editingEpisodesById.get(episode.id)}
                editDropdown={editDropdown}
                setEditDropdown={setEditDropdown}
                onEditChange={handleEpisodeEditChange}
                allPartners={allPartners}
                partnersById={partnersById}
                onSelect={setSelectedEpisodeId}
                onDelete={setDeleteEpisodeId}
              />
            ))}
          </div>
        )}
      </div>
      {/* 디테일 패널 (회차 선택 시) */}
      <aside className="hidden lg:block lg:overflow-y-auto">
        {selectedEpisodeId ? (
          <EpisodeDetailPanel
            key={selectedEpisodeId}
            projectId={projectId}
            episodeId={selectedEpisodeId}
            embedded
            onBack={() => setSelectedEpisodeId(null)}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-divider h-full flex flex-col items-center justify-center">
            <EmptyState
              icon={FileText}
              title="회차를 선택하면 상세 정보가 여기에 표시됩니다"
              description="좌측 회차 카드를 클릭하세요"
              size="compact"
            />
          </div>
        )}
      </aside>
      </div>
      )}

      {/* 회차 탭 */}
      {activeTab === 'episodes' && (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(420px,480px)_1fr] gap-4 lg:h-[calc(100vh-220px)] lg:min-h-[620px]">
      <div className="bg-white rounded-2xl border border-divider lg:overflow-y-auto">
        <div className="px-4 sm:px-6 py-4 border-b border-divider flex items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-semibold text-[#1c1917] flex items-center gap-2 flex-shrink-0">
            회차 관리
            <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded-full text-xs font-semibold">
              {episodes.length}개
            </span>
          </h2>
          <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => {
              if (isEpisodeEditMode) {
                // 저장
                Promise.all(editingEpisodes.map(async (edit) => {
                  const ep = episodes.find(e => e.id === edit.id);
                  if (!ep) return;
                  const changed = ep.episodeNumber !== edit.episodeNumber || ep.title !== edit.title
                    || ep.assignee !== edit.assignee || ep.manager !== edit.manager
                    || ep.startDate !== edit.startDate || (ep.dueDate || '') !== edit.dueDate;
                  if (!changed) return;
                  const updated = { ...ep, episodeNumber: edit.episodeNumber, title: edit.title, assignee: edit.assignee, manager: edit.manager, startDate: edit.startDate, dueDate: edit.dueDate || undefined, updatedAt: new Date().toISOString() };
                  setEpisodes(prev => prev.map(e => e.id === edit.id ? updated : e));
                  await updateEpisodeFields(edit.id, { episodeNumber: edit.episodeNumber, title: edit.title, assignee: edit.assignee, manager: edit.manager, startDate: edit.startDate, dueDate: edit.dueDate || undefined });
                }));
                setIsEpisodeEditMode(false);
                showToastMessage('회차 정보가 저장되었습니다.');
              } else {
                // 편집 모드 진입
                setEditingEpisodes(episodes.map(ep => ({ id: ep.id, episodeNumber: ep.episodeNumber, title: ep.title, assignee: ep.assignee, manager: ep.manager, startDate: ep.startDate, dueDate: ep.dueDate || '' })));
                setIsEpisodeEditMode(true);
              }
            }}
            className={`px-3 sm:px-4 py-2 rounded-xl transition-colors text-xs sm:text-sm font-medium ${
              isEpisodeEditMode
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {isEpisodeEditMode ? '저장' : '수정'}
          </button>
          <button
            onClick={handleAddEpisode}
            data-tour="tour-detail-add-episode"
            className="px-3 sm:px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs sm:text-sm inline-flex items-center gap-1.5"
          >
            <Plus size={15} />회차 추가
          </button>
          </div>
        </div>

        {episodes.length === 0 ? (
          <EmptyState
            icon={Film}
            title="등록된 회차가 없습니다"
            description="회차를 추가하여 프로젝트를 관리하세요."
            size="compact"
          />
        ) : (
          <div className="p-4 space-y-2">
            {episodesSorted.map((episode) => (
              <EpisodeListItem
                key={episode.id}
                episode={episode}
                isSelected={selectedEpisodeId === episode.id}
                isEditMode={isEpisodeEditMode}
                editingEpisode={editingEpisodesById.get(episode.id)}
                editDropdown={editDropdown}
                setEditDropdown={setEditDropdown}
                onEditChange={handleEpisodeEditChange}
                allPartners={allPartners}
                partnersById={partnersById}
                onSelect={setSelectedEpisodeId}
                onDelete={setDeleteEpisodeId}
              />
            ))}
          </div>
        )}
      </div>
      {/* 디테일 패널 (회차 선택 시) */}
      <aside className="hidden lg:block lg:overflow-y-auto">
        {selectedEpisodeId ? (
          <EpisodeDetailPanel
            key={selectedEpisodeId}
            projectId={projectId}
            episodeId={selectedEpisodeId}
            embedded
            onBack={() => setSelectedEpisodeId(null)}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-divider h-full flex flex-col items-center justify-center">
            <EmptyState
              icon={FileText}
              title="회차를 선택하면 상세 정보가 여기에 표시됩니다"
              description="좌측 회차 카드를 클릭하세요"
              size="compact"
            />
          </div>
        )}
      </aside>
      </div>
      )}
      </motion.div>
      </AnimatePresence>
      </div>

      {/* 모바일 회차 상세 모달 (lg 미만: 숨겨진 aside 대체) */}
      {selectedEpisodeId && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/40"
          onClick={() => setSelectedEpisodeId(null)}
        >
          <div
            className="absolute inset-x-0 bottom-0 top-10 bg-[#fafafa] rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-divider bg-white flex-shrink-0">
              <span className="text-sm font-semibold text-[#1c1917]">회차 상세</span>
              <button
                onClick={() => setSelectedEpisodeId(null)}
                className="p-1.5 -mr-1.5 rounded-lg hover:bg-[#f5f5f4] text-[#78716c] transition-colors"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3">
              <EpisodeDetailPanel
                key={selectedEpisodeId}
                projectId={projectId}
                episodeId={selectedEpisodeId}
                embedded
                onBack={() => setSelectedEpisodeId(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsDeleteModalOpen(false)}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="relative bg-[#fafaf9] rounded-lg shadow-xl max-w-md w-full p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#1c1917] mb-2">프로젝트 삭제</h3>
              <p className="text-[#57534e] mb-6">
                <span className="font-semibold text-[#1c1917]">"{project.title}"</span> 프로젝트를 삭제하시겠습니까?
                <br />
                <span className="text-sm text-orange-600">휴지통으로 이동되며, 30일 이내에 복구할 수 있습니다.</span>
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2 text-[#44403c] hover:bg-[#f5f5f4] rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 프로젝트 정보 수정 모달 */}
      {/* 통합 프로젝트 수정 모달 (탭 방식) */}
      {isProjectEditModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto animate-modal-overlay">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={cancelProjectEditModal}
          />

          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="relative bg-gray-50 rounded-lg shadow-xl max-w-4xl w-full animate-modal-content"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="sticky top-0 bg-gray-50 px-6 py-4 border-b border-divider rounded-t-lg">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">프로젝트 수정</h2>
                  <button
                    onClick={cancelProjectEditModal}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-gray-500" />
                  </button>
                </div>

                {/* 탭 네비게이션 */}
                <div className="flex gap-2 border-b border-divider bg-gray-50 px-2 rounded-t-lg overflow-x-auto no-scrollbar">
                  <button
                    onClick={() => setActiveEditTab('basic')}
                    className={`flex flex-shrink-0 items-center gap-2 px-5 py-3 text-sm font-medium transition-all relative rounded-t-lg whitespace-nowrap ${
                      activeEditTab === 'basic'
                        ? 'text-orange-600 bg-gray-50 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <FileText size={18} />
                    기본 정보
                    {activeEditTab === 'basic' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 rounded-full" />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveEditTab('workers')}
                    className={`flex flex-shrink-0 items-center gap-2 px-5 py-3 text-sm font-medium transition-all relative rounded-t-lg whitespace-nowrap ${
                      activeEditTab === 'workers'
                        ? 'text-orange-600 bg-gray-50 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Users size={18} />
                    작업자 정보
                    {activeEditTab === 'workers' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 rounded-full" />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveEditTab('budget')}
                    className={`flex flex-shrink-0 items-center gap-2 px-5 py-3 text-sm font-medium transition-all relative rounded-t-lg whitespace-nowrap ${
                      activeEditTab === 'budget'
                        ? 'text-orange-600 bg-gray-50 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <DollarSign size={18} />
                    비용 정보
                    {activeEditTab === 'budget' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 rounded-full" />
                    )}
                  </button>
                </div>
              </div>

              {/* 탭 내용 */}
              <div className="p-6 max-h-[70vh] overflow-y-auto bg-gray-50">
                {activeEditTab === 'basic' && (
                  <div className="space-y-5">
                    {/* 프로젝트 기본 정보 카드 */}
                    <div className="bg-gray-50 rounded-xl p-5 shadow-sm border border-divider">
                      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <FileText size={18} className="text-orange-600" />
                        프로젝트 기본
                      </h3>
                      <div className="space-y-4">
                        {/* 프로젝트 이름 */}
                        <FloatingLabelInput
                          label="프로젝트 이름"
                          required
                          type="text"
                          value={tempEditedProject.title || ''}
                          onChange={(e) => setTempEditedProject({ ...tempEditedProject, title: e.target.value })}
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* 프로젝트 상태 - 커스텀 드롭다운 */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                              <Target size={14} className="text-gray-500" />
                              프로젝트 상태 <span className="text-gray-400 text-xs">(선택)</span>
                            </label>
                            <div className="relative" ref={statusDropdownRef}>
                              <button
                                type="button"
                                onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                                className={`w-full pl-10 pr-10 py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all cursor-pointer font-medium text-left ${
                                  (tempEditedProject.status || project?.status) === 'planning' ? 'border-orange-300 bg-orange-50 text-orange-700' :
                                  (tempEditedProject.status || project?.status) === 'in_progress' ? 'border-green-300 bg-green-50 text-green-700' :
                                  (tempEditedProject.status || project?.status) === 'completed' ? 'border-gray-300 bg-gray-50 text-gray-700' :
                                  'border-yellow-300 bg-yellow-50 text-yellow-700'
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  {(tempEditedProject.status || project?.status) === 'planning' && '시작 전'}
                                  {(tempEditedProject.status || project?.status) === 'in_progress' && '진행 중'}
                                  {(tempEditedProject.status || project?.status) === 'completed' && '완료'}
                                  {(tempEditedProject.status || project?.status) === 'on_hold' && '보류'}
                                </span>
                              </button>
                              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                {(tempEditedProject.status || project?.status) === 'planning' && <Clock size={16} className="text-orange-600" />}
                                {(tempEditedProject.status || project?.status) === 'in_progress' && <TrendingUp size={16} className="text-green-600" />}
                                {(tempEditedProject.status || project?.status) === 'completed' && <CheckCircle2 size={16} className="text-gray-600" />}
                                {(tempEditedProject.status || project?.status) === 'on_hold' && <Pause size={16} className="text-yellow-600" />}
                              </div>
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronRight size={16} className={`text-gray-500 transition-transform ${isStatusDropdownOpen ? 'rotate-90' : 'rotate-0'}`} />
                              </div>
                              {isStatusDropdownOpen && (
                                <div className="absolute z-50 w-full mt-2 bg-white border-2 border-divider rounded-xl shadow-xl overflow-hidden animate-modal-content">
                                  {([
                                    { value: 'planning', label: '시작 전', icon: Clock, color: 'orange' as const, desc: '프로젝트 기획 단계' },
                                    { value: 'in_progress', label: '진행 중', icon: TrendingUp, color: 'green' as const, desc: '현재 작업 진행 중' },
                                    { value: 'completed', label: '완료', icon: CheckCircle2, color: 'gray' as const, desc: '프로젝트 완료됨' },
                                    { value: 'on_hold', label: '보류', icon: Pause, color: 'yellow' as const, desc: '일시적으로 중단' }
                                  ]).map((status) => {
                                    const Icon = status.icon;
                                    const isSelected = (tempEditedProject.status || project?.status) === status.value;
                                    // 동적 Tailwind 클래스는 purge되어 색이 안 나옴 — color별 정적 매핑.
                                    const colorCls = {
                                      orange: { hover: 'hover:bg-orange-50', selBg: 'bg-orange-50', icon: 'text-orange-600' },
                                      green: { hover: 'hover:bg-green-50', selBg: 'bg-green-50', icon: 'text-green-600' },
                                      gray: { hover: 'hover:bg-gray-50', selBg: 'bg-gray-50', icon: 'text-gray-600' },
                                      yellow: { hover: 'hover:bg-yellow-50', selBg: 'bg-yellow-50', icon: 'text-yellow-600' },
                                    }[status.color];
                                    return (
                                      <button
                                        key={status.value}
                                        type="button"
                                        onClick={() => {
                                          setTempEditedProject({ ...tempEditedProject, status: status.value as Project['status'] });
                                          setIsStatusDropdownOpen(false);
                                        }}
                                        className={`w-full px-4 py-3 flex items-center gap-3 ${colorCls.hover} transition-colors ${
                                          isSelected ? colorCls.selBg : ''
                                        }`}
                                      >
                                        <Icon size={18} className={`${colorCls.icon} flex-shrink-0`} />
                                        <div className="flex-1 text-left">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-gray-900">{status.label}</span>
                                            {isSelected && <CheckCircle2 size={14} className="text-orange-600" />}
                                          </div>
                                          <p className="text-xs text-gray-500 mt-0.5">{status.desc}</p>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 클라이언트 - 커스텀 드롭다운 */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                              <UserCircle size={14} className="text-gray-500" />
                              클라이언트 <span className="text-gray-400 text-xs">(선택)</span>
                            </label>
                            <div className="relative" ref={clientDropdownRef}>
                              <button
                                type="button"
                                onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                                className="w-full pl-10 pr-10 py-2.5 border-2 border-gray-300 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:bg-white transition-all cursor-pointer font-medium text-gray-700 hover:border-gray-400 text-left"
                              >
                                {tempSelectedClient || '클라이언트를 선택하세요'}
                              </button>
                              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <User size={16} className="text-gray-500" />
                              </div>
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronRight size={16} className={`text-gray-500 transition-transform ${isClientDropdownOpen ? 'rotate-90' : 'rotate-0'}`} />
                              </div>
                              {isClientDropdownOpen && (
                                <div className="absolute z-50 w-full mt-2 bg-white border-2 border-divider rounded-xl shadow-xl max-h-64 overflow-y-auto animate-modal-content">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTempSelectedClient('');
                                      setIsClientDropdownOpen(false);
                                    }}
                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                                  >
                                    <UserCircle size={18} className="text-gray-400 flex-shrink-0" />
                                    <span className="text-sm font-medium text-gray-400 italic">클라이언트 선택 안 함</span>
                                  </button>
                                  {clients.filter(c => c.status === 'active').map((client) => {
                                    const isSelected = tempSelectedClient === client.name;
                                    return (
                                      <button
                                        key={client.id}
                                        type="button"
                                        onClick={() => {
                                          setTempSelectedClient(client.name);
                                          setIsClientDropdownOpen(false);
                                        }}
                                        className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-orange-50 transition-colors ${
                                          isSelected ? 'bg-orange-50' : ''
                                        }`}
                                      >
                                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                                          <Building2 size={15} className="text-orange-500" />
                                        </div>
                                        <div className="flex-1 text-left">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-gray-900">{client.name}</span>
                                            {isSelected && <CheckCircle2 size={14} className="text-orange-600" />}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 설명 */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            프로젝트 설명 <span className="text-gray-400 text-xs">(선택)</span>
                          </label>
                          <textarea
                            value={tempEditedProject.description || ''}
                            onChange={(e) => setTempEditedProject({ ...tempEditedProject, description: e.target.value })}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent min-h-[100px] transition-shadow resize-none"
                            placeholder="프로젝트에 대한 설명을 입력하세요"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 분류 및 작업 카드 */}
                    <div className="bg-gray-50 rounded-xl p-5 shadow-sm border border-divider">
                      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Tag size={18} className="text-orange-600" />
                        분류 및 작업
                      </h3>
                      <div className="space-y-4">
                        {/* 분류 + 상영 채널 */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* 분류 */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                              <Tag size={14} className="text-gray-500" />
                              분류 <span className="text-gray-400 text-xs">(선택)</span>
                            </label>
                            <div className="relative" ref={categoryDropdownRef}>
                              <button
                                type="button"
                                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                                className={`w-full pl-10 pr-10 py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all cursor-pointer font-medium text-left ${
                                  tempSelectedCategory ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-gray-300 bg-white text-gray-500'
                                }`}
                              >
                                <span>{tempSelectedCategory || '선택하세요'}</span>
                              </button>
                              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <Palette size={16} className={tempSelectedCategory ? 'text-orange-600' : 'text-gray-400'} />
                              </div>
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronRight size={16} className={`text-gray-500 transition-transform ${isCategoryDropdownOpen ? 'rotate-90' : 'rotate-0'}`} />
                              </div>
                              {isCategoryDropdownOpen && (
                                <div className="absolute z-50 w-full mt-2 bg-white border-2 border-divider rounded-xl shadow-xl overflow-hidden animate-modal-content">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTempSelectedCategory('');
                                      setIsCategoryDropdownOpen(false);
                                    }}
                                    className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                                      tempSelectedCategory === '' ? 'bg-gray-50' : ''
                                    }`}
                                  >
                                    <X size={16} className="text-gray-400 flex-shrink-0" />
                                    <span className="text-sm font-medium text-gray-500">선택 안 함</span>
                                  </button>
                                  {[
                                    { value: '예능', desc: '예능 프로그램 콘텐츠' },
                                    { value: '교양', desc: '교양/다큐 콘텐츠' },
                                    { value: '쇼양', desc: '쇼+교양 콘텐츠' },
                                    { value: '스케치', desc: '스케치/현장 콘텐츠' },
                                    { value: '모션그래픽', desc: '모션그래픽 콘텐츠' },
                                  ].map((category) => {
                                    const isSelected = tempSelectedCategory === category.value;
                                    return (
                                      <button
                                        key={category.value}
                                        type="button"
                                        onClick={() => {
                                          setTempSelectedCategory(category.value);
                                          setIsCategoryDropdownOpen(false);
                                        }}
                                        className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-orange-50 transition-colors ${
                                          isSelected ? 'bg-orange-50' : ''
                                        }`}
                                      >
                                        <Palette size={16} className={`flex-shrink-0 ${isSelected ? 'text-orange-600' : 'text-gray-400'}`} />
                                        <div className="flex-1 text-left">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-gray-900">{category.value}</span>
                                            {isSelected && <CheckCircle2 size={14} className="text-orange-600" />}
                                          </div>
                                          <p className="text-xs text-gray-500 mt-0.5">{category.desc}</p>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 상영 채널 */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                              <Tv size={14} className="text-gray-500" />
                              상영 채널 <span className="text-gray-400 text-xs">(복수 선택)</span>
                            </label>
                            <div className="relative" ref={channelDropdownRef}>
                              <button
                                type="button"
                                onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
                                className={`w-full pl-10 pr-10 py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all cursor-pointer font-medium text-left ${
                                  tempChannels.length > 0 ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-gray-300 bg-white text-gray-500'
                                }`}
                              >
                                <span className="truncate block">{tempChannels.length > 0 ? tempChannels.join(', ') : '선택하세요'}</span>
                              </button>
                              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <Tv size={16} className={tempChannels.length > 0 ? 'text-purple-600' : 'text-gray-400'} />
                              </div>
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <ChevronRight size={16} className={`text-gray-500 transition-transform ${isChannelDropdownOpen ? 'rotate-90' : 'rotate-0'}`} />
                              </div>
                              {isChannelDropdownOpen && (
                                <div className="absolute z-50 w-full mt-2 bg-white border-2 border-divider rounded-xl shadow-xl overflow-hidden animate-modal-content">
                                  {[
                                    { value: '유튜브', icon: Youtube, desc: 'YouTube 채널' },
                                    { value: '레거시 미디어', icon: Monitor, desc: 'TV/방송 미디어' },
                                    { value: '인스타', icon: Camera, desc: 'Instagram 릴스/피드' },
                                  ].map((channel) => {
                                    const Icon = channel.icon;
                                    const isSelected = tempChannels.includes(channel.value);
                                    return (
                                      <button
                                        key={channel.value}
                                        type="button"
                                        onClick={() => {
                                          if (isSelected) {
                                            setTempChannels(tempChannels.filter(c => c !== channel.value));
                                          } else {
                                            setTempChannels([...tempChannels, channel.value]);
                                          }
                                        }}
                                        className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-purple-50 transition-colors ${
                                          isSelected ? 'bg-purple-50' : ''
                                        }`}
                                      >
                                        <Icon size={16} className={`flex-shrink-0 ${isSelected ? 'text-purple-600' : 'text-gray-400'}`} />
                                        <div className="flex-1 text-left">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-gray-900">{channel.value}</span>
                                            {isSelected && <CheckCircle2 size={14} className="text-purple-600" />}
                                          </div>
                                          <p className="text-xs text-gray-500 mt-0.5">{channel.desc}</p>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 작업 내용 */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                            <Video size={14} className="text-gray-500" />
                            작업 내용 <span className="text-gray-400 text-xs">(복수 선택)</span>
                          </label>
                          <div className="relative" ref={workContentDropdownRef}>
                            <button
                              type="button"
                              onClick={() => setIsWorkContentDropdownOpen(!isWorkContentDropdownOpen)}
                              className={`w-full pl-10 pr-10 py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all cursor-pointer font-medium text-left ${
                                tempWorkContent.length > 0 ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 bg-white text-gray-500'
                              }`}
                            >
                              <span>{tempWorkContent.length > 0 ? tempWorkContent.join(', ') : '선택하세요'}</span>
                            </button>
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                              <ClipboardCheck size={16} className={tempWorkContent.length > 0 ? 'text-green-600' : 'text-gray-400'} />
                            </div>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                              <ChevronRight size={16} className={`text-gray-500 transition-transform ${isWorkContentDropdownOpen ? 'rotate-90' : 'rotate-0'}`} />
                            </div>
                            {isWorkContentDropdownOpen && (
                              <div className="absolute z-50 w-full mt-2 bg-white border-2 border-divider rounded-xl shadow-xl overflow-hidden animate-modal-content">
                                {[
                                  { value: '롱폼' as const, icon: Video, desc: '롱폼 영상 편집' },
                                  { value: '기획 숏폼' as const, icon: Video, desc: '기획 숏폼 영상 편집' },
                                  { value: '본편 숏폼' as const, icon: Video, desc: '본편 기반 숏폼 편집' },
                                  { value: '썸네일' as const, icon: Image, desc: '썸네일 디자인' },
                                ].map((work) => {
                                  const Icon = work.icon;
                                  const isSelected = tempWorkContent.includes(work.value);
                                  return (
                                    <button
                                      key={work.value}
                                      type="button"
                                      onClick={() => {
                                        if (isSelected) {
                                          setTempWorkContent(tempWorkContent.filter(w => w !== work.value));
                                        } else {
                                          setTempWorkContent([...tempWorkContent, work.value]);
                                        }
                                      }}
                                      className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-green-50 transition-colors ${
                                        isSelected ? 'bg-green-50' : ''
                                      }`}
                                    >
                                      <Icon size={16} className={`flex-shrink-0 ${isSelected ? 'text-green-600' : 'text-gray-400'}`} />
                                      <div className="flex-1 text-left">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-semibold text-gray-900">{work.value}</span>
                                          {isSelected && <CheckCircle2 size={14} className="text-green-600" />}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">{work.desc}</p>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeEditTab === 'workers' && (
                  <div className="space-y-5">
                    {/* 매니저 카드 */}
                    <div className="bg-gray-50 rounded-xl p-5 shadow-sm border border-divider">
                      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <UserCircle size={18} className="text-orange-600" />
                        매니저 <span className="text-gray-400 text-xs font-normal">(선택)</span>
                      </h3>
                      <div className="space-y-3">
                        {tempManagerIds.length === 0 ? (
                          <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-divider">
                            <UserCircle size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm text-gray-500">매니저를 추가해보세요</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {tempManagerIds.map((managerId) => {
                              const manager = allPartners.find(p => p.id === managerId);
                              return manager ? (
                                <div key={managerId} className="flex items-center gap-3 p-3 bg-gradient-to-r from-orange-50 to-orange-100 border border-orange-100 rounded-lg group hover:shadow-md transition-all">
                                  <div className="flex-shrink-0 w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center text-white font-semibold shadow-sm">
                                    {manager.name.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{manager.name}</p>
                                    <p className="text-xs text-orange-600 font-medium">매니저</p>
                                  </div>
                                  <button
                                    onClick={() => setTempManagerIds(tempManagerIds.filter(id => id !== managerId))}
                                    className="flex-shrink-0 p-2.5 sm:p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : null;
                            })}
                          </div>
                        )}
                        <div className="relative" ref={managerDropdownRef}>
                          <button
                            type="button"
                            onClick={() => setIsManagerDropdownOpen(!isManagerDropdownOpen)}
                            className="w-full pl-10 pr-10 py-2.5 border-2 border-orange-300 bg-orange-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus:bg-white transition-all cursor-pointer font-medium text-orange-700 hover:border-orange-400 text-left"
                          >
                            + 매니저 추가
                          </button>
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <UserCircle size={16} className="text-orange-600" />
                          </div>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <ChevronRight size={16} className={`text-orange-600 transition-transform ${isManagerDropdownOpen ? 'rotate-90' : 'rotate-0'}`} />
                          </div>
                          {isManagerDropdownOpen && allPartners.filter(p => !tempManagerIds.includes(p.id)).length > 0 && (
                            <div className="absolute z-50 w-full mt-2 bg-white border-2 border-orange-200 rounded-xl shadow-xl max-h-64 overflow-y-auto animate-modal-content">
                              {allPartners.filter(p => !tempManagerIds.includes(p.id)).map((manager) => (
                                <button
                                  key={manager.id}
                                  type="button"
                                  onClick={() => {
                                    setTempManagerIds([...tempManagerIds, manager.id]);
                                    setIsManagerDropdownOpen(false);
                                  }}
                                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-orange-50 transition-colors text-left"
                                >
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
                                    {manager.name.charAt(0)}
                                  </div>
                                  <div className="flex-1">
                                    <span className="text-sm font-semibold text-gray-900">{manager.name}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 담당 파트너 카드 */}
                    <div className="bg-gray-50 rounded-xl p-5 shadow-sm border border-divider">
                      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Users size={18} className="text-green-600" />
                        담당 파트너 <span className="text-gray-400 text-xs font-normal">(선택)</span>
                      </h3>
                      <div className="space-y-3">
                        {tempPartnerIds.length === 0 ? (
                          <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-divider">
                            <Users size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm text-gray-500">파트너를 추가해보세요</p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {tempPartnerIds.map((partnerId) => {
                              const partner = allPartners.find(p => p.id === partnerId);
                              return partner ? (
                                <div key={partnerId} className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-50 to-green-100 border border-green-100 rounded-lg group hover:shadow-md transition-all">
                                  <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                                    <User size={20} className="text-orange-500" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">{partner.name}</p>
                                    <p className="text-xs text-green-600 font-medium">파트너</p>
                                  </div>
                                  <button
                                    onClick={() => setTempPartnerIds(tempPartnerIds.filter(id => id !== partnerId))}
                                    className="flex-shrink-0 p-2.5 sm:p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : null;
                            })}
                          </div>
                        )}
                        <div className="relative" ref={partnerDropdownRef}>
                          <button
                            type="button"
                            onClick={() => setIsPartnerDropdownOpen(!isPartnerDropdownOpen)}
                            className="w-full pl-10 pr-10 py-2.5 border-2 border-green-300 bg-green-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition-all cursor-pointer font-medium text-green-700 hover:border-green-400 text-left"
                          >
                            + 파트너 추가
                          </button>
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <Users size={16} className="text-green-600" />
                          </div>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <ChevronRight size={16} className={`text-green-600 transition-transform ${isPartnerDropdownOpen ? 'rotate-90' : 'rotate-0'}`} />
                          </div>
                          {isPartnerDropdownOpen && allPartners.filter(p => !tempPartnerIds.includes(p.id)).length > 0 && (
                            <div className="absolute z-50 w-full mt-2 bg-white border-2 border-green-200 rounded-xl shadow-xl max-h-64 overflow-y-auto animate-modal-content">
                              {allPartners.filter(p => !tempPartnerIds.includes(p.id)).map((partner) => (
                                <button
                                  key={partner.id}
                                  type="button"
                                  onClick={() => {
                                    setTempPartnerIds([...tempPartnerIds, partner.id]);
                                    setIsPartnerDropdownOpen(false);
                                  }}
                                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-green-50 transition-colors text-left"
                                >
                                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                                    <User size={16} className="text-orange-500" />
                                  </div>
                                  <div className="flex-1">
                                    <span className="text-sm font-semibold text-gray-900">{partner.name}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeEditTab === 'budget' && (
                  <div className="space-y-5">
                    {/* 전체 비용 카드 */}
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100/80 rounded-xl p-6 shadow-sm border-2 border-orange-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-orange-700">프로젝트 총 비용</h3>
                        <DollarSign size={24} className="text-orange-500" />
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          value={formatCurrency(tempTotalAmount)}
                          onChange={(e) => updateTempTotalAmount(e.target.value)}
                          className="w-full px-4 py-3 pr-16 text-2xl sm:text-3xl font-bold bg-gray-50 border-2 border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 placeholder-gray-400 transition-all"
                          placeholder="0"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 font-medium">원</span>
                      </div>
                      <p className="text-xs text-orange-600 mt-2">아래 작업별 비용의 합계와 다를 수 있습니다</p>
                    </div>

                    {/* 작업별 비용 */}
                    <div className="bg-gray-50 rounded-xl p-5 shadow-sm border border-divider">
                      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Tag size={18} className="text-orange-600" />
                        작업별 비용 <span className="text-gray-400 text-xs font-normal">(선택)</span>
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* 롱폼 */}
                        <div className={`bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border-2 shadow-sm hover:shadow-md transition-all ${
                          tempWorkContent.includes('롱폼') ? 'border-divider opacity-100' : 'border-divider opacity-40'
                        }`}>
                          <div className="flex items-center gap-2 mb-3">
                            <Video size={18} className="text-gray-600" />
                            <p className="text-sm font-bold text-gray-900">롱폼</p>
                            {!tempWorkContent.includes('롱폼') && (
                              <span className="ml-auto text-xs text-gray-400 italic">미선택</span>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-medium text-gray-600 block mb-1.5">파트너 비용</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={formatCurrency(tempWorkTypeCosts['롱폼'].partnerCost)}
                                  onChange={(e) => updateTempWorkTypeCost('롱폼', 'partnerCost', e.target.value)}
                                  className="w-full px-3 py-2.5 pr-10 border-2 border-divider rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-gray-50 transition-all"
                                  placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">원</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 block mb-1.5">매니징 비용</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={formatCurrency(tempWorkTypeCosts['롱폼'].managementCost)}
                                  onChange={(e) => updateTempWorkTypeCost('롱폼', 'managementCost', e.target.value)}
                                  className="w-full px-3 py-2.5 pr-10 border-2 border-divider rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-gray-50 transition-all"
                                  placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">원</span>
                              </div>
                            </div>
                            <div className="pt-2 mt-2 border-t-2 border-divider">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-gray-600">소계</span>
                                <span className="text-sm font-bold text-gray-900">
                                  {formatCurrency(tempWorkTypeCosts['롱폼'].partnerCost + tempWorkTypeCosts['롱폼'].managementCost)}원
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 기획 숏폼 */}
                        <div className={`bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border-2 shadow-sm hover:shadow-md transition-all ${
                          tempWorkContent.includes('기획 숏폼') ? 'border-divider opacity-100' : 'border-divider opacity-40'
                        }`}>
                          <div className="flex items-center gap-2 mb-3">
                            <Video size={18} className="text-gray-600" />
                            <p className="text-sm font-bold text-gray-900">기획 숏폼</p>
                            {!tempWorkContent.includes('기획 숏폼') && (
                              <span className="ml-auto text-xs text-gray-400 italic">미선택</span>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-medium text-gray-600 block mb-1.5">파트너 비용</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={formatCurrency(tempWorkTypeCosts['기획 숏폼'].partnerCost)}
                                  onChange={(e) => updateTempWorkTypeCost('기획 숏폼', 'partnerCost', e.target.value)}
                                  className="w-full px-3 py-2.5 pr-10 border-2 border-divider rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-gray-50 transition-all"
                                  placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">원</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 block mb-1.5">매니징 비용</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={formatCurrency(tempWorkTypeCosts['기획 숏폼'].managementCost)}
                                  onChange={(e) => updateTempWorkTypeCost('기획 숏폼', 'managementCost', e.target.value)}
                                  className="w-full px-3 py-2.5 pr-10 border-2 border-divider rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-gray-50 transition-all"
                                  placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">원</span>
                              </div>
                            </div>
                            <div className="pt-2 mt-2 border-t-2 border-divider">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-gray-600">소계</span>
                                <span className="text-sm font-bold text-gray-900">
                                  {formatCurrency(tempWorkTypeCosts['기획 숏폼'].partnerCost + tempWorkTypeCosts['기획 숏폼'].managementCost)}원
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 본편 숏폼 */}
                        <div className={`bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border-2 shadow-sm hover:shadow-md transition-all ${
                          tempWorkContent.includes('본편 숏폼') ? 'border-divider opacity-100' : 'border-divider opacity-40'
                        }`}>
                          <div className="flex items-center gap-2 mb-3">
                            <Video size={18} className="text-gray-600" />
                            <p className="text-sm font-bold text-gray-900">본편 숏폼</p>
                            {!tempWorkContent.includes('본편 숏폼') && (
                              <span className="ml-auto text-xs text-gray-400 italic">미선택</span>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-medium text-gray-600 block mb-1.5">파트너 비용</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={formatCurrency(tempWorkTypeCosts['본편 숏폼'].partnerCost)}
                                  onChange={(e) => updateTempWorkTypeCost('본편 숏폼', 'partnerCost', e.target.value)}
                                  className="w-full px-3 py-2.5 pr-10 border-2 border-divider rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-gray-50 transition-all"
                                  placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">원</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 block mb-1.5">매니징 비용</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={formatCurrency(tempWorkTypeCosts['본편 숏폼'].managementCost)}
                                  onChange={(e) => updateTempWorkTypeCost('본편 숏폼', 'managementCost', e.target.value)}
                                  className="w-full px-3 py-2.5 pr-10 border-2 border-divider rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-gray-50 transition-all"
                                  placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">원</span>
                              </div>
                            </div>
                            <div className="pt-2 mt-2 border-t-2 border-divider">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-gray-600">소계</span>
                                <span className="text-sm font-bold text-gray-900">
                                  {formatCurrency(tempWorkTypeCosts['본편 숏폼'].partnerCost + tempWorkTypeCosts['본편 숏폼'].managementCost)}원
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 썸네일 */}
                        <div className={`bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border-2 shadow-sm hover:shadow-md transition-all ${
                          tempWorkContent.includes('썸네일') ? 'border-divider opacity-100' : 'border-divider opacity-40'
                        }`}>
                          <div className="flex items-center gap-2 mb-3">
                            <Image size={18} className="text-gray-600" />
                            <p className="text-sm font-bold text-gray-900">썸네일</p>
                            {!tempWorkContent.includes('썸네일') && (
                              <span className="ml-auto text-xs text-gray-400 italic">미선택</span>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-medium text-gray-600 block mb-1.5">파트너 비용</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={formatCurrency(tempWorkTypeCosts['썸네일'].partnerCost)}
                                  onChange={(e) => updateTempWorkTypeCost('썸네일', 'partnerCost', e.target.value)}
                                  className="w-full px-3 py-2.5 pr-10 border-2 border-divider rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-gray-50 transition-all"
                                  placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">원</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 block mb-1.5">매니징 비용</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={formatCurrency(tempWorkTypeCosts['썸네일'].managementCost)}
                                  onChange={(e) => updateTempWorkTypeCost('썸네일', 'managementCost', e.target.value)}
                                  className="w-full px-3 py-2.5 pr-10 border-2 border-divider rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-gray-50 transition-all"
                                  placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">원</span>
                              </div>
                            </div>
                            <div className="pt-2 mt-2 border-t-2 border-divider">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-gray-600">소계</span>
                                <span className="text-sm font-bold text-gray-900">
                                  {formatCurrency(tempWorkTypeCosts['썸네일'].partnerCost + tempWorkTypeCosts['썸네일'].managementCost)}원
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* OAP */}
                        <div className="bg-purple-50/50 rounded-xl p-4 border border-purple-100">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-purple-500" />
                            <h4 className="text-sm font-bold text-gray-800">OAP</h4>
                            {tempWorkContent.includes('OAP') ? (
                              <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">선택됨</span>
                            ) : (
                              <span className="ml-auto text-xs text-gray-400 italic">미선택</span>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-medium text-gray-600 block mb-1.5">파트너 비용</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={formatCurrency(tempWorkTypeCosts['OAP'].partnerCost)}
                                  onChange={(e) => updateTempWorkTypeCost('OAP', 'partnerCost', e.target.value)}
                                  className="w-full px-3 py-2.5 pr-10 border-2 border-divider rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-gray-50 transition-all"
                                  placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">원</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 block mb-1.5">매니징 비용</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  value={formatCurrency(tempWorkTypeCosts['OAP'].managementCost)}
                                  onChange={(e) => updateTempWorkTypeCost('OAP', 'managementCost', e.target.value)}
                                  className="w-full px-3 py-2.5 pr-10 border-2 border-divider rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-gray-50 transition-all"
                                  placeholder="0"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">원</span>
                              </div>
                            </div>
                            <div className="pt-2 mt-2 border-t-2 border-divider">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-gray-600">소계</span>
                                <span className="text-sm font-bold text-gray-900">
                                  {formatCurrency(tempWorkTypeCosts['OAP'].partnerCost + tempWorkTypeCosts['OAP'].managementCost)}원
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 푸터 */}
              <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-divider flex justify-end gap-3 rounded-b-lg">
                <button
                  onClick={cancelProjectEditModal}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  취소
                </button>
                <button
                  onClick={saveProjectEditModal}
                  disabled={isSavingProject}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingProject ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 회차 삭제 확인 모달 */}
      {deleteEpisodeId && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDeleteEpisodeId(null)}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="relative bg-[#fafaf9] rounded-lg shadow-xl max-w-md w-full p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[#1c1917] mb-2">회차 삭제</h3>
              <p className="text-[#57534e] mb-6">
                <span className="font-semibold text-[#1c1917]">"{(() => { const ep = episodes.find(ep => ep.id === deleteEpisodeId); return ep?.title?.trim() || (ep ? `${ep.episodeNumber}회차` : ''); })()}"</span>을(를) 삭제하시겠습니까?
                <br />
                <span className="text-sm text-orange-600">휴지통으로 이동되며, 30일 이내에 복구할 수 있습니다.</span>
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setDeleteEpisodeId(null)}
                  className="px-4 py-2 text-[#44403c] hover:bg-[#f5f5f4] rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleDeleteEpisode}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 체크리스트 모달 */}
      {project && <ProjectChecklistModal
        project={project}
        episodes={episodes}
        isOpen={isChecklistModalOpen}
        onClose={() => setIsChecklistModalOpen(false)}
        onEpisodeClick={(episode) => {
          setSelectedEpisodeForDetail(episode);
          setIsChecklistModalOpen(false);
        }}
      />}

      {/* 회차 상세 모달 */}
      {selectedEpisodeForDetail && (
        <EpisodeDetailModal
          episode={selectedEpisodeForDetail}
          partner={allPartners.find(p => p.id === selectedEpisodeForDetail.assignee)}
          partners={allPartners}
          projectWorkTypeCosts={workTypeCosts}
          isOpen={!!selectedEpisodeForDetail}
          onClose={() => setSelectedEpisodeForDetail(null)}
          onSave={async (updatedEpisode) => {
            const ok = await updateEpisodeFields(updatedEpisode.id, updatedEpisode);
            if (ok) {
              setEpisodes(prev =>
                prev.map(e => e.id === updatedEpisode.id ? { ...updatedEpisode, projectId } : e)
              );
              showToastMessage('회차가 저장되었습니다.');
            } else {
              showToastMessage('저장에 실패했습니다. 다시 시도해주세요.');
            }
          }}
        />
      )}

      {/* 토스트 알림 */}
      {showToast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 animate-modal-content">
          <div className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 min-w-[320px]">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <CheckCircle2 size={20} className="text-white" />
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">{toastMessage}</p>
            </div>
            <button
              onClick={() => setShowToast(false)}
              className="flex-shrink-0 p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X size={18} className="text-white" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
