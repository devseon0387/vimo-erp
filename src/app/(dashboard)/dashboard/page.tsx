'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, FolderOpen, CheckCircle, Clock, TrendingUp, Wallet, Calendar, X, ChevronDown, Sparkles, AlertTriangle, Megaphone, Building2, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Project, Episode, Partner, Client, WorkContentType } from '@/types';
import { EmptyReviews, EmptyDeadlines } from '@/components/EmptyState';
import { FloatingLabelInput, FloatingLabelTextarea } from '@/components/FloatingLabelInput';
import ProjectWizardModal from '@/components/ProjectWizardModal';
import { formatPhoneNumber, getComputedProjectStatus } from '@/lib/utils';
import { getProjects, getPartners, getClients, insertClient, insertPartner, insertProject, getAllEpisodes, upsertEpisodes } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { useToast } from '@/contexts/ToastContext';

export default function DashboardPage() {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // 모든 회차 데이터 (프로젝트별로 저장되어 있음)
  const [allEpisodes, setAllEpisodes] = useState<(Episode & { projectId: string })[]>([]);

  // 위자드 모달 상태
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'content' | 'marketing' | 'finance'>('content');
  const [tabDirection, setTabDirection] = useState(1);
  const TAB_ORDER = ['content', 'marketing', 'finance'] as const;
  const switchTab = (tab: 'content' | 'marketing' | 'finance') => {
    setTabDirection(TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(activeTab) ? 1 : -1);
    setActiveTab(tab);
  };

  // 모달 상태
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [isAddPartnerModalOpen, setIsAddPartnerModalOpen] = useState(false);
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);

  // 성공 상태
  const [isClientSuccess, setIsClientSuccess] = useState(false);
  const [isPartnerSuccess, setIsPartnerSuccess] = useState(false);
  const [isProjectSuccess, setIsProjectSuccess] = useState(false);
  const [lastAddedClientName, setLastAddedClientName] = useState('');

  // 드롭다운 상태
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isPartnerDropdownOpen, setIsPartnerDropdownOpen] = useState(false);
  const [isPartnerRoleDropdownOpen, setIsPartnerRoleDropdownOpen] = useState(false);
  const [isPartnerStatusDropdownOpen, setIsPartnerStatusDropdownOpen] = useState(false);
  const [isClientStatusDropdownOpen, setIsClientStatusDropdownOpen] = useState(false);
  const [isGenerationDropdownOpen, setIsGenerationDropdownOpen] = useState(false);

  // 폼 데이터
  const [newClient, setNewClient] = useState<Partial<Client>>({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    company: '',
    address: '',
    notes: '',
    status: 'active',
  });

  const [newPartner, setNewPartner] = useState<Partial<Partner>>({
    name: '',
    email: '',
    phone: '',
    partnerType: 'freelancer',
    role: 'partner',
    status: 'active',
    generation: 1,
  });

  const [newProject, setNewProject] = useState<Partial<Project>>({
    title: '',
    description: '',
    client: '',
    partnerId: '',
    status: 'planning',
    budget: {
      totalAmount: 0,
      partnerPayment: 0,
      managementFee: 0,
      marginRate: 0,
    },
    tags: [],
  });

  const loadData = useCallback(async () => {
    const [projectsData, partnersData, clientsData, episodesData] = await Promise.all([
      getProjects(),
      getPartners(),
      getClients(),
      getAllEpisodes(),
    ]);
    setProjects(projectsData);
    setPartners(partnersData);
    setClients(clientsData);
    setAllEpisodes(episodesData);
    setLoading(false);
  }, []);

  useEffect(() => {
    // 로그인 직후 환영 토스트
    if (sessionStorage.getItem('vm_just_logged_in')) {
      sessionStorage.removeItem('vm_just_logged_in');
      toast.success('로그인에 성공했습니다!');
    }
    loadData();
  }, [loadData]);

  useSupabaseRealtime(['projects', 'episodes', 'partners', 'clients'], loadData);

  // 클라이언트 추가 핸들러
  const handleAddClient = async () => {
    if (!newClient.name) {
      toast.warning('클라이언트 이름을 입력해주세요.');
      return;
    }

    const saved = await insertClient({
      name: newClient.name,
      contactPerson: newClient.contactPerson,
      email: newClient.email,
      phone: newClient.phone,
      company: newClient.company,
      address: newClient.address,
      status: newClient.status || 'active',
      notes: newClient.notes,
    });

    if (saved) {
      setClients(prev => [saved, ...prev]);
      setLastAddedClientName(saved.name);
      setIsClientSuccess(true);
    } else {
      toast.error('클라이언트 추가에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // 클라이언트 추가 후 프로젝트 추가로 이동
  const handleAddProjectFromClient = () => {
    // 클라이언트 모달 닫기
    setIsAddClientModalOpen(false);
    setIsClientSuccess(false);
    setNewClient({
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      company: '',
      address: '',
      notes: '',
      status: 'active',
    });

    // 프로젝트 모달 열기 (클라이언트 자동 선택)
    setNewProject({
      ...newProject,
      client: lastAddedClientName,
    });
    setIsAddProjectModalOpen(true);
  };

  // 클라이언트 모달만 닫기
  const handleCloseClientModal = () => {
    setIsAddClientModalOpen(false);
    setIsClientSuccess(false);
    setNewClient({
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      company: '',
      address: '',
      notes: '',
      status: 'active',
    });
  };

  // 파트너 추가 핸들러
  const handleAddPartner = async () => {
    if (!newPartner.name || !newPartner.email) {
      toast.warning('파트너 이름과 이메일을 입력해주세요.');
      return;
    }

    const saved = await insertPartner({
      name: newPartner.name,
      email: newPartner.email,
      phone: newPartner.phone,
      company: newPartner.company,
      partnerType: newPartner.partnerType || 'freelancer',
      generation: newPartner.generation ?? 1,
      role: newPartner.role || 'partner',
      status: newPartner.status || 'active',
    });

    if (saved) {
      setPartners(prev => [saved, ...prev]);
      setIsPartnerSuccess(true);
      setTimeout(() => {
        setIsAddPartnerModalOpen(false);
        setIsPartnerSuccess(false);
        setNewPartner({ name: '', email: '', phone: '', company: '', role: 'partner', status: 'active' });
      }, 1500);
    } else {
      toast.error('파트너 추가에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // 프로젝트 추가 핸들러
  const handleAddProject = async () => {
    if (!newProject.title || !newProject.client || !newProject.partnerId) {
      toast.warning('프로젝트 이름, 클라이언트, 담당자를 입력해주세요.');
      return;
    }

    const saved = await insertProject({
      title: newProject.title!,
      description: newProject.description || '',
      client: newProject.client!,
      partnerId: newProject.partnerId!,
      partnerIds: newProject.partnerId ? [newProject.partnerId] : [],
      managerIds: [],
      status: newProject.status || 'planning',
      budget: newProject.budget || { totalAmount: 0, partnerPayment: 0, managementFee: 0, marginRate: 0 },
      tags: newProject.tags || [],
      workContent: [],
    });

    if (saved) {
      setProjects(prev => [saved, ...prev]);
      setIsProjectSuccess(true);
      setTimeout(() => {
        setIsAddProjectModalOpen(false);
        setIsProjectSuccess(false);
        setNewProject({
          title: '', description: '', client: '', partnerId: '', status: 'planning',
          budget: { totalAmount: 0, partnerPayment: 0, managementFee: 0, marginRate: 0 },
          tags: [],
        });
      }, 1500);
    } else {
      toast.error('프로젝트 추가에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // 현재 날짜
  const now = new Date();

  // 이번 달 시작일과 종료일
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // 이번 달 프로젝트 필터링 (생성일 기준)
  const thisMonthProjects = projects.filter(p => {
    if (!p.completedAt) return false;
    const completedDate = new Date(p.completedAt);
    return completedDate >= thisMonthStart && completedDate <= thisMonthEnd;
  });

  // 이번 달 회차 필터링 (완료일 기준)
  const thisMonthCompletedEpisodes = allEpisodes.filter(ep => {
    if (ep.status !== 'completed' || !ep.completedAt) return false;
    const completedDate = new Date(ep.completedAt);
    return completedDate >= thisMonthStart && completedDate <= thisMonthEnd;
  });

  // 통계 계산
  const stats = {
    total: projects.length,
    completed: projects.filter(p => p.status === 'completed').length,
    inProgress: projects.filter(p => p.status === 'in_progress').length,
    planning: projects.filter(p => p.status === 'planning').length,
  };

  // 이번 달 통계
  const thisMonthStats = {
    newProjects: thisMonthProjects.length,
    inProgress: projects.filter(p => p.status === 'in_progress').length,
    completedEpisodes: thisMonthCompletedEpisodes.length,
    totalEpisodes: allEpisodes.filter(ep => ep.status === 'in_progress' || ep.status === 'waiting').length,
  };

  // 이번 달 비용 통계 계산
  const thisMonthRevenue = thisMonthProjects.reduce((sum, p) => sum + p.budget.totalAmount, 0);
  const thisMonthPartnerPayment = thisMonthProjects.reduce((sum, p) => sum + p.budget.partnerPayment, 0);
  const thisMonthManagementFee = thisMonthProjects.reduce((sum, p) => sum + p.budget.managementFee, 0);
  const thisMonthMargin = thisMonthRevenue - thisMonthPartnerPayment - thisMonthManagementFee;
  const thisMonthAvgMarginRate = thisMonthProjects.length > 0
    ? (thisMonthProjects.reduce((sum, p) => sum + p.budget.marginRate, 0) / thisMonthProjects.length).toFixed(1)
    : 0;

  // 다가오는 마감일 (7일 이내)
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingDeadlines = allEpisodes
    .filter(ep => {
      if (!ep.dueDate) return false;
      const dueDate = new Date(ep.dueDate);
      return dueDate >= now && dueDate <= sevenDaysLater && ep.status !== 'completed';
    })
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5);

  // 검수 대기 중인 회차
  const reviewingEpisodes = allEpisodes.filter(ep => ep.status === 'review').slice(0, 5);

  // 파트너별 작업 현황
  const partnerWorkload = partners.map(partner => {
    const partnerEpisodes = allEpisodes.filter(ep => ep.assignee === partner.id);
    const inProgress = partnerEpisodes.filter(ep => ep.status === 'in_progress').length;
    const waiting = partnerEpisodes.filter(ep => ep.status === 'waiting').length;
    const completed = partnerEpisodes.filter(ep => ep.status === 'completed').length;

    return {
      partner,
      inProgress,
      waiting,
      completed,
      total: partnerEpisodes.length,
    };
  }).filter(pw => pw.total > 0); // 작업이 있는 파트너만

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#f97316' }} />
      </div>
    );
  }

  // ── 카드 토큰
  const CARD: React.CSSProperties = {
    background:   '#ffffff',
    border:       '1px solid #ede9e6',
    boxShadow:    '0 1px 3px rgba(0,0,0,0.05)',
    borderRadius: '14px',
  };

  // 내부 행 구분선
  const rowDivider = '1px solid #f0ece9';
  // 섹션 마이크로 라벨
  const μ = (t: string) => (
    <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', color: '#c4b5a5', textTransform: 'uppercase', marginBottom: '4px' }}>{t}</p>
  );

  return (
    <div>

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p style={{ fontSize: '11px', fontWeight: 500, color: '#a8a29e', marginBottom: '4px' }}>
            {now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
          <h1 style={{ fontSize: 'clamp(22px,2.5vw,32px)', fontWeight: 700, color: '#1c1917', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            대시보드
          </h1>
        </div>
        <button
          onClick={() => setIsWizardOpen(true)}
          className="flex items-center gap-2 flex-shrink-0 active:scale-[0.97]"
          style={{
            padding:      '9px 16px',
            borderRadius: '9px',
            fontSize:     '13px',
            fontWeight:   600,
            color:        '#ffffff',
            background:   '#f97316',
            border:       'none',
            cursor:       'pointer',
            transition:   'background 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#c2410c'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#f97316'; }}
        >
          <Sparkles size={13} /> 새 프로젝트
        </button>
      </div>

      {/* ── 스탯 스트립 ── */}
      <div style={{ ...CARD, marginBottom: '20px', overflow: 'hidden' }} className="flex flex-wrap sm:flex-nowrap">
        {[
          { value: stats.inProgress,                 label: '진행 중',           color: '#f97316' },
          { value: stats.total,                      label: '전체 프로젝트',     color: '#1c1917' },
          { value: reviewingEpisodes.length,          label: '검수 대기',         color: reviewingEpisodes.length  > 0 ? '#c2410c' : '#1c1917' },
          { value: upcomingDeadlines.length,          label: 'D-7 마감',          color: upcomingDeadlines.length  > 0 ? '#dc2626' : '#1c1917' },
          { value: thisMonthStats.completedEpisodes, label: '이달 완료',         color: '#1c1917' },
        ].map(({ value, label: lbl, color }, i, arr) => (
          <div
            key={lbl}
            className="flex-1 min-w-[calc(33.333%-1px)] sm:min-w-0"
            style={{
              padding:     'clamp(12px,2vw,20px) clamp(8px,1.5vw,24px)',
              borderRight: i < arr.length - 1 ? rowDivider : 'none',
              textAlign:   'center',
            }}
          >
            <p style={{ fontSize: 'clamp(18px,2.5vw,34px)', fontWeight: 700, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</p>
            <p style={{ fontSize: 'clamp(9px,1vw,11px)', color: '#a8a29e', marginTop: '5px', fontWeight: 400 }}>{lbl}</p>
          </div>
        ))}
      </div>

      {/* ── 탭 ── */}
      <div className="flex overflow-x-auto scrollbar-hide" style={{ borderBottom: '1px solid #ede9e6', marginBottom: '20px' }}>
        {([
          { key: 'content'   as const, icon: FolderOpen, label: '콘텐츠 제작' },
          { key: 'marketing' as const, icon: Megaphone,  label: '마케팅'      },
          { key: 'finance'   as const, icon: Wallet,     label: '재무'        },
        ]).map(({ key, icon: Icon, label: tl }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className="relative flex items-center gap-1.5 sm:gap-2 pb-3 mr-4 sm:mr-7 transition-colors duration-150 whitespace-nowrap flex-shrink-0"
            style={{ fontSize: '13px', fontWeight: 600, color: activeTab === key ? '#1c1917' : '#c4b5a5' }}
          >
            <Icon size={14} />
            <span>{tl}</span>
            {activeTab === key && (
              <motion.div
                layoutId="lg-tab"
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '1.5px', background: '#f97316', borderRadius: '99px' }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── 탭 콘텐츠 ── */}
      <div style={{ overflowX: 'clip' }}>
      <AnimatePresence mode="wait" custom={tabDirection}>
        <motion.div key={activeTab} custom={tabDirection}
          variants={{
            enter:  (d: number) => ({ x: d > 0 ? 24 : -24, opacity: 0 }),
            center: { x: 0, opacity: 1 },
            exit:   (d: number) => ({ x: d > 0 ? -24 : 24, opacity: 0 }),
          }}
          initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
        >

        {/* ── 콘텐츠 제작 ── */}
        {activeTab === 'content' && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_320px]" style={{ alignItems: 'start' }}>

          {/* 왼쪽: 프로젝트 */}
          <div style={{ ...CARD, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: rowDivider, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                {μ('Projects')}
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1c1917', letterSpacing: '-0.015em' }}>진행 중인 프로젝트</h2>
              </div>
              <Link href="/projects" style={{ fontSize: '12px', fontWeight: 600, color: '#f97316' }}>전체 보기 →</Link>
            </div>

            {projects.filter(p => p.status === 'in_progress' || p.status === 'planning').length === 0 ? (
              <div style={{ padding: '64px 24px', textAlign: 'center' }}>
                <FolderOpen style={{ margin: '0 auto 12px', color: '#fcd9bd', display: 'block' }} size={32} />
                <p style={{ fontWeight: 600, color: '#78716c', fontSize: '14px', marginBottom: '4px' }}>진행 중인 프로젝트가 없어요</p>
                <p style={{ color: '#c4b5a5', fontSize: '12px', marginBottom: '20px' }}>새 프로젝트를 시작해보세요</p>
                <button onClick={() => setIsWizardOpen(true)} style={{ ...CARD, display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, color: '#f97316', borderRadius: '999px' }}>
                  <Sparkles size={13} /> 프로젝트 시작
                </button>
              </div>
            ) : (
              <div>
                {/* 컬럼 헤더 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px', padding: '8px 24px', borderBottom: rowDivider, background: '#faf9f8' }}>
                  {['프로젝트', '진행률', '상태'].map((h, i) => (
                    <p key={h} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: '#c4b5a5', textTransform: 'uppercase', textAlign: i > 0 ? 'center' : 'left' }}>{h}</p>
                  ))}
                </div>
                {projects.map(p => {
                  const eps = allEpisodes.filter(ep => ep.projectId === p.id);
                  return { project: p, eps, computed: getComputedProjectStatus(eps) };
                }).filter(({ computed }) => computed === 'active' || computed === 'standby')
                .slice(0, 8).map(({ project, eps, computed: computedStatus }, i, arr) => {
                  const partner = partners.find(p => p.id === project.partnerId);
                  const done    = eps.filter(ep => ep.status === 'completed').length;
                  const pct     = eps.length > 0 ? Math.round((done / eps.length) * 100) : 0;
                  return (
                    <Link key={project.id} href={`/projects/${project.id}`}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px', alignItems: 'center', padding: '14px 24px', borderBottom: i < arr.length - 1 ? rowDivider : 'none', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9f7f5'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <div style={{ minWidth: 0, paddingRight: '16px' }}>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#1c1917', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}</p>
                        <p style={{ fontSize: '11px', color: '#a8a29e', marginTop: '2px' }}>
                          {project.client}{partner && <span style={{ color: '#c4b5a5' }}> · {partner.name}</span>}
                          {eps.length > 0 && <span style={{ color: '#c4b5a5' }}> · {done}/{eps.length}</span>}
                        </p>
                      </div>
                      <div style={{ padding: '0 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '3px', borderRadius: '99px', background: '#f0ece9', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#16a34a' : '#f97316', borderRadius: '99px', transition: 'width 0.5s' }} />
                          </div>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#a8a29e', flexShrink: 0 }}>{pct}%</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <StatusBadge status={computedStatus} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* 오른쪽: 검수 + 마감 + 파트너 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* 검수 대기 */}
            <div style={{ ...CARD, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px 12px', borderBottom: rowDivider, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  {μ('Review')}
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1c1917', letterSpacing: '-0.01em' }}>검수 대기</h3>
                </div>
                {reviewingEpisodes.length > 0 && (
                  <span style={{ fontSize: '24px', fontWeight: 700, color: '#f97316', letterSpacing: '-0.03em' }}>{reviewingEpisodes.length}</span>
                )}
              </div>
              {reviewingEpisodes.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', color: '#c4b5a5' }}>검수 대기 없음</p>
                </div>
              ) : reviewingEpisodes.map((ep, i, arr) => {
                const proj = projects.find(p => p.id === ep.projectId);
                return (
                  <div key={ep.id} style={{ padding: '10px 20px', borderBottom: i < arr.length - 1 ? rowDivider : 'none', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9f7f5'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.title}</p>
                      {proj && <p style={{ fontSize: '11px', color: '#a8a29e', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.title}</p>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* D-7 마감 */}
            <div style={{ ...CARD, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px 12px', borderBottom: rowDivider, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  {μ('Deadline')}
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1c1917', letterSpacing: '-0.01em' }}>D-7 마감</h3>
                </div>
                {upcomingDeadlines.length > 0 && (
                  <span style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626', letterSpacing: '-0.03em' }}>{upcomingDeadlines.length}</span>
                )}
              </div>
              {upcomingDeadlines.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', color: '#c4b5a5' }}>임박한 마감 없음</p>
                </div>
              ) : upcomingDeadlines.map((ep, i, arr) => {
                const proj = projects.find(p => p.id === ep.projectId);
                const days = Math.ceil((new Date(ep.dueDate!).getTime() - now.getTime()) / 86400000);
                const urg  = days <= 2;
                return (
                  <div key={ep.id} style={{ padding: '10px 20px', borderBottom: i < arr.length - 1 ? rowDivider : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9f7f5'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.title}</p>
                      {proj && <p style={{ fontSize: '11px', color: '#a8a29e', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.title}</p>}
                    </div>
                    <span style={{ flexShrink: 0, fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: urg ? '#fef2f2' : '#fef9ed', color: urg ? '#dc2626' : '#d97706', border: urg ? '1px solid #fecaca' : '1px solid #fde68a' }}>
                      {days === 0 ? '오늘' : days === 1 ? '내일' : `D-${days}`}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 파트너 현황 */}
            {partnerWorkload.length > 0 && (
              <div style={{ ...CARD, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px 12px', borderBottom: rowDivider }}>
                  {μ('Team')}
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1c1917', letterSpacing: '-0.01em' }}>파트너 현황</h3>
                </div>
                {partnerWorkload.map(({ partner, inProgress: ip, waiting: w, completed: c, total: t }, i, arr) => (
                  <div key={partner.id} style={{ padding: '12px 20px', borderBottom: i < arr.length - 1 ? rowDivider : 'none', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9f7f5'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '8px', background: 'linear-gradient(135deg,#f97316,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#fff' }}>
                          {partner.name.charAt(0)}
                        </div>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#1c1917' }}>{partner.name}</p>
                      </div>
                      <p style={{ fontSize: '11px', color: '#c4b5a5' }}>{t}개</p>
                    </div>
                    <div style={{ display: 'flex', borderRadius: '99px', overflow: 'hidden', height: '3px', background: '#f0ece9' }}>
                      <div style={{ width: `${t > 0 ? (c/t)*100 : 0}%`, background: '#16a34a', transition: 'width 0.5s' }} />
                      <div style={{ width: `${t > 0 ? (ip/t)*100 : 0}%`, background: '#f97316', transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      {ip > 0 && <span style={{ fontSize: '10px', color: '#f97316', fontWeight: 600 }}>진행 {ip}</span>}
                      {w  > 0 && <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 600 }}>대기 {w}</span>}
                      {c  > 0 && <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>완료 {c}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── 마케팅 탭 ── */}
        {activeTab === 'marketing' && (
          <div style={{ ...CARD, padding: '80px 24px', textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#f0ece9', border: '1px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', backdropFilter: 'blur(20px)' }}>
              <Megaphone size={24} style={{ color: '#c4b5a5' }} />
            </div>
            <p style={{ fontWeight: 700, color: '#1c1917', fontSize: '16px', marginBottom: '6px' }}>마케팅 기능 준비 중</p>
            <p style={{ color: '#c4b5a5', fontSize: '13px' }}>곧 업데이트될 예정이에요</p>
          </div>
        )}

        {/* ── 재무 탭 ── */}
        {activeTab === 'finance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* KPI 스트립 */}
          <div style={{ ...CARD, display: 'flex', overflow: 'hidden' }}>
            {[
              { en: 'Revenue',    kr: '이번 달 총 매출',  value: (thisMonthRevenue         / 10000).toFixed(0), sub: `신규 ${thisMonthProjects.length}건`, color: '#1c1917' },
              { en: 'Partner',    kr: '파트너 지급',      value: (thisMonthPartnerPayment  / 10000).toFixed(0), sub: '\u00a0',                              color: '#f97316' },
              { en: 'Management', kr: '매니징 비용',      value: (thisMonthManagementFee   / 10000).toFixed(0), sub: '\u00a0',                              color: '#f97316' },
              { en: 'Reserve',    kr: '유보금',           value: (thisMonthMargin          / 10000).toFixed(0), sub: `마진율 ${thisMonthAvgMarginRate}%`,   color: '#0891b2' },
            ].map(({ en, kr, value, sub, color }, i, arr) => (
              <div key={en} style={{ flex: 1, padding: '24px 24px 20px', borderRight: i < arr.length - 1 ? rowDivider : 'none', textAlign: 'center' }}>
                {μ(en)}
                <p style={{ fontSize: 'clamp(24px,3vw,36px)', fontWeight: 700, color, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: '4px' }}>
                  {value}<span style={{ fontSize: '14px', opacity: 0.45, marginLeft: '2px' }}>만</span>
                </p>
                <p style={{ fontSize: '11px', color: '#a8a29e' }}>{kr}</p>
                <p style={{ fontSize: '10px', color: '#c4b5a5', marginTop: '2px' }}>{sub}</p>
              </div>
            ))}
          </div>

          {/* 프로젝트 재무 테이블 */}
          <div style={{ ...CARD, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: rowDivider }}>
              {μ('This Month')}
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1c1917', letterSpacing: '-0.015em' }}>이번 달 프로젝트 재무</h2>
            </div>
            {thisMonthProjects.length === 0 ? (
              <div style={{ padding: '64px 24px', textAlign: 'center' }}>
                <Wallet style={{ margin: '0 auto 12px', color: '#c4b5a5', display: 'block' }} size={28} />
                <p style={{ fontWeight: 600, color: '#78716c', fontSize: '14px' }}>이번 달 등록된 프로젝트가 없어요</p>
              </div>
            ) : (
              <div>
                {/* 헤더 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px', padding: '8px 24px', borderBottom: rowDivider, background: '#faf9f8' }}>
                  {['프로젝트', '매출', '파트너', '유보금'].map((h, i) => (
                    <p key={h} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: '#c4b5a5', textTransform: 'uppercase', textAlign: i > 0 ? 'right' : 'left' }}>{h}</p>
                  ))}
                </div>
                {thisMonthProjects.map((project, i, arr) => {
                  const res = project.budget.totalAmount - project.budget.partnerPayment - project.budget.managementFee;
                  return (
                    <div key={project.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px', alignItems: 'center', padding: '14px 24px', borderBottom: i < arr.length - 1 ? rowDivider : 'none', transition: 'background 0.12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9f7f5'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <div style={{ minWidth: 0, paddingRight: '12px' }}>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}</p>
                        <p style={{ fontSize: '11px', color: '#a8a29e', marginTop: '1px' }}>{project.client}</p>
                      </div>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: '#1c1917', textAlign: 'right' }}>{(project.budget.totalAmount / 10000).toFixed(0)}<span style={{ fontSize: '10px', opacity: 0.4 }}>만</span></p>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: '#f97316',  textAlign: 'right' }}>{(project.budget.partnerPayment / 10000).toFixed(0)}<span style={{ fontSize: '10px', opacity: 0.4 }}>만</span></p>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: '#16a34a',  textAlign: 'right' }}>{(res / 10000).toFixed(0)}<span style={{ fontSize: '10px', opacity: 0.4 }}>만</span></p>
                    </div>
                  );
                })}
                {/* 합계 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px', alignItems: 'center', padding: '12px 24px', background: '#faf9f8', borderTop: rowDivider }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#c4b5a5', letterSpacing: '0.1em', textTransform: 'uppercase' }}>합계</p>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: '#1c1917', textAlign: 'right' }}>{(thisMonthRevenue / 10000).toFixed(0)}<span style={{ fontSize: '10px', opacity: 0.4 }}>만</span></p>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: '#f97316',  textAlign: 'right' }}>{(thisMonthPartnerPayment / 10000).toFixed(0)}<span style={{ fontSize: '10px', opacity: 0.4 }}>만</span></p>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: '#16a34a',  textAlign: 'right' }}>{(thisMonthMargin / 10000).toFixed(0)}<span style={{ fontSize: '10px', opacity: 0.4 }}>만</span></p>
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        </motion.div>
      </AnimatePresence>
      </div>

      {/* 프로젝트 마법사 모달 */}
      <ProjectWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onComplete={async (data) => {
          if (!data.project.title) { setIsWizardOpen(false); return; }

          let clientName = '';
          if (data.client?.isNew && data.client.name) {
            const saved = await insertClient({ name: data.client.name, contactPerson: data.client.contact, email: data.client.email, status: 'active' });
            clientName = saved?.name || data.client.name;
            if (saved) setClients(prev => [saved, ...prev]);
          } else if (data.client?.id) {
            clientName = clients.find(c => c.id === data.client!.id)?.name || '';
          }

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

          if (!savedProject) { toast.error('프로젝트 생성에 실패했습니다.'); setIsWizardOpen(false); return; }
          toast.success('프로젝트가 만들어졌어요!');
          setProjects(prev => [savedProject, ...prev]);

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
        }}
        clients={clients}
        partners={partners}
      />

      {/* 클라이언트 추가 모달 - Toss Style */}
      {isAddClientModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <style jsx>{`
            @keyframes checkmark {
              0% {
                stroke-dashoffset: 100;
              }
              100% {
                stroke-dashoffset: 0;
              }
            }
            @keyframes circle-scale {
              0% {
                transform: scale(0);
                opacity: 0;
              }
              50% {
                transform: scale(1.1);
              }
              100% {
                transform: scale(1);
                opacity: 1;
              }
            }
            .checkmark-circle {
              animation: circle-scale 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .checkmark-check {
              stroke-dasharray: 100;
              stroke-dashoffset: 100;
              animation: checkmark 0.5s 0.3s cubic-bezier(0.65, 0, 0.45, 1) forwards;
            }
            @keyframes dash-modal-content-in {
              from { opacity: 0; transform: scale(0.95) translateY(8px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes dash-modal-sheet-in {
              from { opacity: 0; transform: translateY(24px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-dash-modal { animation: dash-modal-content-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
            .animate-dash-sheet { animation: dash-modal-sheet-in 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
          `}</style>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !isClientSuccess && setIsAddClientModalOpen(false)}
          />
          <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="relative bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl max-w-2xl w-full animate-dash-sheet"
              onClick={(e) => e.stopPropagation()}
            >
              {isClientSuccess ? (
                /* 성공 화면 */
                <div className="px-6 sm:px-8 py-12 flex flex-col items-center justify-center">
                  <div className="checkmark-circle w-24 h-24 bg-orange-500 rounded-full flex items-center justify-center mb-6">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <path
                        className="checkmark-check"
                        d="M14 24L20 30L34 16"
                        stroke="white"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">클라이언트 추가 완료</h2>
                  <p className="text-gray-500 mb-8">새로운 클라이언트가 등록되었습니다</p>

                  {/* 프로젝트 추가 제안 */}
                  <div className="w-full max-w-md space-y-4">
                    <p className="text-center text-gray-700 font-medium">해당 클라이언트의 프로젝트도<br />추가하시겠어요?</p>
                    <div className="flex gap-3">
                      <button
                        onClick={handleAddProjectFromClient}
                        className="flex-1 h-14 bg-orange-600 text-white rounded-2xl font-semibold text-base hover:bg-orange-700 transition-all shadow-lg shadow-orange-500/20"
                      >
                        프로젝트 추가
                      </button>
                      <button
                        onClick={handleCloseClientModal}
                        className="flex-1 h-14 bg-gray-100 text-gray-700 rounded-2xl font-semibold text-base hover:bg-gray-200 transition-all"
                      >
                        닫기
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* 헤더 */}
                  <div className="px-6 sm:px-8 pt-8 pb-6">
                <button
                  onClick={() => setIsAddClientModalOpen(false)}
                  className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={24} className="text-gray-400" />
                </button>
                <h2 className="text-page mb-2">새 클라이언트를<br />추가할게요</h2>
                <p className="text-sm text-gray-500">클라이언트 정보를 입력해주세요</p>
              </div>

              {/* 폼 */}
              <div className="px-6 sm:px-8 pb-8 space-y-6">
                {/* 기본 정보 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    기본 정보
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FloatingLabelInput
                      label="클라이언트 이름"
                      required
                      type="text"
                      value={newClient.name}
                      onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                    />
                    <FloatingLabelInput
                      label="담당자 이름"
                      type="text"
                      value={newClient.contactPerson}
                      onChange={(e) => setNewClient({ ...newClient, contactPerson: e.target.value })}
                    />
                  </div>
                </div>

                {/* 연락처 정보 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    연락처 정보
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FloatingLabelInput
                      label="이메일"
                      type="email"
                      value={newClient.email}
                      onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                    />
                    <FloatingLabelInput
                      label="전화번호"
                      type="tel"
                      value={formatPhoneNumber(newClient.phone)}
                      onChange={(e) => setNewClient({ ...newClient, phone: formatPhoneNumber(e.target.value) })}
                    />
                  </div>
                </div>

                {/* 추가 정보 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    추가 정보
                  </h3>
                  <FloatingLabelInput
                    label="회사명"
                    type="text"
                    value={newClient.company}
                    onChange={(e) => setNewClient({ ...newClient, company: e.target.value })}
                  />
                  <FloatingLabelInput
                    label="주소"
                    type="text"
                    value={newClient.address}
                    onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                  />
                  <FloatingLabelTextarea
                    label="메모"
                    value={newClient.notes}
                    onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>

              {/* 푸터 */}
              <div className="sticky bottom-0 bg-white px-6 sm:px-8 py-6 border-t border-divider rounded-b-[28px]">
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsAddClientModalOpen(false)}
                    className="flex-1 h-14 text-gray-700 font-semibold bg-gray-100 hover:bg-gray-200 rounded-xl transition-all active:scale-[0.98]"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleAddClient}
                    disabled={!newClient.name}
                    className="flex-1 h-14 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.98] shadow-lg shadow-orange-500/25"
                  >
                    클라이언트 추가하기
                  </button>
                </div>
              </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 파트너 추가 모달 - Toss Style */}
      {isAddPartnerModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <style jsx>{`
            @keyframes checkmark {
              0% {
                stroke-dashoffset: 100;
              }
              100% {
                stroke-dashoffset: 0;
              }
            }
            @keyframes circle-scale {
              0% {
                transform: scale(0);
                opacity: 0;
              }
              50% {
                transform: scale(1.1);
              }
              100% {
                transform: scale(1);
                opacity: 1;
              }
            }
            .checkmark-circle {
              animation: circle-scale 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .checkmark-check {
              stroke-dasharray: 100;
              stroke-dashoffset: 100;
              animation: checkmark 0.5s 0.3s cubic-bezier(0.65, 0, 0.45, 1) forwards;
            }
          `}</style>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !isPartnerSuccess && setIsAddPartnerModalOpen(false)}
          />
          <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="relative bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl max-w-lg w-full animate-dash-sheet"
              onClick={(e) => e.stopPropagation()}
            >
              {isPartnerSuccess ? (
                /* 성공 화면 */
                <div className="px-6 sm:px-8 py-16 flex flex-col items-center justify-center">
                  <div className="checkmark-circle w-24 h-24 bg-orange-500 rounded-full flex items-center justify-center mb-6">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <path
                        className="checkmark-check"
                        d="M14 24L20 30L34 16"
                        stroke="white"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">파트너 추가 완료</h2>
                  <p className="text-gray-500">새로운 파트너가 등록되었습니다</p>
                </div>
              ) : (
                <>
                  {/* 헤더 */}
                  <div className="px-6 sm:px-8 pt-8 pb-6">
                <button
                  onClick={() => setIsAddPartnerModalOpen(false)}
                  className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={24} className="text-gray-400" />
                </button>
                <h2 className="text-page mb-2">새 파트너를<br />추가할게요</h2>
                <p className="text-sm text-gray-500">파트너 정보를 입력해주세요</p>
              </div>

              {/* 폼 */}
              <div className="px-6 sm:px-8 pb-8 space-y-6">
                {/* 기본 정보 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    기본 정보
                  </h3>
                  <FloatingLabelInput
                    label="이름"
                    required
                    type="text"
                    value={newPartner.name}
                    onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })}
                  />
                  <FloatingLabelInput
                    label="이메일"
                    required
                    type="email"
                    value={newPartner.email}
                    onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })}
                  />
                </div>

                {/* 연락처 정보 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    연락처 정보
                  </h3>
                  <FloatingLabelInput
                    label="전화번호"
                    type="tel"
                    value={formatPhoneNumber(newPartner.phone)}
                    onChange={(e) => setNewPartner({ ...newPartner, phone: formatPhoneNumber(e.target.value) })}
                  />

                  {/* 파트너 유형 선택 - 토스 스타일 버튼 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">파트너 유형</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setNewPartner({ ...newPartner, partnerType: 'freelancer' })}
                        className={`h-14 rounded-xl font-semibold transition-all ${
                          newPartner.partnerType === 'freelancer'
                            ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/25'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        프리랜서
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewPartner({ ...newPartner, partnerType: 'business' })}
                        className={`h-14 rounded-xl font-semibold transition-all ${
                          newPartner.partnerType === 'business'
                            ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/25'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        사업자
                      </button>
                    </div>
                  </div>

                  {/* 파트너 기수 선택 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      파트너 기수
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsGenerationDropdownOpen(!isGenerationDropdownOpen)}
                        className="w-full h-14 px-4 border-2 border-divider rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white text-left flex items-center justify-between hover:border-gray-300 transition-all"
                      >
                        <span className="text-gray-900 font-medium">{newPartner.generation}기</span>
                        <ChevronDown size={20} className="text-gray-400" />
                      </button>
                      {isGenerationDropdownOpen && (
                        <div className="absolute z-20 w-full mt-2 bg-white border-2 border-divider rounded-xl shadow-2xl overflow-hidden">
                          {[1, 2, 3].map((gen) => (
                            <button
                              key={gen}
                              type="button"
                              onClick={() => {
                                setNewPartner({ ...newPartner, generation: gen });
                                setIsGenerationDropdownOpen(false);
                              }}
                              className="w-full px-4 py-3 hover:bg-orange-50 text-left transition-colors first:rounded-t-xl last:rounded-b-xl"
                            >
                              <span className="text-gray-900 font-medium">{gen}기</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 푸터 */}
              <div className="sticky bottom-0 bg-white px-6 sm:px-8 py-6 border-t border-divider rounded-b-[28px]">
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsAddPartnerModalOpen(false)}
                    className="flex-1 h-14 text-gray-700 font-semibold bg-gray-100 hover:bg-gray-200 rounded-xl transition-all active:scale-[0.98]"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleAddPartner}
                    disabled={!newPartner.name || !newPartner.email}
                    className="flex-1 h-14 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.98] shadow-lg shadow-orange-500/25"
                  >
                    파트너 추가하기
                  </button>
                </div>
              </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 프로젝트 추가 모달 - Toss Style */}
      {isAddProjectModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <style jsx>{`
            @keyframes checkmark {
              0% {
                stroke-dashoffset: 100;
              }
              100% {
                stroke-dashoffset: 0;
              }
            }
            @keyframes circle-scale {
              0% {
                transform: scale(0);
                opacity: 0;
              }
              50% {
                transform: scale(1.1);
              }
              100% {
                transform: scale(1);
                opacity: 1;
              }
            }
            .checkmark-circle {
              animation: circle-scale 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .checkmark-check {
              stroke-dasharray: 100;
              stroke-dashoffset: 100;
              animation: checkmark 0.5s 0.3s cubic-bezier(0.65, 0, 0.45, 1) forwards;
            }
          `}</style>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !isProjectSuccess && setIsAddProjectModalOpen(false)}
          />
          <div className="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4">
            <div
              className="relative bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-dash-sheet"
              onClick={(e) => e.stopPropagation()}
            >
              {isProjectSuccess ? (
                /* 성공 화면 */
                <div className="px-6 sm:px-8 py-16 flex flex-col items-center justify-center">
                  <div className="checkmark-circle w-24 h-24 bg-orange-500 rounded-full flex items-center justify-center mb-6">
                    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                      <path
                        className="checkmark-check"
                        d="M14 24L20 30L34 16"
                        stroke="white"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">프로젝트 추가 완료</h2>
                  <p className="text-gray-500">새로운 프로젝트가 시작되었습니다</p>
                </div>
              ) : (
                <>
                  {/* 헤더 */}
                  <div className="sticky top-0 bg-white px-6 sm:px-8 pt-8 pb-6 rounded-t-[28px] z-10">
                <button
                  onClick={() => setIsAddProjectModalOpen(false)}
                  className="absolute right-6 top-6 p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={24} className="text-gray-400" />
                </button>
                <h2 className="text-page mb-2">새 프로젝트를<br />시작할게요</h2>
                <p className="text-sm text-gray-500">프로젝트 정보를 입력해주세요</p>
              </div>

              {/* 폼 */}
              <div className="px-6 sm:px-8 pb-8 space-y-6">
                {/* 기본 정보 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    프로젝트 기본 정보
                  </h3>
                  <FloatingLabelInput
                    label="프로젝트 이름"
                    required
                    type="text"
                    value={newProject.title}
                    onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                  />
                </div>

                {/* 담당자 선택 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    담당자 선택
                  </h3>

                  {/* 클라이언트 선택 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      클라이언트 <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsClientDropdownOpen(!isClientDropdownOpen)}
                        className="w-full h-14 px-4 border-2 border-divider rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white text-left flex items-center justify-between hover:border-gray-300 transition-all"
                      >
                        {newProject.client ? (
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                              {newProject.client.charAt(0)}
                            </div>
                            <span className="text-gray-900 font-medium">{newProject.client}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">클라이언트를 선택해주세요</span>
                        )}
                        <ChevronDown size={20} className="text-gray-400" />
                      </button>
                      {isClientDropdownOpen && (
                        <div className="absolute z-20 w-full mt-2 bg-white border-2 border-divider rounded-xl shadow-2xl max-h-60 overflow-auto">
                          {clients.length === 0 ? (
                            <div className="p-6 text-center text-gray-500">
                              <p className="mb-2">등록된 클라이언트가 없습니다</p>
                              <button
                                onClick={() => {
                                  setIsClientDropdownOpen(false);
                                  setIsAddClientModalOpen(true);
                                }}
                                className="text-sm text-orange-500 hover:text-orange-600 font-medium"
                              >
                                클라이언트 먼저 추가하기 →
                              </button>
                            </div>
                          ) : (
                            clients.map((client) => (
                              <button
                                key={client.id}
                                type="button"
                                onClick={() => {
                                  setNewProject({ ...newProject, client: client.name });
                                  setIsClientDropdownOpen(false);
                                }}
                                className="w-full px-4 py-3 hover:bg-orange-50 flex items-center gap-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl"
                              >
                                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <Building2 size={15} className="text-orange-500" />
                                </div>
                                <div>
                                  <p className="text-gray-900 font-medium">{client.name}</p>
                                  {client.company && <p className="text-xs text-gray-500">{client.company}</p>}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 파트너 선택 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      담당 파트너 <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsPartnerDropdownOpen(!isPartnerDropdownOpen)}
                        className="w-full h-14 px-4 border-2 border-divider rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white text-left flex items-center justify-between hover:border-gray-300 transition-all"
                      >
                        {newProject.partnerId ? (
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <User size={16} className="text-orange-500" />
                            </div>
                            <span className="text-gray-900 font-medium">
                              {partners.find(p => p.id === newProject.partnerId)?.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">파트너를 선택해주세요</span>
                        )}
                        <ChevronDown size={20} className="text-gray-400" />
                      </button>
                      {isPartnerDropdownOpen && (
                        <div className="absolute z-20 w-full mt-2 bg-white border-2 border-divider rounded-xl shadow-2xl max-h-60 overflow-auto">
                          {partners.length === 0 ? (
                            <div className="p-6 text-center text-gray-500">
                              <p className="mb-2">등록된 파트너가 없습니다</p>
                              <button
                                onClick={() => {
                                  setIsPartnerDropdownOpen(false);
                                  setIsAddPartnerModalOpen(true);
                                }}
                                className="text-sm text-orange-500 hover:text-orange-600 font-medium"
                              >
                                파트너 먼저 추가하기 →
                              </button>
                            </div>
                          ) : (
                            partners.map((partner) => (
                              <button
                                key={partner.id}
                                type="button"
                                onClick={() => {
                                  setNewProject({ ...newProject, partnerId: partner.id });
                                  setIsPartnerDropdownOpen(false);
                                }}
                                className="w-full px-4 py-3 hover:bg-orange-50 flex items-center gap-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl"
                              >
                                <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <User size={16} className="text-orange-500" />
                                </div>
                                <div>
                                  <p className="text-gray-900 font-medium">{partner.name}</p>
                                  <p className="text-xs text-gray-500">{partner.email}</p>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 비용 정보 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    비용 정보
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <FloatingLabelInput
                      label="전체 비용"
                      type="number"
                      value={newProject.budget?.totalAmount || 0}
                      onChange={(e) => setNewProject({
                        ...newProject,
                        budget: { ...newProject.budget!, totalAmount: Number(e.target.value) }
                      })}
                    />
                    <FloatingLabelInput
                      label="파트너 지급"
                      type="number"
                      value={newProject.budget?.partnerPayment || 0}
                      onChange={(e) => setNewProject({
                        ...newProject,
                        budget: { ...newProject.budget!, partnerPayment: Number(e.target.value) }
                      })}
                    />
                    <FloatingLabelInput
                      label="매니징 비용"
                      type="number"
                      value={newProject.budget?.managementFee || 0}
                      onChange={(e) => setNewProject({
                        ...newProject,
                        budget: { ...newProject.budget!, managementFee: Number(e.target.value) }
                      })}
                    />
                  </div>
                </div>
              </div>

              {/* 푸터 */}
              <div className="sticky bottom-0 bg-white px-6 sm:px-8 py-6 border-t border-divider rounded-b-[28px]">
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsAddProjectModalOpen(false)}
                    className="flex-1 h-14 text-gray-700 font-semibold bg-gray-100 hover:bg-gray-200 rounded-xl transition-all active:scale-[0.98]"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleAddProject}
                    disabled={!newProject.title || !newProject.client || !newProject.partnerId}
                    className="flex-1 h-14 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 transition-all disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.98] shadow-lg shadow-orange-500/25"
                  >
                    프로젝트 시작하기
                  </button>
                </div>
              </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// 상태 배지 컴포넌트
function StatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, { label: string; style: React.CSSProperties }> = {
    active: { label: '진행 중', style: { background: 'rgba(22,163,74,0.1)', color: '#16a34a' } },
    standby: { label: '대기', style: { background: 'rgba(37,99,235,0.1)', color: '#2563eb' } },
    dormant: { label: '휴면', style: { background: 'rgba(249,115,22,0.1)', color: '#f97316' } },
    inactive: { label: '비활성', style: { background: 'rgba(148,163,184,0.15)', color: '#64748b' } },
  };

  const { label, style } = statusMap[status] || statusMap.inactive;

  return (
    <span className="px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap" style={style}>
      {label}
    </span>
  );
}
