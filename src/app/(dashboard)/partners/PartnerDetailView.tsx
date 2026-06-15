'use client';

import { useState } from 'react';
import { Pencil, Trash2, Plus, Mail, Phone, User, Briefcase, Film, FolderOpen, Receipt, DollarSign } from 'lucide-react';
import Link from 'next/link';
import type { Partner, Project, Episode } from '@/types';
import { formatPhoneNumber } from '@/lib/utils';
import { isBusinessPartner, PARTNER_STATUS_LABEL, type EnrichedPartner, type PartnerGroupStatus } from './PartnerMasterList';
import { TabBar } from '@/components/TabBar';
import { KPICard } from '@/components/KPICard';
import { StatusBadge, type StatusTone } from '@/components/StatusBadge';

interface Props {
  partner: EnrichedPartner;
  projects: Project[];
  episodes: (Episode & { projectId: string })[];
  onEdit: (partner: Partner) => void;
  onDelete: (partner: Partner) => void;
}

type TabKey = 'episodes' | 'projects' | 'settlement';

function statusBadgeColor(status: PartnerGroupStatus): 'ok' | 'brand' | 'warn' | 'muted' {
  if (status === 'active') return 'ok';
  if (status === 'standby') return 'brand';
  if (status === 'dormant') return 'warn';
  return 'muted';
}

// 공용 StatusBadge로 위임 — 로컬 색 사전 제거(전 페이지 상태칩 통일).
const BADGE_TONE: Record<'ok' | 'brand' | 'warn' | 'bad' | 'muted', StatusTone> = {
  ok: 'ok',
  brand: 'brand',
  warn: 'warn',
  bad: 'danger',
  muted: 'neutral',
};

function Badge({ label, color = 'muted' }: { label: string; color?: 'ok' | 'brand' | 'warn' | 'bad' | 'muted' }) {
  return <StatusBadge tone={BADGE_TONE[color]}>{label}</StatusBadge>;
}

function Avatar({ business, inactive = false, size = 52 }: { business: boolean; inactive?: boolean; size?: number }) {
  const tint = inactive
    ? { bg: 'var(--color-ink-100)', fg: 'var(--color-ink-400)' }
    : business
      ? { bg: '#eff6ff', fg: '#2563eb' }
      : { bg: 'var(--color-brand-50)', fg: 'var(--color-brand-600)' };
  const Icon = business ? Briefcase : User;
  return (
    <div
      style={{ width: size, height: size, borderRadius: 14, background: tint.bg, color: tint.fg }}
      className="shrink-0 inline-flex items-center justify-center select-none"
      title={business ? '사업자' : '프리랜서'}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={2.2} />
    </div>
  );
}

// ── 탭 콘텐츠 ────────────────────────────────────────────────

function EpisodesTab({ episodes, projects }: { episodes: (Episode & { projectId: string })[]; projects: Project[] }) {
  if (episodes.length === 0) {
    return (
      <div className="py-12 text-center text-[12.5px]" style={{ color: 'var(--color-ink-400)' }}>
        할당된 회차가 없어요
      </div>
    );
  }
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const sorted = [...episodes].sort((a, b) => {
    const ad = a.completedAt || a.dueDate || a.startDate || '';
    const bd = b.completedAt || b.dueDate || b.startDate || '';
    return bd.localeCompare(ad);
  });
  return (
    <div className="space-y-2">
      {sorted.slice(0, 30).map((ep) => {
        const proj = projectMap.get(ep.projectId);
        const badge =
          ep.status === 'completed' ? { label: '완료', color: 'muted' as const } :
          ep.status === 'in_progress' ? { label: '진행', color: 'ok' as const } :
          ep.status === 'review' ? { label: '검토', color: 'warn' as const } :
          { label: '대기', color: 'muted' as const };
        return (
          <Link
            key={ep.id}
            href={proj ? `/projects/${proj.id}/episodes/${ep.id}` : '#'}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--color-ink-50)] transition-colors"
            style={{ border: '1px solid var(--color-ink-200)', opacity: ep.status === 'completed' ? 0.75 : 1 }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--color-ink-900)' }}>
                {proj?.title ?? '프로젝트'} · Ep {ep.episodeNumber ?? '?'}{ep.title ? ` · ${ep.title}` : ''}
              </div>
              <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--color-ink-500)' }}>
                {ep.budget?.partnerPayment ? `₩${(ep.budget.partnerPayment / 10000).toFixed(0)}만` : '단가 미정'}
                {ep.completedAt && ` · 완료 ${ep.completedAt.slice(0, 10)}`}
                {!ep.completedAt && ep.dueDate && ` · 마감 ${ep.dueDate.slice(0, 10)}`}
              </div>
            </div>
            <Badge label={badge.label} color={badge.color} />
          </Link>
        );
      })}
      {sorted.length > 30 && (
        <div className="text-center text-[11px] pt-2" style={{ color: 'var(--color-ink-400)' }}>
          최근 30건만 표시
        </div>
      )}
    </div>
  );
}

function ProjectsTab({ projects, episodes }: { projects: Project[]; episodes: (Episode & { projectId: string })[] }) {
  if (projects.length === 0) {
    return (
      <div className="py-12 text-center text-[12.5px]" style={{ color: 'var(--color-ink-400)' }}>
        참여한 프로젝트가 없어요
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {projects.map((p) => {
        const projEps = episodes.filter((e) => e.projectId === p.id);
        const completedEp = projEps.filter((e) => e.status === 'completed').length;
        return (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--color-ink-50)] transition-colors"
            style={{ border: '1px solid var(--color-ink-200)', opacity: p.status === 'completed' ? 0.75 : 1 }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--color-ink-900)' }}>
                {p.title}
              </div>
              <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--color-ink-500)' }}>
                {p.client}
                {projEps.length > 0 && ` · 할당 회차 ${completedEp}/${projEps.length}`}
              </div>
            </div>
            <Badge
              label={p.status === 'completed' ? '완료' : p.status === 'in_progress' ? '진행' : p.status === 'planning' ? '기획' : '보류'}
              color={p.status === 'completed' ? 'muted' : p.status === 'in_progress' ? 'ok' : 'brand'}
            />
          </Link>
        );
      })}
    </div>
  );
}

function SettlementTab({ partner, episodes, projects }: { partner: EnrichedPartner; episodes: (Episode & { projectId: string })[]; projects: Project[] }) {
  const completedEps = episodes.filter((e) => e.status === 'completed');
  const totalEarned = completedEps.reduce((s, e) => s + (e.budget?.partnerPayment || 0), 0);

  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const thisMonth = completedEps.filter(
    (e) => e.completedAt && new Date(e.completedAt) >= thisMonthStart,
  );
  const thisMonthAmount = thisMonth.reduce((s, e) => s + (e.budget?.partnerPayment || 0), 0);

  // paymentStatus: 'completed'인 건은 지급 완료, pending은 미지급
  const unpaidEps = completedEps.filter((e) => e.paymentStatus !== 'completed');
  const unpaidAmount = unpaidEps.reduce((s, e) => s + (e.budget?.partnerPayment || 0), 0);

  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const recentUnpaid = [...unpaidEps]
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 8);

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KPICard
          label="이번 달 완료"
          value={`${thisMonth.length}건`}
          sub={thisMonthAmount > 0 ? `₩${(thisMonthAmount / 10000).toFixed(0)}만` : undefined}
        />
        <KPICard
          label="누적 정산액"
          value={totalEarned > 0 ? `₩${(totalEarned / 10000).toFixed(0)}만` : '-'}
          sub={`완료 ${completedEps.length}건`}
        />
        <KPICard
          label="미지급"
          value={unpaidAmount > 0 ? `₩${(unpaidAmount / 10000).toFixed(0)}만` : '-'}
          sub={unpaidEps.length > 0 ? `${unpaidEps.length}건 미지급` : '전부 지급 완료'}
          tone={unpaidAmount > 0 ? 'bad' : 'ok'}
        />
        <KPICard
          label="이번 달 지급예정"
          value={thisMonthAmount > 0 ? `₩${(thisMonthAmount / 10000).toFixed(0)}만` : '-'}
          sub={thisMonth.length > 0 ? `${thisMonth.length}건 완료분` : '완료 건 없음'}
        />
      </div>

      {/* 계좌 정보 */}
      <div
        className="rounded-lg p-4"
        style={{ background: 'var(--color-ink-50)', border: '1px solid var(--color-ink-200)' }}
      >
        <div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--color-ink-700)' }}>
          계좌 정보
        </div>
        {partner.bank || partner.bankAccount ? (
          <div className="text-[12.5px]" style={{ color: 'var(--color-ink-700)' }}>
            <span className="font-semibold">{partner.bank ?? '은행 미지정'}</span>
            {partner.bankAccount && <span className="ml-2 tabular-nums">{partner.bankAccount}</span>}
          </div>
        ) : (
          <div className="text-[12px]" style={{ color: 'var(--color-ink-400)' }}>
            계좌 정보가 등록되지 않았어요
          </div>
        )}
      </div>

      {/* 미지급 회차 목록 */}
      {unpaidEps.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--color-ink-200)' }}
        >
          <div
            className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider flex items-center justify-between"
            style={{ background: 'var(--color-ink-50)', color: 'var(--color-ink-500)' }}
          >
            <span>미지급 회차</span>
            <span>{unpaidEps.length}건 · ₩{(unpaidAmount / 10000).toFixed(0)}만</span>
          </div>
          {recentUnpaid.map((ep) => {
            const proj = projectMap.get(ep.projectId);
            return (
              <Link
                key={ep.id}
                href={proj ? `/projects/${proj.id}/episodes/${ep.id}` : '#'}
                className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 items-center hover:bg-[var(--color-ink-50)] transition-colors"
                style={{ borderTop: '1px solid var(--color-ink-200)' }}
              >
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--color-ink-900)' }}>
                    {proj?.title ?? '프로젝트'} · Ep {ep.episodeNumber ?? '?'}
                  </div>
                  <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--color-ink-500)' }}>
                    {ep.completedAt ? `완료 ${ep.completedAt.slice(0, 10)}` : '완료일 미상'}
                  </div>
                </div>
                <Badge label="미지급" color="bad" />
                <div className="text-[12.5px] font-semibold tabular-nums" style={{ color: 'var(--color-ink-900)' }}>
                  ₩{((ep.budget?.partnerPayment || 0) / 10000).toFixed(0)}만
                </div>
              </Link>
            );
          })}
          {unpaidEps.length > recentUnpaid.length && (
            <div
              className="text-center text-[11px] py-2"
              style={{ borderTop: '1px solid var(--color-ink-200)', color: 'var(--color-ink-400)' }}
            >
              최근 {recentUnpaid.length}건만 표시 · 전체 {unpaidEps.length}건
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end text-[11.5px]">
        <Link href="/finance/partner-settlement" className="hover:underline" style={{ color: 'var(--color-brand-600)' }}>
          파트너 정산 페이지 →
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

export function PartnerDetailView({ partner, projects, episodes, onEdit, onDelete }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('episodes');

  const completedEpisodesCount = episodes.filter((e) => e.status === 'completed').length;

  const lastActivity = partner.lastActivityDays === null
    ? '정보 없음'
    : partner.lastActivityDays < 1
      ? '오늘'
      : partner.lastActivityDays < 7
        ? `${partner.lastActivityDays}일 전`
        : partner.lastActivityDays < 30
          ? `${Math.round(partner.lastActivityDays / 7)}주 전`
          : `${Math.round(partner.lastActivityDays / 30)}달 전`;

  const activityTone: 'ok' | 'warn' | 'bad' | undefined =
    partner.lastActivityDays === null ? undefined :
    partner.lastActivityDays <= 14 ? 'ok' :
    partner.lastActivityDays <= 60 ? 'warn' : 'bad';

  const positionLabel = partner.position === 'executive' ? '임원' :
                         partner.position === 'manager' ? '매니저' : null;

  return (
    <div
      className="rounded-xl p-4 md:p-5 h-full overflow-y-auto"
      style={{ background: 'white', border: '1px solid var(--color-ink-200)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar business={isBusinessPartner(partner)} inactive={partner.computedStatus === 'inactive'} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-page truncate">
                {partner.name}
              </h2>
              <Badge
                label={PARTNER_STATUS_LABEL[partner.computedStatus]}
                color={statusBadgeColor(partner.computedStatus)}
              />
              <Badge
                label={isBusinessPartner(partner) ? '사업자' : '프리랜서'}
                color={isBusinessPartner(partner) ? 'brand' : 'muted'}
              />
              {positionLabel && <Badge label={positionLabel} color="brand" />}
              {partner.generation && <Badge label={`${partner.generation}기`} color="muted" />}
              {partner.needsContact && <Badge label="연락 필요" color="warn" />}
            </div>
            <div className="text-[12px] mt-1 flex items-center gap-3 flex-wrap" style={{ color: 'var(--color-ink-500)' }}>
              {partner.jobRank && <span>{partner.jobRank}</span>}
              {partner.jobTitle && <span>{partner.jobTitle}</span>}
              {partner.company && <span>{partner.company}</span>}
              {partner.createdAt && (
                <span>{new Date(partner.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric' })}부터 협업</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(partner)}
            className="w-8 h-8 rounded-md inline-flex items-center justify-center"
            style={{ border: '1px solid var(--color-ink-300)', color: 'var(--color-ink-600)' }}
            title="편집"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(partner)}
            className="w-8 h-8 rounded-md inline-flex items-center justify-center"
            style={{ border: '1px solid var(--color-ink-300)', color: '#b91c1c' }}
            title="삭제"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Contact row */}
      {(partner.email || partner.phone) && (
        <div
          className="rounded-lg p-3 mb-4 flex items-center gap-3 flex-wrap text-[12px]"
          style={{ background: 'var(--color-ink-50)', color: 'var(--color-ink-600)' }}
        >
          {partner.email && (
            <a href={`mailto:${partner.email}`} className="inline-flex items-center gap-1.5 hover:text-[var(--color-brand-600)]">
              <Mail size={12} /> {partner.email}
            </a>
          )}
          {partner.phone && (
            <a href={`tel:${partner.phone}`} className="inline-flex items-center gap-1.5 hover:text-[var(--color-brand-600)]">
              <Phone size={12} /> {formatPhoneNumber(partner.phone)}
            </a>
          )}
          {(partner.bank || partner.bankAccount) && (
            <span className="inline-flex items-center gap-1.5">
              <DollarSign size={12} /> {partner.bank}{partner.bankAccount && ` · ${partner.bankAccount}`}
            </span>
          )}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <KPICard
          label="진행 중 회차"
          value={String(partner.activeEpisodeCount)}
          sub={completedEpisodesCount > 0 ? `완료 ${completedEpisodesCount}건` : undefined}
        />
        <KPICard
          label="참여 프로젝트"
          value={String(partner.projectCount)}
        />
        <KPICard
          label="이번 달 정산"
          value={partner.thisMonthRevenue > 0 ? `₩${(partner.thisMonthRevenue / 10000).toFixed(0)}만` : '-'}
        />
        <KPICard
          label="최근 활동"
          value={lastActivity}
          tone={activityTone}
        />
      </div>

      {/* Tabs */}
      <div className="mb-4">
        <TabBar
          items={[
            { key: 'episodes', label: '회차', icon: Film, count: episodes.length },
            { key: 'projects', label: '프로젝트', icon: FolderOpen, count: projects.length },
            { key: 'settlement', label: '정산', icon: Receipt },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Tab content */}
      {activeTab === 'episodes' && <EpisodesTab episodes={episodes} projects={projects} />}
      {activeTab === 'projects' && <ProjectsTab projects={projects} episodes={episodes} />}
      {activeTab === 'settlement' && <SettlementTab partner={partner} episodes={episodes} projects={projects} />}
    </div>
  );
}
