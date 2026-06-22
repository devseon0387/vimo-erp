'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Mail, Clock, CheckCircle, AlertTriangle,
  User, Briefcase, Calendar, ArrowRight, XCircle, Inbox, FileSignature,
} from 'lucide-react';
import { getInquiries, updateInquiryStatus } from '@/lib/supabase/db';
import { Inquiry, InquiryStatus } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import { TabBar } from '@/components/TabBar';
import { StatusBadge } from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { KPICard } from '@/components/KPICard';
import InquiryManageView from './InquiryManageView';

type Tab = 'dashboard' | 'new' | 'all';

// 신규 큐/대시보드 상태칩 — 공용 StatusBadge로 통일 (new=info·contacted=brand)
function QueueStatusBadge({ status }: { status: InquiryStatus }) {
  return status === 'new'
    ? <StatusBadge tone="info">새 문의</StatusBadge>
    : <StatusBadge tone="brand">연락 완료</StatusBadge>;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: '문의 매니지먼트' },
  { key: 'new',       label: '신규 문의' },
  { key: 'all',       label: '문의 관리' },
];

function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

function fmtDateTime(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function daysAgo(d: string) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
}

function PageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromQuery = (searchParams.get('tab') as Tab) || 'new';
  // 계약 상세의 "출처 문의"(?selected=) 딥링크는 전체 관리 탭에서 받아 상세를 연다
  const hasSelected = !!searchParams.get('selected');
  const [activeTab, setActiveTab] = useState<Tab>(
    hasSelected ? 'all' : ['dashboard', 'new', 'all'].includes(tabFromQuery) ? tabFromQuery : 'new'
  );

  // 디폴트(신규) 탭은 URL에 ?tab=new 안 박는 게 깔끔
  const switchTab = (t: Tab) => {
    setActiveTab(t);
    const url = t === 'new' ? '/inquiries' : `/inquiries?tab=${t}`;
    router.replace(url, { scroll: false });
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 헤더 */}
      <div className="space-y-3">
        <div>
          <h1 className="text-page">문의</h1>
          <p className="text-[#78716c] mt-1 text-sm">홈페이지에서 접수된 문의를 처리하고 추적합니다</p>
        </div>

        {/* 탭 */}
        <TabBar items={TABS} active={activeTab} onChange={switchTab} />
      </div>

      {/* 컨텐츠 */}
      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'dashboard' && <InquiryDashboard onSwitchTab={switchTab} />}
            {activeTab === 'new' && <InquiryQueue />}
            {activeTab === 'all' && <InquiryManageView />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function InquiriesPage() {
  return (
    <Suspense fallback={<LoadingState label="로딩 중..." />}>
      <PageInner />
    </Suspense>
  );
}

// ─────────────────────────────────────────────────────────────
// 매니지먼트 (대시보드) 탭
// ─────────────────────────────────────────────────────────────

function InquiryDashboard({ onSwitchTab }: { onSwitchTab: (t: Tab) => void }) {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getInquiries();
      setInquiries(data ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const now = Date.now();
    const dayMs = 1000 * 60 * 60 * 24;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekAgo = now - 7 * dayMs;

    const todayIncoming = inquiries.filter(i => new Date(i.createdAt).getTime() >= todayStart.getTime()).length;
    const weekIncoming = inquiries.filter(i => new Date(i.createdAt).getTime() >= weekAgo).length;
    const unhandled = inquiries.filter(i => i.status === 'new').length;
    const inProgress = inquiries.filter(i => i.status === 'in_progress').length;
    const weekItems = inquiries.filter(i => new Date(i.createdAt).getTime() >= weekAgo);
    const weekRejected = weekItems.filter(i => i.status === 'rejected').length;
    const rejectionRate = weekItems.length > 0 ? Math.round((weekRejected / weekItems.length) * 100) : 0;
    const responseRate = inquiries.length > 0
      ? Math.round((inquiries.filter(i => i.status !== 'new').length / inquiries.length) * 100)
      : 0;
    const converted = inquiries.filter(i => i.status === 'converted').length;
    const conversionRate = inquiries.length > 0 ? Math.round((converted / inquiries.length) * 100) : 0;

    return { todayIncoming, weekIncoming, unhandled, inProgress, converted, conversionRate, rejectionRate, responseRate };
  }, [inquiries]);

  // 응답 권장 — 24h 이상 미처리된 new + 진행 중
  const urgent = useMemo(() => {
    return inquiries
      .filter(i => i.status === 'new' || i.status === 'contacted')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(0, 5);
  }, [inquiries]);

  // 최근 7일 활동 — status 변경 추적이 없으므로 createdAt 기준
  const recentActivity = useMemo(() => {
    return [...inquiries]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [inquiries]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-ink-100">
        <LoadingState label="로딩 중..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-2xl border border-ink-100">
        <EmptyState
          icon={AlertTriangle}
          title="문의를 불러오지 못했습니다"
          description="네트워크 상태를 확인한 뒤 다시 시도해 주세요"
          iconColor="text-red-500"
          iconBgColor="bg-red-50"
          action={{ label: '다시 시도', onClick: load }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPICard
          label="오늘 인입"
          value={<>{stats.todayIncoming}<span className="text-[12px] font-medium text-[var(--color-ink-400)] ml-1">건</span></>}
          sub={`이번 주 ${stats.weekIncoming}건`}
          icon={<Mail size={11} className="text-blue-500" />}
        />
        <button onClick={() => onSwitchTab('new')} className="text-left cursor-pointer rounded-lg [&>div]:transition-colors [&:hover>div]:border-orange-200">
          <KPICard
            label="미처리"
            value={<>{stats.unhandled}<span className="text-[12px] font-medium text-[var(--color-ink-400)] ml-1">건</span></>}
            sub={stats.unhandled > 0 ? '응답 필요' : '모두 처리됨'}
            tone={stats.unhandled > 0 ? 'bad' : 'default'}
            icon={<AlertTriangle size={11} className="text-red-500" />}
          />
        </button>
        <KPICard
          label="진행 중"
          value={<>{stats.inProgress}<span className="text-[12px] font-medium text-[var(--color-ink-400)] ml-1">건</span></>}
          tone="brand"
          icon={<Clock size={11} className="text-orange-500" />}
        />
        <KPICard
          label="수주"
          value={<>{stats.converted}<span className="text-[12px] font-medium text-[var(--color-ink-400)] ml-1">건</span></>}
          sub={`전환율 ${stats.conversionRate}%`}
          tone="ok"
          icon={<FileSignature size={11} className="text-green-500" />}
        />
        <KPICard
          label="이번 주 거절율"
          value={<>{stats.rejectionRate}<span className="text-[12px] font-medium text-[var(--color-ink-400)] ml-1">%</span></>}
          sub={`응답률 ${stats.responseRate}%`}
          icon={<XCircle size={11} className="text-[var(--color-ink-400)]" />}
        />
      </div>

      {/* 응답 권장 + 최근 활동 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* 응답 권장 */}
        <div className="bg-white rounded-2xl border border-ink-100">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#f8f7f6]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-section">응답 권장 (오래된 순)</span>
              <span className="text-[11px] font-semibold text-[#a8a29e]">{urgent.length}</span>
            </div>
            {urgent.length > 0 && (
              <button onClick={() => onSwitchTab('new')} className="flex items-center gap-1 text-[12px] font-semibold text-orange-500 hover:text-orange-600">
                전체 보기 <ArrowRight size={12} />
              </button>
            )}
          </div>
          {urgent.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="처리 안 된 문의가 없어요"
              description="응답이 필요한 문의가 들어오면 여기에 표시됩니다"
              iconColor="text-green-500"
              iconBgColor="bg-green-50"
              size="compact"
            />
          ) : (
            <ul>
              {urgent.map((iq, idx) => {
                const days = daysAgo(iq.createdAt) ?? 0;
                const isUrgent = days >= 1;
                return (
                  <li key={iq.id} className={`flex items-center justify-between px-6 py-3 ${idx < urgent.length - 1 ? 'border-b border-[#f8f7f6]' : ''}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                        <User size={13} className="text-orange-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[#1c1917] truncate">{iq.name}</div>
                        <div className="text-[11px] text-[var(--color-ink-400)] truncate">{iq.projectType} · {iq.phone}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[11px] font-bold ${isUrgent ? 'text-red-500' : 'text-[#78716c]'}`}>
                        {days === 0 ? '오늘' : `${days}일 전`}
                      </span>
                      <QueueStatusBadge status={iq.status} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 최근 활동 사이드바 */}
        <div className="bg-white rounded-2xl border border-ink-100">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[#f8f7f6]">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-section">최근 인입</span>
          </div>
          {recentActivity.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="인입 없음"
              description="새 문의가 들어오면 여기에 표시됩니다"
              size="compact"
            />
          ) : (
            <ul>
              {recentActivity.map((iq, idx) => (
                <li key={iq.id} className={`px-5 py-3 ${idx < recentActivity.length - 1 ? 'border-b border-[#f8f7f6]' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold text-[#1c1917] truncate">{iq.name}</div>
                    <div className="text-[10px] text-[var(--color-ink-400)] flex-shrink-0">{fmtDateTime(iq.createdAt)}</div>
                  </div>
                  <div className="text-[11px] text-[var(--color-ink-400)] mt-0.5 truncate">{iq.projectType}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 신규 문의 큐 (status = new + contacted)
// ─────────────────────────────────────────────────────────────

function InquiryQueue() {
  const toast = useToast();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getInquiries();
      setInquiries((data ?? []).filter(i => i.status === 'new' || i.status === 'contacted'));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const quickUpdate = async (id: string, status: InquiryStatus) => {
    setUpdatingId(id);
    const ok = await updateInquiryStatus(id, status);
    setUpdatingId(null);
    if (ok) {
      toast.success('상태가 변경되었습니다');
      load();
    } else {
      toast.error('변경 실패');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-ink-100">
        <LoadingState label="로딩 중..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-2xl border border-ink-100">
        <EmptyState
          icon={AlertTriangle}
          title="문의를 불러오지 못했습니다"
          description="네트워크 상태를 확인한 뒤 다시 시도해 주세요"
          iconColor="text-red-500"
          iconBgColor="bg-red-50"
          action={{ label: '다시 시도', onClick: load }}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-ink-100">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-[#f8f7f6]">
        <div className="w-2 h-2 rounded-full bg-orange-500" />
        <span className="text-section">처리 대기 큐</span>
        <span className="text-[11px] font-semibold text-[#a8a29e]">{inquiries.length}</span>
      </div>

      {inquiries.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title="처리 안 된 문의가 없어요"
          description="새 문의가 들어오면 여기에 표시됩니다"
          iconColor="text-green-500"
          iconBgColor="bg-green-50"
        />
      ) : (
        <ul>
          {inquiries.map((iq, idx) => {
            const days = daysAgo(iq.createdAt) ?? 0;
            const isUrgent = days >= 1 && iq.status === 'new';
            return (
              <li key={iq.id} className={`px-6 py-4 ${idx < inquiries.length - 1 ? 'border-b border-[#f8f7f6]' : ''}`}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0">
                    <User size={16} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-[#1c1917]">{iq.name}</span>
                      <QueueStatusBadge status={iq.status} />
                      {isUrgent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-600 flex items-center gap-0.5">
                          <AlertTriangle size={9} />
                          {days}일 경과
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[12px] text-[#78716c] flex-wrap">
                      <span className="flex items-center gap-1">
                        <Briefcase size={11} />
                        {iq.projectType}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail size={11} />
                        {iq.phone}
                      </span>
                      <span className="flex items-center gap-1 text-[var(--color-ink-400)]">
                        <Calendar size={11} />
                        {fmtDate(iq.createdAt)}
                      </span>
                    </div>
                    {iq.message && (
                      <p className="text-[12px] text-[#44403c] mt-1.5 line-clamp-2 leading-relaxed">
                        {iq.message}
                      </p>
                    )}
                  </div>
                  {/* 빠른 액션 */}
                  <div className="flex flex-col sm:flex-row gap-1.5 flex-shrink-0">
                    {iq.status === 'new' && (
                      <button
                        onClick={() => quickUpdate(iq.id, 'contacted')}
                        disabled={updatingId === iq.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50"
                      >
                        <Mail size={12} />
                        연락
                      </button>
                    )}
                    <button
                      onClick={() => quickUpdate(iq.id, 'in_progress')}
                      disabled={updatingId === iq.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50"
                    >
                      <ArrowRight size={12} />
                      진행
                    </button>
                    <button
                      onClick={() => quickUpdate(iq.id, 'rejected')}
                      disabled={updatingId === iq.id}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[var(--color-ink-100)] hover:bg-[var(--color-ink-200)] text-[#78716c] rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50"
                    >
                      <XCircle size={12} />
                      거절
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="px-6 py-3 border-t border-[#f8f7f6] flex justify-end">
        <Link
          href="/inquiries?tab=all"
          className="text-[12px] font-semibold text-orange-500 hover:text-orange-600 flex items-center gap-1"
        >
          전체 문의 관리로 이동 <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
