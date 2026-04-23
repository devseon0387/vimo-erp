'use client';

import { useState } from 'react';
import { Pencil, Trash2, Plus, Mail, Phone, Building2, User, MapPin, FolderOpen, Receipt, MessageSquare, FileText, Paperclip } from 'lucide-react';
import Link from 'next/link';
import type { Client, Project, Episode } from '@/types';
import { formatPhoneNumber } from '@/lib/utils';
import { isCorporateClient, STATUS_LABEL, type EnrichedClient, type ClientGroupStatus } from './ClientMasterList';

interface Props {
  client: EnrichedClient;
  projects: Project[];
  episodes: (Episode & { projectId: string })[];
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
  onNewProject: (client: Client) => void;
  onNotesChange: (clientId: string, notes: string) => Promise<void>;
}

type TabKey = 'projects' | 'settlement' | 'activity' | 'memo' | 'files';

function statusBadgeColor(status: ClientGroupStatus): 'ok' | 'brand' | 'warn' | 'muted' {
  if (status === 'active') return 'ok';
  if (status === 'standby') return 'brand';
  if (status === 'dormant') return 'warn';
  return 'muted';
}

function Badge({ label, color = 'muted' }: { label: string; color?: 'ok' | 'brand' | 'warn' | 'bad' | 'muted' }) {
  const bg: Record<string, { background: string; color: string }> = {
    ok:    { background: 'var(--color-ok-50)',    color: 'var(--color-ok-600)' },
    brand: { background: 'var(--color-brand-50)', color: 'var(--color-brand-600)' },
    warn:  { background: 'var(--color-warn-50)',  color: '#b45309' },
    bad:   { background: 'var(--color-bad-50)',   color: '#b91c1c' },
    muted: { background: 'var(--color-ink-100)',  color: 'var(--color-ink-600)' },
  };
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
      style={bg[color]}
    >
      {label}
    </span>
  );
}

function Avatar({ corporate, size = 52 }: { corporate: boolean; size?: number }) {
  const bg = corporate
    ? 'linear-gradient(135deg, #60a5fa, #2563eb)'
    : 'linear-gradient(135deg, var(--color-brand-400), var(--color-brand-600))';
  const Icon = corporate ? Building2 : User;
  return (
    <div
      style={{ width: size, height: size, borderRadius: 14, background: bg }}
      className="shrink-0 text-white inline-flex items-center justify-center select-none"
      title={corporate ? '기업' : '개인'}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={2.2} />
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'bad' | 'warn' }) {
  const valueColor =
    tone === 'ok' ? 'var(--color-ok-600)' :
    tone === 'bad' ? 'var(--color-bad-500)' :
    tone === 'warn' ? '#b45309' :
    'var(--color-ink-900)';
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'white', border: '1px solid var(--color-ink-200)' }}
    >
      <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--color-ink-400)' }}>
        {label}
      </div>
      <div className="text-[17px] font-bold mt-1" style={{ color: valueColor }}>
        {value}
      </div>
      {sub && <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--color-ink-500)' }}>{sub}</div>}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 text-[12.5px] font-semibold inline-flex items-center gap-1.5"
      style={{
        borderBottom: active ? '2px solid var(--color-brand-500)' : '2px solid transparent',
        color: active ? 'var(--color-brand-600)' : 'var(--color-ink-500)',
      }}
    >
      <Icon size={13} />
      {label}
      {count !== undefined && count > 0 && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{ background: active ? 'var(--color-brand-100)' : 'var(--color-ink-100)' }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── 탭 콘텐츠 ────────────────────────────────────────────────

function ProjectsTab({ projects, episodes }: { projects: Project[]; episodes: (Episode & { projectId: string })[] }) {
  if (projects.length === 0) {
    return (
      <div className="py-12 text-center text-[12.5px]" style={{ color: 'var(--color-ink-400)' }}>
        아직 등록된 프로젝트가 없어요
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {projects.map((p) => {
        const projEps = episodes.filter((e) => e.projectId === p.id);
        const completedEp = projEps.filter((e) => e.status === 'completed').length;
        const isCompleted = p.status === 'completed';
        return (
          <Link
            key={p.id}
            href={`/projects/${p.id}`}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--color-ink-50)] transition-colors"
            style={{ border: '1px solid var(--color-ink-200)', opacity: isCompleted ? 0.75 : 1 }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--color-ink-900)' }}>
                {p.title}
              </div>
              <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--color-ink-500)' }}>
                {projEps.length > 0 ? `회차 ${completedEp}/${projEps.length}` : '회차 없음'}
                {p.budget.totalAmount > 0 && ` · ₩${(p.budget.totalAmount / 10000).toFixed(0)}만`}
                {p.category && ` · ${p.category}`}
              </div>
            </div>
            <Badge
              label={isCompleted ? '완료' : p.status === 'in_progress' ? '진행' : p.status === 'planning' ? '기획' : '보류'}
              color={isCompleted ? 'muted' : p.status === 'in_progress' ? 'ok' : 'brand'}
            />
          </Link>
        );
      })}
    </div>
  );
}

function MemoTab({
  clientId,
  initialNotes,
  onSave,
}: {
  clientId: string;
  initialNotes: string;
  onSave: (clientId: string, notes: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = value !== initialNotes;

  const handleSave = async () => {
    setSaving(true);
    await onSave(clientId, value);
    setSaving(false);
    setSavedAt(Date.now());
  };

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="클라이언트에 대한 메모, 선호도, 주의사항 등을 기록해요"
        rows={10}
        className="w-full rounded-lg p-3 text-[13px] focus:outline-none"
        style={{
          background: 'var(--color-ink-50)',
          border: '1px solid var(--color-ink-200)',
          color: 'var(--color-ink-700)',
          lineHeight: 1.65,
          resize: 'vertical',
        }}
      />
      <div className="flex items-center justify-between mt-2">
        <div className="text-[11px]" style={{ color: 'var(--color-ink-400)' }}>
          {savedAt && !dirty && '저장됨 ✓'}
          {dirty && !saving && '저장되지 않은 변경사항'}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-3.5 py-1.5 rounded-md text-[12px] font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--color-brand-500)' }}
        >
          {saving ? '저장 중...' : '메모 저장'}
        </button>
      </div>
    </div>
  );
}

function ClientSettlementTab({
  projects,
  episodes,
}: {
  projects: Project[];
  episodes: (Episode & { projectId: string })[];
}) {
  // 클라이언트 소유 프로젝트의 에피소드만 사용
  const projectIds = new Set(projects.map((p) => p.id));
  const clientEpisodes = episodes.filter((e) => projectIds.has(e.projectId));
  const completedEps = clientEpisodes.filter((e) => e.status === 'completed');
  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const totalRevenue = completedEps.reduce((s, e) => s + (e.budget?.totalAmount || 0), 0);
  const thisMonth = completedEps.filter(
    (e) => e.completedAt && new Date(e.completedAt) >= thisMonthStart,
  );
  const thisMonthAmount = thisMonth.reduce((s, e) => s + (e.budget?.totalAmount || 0), 0);

  const unpaidEps = completedEps.filter((e) => e.paymentStatus !== 'completed');
  const unpaidAmount = unpaidEps.reduce((s, e) => s + (e.budget?.totalAmount || 0), 0);

  const uninvoicedEps = completedEps.filter((e) => e.invoiceStatus !== 'completed');
  const uninvoicedAmount = uninvoicedEps.reduce((s, e) => s + (e.budget?.totalAmount || 0), 0);

  if (projects.length === 0) {
    return (
      <div className="py-10 text-center" style={{ color: 'var(--color-ink-400)' }}>
        <Receipt size={28} className="mx-auto mb-2" />
        <div className="text-[12.5px]">아직 정산할 프로젝트가 없어요</div>
      </div>
    );
  }

  // 프로젝트별 집계
  const projectRows = projects.map((p) => {
    const projEps = clientEpisodes.filter((e) => e.projectId === p.id);
    const completed = projEps.filter((e) => e.status === 'completed');
    const paid = completed.filter((e) => e.paymentStatus === 'completed');
    const invoiced = completed.filter((e) => e.invoiceStatus === 'completed');
    const completedAmt = completed.reduce((s, e) => s + (e.budget?.totalAmount || 0), 0);
    const paidAmt = paid.reduce((s, e) => s + (e.budget?.totalAmount || 0), 0);
    return {
      project: p,
      totalEp: projEps.length,
      completedEp: completed.length,
      paidEp: paid.length,
      invoicedEp: invoiced.length,
      completedAmt,
      paidAmt,
      outstandingAmt: completedAmt - paidAmt,
    };
  }).filter((r) => r.totalEp > 0 || r.completedAmt > 0);

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-4 gap-2">
        <Kpi label="이번 달 매출" value={thisMonthAmount > 0 ? `₩${(thisMonthAmount / 10000).toFixed(0)}만` : '-'} sub={`${thisMonth.length}건 완료`} />
        <Kpi label="누적 매출" value={totalRevenue > 0 ? `₩${(totalRevenue / 10000).toFixed(0)}만` : '-'} sub={`${completedEps.length}건`} />
        <Kpi
          label="미수금"
          value={unpaidAmount > 0 ? `₩${(unpaidAmount / 10000).toFixed(0)}만` : '-'}
          sub={unpaidEps.length > 0 ? `${unpaidEps.length}건 미입금` : '전부 입금 완료'}
          tone={unpaidAmount > 0 ? 'bad' : undefined}
        />
        <Kpi
          label="미발행"
          value={uninvoicedAmount > 0 ? `₩${(uninvoicedAmount / 10000).toFixed(0)}만` : '-'}
          sub={uninvoicedEps.length > 0 ? `${uninvoicedEps.length}건 미발행` : '전부 발행 완료'}
          tone={uninvoicedAmount > 0 ? 'warn' : undefined}
        />
      </div>

      {/* 프로젝트별 집계 */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--color-ink-200)' }}
      >
        <div
          className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{ background: 'var(--color-ink-50)', color: 'var(--color-ink-500)' }}
        >
          <div>프로젝트</div>
          <div className="text-right">완료 회차</div>
          <div className="text-right">입금</div>
          <div className="text-right">청구액</div>
        </div>
        {projectRows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px]" style={{ color: 'var(--color-ink-400)' }}>
            완료된 회차가 없어요
          </div>
        ) : (
          projectRows.map((r) => (
            <Link
              key={r.project.id}
              href={`/projects/${r.project.id}`}
              className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 items-center hover:bg-[var(--color-ink-50)] transition-colors"
              style={{ borderTop: '1px solid var(--color-ink-200)' }}
            >
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--color-ink-900)' }}>
                  {r.project.title}
                </div>
                {r.outstandingAmt > 0 && (
                  <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--color-bad-500)' }}>
                    미수 ₩{(r.outstandingAmt / 10000).toFixed(0)}만
                  </div>
                )}
              </div>
              <div className="text-[12px] tabular-nums" style={{ color: 'var(--color-ink-700)' }}>
                {r.completedEp} / {r.totalEp}
              </div>
              <div className="text-[12px] tabular-nums" style={{ color: 'var(--color-ink-700)' }}>
                {r.completedEp > 0 ? (
                  <span style={{ color: r.paidEp === r.completedEp ? 'var(--color-ok-600)' : 'var(--color-ink-500)' }}>
                    {r.paidEp} / {r.completedEp}
                  </span>
                ) : '-'}
              </div>
              <div className="text-[12.5px] font-semibold tabular-nums" style={{ color: 'var(--color-ink-900)' }}>
                ₩{(r.completedAmt / 10000).toFixed(0)}만
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="flex items-center justify-between text-[11.5px]" style={{ color: 'var(--color-ink-500)' }}>
        <span>상세 정산 내역 · 월별 추이는 아래 링크에서 확인</span>
        <div className="flex gap-3">
          <Link href="/settlement" className="hover:underline" style={{ color: 'var(--color-brand-600)' }}>월별 정산 →</Link>
          <Link href="/finance/invoices" className="hover:underline" style={{ color: 'var(--color-brand-600)' }}>세금계산서 →</Link>
        </div>
      </div>
    </div>
  );
}

function ActivityTabPlaceholder() {
  return (
    <div className="py-10 text-center" style={{ color: 'var(--color-ink-400)' }}>
      <MessageSquare size={28} className="mx-auto mb-2" />
      <div className="text-[12.5px] font-semibold" style={{ color: 'var(--color-ink-600)' }}>활동 로그 (Phase 3)</div>
      <div className="text-[11px] mt-1">메일·통화·미팅·파일 송수신 타임라인 예정</div>
    </div>
  );
}

function FilesTabPlaceholder() {
  return (
    <div className="py-10 text-center" style={{ color: 'var(--color-ink-400)' }}>
      <Paperclip size={28} className="mx-auto mb-2" />
      <div className="text-[12.5px] font-semibold" style={{ color: 'var(--color-ink-600)' }}>파일 (Phase 3)</div>
      <div className="text-[11px] mt-1">계약서·견적서 등 관련 파일 첨부 공간 예정</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

export function ClientDetailView({ client, projects, episodes, onEdit, onDelete, onNewProject, onNotesChange }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('projects');

  const completedCount = projects.filter((p) => p.status === 'completed').length;
  const avgDeal = completedCount > 0
    ? Math.round(projects.filter((p) => p.status === 'completed').reduce((s, p) => s + (p.budget.totalAmount || 0), 0) / completedCount)
    : 0;

  const lastContact = client.lastContactDays === null
    ? '정보 없음'
    : client.lastContactDays < 1
      ? '오늘'
      : client.lastContactDays < 7
        ? `${client.lastContactDays}일 전`
        : client.lastContactDays < 30
          ? `${Math.round(client.lastContactDays / 7)}주 전`
          : `${Math.round(client.lastContactDays / 30)}달 전`;

  const contactTone: 'ok' | 'warn' | 'bad' | undefined =
    client.lastContactDays === null ? undefined :
    client.lastContactDays <= 14 ? 'ok' :
    client.lastContactDays <= 60 ? 'warn' : 'bad';

  return (
    <div
      className="rounded-xl p-5 md:p-6 h-full overflow-y-auto"
      style={{ background: 'white', border: '1px solid var(--color-ink-200)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar corporate={isCorporateClient(client)} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[20px] font-bold truncate" style={{ color: 'var(--color-ink-900)' }}>
                {client.name}
              </h2>
              <Badge
                label={STATUS_LABEL[client.computedStatus]}
                color={statusBadgeColor(client.computedStatus)}
              />
              <Badge
                label={isCorporateClient(client) ? '기업' : '개인'}
                color={isCorporateClient(client) ? 'brand' : 'muted'}
              />
              {client.computedStatus === 'active' && client.activeProjectCount >= 3 && (
                <Badge label="VIP" color="ok" />
              )}
              {client.needsContact && <Badge label="연락 필요" color="warn" />}
            </div>
            <div className="text-[12px] mt-1 flex items-center gap-3 flex-wrap" style={{ color: 'var(--color-ink-500)' }}>
              {client.contactPerson && (
                <span>담당 <b style={{ color: 'var(--color-ink-700)' }}>{client.contactPerson}</b></span>
              )}
              {client.company && <span>{client.company}</span>}
              <span>{new Date(client.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric' })}부터 거래</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(client)}
            className="w-8 h-8 rounded-md inline-flex items-center justify-center"
            style={{ border: '1px solid var(--color-ink-300)', color: 'var(--color-ink-600)' }}
            title="편집"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(client)}
            className="w-8 h-8 rounded-md inline-flex items-center justify-center"
            style={{ border: '1px solid var(--color-ink-300)', color: '#b91c1c' }}
            title="삭제"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => onNewProject(client)}
            className="px-3 h-8 rounded-md text-[12px] font-semibold text-white inline-flex items-center gap-1.5"
            style={{ background: 'var(--color-brand-500)' }}
          >
            <Plus size={13} /> 새 프로젝트
          </button>
        </div>
      </div>

      {/* Contact row */}
      {(client.email || client.phone || client.address) && (
        <div
          className="rounded-lg p-3 mb-4 flex items-center gap-4 flex-wrap text-[12px]"
          style={{ background: 'var(--color-ink-50)', color: 'var(--color-ink-600)' }}
        >
          {client.email && (
            <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 hover:text-[var(--color-brand-600)]">
              <Mail size={12} /> {client.email}
            </a>
          )}
          {client.phone && (
            <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 hover:text-[var(--color-brand-600)]">
              <Phone size={12} /> {formatPhoneNumber(client.phone)}
            </a>
          )}
          {client.address && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={12} /> {client.address}
            </span>
          )}
          {client.company && (
            <span className="inline-flex items-center gap-1.5">
              <Building2 size={12} /> {client.company}
            </span>
          )}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <Kpi
          label="활성 프로젝트"
          value={String(client.activeProjectCount)}
          sub={client.projectCount > 0 ? `전체 ${client.projectCount}건` : undefined}
        />
        <Kpi
          label="누적 매출"
          value={client.totalRevenue > 0 ? `₩${(client.totalRevenue / 10000).toFixed(0)}만` : '-'}
        />
        <Kpi
          label="평균 단가"
          value={avgDeal > 0 ? `₩${(avgDeal / 10000).toFixed(0)}만` : '-'}
          sub={completedCount > 0 ? `완료 ${completedCount}건` : undefined}
        />
        <Kpi label="최근 연락" value={lastContact} tone={contactTone} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid var(--color-ink-200)' }}>
        <TabButton active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} icon={FolderOpen} label="프로젝트" count={projects.length} />
        <TabButton active={activeTab === 'settlement'} onClick={() => setActiveTab('settlement')} icon={Receipt} label="정산" />
        <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')} icon={MessageSquare} label="활동" />
        <TabButton active={activeTab === 'memo'} onClick={() => setActiveTab('memo')} icon={FileText} label="메모" />
        <TabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} icon={Paperclip} label="파일" />
      </div>

      {/* Tab content */}
      {activeTab === 'projects' && <ProjectsTab projects={projects} episodes={episodes} />}
      {activeTab === 'settlement' && <ClientSettlementTab projects={projects} episodes={episodes} />}
      {activeTab === 'activity' && <ActivityTabPlaceholder />}
      {activeTab === 'memo' && (
        <MemoTab
          key={client.id}
          clientId={client.id}
          initialNotes={client.notes ?? ''}
          onSave={onNotesChange}
        />
      )}
      {activeTab === 'files' && <FilesTabPlaceholder />}
    </div>
  );
}
