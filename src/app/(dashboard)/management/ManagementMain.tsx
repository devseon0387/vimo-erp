'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getProjects, getPartners, getClients, getAllEpisodes,
  getMyChecklists, insertChecklist, updateChecklist, deleteChecklist,
  insertProject, insertClient, upsertEpisodes, updateEpisodeFields,
} from '@/lib/supabase/db';
import type { ChecklistRow } from '@/lib/supabase/db/users.types';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { Calendar, Plus, Bell, Clock, X, Link2, Search, ChevronLeft, ChevronRight, User, FolderOpen, Building2, Film, SearchX, Check, ArrowRight, AlertTriangle } from 'lucide-react';
import { Project, Episode, Partner, Client, WorkContentType, WorkStep } from '@/types';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const ProjectWizardModal = dynamic(() => import('@/components/ProjectWizardModal'), { ssr: false });
import PartnerStatusStrip from './PartnerStatusStrip';
import MiniCalendar from './MiniCalendar';
import Checklist from './Checklist';
import EpisodeQuickViewContent from './EpisodeQuickViewContent';
import { useToast } from '@/contexts/ToastContext';
import DateTimePicker, { RepeatType } from '@/components/DateTimePicker';
import { useTutorial } from '@/components/tutorial/useTutorial';
import { APP_VERSION_LABEL } from '@/config/version';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

type LinkPickerType = 'episode' | 'project' | 'client' | 'partner' | null;

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  reminderTime?: string;
  notified?: boolean;
  repeatType?: RepeatType;
  repeatDays?: number[];
  createdAt: string;
  // 연결 정보
  linkedEpisodeId?: string;
  linkedEpisodeTitle?: string;
  linkedEpisodeNumber?: number;
  linkedProjectId?: string;
  linkedProjectTitle?: string;
  linkedClientName?: string;
  linkedPartnerId?: string;
  linkedPartnerName?: string;
}

// snake_case DB 행 → camelCase UI 아이템 변환
function rowToItem(row: ChecklistRow): ChecklistItem {
  return {
    id: row.id,
    text: row.text,
    completed: row.completed,
    reminderTime: row.reminder_time ?? undefined,
    notified: row.notified,
    repeatType: (row.repeat_type as RepeatType) ?? undefined,
    repeatDays: row.repeat_days ?? undefined,
    createdAt: row.created_at,
    linkedEpisodeId: row.linked_episode_id ?? undefined,
    linkedEpisodeTitle: row.linked_episode_title ?? undefined,
    linkedEpisodeNumber: row.linked_episode_number ?? undefined,
    linkedProjectId: row.linked_project_id ?? undefined,
    linkedProjectTitle: row.linked_project_title ?? undefined,
    linkedClientName: row.linked_client_name ?? undefined,
    linkedPartnerId: row.linked_partner_id ?? undefined,
    linkedPartnerName: row.linked_partner_name ?? undefined,
  };
}

// camelCase UI 아이템 → snake_case DB 행 변환 (insert/update용)
function itemToRow(item: ChecklistItem): Omit<ChecklistRow, 'id' | 'user_id' | 'created_at'> {
  return {
    text: item.text,
    completed: item.completed,
    reminder_time: item.reminderTime ?? null,
    notified: item.notified ?? false,
    repeat_type: item.repeatType ?? null,
    repeat_days: item.repeatDays ?? null,
    linked_episode_id: item.linkedEpisodeId ?? null,
    linked_episode_title: item.linkedEpisodeTitle ?? null,
    linked_episode_number: item.linkedEpisodeNumber ?? null,
    linked_project_id: item.linkedProjectId ?? null,
    linked_project_title: item.linkedProjectTitle ?? null,
    linked_client_name: item.linkedClientName ?? null,
    linked_partner_id: item.linkedPartnerId ?? null,
    linked_partner_name: item.linkedPartnerName ?? null,
  };
}

export default function ManagementMain() {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allEpisodes, setAllEpisodes] = useState<(Episode & { projectId: string })[]>([]);
  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'checklist'>('today');
  const [mobileChecklistOpen, setMobileChecklistOpen] = useState(false);
  const [quickViewEpisode, setQuickViewEpisode] = useState<(Episode & { projectId: string }) | null>(null);

  // Esc 키로 인스펙터 닫기
  useEffect(() => {
    if (!quickViewEpisode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuickViewEpisode(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [quickViewEpisode]);
  const [tabDirection, setTabDirection] = useState(1);

  const TAB_ORDER = ['checklist', 'today', 'week'] as const;
  const switchTab = (tab: 'today' | 'week' | 'checklist') => {
    setTabDirection(TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(activeTab) ? 1 : -1);
    setActiveTab(tab);
  };
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // 튜토리얼 스텝에 맞춰 탭 자동 전환
  const { isActive: tutorialActive, steps: tutorialSteps, currentStepIndex: tutorialStepIdx } = useTutorial();
  useEffect(() => {
    if (!tutorialActive) return;
    const target = tutorialSteps[tutorialStepIdx]?.target;
    if (target === 'tour-mgmt-checklist' || target === 'tour-mgmt-calendar') {
      if (activeTab !== 'checklist') switchTab('checklist');
    }
  }, [tutorialActive, tutorialStepIdx, tutorialSteps, activeTab]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === 'new-project') setIsWizardOpen(true);
    };
    window.addEventListener('fab:action', handler);
    const newProjHandler = () => setIsWizardOpen(true);
    window.addEventListener('mgmt:new-project', newProjHandler);
    return () => {
      window.removeEventListener('fab:action', handler);
      window.removeEventListener('mgmt:new-project', newProjHandler);
    };
  }, []);

  const handleProjectWizardComplete = async (data: {
    startType: 'with-client' | 'project-only';
    client?: { isNew: boolean; id?: string; name?: string; contact?: string; email?: string };
    project: { title: string; category: string; description?: string; partnerIds: string[] };
    episodes: { shouldCreate: boolean; count?: number; dates?: Array<{ startDate: string; endDate: string }> };
  }) => {
    if (!data.project.title) {
      setIsWizardOpen(false);
      return;
    }

    // 1. 신규 클라이언트 생성
    let clientName = '';
    if (data.client?.isNew && data.client.name) {
      const saved = await insertClient({ name: data.client.name, contactPerson: data.client.contact, email: data.client.email, status: 'active' });
      clientName = saved?.name || data.client.name;
      if (saved) setClients(prev => [saved, ...prev]);
    } else if (data.client?.id) {
      clientName = clients.find(c => c.id === data.client!.id)?.name || '';
    }

    // 2. 프로젝트 생성
    const savedProject = await insertProject({
      title: data.project.title,
      description: data.project.description || '',
      client: clientName,
      partnerId: data.project.partnerIds[0] || '',
      partnerIds: data.project.partnerIds,
      managerIds: [],
      category: data.project.category,
      status: 'planning',
      budget: { totalAmount: 0, partnerPayment: 0, managementFee: 0, marginRate: 0 },
      workContent: [],
      tags: data.project.category ? [data.project.category] : [],
    });

    if (!savedProject) { setIsWizardOpen(false); return; }
    setProjects(prev => [savedProject, ...prev]);

    // 3. 회차 생성
    if (data.episodes.shouldCreate && data.episodes.count) {
      const now = new Date().toISOString();
      const episodes: (Episode & { projectId: string })[] = Array.from({ length: data.episodes.count }, (_, i) => ({
        id: crypto.randomUUID(),
        projectId: savedProject.id,
        episodeNumber: i + 1,
        title: `${i + 1}회차`,
        workContent: [] as WorkContentType[],
        status: 'waiting' as const,
        assignee: '',
        manager: '',
        startDate: data.episodes.dates?.[i]?.startDate || '',
        endDate: data.episodes.dates?.[i]?.endDate || '',
        createdAt: now,
        updatedAt: now,
      }));
      const ok = await upsertEpisodes(episodes);
      if (ok) setAllEpisodes(prev => [...prev, ...episodes]);
    }

    setIsWizardOpen(false);
  };

  // 체크리스트 상태
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [newItemReminder, setNewItemReminder] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showReminderInput, setShowReminderInput] = useState(false);
  const [repeatType, setRepeatType] = useState<RepeatType>('none');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [activeLinkPicker, setActiveLinkPicker] = useState<LinkPickerType>(null);
  const [linkSearch, setLinkSearch] = useState('');
  // 달력 블록 상태
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<string | null>(null);
  // 현재 작성 중인 항목의 링크 상태
  const [formLink, setFormLink] = useState<{
    episodeId?: string; episodeTitle?: string; episodeNumber?: number;
    projectId?: string; projectTitle?: string;
    clientName?: string;
    partnerId?: string; partnerName?: string;
  }>({});
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const linkPickerRef = useRef<HTMLDivElement>(null);
  const notificationPermission = useRef<NotificationPermission>('default');

  // 체크리스트 새로고침
  const refreshChecklists = async () => {
    const rows = await getMyChecklists();
    setChecklistItems(rows.map(rowToItem));
  };

  const addChecklistItem = async () => {
    if (!newItemText.trim()) return;
    const newItem: ChecklistItem = {
      id: '',
      text: newItemText.trim(),
      completed: false,
      reminderTime: newItemReminder || undefined,
      notified: false,
      repeatType: repeatType !== 'none' ? repeatType : undefined,
      repeatDays: repeatType === 'days' ? repeatDays : undefined,
      createdAt: new Date().toISOString(),
      linkedEpisodeId: formLink.episodeId,
      linkedEpisodeTitle: formLink.episodeTitle,
      linkedEpisodeNumber: formLink.episodeNumber,
      linkedProjectId: formLink.projectId,
      linkedProjectTitle: formLink.projectTitle,
      linkedClientName: formLink.clientName,
      linkedPartnerId: formLink.partnerId,
      linkedPartnerName: formLink.partnerName,
    };
    const saved = await insertChecklist(itemToRow(newItem));
    if (!saved) {
      toast.error('체크리스트 추가에 실패했습니다. 다시 시도해주세요.');
      return;
    }
    await refreshChecklists();
    setNewItemText('');
    setNewItemReminder('');
    setShowAddForm(false);
    setShowReminderInput(false);
    setFormLink({});
    setActiveLinkPicker(null);
  };

  const resetInlineForm = () => {
    setShowAddForm(false);
    setNewItemText('');
    setNewItemReminder('');
    setShowReminderInput(false);
    setRepeatType('none');
    setRepeatDays([]);
    setFormLink({});
    setActiveLinkPicker(null);
    setLinkSearch('');
  };

  // 회차 선택 → 프로젝트/클라이언트/파트너 자동 연결
  const selectEpisode = (episode: Episode & { projectId?: string }) => {
    const project = projects.find(p => p.id === episode.projectId);
    const partner = project ? partners.find(p => p.id === project.partnerId) : undefined;
    setFormLink({
      episodeId: episode.id,
      episodeTitle: episode.title,
      episodeNumber: episode.episodeNumber,
      projectId: project?.id,
      projectTitle: project?.title,
      clientName: project?.client,
      partnerId: partner?.id,
      partnerName: partner?.name,
    });
    setActiveLinkPicker(null);
    setLinkSearch('');
  };

  // 프로젝트 선택 → 클라이언트/파트너 자동 연결
  const selectProject = (project: Project) => {
    const partner = partners.find(p => p.id === project.partnerId);
    setFormLink(prev => ({
      ...prev,
      episodeId: undefined, episodeTitle: undefined, episodeNumber: undefined,
      projectId: project.id,
      projectTitle: project.title,
      clientName: project.client,
      partnerId: partner?.id,
      partnerName: partner?.name,
    }));
    setActiveLinkPicker(null);
    setLinkSearch('');
  };

  const selectClient = (name: string) => {
    setFormLink(prev => ({ ...prev, clientName: name }));
    setActiveLinkPicker(null);
    setLinkSearch('');
  };

  const selectPartner = (partner: Partner) => {
    setFormLink(prev => ({ ...prev, partnerId: partner.id, partnerName: partner.name }));
    setActiveLinkPicker(null);
    setLinkSearch('');
  };

  const clearLink = (type: 'episode' | 'project' | 'client' | 'partner') => {
    if (type === 'episode') {
      setFormLink({});
    } else if (type === 'project') {
      setFormLink(prev => ({ ...prev, projectId: undefined, projectTitle: undefined, clientName: undefined, partnerId: undefined, partnerName: undefined }));
    } else if (type === 'client') {
      setFormLink(prev => ({ ...prev, clientName: undefined }));
    } else if (type === 'partner') {
      setFormLink(prev => ({ ...prev, partnerId: undefined, partnerName: undefined }));
    }
  };

  // 특정 날짜의 체크리스트 아이템 가져오기
  const getItemsForDate = (dateStr: string): ChecklistItem[] => {
    const date = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = date.getDay();
    return checklistItems.filter(item => {
      if (item.repeatType && item.repeatType !== 'none') {
        if (item.repeatType === 'daily') return true;
        if (item.repeatType === 'weekly') {
          const base = item.reminderTime ? new Date(item.reminderTime) : new Date(item.createdAt);
          return base.getDay() === dayOfWeek;
        }
        if (item.repeatType === 'days') return item.repeatDays?.includes(dayOfWeek) ?? false;
      } else {
        if (item.reminderTime) return item.reminderTime.startsWith(dateStr);
      }
      return false;
    });
  };

  const toggleChecklistItem = async (id: string) => {
    const item = checklistItems.find(i => i.id === id);
    if (!item) return;
    const ok = await updateChecklist(id, { completed: !item.completed });
    if (!ok) {
      toast.error('체크리스트 업데이트에 실패했습니다.');
      return;
    }
    await refreshChecklists();
  };

  const deleteChecklistItem = async (id: string) => {
    const ok = await deleteChecklist(id);
    if (!ok) {
      toast.error('체크리스트 삭제에 실패했습니다.');
      return;
    }
    await refreshChecklists();
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    notificationPermission.current = permission;
  };

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoadError(false);
      const [projectsData, partnersData, clientsData, episodesData, checklistRows] = await Promise.all([
        getProjects(),
        getPartners(),
        getClients(),
        getAllEpisodes(),
        getMyChecklists(),
      ]);
      setProjects(projectsData);
      setPartners(partnersData);
      setClients(clientsData);
      setAllEpisodes(episodesData);
      setChecklistItems(checklistRows.map(rowToItem));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // 알림 권한 상태 초기화
    if ('Notification' in window) {
      notificationPermission.current = Notification.permission;
    }
  }, [loadData]);

  useSupabaseRealtime(['projects', 'episodes', 'partners', 'clients'], loadData);

  // 알림 체크 (30초마다) - checklistItems를 ref로 참조해 인터벌 재생성 방지
  const checklistItemsRef = useRef<ChecklistItem[]>([]);
  useEffect(() => { checklistItemsRef.current = checklistItems; }, [checklistItems]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const now = new Date();
      const itemsToNotify = checklistItemsRef.current.filter(
        item => !item.completed && !item.notified && !!item.reminderTime && new Date(item.reminderTime) <= now
      );
      if (itemsToNotify.length === 0) return;
      await Promise.all(itemsToNotify.map(item => {
        new Notification('Video Moment 체크리스트', {
          body: item.text,
          icon: '/favicon.ico',
        });
        return updateChecklist(item.id, { notified: true });
      }));
      await refreshChecklists();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // 현재 날짜 및 시간 계산 — 마운트 시 고정. 페이지를 자정 넘겨 켜두면 새로고침 필요.
  const { now, todayStart, todayEnd, thisWeekStart, thisWeekEnd, tomorrowStart, tomorrowEnd } = useMemo(() => {
    const n = new Date();
    const ts = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const te = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59);
    const currentDay = n.getDay();
    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
    const ws = new Date(n.getFullYear(), n.getMonth(), n.getDate() + mondayOffset);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    we.setHours(23, 59, 59);
    const tms = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
    const tme = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 23, 59, 59);
    return { now: n, todayStart: ts, todayEnd: te, thisWeekStart: ws, thisWeekEnd: we, tomorrowStart: tms, tomorrowEnd: tme };
  }, []);

  // O(1) 조회용 Maps — `.find()` 매번 호출 패턴 제거
  const projectsById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const partnersById = useMemo(() => new Map(partners.map(p => [p.id, p])), [partners]);

  // 회차들의 한 번 순회로 마감/검수/지연/주간 분류 — 8개 filter+sort 체인 → 1번 순회
  const {
    todayDeadlines, tomorrowDeadlines, todayReviews, overdueEpisodes,
    thisWeekDeadlines, thisWeekCompleted, deadlineCountByDay,
  } = useMemo(() => {
    const todayMs = todayStart.getTime();
    const todayEndMs = todayEnd.getTime();
    const tomorrowMs = tomorrowStart.getTime();
    const tomorrowEndMs = tomorrowEnd.getTime();
    const weekStartMs = thisWeekStart.getTime();
    const weekEndMs = thisWeekEnd.getTime();
    const today: typeof allEpisodes = [];
    const tomorrow: typeof allEpisodes = [];
    const reviews: typeof allEpisodes = [];
    const overdue: typeof allEpisodes = [];
    const weekDue: typeof allEpisodes = [];
    const weekComp: typeof allEpisodes = [];
    const dayMap = new Map<string, number>(); // YYYY-MM-DD → count
    for (const ep of allEpisodes) {
      if (ep.status === 'review') reviews.push(ep);
      if (ep.status === 'completed') {
        if (ep.completedAt) {
          const ms = new Date(ep.completedAt).getTime();
          if (ms >= weekStartMs && ms <= weekEndMs) weekComp.push(ep);
        }
        continue;
      }
      if (!ep.dueDate) continue;
      const dueMs = new Date(ep.dueDate).getTime();
      // 캘린더용 day key (YYYY-MM-DD 첫 10자)
      const dayKey = ep.dueDate.slice(0, 10);
      dayMap.set(dayKey, (dayMap.get(dayKey) ?? 0) + 1);
      if (dueMs < todayMs) overdue.push(ep);
      else if (dueMs >= todayMs && dueMs <= todayEndMs) today.push(ep);
      else if (dueMs >= tomorrowMs && dueMs <= tomorrowEndMs) tomorrow.push(ep);
      if (dueMs >= weekStartMs && dueMs <= weekEndMs && dueMs > todayEndMs) weekDue.push(ep);
    }
    const byDueAsc = (a: typeof allEpisodes[number], b: typeof allEpisodes[number]) =>
      new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime();
    return {
      todayDeadlines: today.sort(byDueAsc),
      tomorrowDeadlines: tomorrow.sort(byDueAsc),
      todayReviews: reviews,
      overdueEpisodes: overdue.sort(byDueAsc),
      thisWeekDeadlines: weekDue.sort(byDueAsc),
      thisWeekCompleted: weekComp,
      deadlineCountByDay: dayMap,
    };
  }, [allEpisodes, todayStart, todayEnd, tomorrowStart, tomorrowEnd, thisWeekStart, thisWeekEnd]);

  const activeProjects = useMemo(
    () => projects.filter(p => p.status === 'in_progress' || p.status === 'planning'),
    [projects]
  );

  const oneTimeItems = useMemo(
    () => checklistItems.filter(i => !i.repeatType || i.repeatType === 'none'),
    [checklistItems]
  );
  const recurringItems = useMemo(
    () => checklistItems.filter(i => i.repeatType && i.repeatType !== 'none'),
    [checklistItems]
  );

  // 파트너별 이번 주 작업 현황 — O(partners × episodes × 4) 였던 nested filter를 1패스로
  const partnerWeeklyWorkload = useMemo(() => {
    const weekStartMs = thisWeekStart.getTime();
    const weekEndMs = thisWeekEnd.getTime();
    const acc = new Map<string, { total: number; completed: number; inProgress: number; waiting: number }>();
    for (const ep of allEpisodes) {
      if (!ep.dueDate || !ep.assignee) continue;
      const dueMs = new Date(ep.dueDate).getTime();
      if (dueMs < weekStartMs || dueMs > weekEndMs) continue;
      const cur = acc.get(ep.assignee) ?? { total: 0, completed: 0, inProgress: 0, waiting: 0 };
      cur.total++;
      if (ep.status === 'completed') cur.completed++;
      else if (ep.status === 'in_progress') cur.inProgress++;
      else if (ep.status === 'waiting') cur.waiting++;
      acc.set(ep.assignee, cur);
    }
    return partners
      .map(partner => ({ partner, ...(acc.get(partner.id) ?? { total: 0, completed: 0, inProgress: 0, waiting: 0 }) }))
      .filter(pw => pw.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [partners, allEpisodes, thisWeekStart, thisWeekEnd]);

  // 헬퍼 함수: 회차의 프로젝트와 파트너 찾기 (Map 사용)
  const getEpisodeDetails = useCallback((episode: Episode & { projectId: string }) => {
    const project = projectsById.get(episode.projectId);
    const partner = partnersById.get(episode.assignee);
    return { project, partner };
  }, [projectsById, partnersById]);

  if (loading) {
    return <LoadingState />;
  }

  if (loadError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="데이터를 불러오지 못했습니다"
        description="네트워크 상태를 확인한 뒤 다시 시도해주세요"
        action={{ label: '다시 시도', onClick: () => { setLoading(true); loadData(); } }}
      />
    );
  }

  return (
    <div className="space-y-5 sm:space-y-8">

      {/* 모바일: 체크리스트 접기/펼치기 */}
      <div className="lg:hidden">
        <div className="bg-white rounded-2xl border border-ink-100 overflow-hidden">
          <button
            onClick={() => setMobileChecklistOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold">체크리스트</span>
              <span className="text-[11px] text-brand-500 font-semibold">{checklistItems.filter(i => !i.completed).length}개 남음</span>
            </div>
            <ChevronRight size={16} className={`text-[var(--color-ink-400)] transition-transform duration-200 ${mobileChecklistOpen ? 'rotate-90' : ''}`} />
          </button>
          {mobileChecklistOpen && (
            <div className="px-4 pb-4 border-t border-[var(--color-ink-200)]">
              <div className="flex flex-col gap-1 mt-3">
                {oneTimeItems.filter(i => !i.completed).map(item => (
                  <div key={item.id} className={`flex items-center gap-2 p-2 rounded-lg ${item.reminderTime ? 'bg-bad-50 border border-red-200' : ''}`}>
                    <button
                      type="button"
                      aria-label={`${item.text} 완료 처리`}
                      onClick={() => toggleChecklistItem(item.id)}
                      className="w-[18px] h-[18px] rounded-[5px] border-2 border-[var(--color-ink-300)] flex-shrink-0 flex items-center justify-center hover:border-brand-500 transition-colors"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-medium block truncate">{item.text}</span>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {item.reminderTime && (
                          <span className="text-[10px] font-semibold text-bad-500 bg-bad-100 px-1.5 py-0.5 rounded"><Clock className="inline align-middle w-2.5 h-2.5" /> {new Date(item.reminderTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                        {item.linkedProjectTitle && (
                          <span className="text-[10px] text-[var(--color-ink-500)] bg-[var(--color-ink-100)] px-1.5 py-0.5 rounded"><FolderOpen className="inline align-middle w-2.5 h-2.5" /> {item.linkedProjectTitle}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {oneTimeItems.filter(i => i.completed).length > 0 && (
                  <div className="border-t border-[var(--color-ink-200)] pt-2 mt-1">
                    <p className="text-[10px] text-[var(--color-ink-400)] mb-1">완료 · {oneTimeItems.filter(i => i.completed).length}개</p>
                    {oneTimeItems.filter(i => i.completed).map(item => (
                      <div key={item.id} className="flex items-center gap-2 p-1.5 opacity-40">
                        <button onClick={() => toggleChecklistItem(item.id)} className="w-[18px] h-[18px] rounded-[5px] bg-ok-500 border-2 border-ok-500 flex-shrink-0 flex items-center justify-center text-white"><Check size={11} strokeWidth={3} /></button>
                        <span className="text-[12px] line-through text-[var(--color-ink-400)]">{item.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full mt-2 p-2 border-[1.5px] border-dashed border-[var(--color-ink-200)] rounded-lg text-[12px] text-[var(--color-ink-400)] hover:border-[var(--color-ink-300)] transition-colors inline-flex items-center justify-center gap-1"
              >
                <Plus size={12} /> 할 일 추가
              </button>
            </div>
          )}
        </div>
      </div>

      {/* C3 레이아웃: 타임라인 + 사이드 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_560px] gap-3 relative">
        {/* 왼쪽: 타임라인 */}
        <div className="bg-white rounded-2xl border border-ink-100 p-4">
          {/* 지연 */}
          {overdueEpisodes.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-bad-500" />
                <span className="text-[13px] font-bold text-bad-600">지연</span>
                <span className="text-[11px] text-bad-500 font-semibold">{overdueEpisodes.length}</span>
              </div>
              <div className="ml-4 border-l-2 border-red-200 pl-3.5 flex flex-col gap-1.5">
                {overdueEpisodes.map(ep => {
                  const { project, partner } = getEpisodeDetails(ep);
                  const days = Math.ceil((todayStart.getTime() - new Date(ep.dueDate!).getTime()) / (1000*60*60*24));
                  return (
                    <button type="button" key={ep.id} className="text-left w-full p-2.5 px-3.5 rounded-[10px] border border-red-200 bg-bad-50 cursor-pointer hover:border-red-300 transition-colors" onClick={() => setQuickViewEpisode(ep)}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1"><div className="flex items-baseline gap-1.5"><span className="text-[12px] font-bold text-[var(--color-ink-400)] flex-shrink-0">{ep.episodeNumber === 0 ? '미정' : `${ep.episodeNumber}편`}</span><span className="text-[13px] font-bold truncate">{ep.title || '제목 없음'}</span></div><div className="text-[11px] text-[var(--color-ink-400)] mt-0.5 truncate">{project?.title} · {partner?.name || '미정'}</div></div>
                        <span className="text-[11px] font-semibold text-bad-500 bg-bad-100 px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">{days}일 지남</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* 오늘 */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-brand-500" />
              <span className="text-[13px] font-bold">오늘</span>
              <span className="text-[11px] text-brand-500 font-semibold">{todayDeadlines.length}</span>
            </div>
            <div className="ml-4 border-l-2 border-brand-200 pl-3.5 flex flex-col gap-1.5">
              {todayDeadlines.length === 0 ? (
                <p className="text-[12px] text-[var(--color-ink-400)] py-2">오늘 마감인 회차가 없습니다</p>
              ) : todayDeadlines.map(ep => {
                const { project, partner } = getEpisodeDetails(ep);
                return (
                  <button type="button" key={ep.id} className="text-left w-full p-2.5 px-3.5 rounded-[10px] border border-[var(--color-ink-200)] cursor-pointer hover:border-[var(--color-ink-300)] transition-colors" onClick={() => setQuickViewEpisode(ep)}>
                    <div className="flex items-baseline gap-1.5"><span className="text-[12px] font-bold text-[var(--color-ink-400)]">{ep.episodeNumber === 0 ? '미정' : `${ep.episodeNumber}편`}</span><span className="text-[13px] font-bold">{ep.title || '제목 없음'}</span></div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-400)] mt-0.5"><span>{project?.title}</span><span className="text-[var(--color-ink-200)]">·</span><div className="w-[14px] h-[14px] bg-[var(--color-ink-200)] rounded-full flex items-center justify-center text-[9px] font-bold text-[var(--color-ink-500)]">{partner?.name?.charAt(0) || '?'}</div><span>{partner?.name || '미정'}</span></div>
                  </button>
                );
              })}
            </div>
          </div>
          {/* 내일 */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[13px] font-bold">내일</span>
              <span className="text-[11px] text-warn-500 font-semibold">{tomorrowDeadlines.length}</span>
            </div>
            <div className="ml-4 border-l-2 border-amber-200 pl-3.5 flex flex-col gap-1.5">
              {tomorrowDeadlines.length === 0 ? (
                <p className="text-[12px] text-[var(--color-ink-400)] py-2">내일 마감인 회차가 없습니다</p>
              ) : tomorrowDeadlines.map(ep => {
                const { project, partner } = getEpisodeDetails(ep);
                return (
                  <button type="button" key={ep.id} className="text-left w-full p-2.5 px-3.5 rounded-[10px] border border-[var(--color-ink-200)] cursor-pointer hover:border-[var(--color-ink-300)] transition-colors" onClick={() => setQuickViewEpisode(ep)}>
                    <div className="flex items-baseline gap-1.5"><span className="text-[12px] font-bold text-[var(--color-ink-400)]">{ep.episodeNumber === 0 ? '미정' : `${ep.episodeNumber}편`}</span><span className="text-[13px] font-bold">{ep.title || '제목 없음'}</span></div>
                    <div className="text-[11px] text-[var(--color-ink-400)] mt-0.5">{project?.title} · {partner?.name || '미정'}</div>
                  </button>
                );
              })}
            </div>
          </div>
          {/* 이번 주 */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-ink-300" />
              <span className="text-[13px] font-bold">이번 주</span>
              <span className="text-[11px] text-[var(--color-ink-500)] font-semibold">{thisWeekDeadlines.length}</span>
            </div>
            <div className="ml-4 border-l-2 border-[var(--color-ink-200)] pl-3.5 flex flex-col gap-1.5">
              {thisWeekDeadlines.length === 0 ? (
                <p className="text-[12px] text-[var(--color-ink-400)] py-2">이번 주 마감 예정이 없습니다</p>
              ) : thisWeekDeadlines.map(ep => {
                const { project, partner } = getEpisodeDetails(ep);
                const dueDate = new Date(ep.dueDate!);
                return (
                  <button type="button" key={ep.id} className="text-left w-full p-2.5 px-3.5 rounded-[10px] border border-[var(--color-ink-200)] cursor-pointer hover:border-[var(--color-ink-300)] transition-colors" onClick={() => setQuickViewEpisode(ep)}>
                    <div className="flex items-baseline gap-1.5"><span className="text-[12px] font-bold text-[var(--color-ink-400)]">{ep.episodeNumber === 0 ? '미정' : `${ep.episodeNumber}편`}</span><span className="text-[13px] font-bold">{ep.title || '제목 없음'}</span><span className="text-[11px] text-[var(--color-ink-400)]">{dueDate.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</span></div>
                    <div className="text-[11px] text-[var(--color-ink-400)] mt-0.5">{project?.title} · {partner?.name || '미정'}</div>
                  </button>
                );
              })}
            </div>
          </div>
          {/* 이번 주 완료 */}
          {thisWeekCompleted.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-ok-500" />
                <span className="text-[13px] font-bold text-ok-600">이번 주 완료</span>
                <span className="text-[11px] text-ok-500 font-semibold">{thisWeekCompleted.length}</span>
              </div>
              <div className="ml-4 border-l-2 border-green-200 pl-3.5 flex flex-col gap-1.5">
                {thisWeekCompleted.map(ep => {
                  const { project, partner } = getEpisodeDetails(ep);
                  return (
                    <button type="button" key={ep.id} className="text-left w-full p-2.5 px-3.5 rounded-[10px] border border-[var(--color-ink-200)] opacity-50 cursor-pointer hover:opacity-70 transition-opacity" onClick={() => setQuickViewEpisode(ep)}>
                      <div className="text-[13px] font-semibold">{ep.title || '제목 없음'}</div>
                      <div className="text-[11px] text-[var(--color-ink-400)] mt-0.5">{partner?.name || '미정'} · {ep.completedAt ? new Date(ep.completedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : ''} 완료</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽: 파트너 현황 + 달력 + 체크리스트
            데스크탑: lg:grid-cols-[1fr_560px] 우측 칼럼
            모바일: 메인 콘텐츠 아래로 자연 흐름 (시안 C) */}
        <div className="relative self-start" data-tour="tour-mgmt-checklist">
        <div className="space-y-3">
          <PartnerStatusStrip
            partners={partners}
            allEpisodes={allEpisodes}
            thisWeekStart={thisWeekStart}
            thisWeekEnd={thisWeekEnd}
          />

          <MiniCalendar
            calYear={calYear}
            calMonth={calMonth}
            setCalYear={setCalYear}
            setCalMonth={setCalMonth}
            now={now}
            selectedCalendarDay={selectedCalendarDay}
            setSelectedCalendarDay={setSelectedCalendarDay}
            deadlineCountByDay={deadlineCountByDay}
          />

          <Checklist
            oneTimeItems={oneTimeItems}
            checklistItems={checklistItems}
            onToggle={toggleChecklistItem}
            onAdd={() => setShowAddForm(true)}
          />
        </div>
        </div>

        {/* 데스크탑 인스펙터 (회차 클릭 시) — 우측 컬럼 내부에 정확히 맞춤 */}
        <AnimatePresence>
          {quickViewEpisode && (
            <motion.div
              key={`insp-${quickViewEpisode.id}`}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 20, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="hidden lg:flex absolute top-0 bottom-0 right-0 w-[560px] bg-white rounded-2xl border border-ink-100 shadow-[-6px_0_20px_-8px_rgba(0,0,0,0.08)] flex-col overflow-y-auto z-10"
            >
              <EpisodeQuickViewContent
                ep={quickViewEpisode}
                projects={projects}
                partners={partners}
                onClose={() => setQuickViewEpisode(null)}
                onStepStatusChange={async (workType, stepId, newStatus) => {
                  const ep = quickViewEpisode;
                  const workSteps = (ep.workSteps || {}) as Record<WorkContentType, WorkStep[]>;
                  const steps = workSteps[workType] || [];
                  const updated = steps.map(s => s.id === stepId ? { ...s, status: newStatus } : s);
                  const newWorkSteps = { ...workSteps, [workType]: updated };
                  setQuickViewEpisode({ ...ep, workSteps: newWorkSteps } as typeof ep);
                  await updateEpisodeFields(ep.id, { workSteps: newWorkSteps });
                  loadData();
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 항목 추가 모달 */}
      <AnimatePresence>
        {showAddForm && (
          <>
            <motion.div
              key="add-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[2px]"
              onClick={resetInlineForm}
            />
            <motion.div
              key="add-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] sm:w-[480px] max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 24px 64px -8px rgba(0,0,0,0.18), 0 4px 16px -4px rgba(0,0,0,0.08)' }}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4">
                <h3 className="text-base font-bold text-ink-900">할 일 추가</h3>
                <button onClick={resetInlineForm} className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors text-ink-400">
                  <X size={16} />
                </button>
              </div>

              {/* 텍스트 입력 */}
              <div className="px-5 pb-4">
                <input
                  ref={inlineInputRef}
                  autoFocus
                  type="text"
                  placeholder="무엇을 해야 하나요?"
                  value={newItemText}
                  onChange={e => setNewItemText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !activeLinkPicker) addChecklistItem();
                    if (e.key === 'Escape') resetInlineForm();
                  }}
                  className="w-full text-base text-ink-900 placeholder-ink-300 focus:outline-none bg-transparent border-b-2 border-ink-100 focus:border-brand-400 pb-2 transition-colors"
                />
              </div>

              {/* 알림 설정 */}
              <div className="px-5 pb-3">
                <DateTimePicker
                  value={newItemReminder}
                  onChange={setNewItemReminder}
                  repeat={repeatType}
                  repeatDays={repeatDays}
                  onRepeatChange={setRepeatType}
                  onRepeatDaysChange={setRepeatDays}
                >
                  <div className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${newItemReminder ? 'text-brand-600 bg-brand-50' : 'text-ink-400 hover:text-ink-600 hover:bg-ink-50'}`}>
                    <Bell size={14} />
                    {newItemReminder
                      ? new Date(newItemReminder).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '알림 설정'}
                    {newItemReminder && (
                      <span
                        onClick={e => { e.stopPropagation(); setNewItemReminder(''); }}
                        className="ml-1 text-brand-400 hover:text-brand-600"
                      >
                        <X size={12} />
                      </span>
                    )}
                  </div>
                </DateTimePicker>
              </div>

              {/* 구분선 */}
              <div className="border-t border-ink-100 mx-5" />

              {/* 연결 영역 */}
              <div className="px-5 py-4 space-y-3">
                {/* 선택된 링크 칩 */}
                {(formLink.episodeId || formLink.projectId || formLink.clientName || formLink.partnerId) && (
                  <div className="flex flex-wrap gap-2">
                    {formLink.episodeId && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-full text-xs font-medium border border-brand-200">
                        <Link2 size={11} /> {formLink.episodeNumber}회차 {formLink.episodeTitle}
                        <button onClick={() => clearLink('episode')} className="ml-0.5 hover:text-orange-900"><X size={11} /></button>
                      </span>
                    )}
                    {formLink.projectId && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-full text-xs font-medium border border-brand-200">
                        <FolderOpen className="inline align-middle w-2.5 h-2.5" /> {formLink.projectTitle}
                        {!formLink.episodeId && <button onClick={() => clearLink('project')} className="ml-0.5 hover:text-orange-900"><X size={11} /></button>}
                      </span>
                    )}
                    {formLink.clientName && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium border border-emerald-200">
                        <Building2 size={11} /> {formLink.clientName}
                        {!formLink.projectId && <button onClick={() => clearLink('client')} className="ml-0.5 hover:text-emerald-900"><X size={11} /></button>}
                      </span>
                    )}
                    {formLink.partnerId && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-full text-xs font-medium border border-brand-200">
                        <User size={11} /> {formLink.partnerName}
                        {!formLink.projectId && <button onClick={() => clearLink('partner')} className="ml-0.5 hover:text-orange-900"><X size={11} /></button>}
                      </span>
                    )}
                  </div>
                )}

                {/* 링크 버튼들 */}
                <div className="flex items-center gap-2 flex-wrap">
                  {!formLink.episodeId && (
                    <button onClick={() => { setActiveLinkPicker('episode'); setLinkSearch(''); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-ink-200 text-ink-500 hover:border-orange-300 hover:text-brand-600 hover:bg-brand-50 transition-all">
                      <Plus size={11} /> 회차 연결
                    </button>
                  )}
                  {!formLink.projectId && !formLink.episodeId && (
                    <button onClick={() => { setActiveLinkPicker('project'); setLinkSearch(''); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-ink-200 text-ink-500 hover:border-orange-300 hover:text-brand-600 hover:bg-brand-50 transition-all">
                      <Plus size={11} /> 프로젝트 연결
                    </button>
                  )}
                  {!formLink.clientName && !formLink.projectId && (
                    <button onClick={() => { setActiveLinkPicker('client'); setLinkSearch(''); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-ink-200 text-ink-500 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                      <Plus size={11} /> 클라이언트 연결
                    </button>
                  )}
                  {!formLink.partnerId && !formLink.projectId && (
                    <button onClick={() => { setActiveLinkPicker('partner'); setLinkSearch(''); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-ink-200 text-ink-500 hover:border-orange-300 hover:text-brand-600 hover:bg-brand-50 transition-all">
                      <Plus size={11} /> 파트너 연결
                    </button>
                  )}
                </div>
              </div>

              {/* 하단 버튼 */}
              <div className="flex gap-3 px-5 pb-5">
                <button onClick={resetInlineForm}
                  className="flex-1 py-2.5 bg-ink-100 text-ink-600 rounded-xl text-sm font-medium hover:bg-ink-200 transition-colors active:scale-[0.97]">
                  취소
                </button>
                <button onClick={addChecklistItem} disabled={!newItemText.trim()}
                  className="flex-1 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-semibold hover:bg-brand-600 transition-colors active:scale-[0.97] disabled:bg-ink-100 disabled:text-ink-400 disabled:cursor-not-allowed">
                  추가
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 링크 선택 모달 */}
      <AnimatePresence>
        {activeLinkPicker && (
          <>
            {/* 백드롭 */}
            <motion.div
              key="link-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/20 z-60"
              style={{ zIndex: 60 }}
              onClick={() => { setActiveLinkPicker(null); setLinkSearch(''); }}
            />
            {/* 모달 */}
            <motion.div
              key="link-modal"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] sm:w-96 max-h-[80vh] overflow-y-auto bg-white rounded-2xl shadow-2xl overflow-hidden"
              style={{ zIndex: 61, boxShadow: '0 24px 64px -8px rgba(0,0,0,0.18), 0 4px 16px -4px rgba(0,0,0,0.08)' }}
            >
              {/* 모달 헤더 */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  {activeLinkPicker === 'episode' && <div className="w-6 h-6 rounded-md bg-brand-100 flex items-center justify-center"><span className="text-[10px] font-bold text-brand-600">EP</span></div>}
                  {activeLinkPicker === 'project' && <div className="w-6 h-6 rounded-md bg-brand-100 flex items-center justify-center"><span className="text-[10px] font-bold text-brand-600">P</span></div>}
                  {activeLinkPicker === 'client' && <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center"><span className="text-[10px] font-bold text-emerald-600">C</span></div>}
                  {activeLinkPicker === 'partner' && <div className="w-6 h-6 rounded-md bg-brand-100 flex items-center justify-center"><span className="text-[10px] font-bold text-brand-600">P</span></div>}
                  <h3 className="text-sm font-bold text-ink-900">
                    {activeLinkPicker === 'episode' && '회차 연결'}
                    {activeLinkPicker === 'project' && '프로젝트 연결'}
                    {activeLinkPicker === 'client' && '클라이언트 연결'}
                    {activeLinkPicker === 'partner' && '파트너 연결'}
                  </h3>
                </div>
                <button
                  onClick={() => { setActiveLinkPicker(null); setLinkSearch(''); }}
                  className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors text-ink-400"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 검색 */}
              <div className="px-4 pb-3">
                <div className="flex items-center gap-2 bg-ink-50 rounded-xl px-3 py-2.5 border border-ink-100">
                  <Search size={14} className="text-ink-400 flex-shrink-0" />
                  <input
                    autoFocus
                    type="text"
                    placeholder={
                      activeLinkPicker === 'episode' ? '회차 제목 또는 번호로 검색...' :
                      activeLinkPicker === 'project' ? '프로젝트명으로 검색...' :
                      activeLinkPicker === 'client' ? '클라이언트명으로 검색...' :
                      '파트너명으로 검색...'
                    }
                    value={linkSearch}
                    onChange={e => setLinkSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Escape' && (setActiveLinkPicker(null), setLinkSearch(''))}
                    className="flex-1 text-sm bg-transparent focus:outline-none text-ink-700 placeholder-ink-400"
                  />
                  {linkSearch && (
                    <button onClick={() => setLinkSearch('')} className="text-ink-400 hover:text-ink-600"><X size={13} /></button>
                  )}
                </div>
              </div>

              {/* 목록 */}
              <div className="max-h-72 overflow-y-auto border-t border-ink-100 pb-2">
                {activeLinkPicker === 'episode' && (() => {
                  const filtered = allEpisodes.filter(ep => !linkSearch || ep.title.includes(linkSearch) || String(ep.episodeNumber).includes(linkSearch)).slice(0, 12);
                  return filtered.length > 0 ? filtered.map(ep => {
                    const proj = projects.find(p => p.id === ep.projectId);
                    return (
                      <button key={ep.id} onClick={() => selectEpisode(ep)}
                        className="w-full text-left px-4 py-3 hover:bg-brand-50 transition-colors flex items-center gap-3">
                        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
                          <span className="text-xs font-bold text-brand-600">{ep.episodeNumber}편</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-ink-900 truncate">{ep.title}</p>
                          {proj && <p className="text-xs text-ink-400 mt-0.5 truncate">{proj.title}</p>}
                        </div>
                      </button>
                    );
                  }) : (
                    <EmptyState
                      size="compact"
                      icon={linkSearch ? SearchX : Film}
                      title={linkSearch ? '검색 결과가 없습니다' : '등록된 회차가 없습니다'}
                      description={linkSearch ? '다른 검색어를 입력해보세요' : '프로젝트에서 회차를 먼저 추가해주세요'}
                    />
                  );
                })()}

                {activeLinkPicker === 'project' && (() => {
                  const filtered = projects.filter(p => !linkSearch || p.title.toLowerCase().includes(linkSearch.toLowerCase())).slice(0, 12);
                  return filtered.length > 0 ? filtered.map(p => (
                    <button key={p.id} onClick={() => selectProject(p)}
                      className="w-full text-left px-4 py-3 hover:bg-brand-50 transition-colors flex items-center gap-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-brand-600">{p.title.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink-900 truncate">{p.title}</p>
                        <p className="text-xs text-ink-400 mt-0.5 truncate">{p.client}</p>
                      </div>
                    </button>
                  )) : (
                    <EmptyState
                      size="compact"
                      icon={linkSearch ? SearchX : FolderOpen}
                      title={linkSearch ? '검색 결과가 없습니다' : '등록된 프로젝트가 없습니다'}
                      description={linkSearch ? '다른 검색어를 입력해보세요' : '프로젝트를 먼저 추가해주세요'}
                    />
                  );
                })()}

                {activeLinkPicker === 'client' && (() => {
                  const filtered = clients.filter(c => !linkSearch || c.name.includes(linkSearch)).slice(0, 12);
                  return filtered.length > 0 ? filtered.map(c => (
                    <button key={c.id} onClick={() => selectClient(c.name)}
                      className="w-full text-left px-4 py-3 hover:bg-emerald-50 transition-colors flex items-center gap-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                        <span className="text-sm font-bold text-emerald-600">{c.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink-900 truncate">{c.name}</p>
                        {c.company && <p className="text-xs text-ink-400 mt-0.5 truncate">{c.company}</p>}
                      </div>
                    </button>
                  )) : (
                    <EmptyState
                      size="compact"
                      icon={linkSearch ? SearchX : Building2}
                      title={linkSearch ? '검색 결과가 없습니다' : '등록된 클라이언트가 없습니다'}
                      description={linkSearch ? '다른 검색어를 입력해보세요' : '클라이언트를 먼저 추가해주세요'}
                    />
                  );
                })()}

                {activeLinkPicker === 'partner' && (() => {
                  const filtered = partners.filter(p => !linkSearch || p.name.includes(linkSearch)).slice(0, 12);
                  return filtered.length > 0 ? filtered.map(p => (
                    <button key={p.id} onClick={() => selectPartner(p)}
                      className="w-full text-left px-4 py-3 hover:bg-brand-50 transition-colors flex items-center gap-3">
                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center">
                        <span className="text-sm font-bold text-brand-600">{p.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink-900 truncate">{p.name}</p>
                        <p className="text-xs text-ink-400 mt-0.5 truncate">{p.email}</p>
                      </div>
                    </button>
                  )) : (
                    <EmptyState
                      size="compact"
                      icon={linkSearch ? SearchX : User}
                      title={linkSearch ? '검색 결과가 없습니다' : '등록된 파트너가 없습니다'}
                      description={linkSearch ? '다른 검색어를 입력해보세요' : '파트너를 먼저 추가해주세요'}
                    />
                  );
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 달력 일정 모달 */}
      <AnimatePresence>
        {selectedCalendarDay && (() => {
          const dayChecklistItems = getItemsForDate(selectedCalendarDay);
          const dayEpisodes = allEpisodes.filter(ep => {
            if (!ep.dueDate || ep.status === 'completed') return false;
            return ep.dueDate.startsWith(selectedCalendarDay);
          });
          const totalCount = dayChecklistItems.length + dayEpisodes.length;
          return (
          <>
            <motion.div
              key="cal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-[2px]"
              style={{ zIndex: 40 }}
              onClick={() => setSelectedCalendarDay(null)}
            />
            <motion.div
              key="cal-modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] sm:w-[420px] max-h-[80vh] overflow-y-auto bg-white rounded-2xl shadow-2xl"
              style={{ zIndex: 50, boxShadow: '0 24px 64px -8px rgba(0,0,0,0.18), 0 4px 16px -4px rgba(0,0,0,0.08)' }}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[var(--color-ink-200)]">
                <div>
                  <h3 className="text-[15px] font-extrabold text-ink-900">
                    {new Date(selectedCalendarDay + 'T00:00:00').toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                  </h3>
                  <p className="text-[11px] text-[var(--color-ink-400)] mt-0.5">
                    {totalCount > 0 ? `${totalCount}개의 일정` : '일정 없음'}
                  </p>
                </div>
                <button onClick={() => setSelectedCalendarDay(null)} className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors text-ink-400"><X size={16} /></button>
              </div>

              <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
                {/* 마감 회차 */}
                {dayEpisodes.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                      <span className="text-[11px] font-semibold text-[var(--color-ink-400)]">마감 회차</span>
                      <span className="text-[11px] text-brand-500 font-semibold">{dayEpisodes.length}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {dayEpisodes.map(ep => {
                        const project = projects.find(p => p.id === ep.projectId);
                        const partner = partners.find(p => p.id === ep.assignee);
                        return (
                          <button type="button" key={ep.id} className="text-left w-full p-3 rounded-xl border border-[var(--color-ink-200)] cursor-pointer hover:border-[var(--color-ink-300)] transition-colors" onClick={() => { setSelectedCalendarDay(null); setQuickViewEpisode(ep); }}>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[12px] font-bold text-[var(--color-ink-400)]">{ep.episodeNumber === 0 ? '미정' : `${ep.episodeNumber}편`}</span>
                              <span className="text-[13px] font-bold">{ep.title || '제목 없음'}</span>
                            </div>
                            <div className="text-[11px] text-[var(--color-ink-400)] mt-1">{project?.title} · {partner?.name || '미정'}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 체크리스트 */}
                {dayChecklistItems.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-ok-500" />
                      <span className="text-[11px] font-semibold text-[var(--color-ink-400)]">체크리스트</span>
                      <span className="text-[11px] text-ok-600 font-semibold">{dayChecklistItems.length}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {dayChecklistItems.map(item => (
                        <div key={item.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[var(--color-ink-50)] transition-colors">
                          <button
                            onClick={() => toggleChecklistItem(item.id)}
                            className={`w-[18px] h-[18px] rounded-[5px] border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                              item.completed ? 'bg-ok-500 border-ok-500 text-white' : 'border-[var(--color-ink-300)] hover:border-brand-500'
                            }`}
                          >{item.completed ? <Check size={11} strokeWidth={3} /> : ''}</button>
                          <div className="flex-1 min-w-0">
                            <span className={`text-[13px] font-medium ${item.completed ? 'line-through text-[var(--color-ink-400)]' : ''}`}>{item.text}</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {item.reminderTime && (
                                <span className="text-[10px] text-brand-500"><Bell className="inline align-middle w-2.5 h-2.5" /> {new Date(item.reminderTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                              )}
                              {item.repeatType && item.repeatType !== 'none' && (
                                <span className="text-[10px] text-brand-500 bg-brand-100 px-1.5 py-0.5 rounded-full">
                                  {item.repeatType === 'daily' ? '매일' : item.repeatType === 'weekly' ? '매주' : item.repeatDays ? ['일','월','화','수','목','금','토'].filter((_, i) => item.repeatDays!.includes(i)).join('·') : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 빈 상태 */}
                {totalCount === 0 && (
                  <EmptyState
                    size="compact"
                    icon={Calendar}
                    title="일정이 없습니다"
                    description="이 날에는 등록된 일정이 없습니다"
                  />
                )}
              </div>

              {/* 할 일 추가 버튼 */}
              <div className="px-5 pb-4">
                <button
                  onClick={() => { setSelectedCalendarDay(null); setShowAddForm(true); }}
                  className="w-full p-2.5 border-[1.5px] border-dashed border-[var(--color-ink-200)] rounded-xl text-[12px] text-[var(--color-ink-400)] hover:border-[var(--color-ink-300)] transition-colors inline-flex items-center justify-center gap-1"
                >
                  <Plus size={12} /> 이 날짜에 할 일 추가
                </button>
              </div>
            </motion.div>
          </>
          );
        })()}
      </AnimatePresence>

      {/* 회차 퀵뷰 모달 */}
      <AnimatePresence>
        {quickViewEpisode && (() => {
          const ep = quickViewEpisode;
          const project = projects.find(p => p.id === ep.projectId);
          const assignee = partners.find(p => p.id === ep.assignee);
          const workTypes = (ep.workContent || []) as WorkContentType[];
          const workSteps = (ep.workSteps || {}) as Record<WorkContentType, WorkStep[]>;

          // 작업 상태 변경
          const handleStepStatusChange = async (workType: WorkContentType, stepId: string, newStatus: string) => {
            const steps = workSteps[workType] || [];
            const updated = steps.map(s => s.id === stepId ? { ...s, status: newStatus } : s);
            const newWorkSteps = { ...workSteps, [workType]: updated };
            setQuickViewEpisode({ ...ep, workSteps: newWorkSteps } as typeof ep);
            await updateEpisodeFields(ep.id, { workSteps: newWorkSteps });
            loadData();
          };

          // 파이프라인 상태 계산
          const getWorkTypeStatus = (wt: WorkContentType) => {
            const steps = workSteps[wt] || [];
            if (steps.length === 0) return 'waiting';
            if (steps.every(s => s.status === 'completed')) return 'completed';
            if (steps.some(s => s.status === 'in_progress' || s.status === 'completed')) return 'in_progress';
            return 'waiting';
          };
          const overallCompleted = workTypes.length > 0 && workTypes.every(wt => getWorkTypeStatus(wt) === 'completed');

          // 마감일
          let finalDueDate: string | null = ep.dueDate || null;
          workTypes.forEach(wt => (workSteps[wt] || []).forEach(s => {
            if (s.dueDate && (!finalDueDate || new Date(s.dueDate) > new Date(finalDueDate))) finalDueDate = s.dueDate;
          }));

          return (
            <>
              <motion.div
                key="qv-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[50] lg:hidden"
                onClick={() => setQuickViewEpisode(null)}
              />
              <motion.div
                key="qv-modal"
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 16 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[51] w-[calc(100%-2rem)] sm:w-[540px] max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-2xl lg:hidden"
              >
                {/* 헤더 */}
                <div className="px-6 pt-5 pb-3 border-b border-[var(--color-ink-200)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-bold text-[var(--color-ink-400)]">{ep.episodeNumber === 0 ? '미정' : `${ep.episodeNumber}편`}</span>
                        <h3 className="text-[17px] font-extrabold">{ep.title || '제목 없음'}</h3>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[var(--color-ink-400)]">
                        <span>{project?.title}</span>
                        {assignee && <><span className="text-[var(--color-ink-200)]">·</span><div className="w-[14px] h-[14px] bg-[var(--color-ink-200)] rounded-full flex items-center justify-center text-[9px] font-bold text-[var(--color-ink-500)]">{assignee.name.charAt(0)}</div><span>{assignee.name}</span></>}
                        {finalDueDate && <><span className="text-[var(--color-ink-200)]">·</span><span>마감 {(() => { const d = new Date(finalDueDate); return `${d.getMonth()+1}/${d.getDate()}`; })()}</span></>}
                      </div>
                    </div>
                    <button onClick={() => setQuickViewEpisode(null)} className="p-1.5 rounded-lg hover:bg-ink-100 transition-colors text-[var(--color-ink-400)]">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* 파이프라인 */}
                {workTypes.length > 0 && (
                  <div className="mx-6 mt-4 flex items-stretch rounded-2xl bg-[var(--color-ink-50)] border border-ink-100 overflow-hidden">
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
                          className={`flex flex-col items-center justify-center gap-1 py-3 ${
                            index > 0 ? 'border-l border-ink-100' : ''
                          } ${status === 'completed' ? 'bg-ok-50/60' : isActive ? 'bg-warn-50/80' : ''}`}
                        >
                          <div className={`w-7 h-7 rounded-full border-[2.5px] flex items-center justify-center transition-all text-[10px] font-bold ${
                            status === 'completed' ? 'border-ok-500 bg-ok-500 text-white' : isActive ? 'border-warn-500 bg-warn-50 text-warn-700' : 'border-ink-300 bg-white text-ink-400'
                          }`}>
                            {status === 'completed' ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : index + 1}
                          </div>
                          <span className={`text-[11px] font-semibold ${status === 'completed' ? 'text-ok-700' : isActive ? 'text-ink-900' : 'text-ink-500'}`}>{workType}</span>
                          <span className={`text-[10px] ${status === 'completed' ? 'text-ok-600' : isActive ? 'text-warn-700' : 'text-ink-400'}`}>
                            {status === 'completed' ? '완료' : stepsCount > 0 ? `${completedCount}/${stepsCount}` : '대기'}
                          </span>
                        </div>
                      );
                    })}
                    {/* 마감 */}
                    <div style={{ flex: overallCompleted ? 1 : 0.7, transition: 'flex 0.6s cubic-bezier(0.4,0,0.2,1)' }} className={`flex flex-col items-center justify-center gap-1 py-3 border-l border-ink-100 ${overallCompleted ? 'bg-ok-50/60' : ''}`}>
                      <div className={`w-7 h-7 rounded-full border-[2.5px] flex items-center justify-center text-[11px] ${overallCompleted ? 'border-ok-500 bg-ok-500 text-white' : 'border-ink-300 bg-white'}`}>
                        {overallCompleted ? <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg> : <Calendar size={12} className="text-ink-400" />}
                      </div>
                      <span className={`text-[11px] font-semibold ${overallCompleted ? 'text-ok-700' : 'text-ink-500'}`}>마감</span>
                      <span className={`text-[10px] ${overallCompleted ? 'text-ok-600' : 'text-ink-400'}`}>
                        {finalDueDate ? (() => { const d = new Date(finalDueDate); return `${d.getMonth()+1}월 ${d.getDate()}일`; })() : '미정'}
                      </span>
                    </div>
                  </div>
                )}

                {/* 작업 타입별 체크리스트 */}
                <div className="px-6 py-4">
                  {workTypes.length === 0 ? (
                    <EmptyState
                      size="compact"
                      icon={Film}
                      title="작업이 없습니다"
                      description="이 회차에 등록된 작업이 없습니다"
                    />
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
                                          handleStepStatusChange(workType, step.id, next);
                                        }}
                                        className={`w-[20px] h-[20px] rounded-[6px] border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                                          step.status === 'completed' ? 'bg-ok-500 border-ok-500 text-white' : step.status === 'in_progress' ? 'border-warn-500 bg-warn-50' : 'border-[var(--color-ink-300)] hover:border-brand-500'
                                        }`}
                                      >
                                        {step.status === 'completed' ? <Check size={12} strokeWidth={3} /> : step.status === 'in_progress' ? <div className="w-2 h-2 rounded-full bg-warn-500" /> : ''}
                                      </button>
                                      <div className="flex-1 min-w-0">
                                        <span className={`text-[12px] font-semibold ${step.status === 'completed' ? 'line-through text-[var(--color-ink-400)]' : ''}`}>{step.label}</span>
                                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[var(--color-ink-400)]">
                                          {stepPartner && <><div className="w-[14px] h-[14px] bg-[var(--color-ink-200)] rounded-full flex items-center justify-center text-[9px] font-bold text-[var(--color-ink-500)]">{stepPartner.name.charAt(0)}</div><span>{stepPartner.name}</span></>}
                                          {step.startDate && <><span className="text-[var(--color-ink-200)]">·</span><span>{(() => { const d = new Date(step.startDate); return `${d.getMonth()+1}/${d.getDate()}`; })()}</span></>}
                                          {step.dueDate && <><span className="text-[var(--color-ink-300)]">→</span><span className="text-[var(--color-brand-600)] font-semibold">{(() => { const d = new Date(step.dueDate); return `${d.getMonth()+1}/${d.getDate()}`; })()}</span></>}
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
                    className="flex items-center justify-center gap-1 w-full text-center py-2.5 bg-brand-500 text-white rounded-xl text-[13px] font-semibold hover:bg-brand-600 transition-colors"
                    onClick={() => setQuickViewEpisode(null)}
                  >
                    상세 보기 <ArrowRight size={14} />
                  </Link>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* 프로젝트 마법사 모달 */}
      <ProjectWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onComplete={handleProjectWizardComplete}
        clients={clients}
        partners={partners}
      />
    </div>
  );
}
