'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getProjects, getAllEpisodes, getPartners } from '@/lib/supabase/db';
import type { Project, Episode, Partner } from '@/types';

type Period = 'week' | 'month';
type SidebarKey = 'projects' | 'partners' | 'manager' | 'inquiries' | 'marketing';

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}
function startOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x;
}
function endOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  return x;
}
function fmtKor(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}

function statusChip(status: Project['status']): { label: string; className: string } {
  switch (status) {
    case 'in_progress': return { label: '진행', className: 'bg-warn-50 text-warn-700' };
    case 'completed': return { label: '마감', className: 'bg-ok-50 text-ok-700' };
    case 'planning': return { label: '시작', className: 'bg-blue-100 text-blue-700' };
    case 'on_hold': return { label: '보류', className: 'bg-ink-100 text-ink-600' };
    default: return { label: status, className: 'bg-ink-100 text-ink-600' };
  }
}

export default function ManagementReport() {
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const [activeSidebar, setActiveSidebar] = useState<SidebarKey>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [episodes, setEpisodes] = useState<(Episode & { projectId: string })[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, e, pt] = await Promise.all([getProjects(), getAllEpisodes(), getPartners()]);
        setProjects(p);
        setEpisodes(e);
        setPartners(pt);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const partnerNameMap = useMemo(() => {
    const m = new Map<string, string>();
    partners.forEach(p => m.set(p.id, p.name));
    return m;
  }, [partners]);

  const now = useMemo(() => new Date(), []);
  const { rangeStart, rangeEnd, ticks, periodLabel } = useMemo(() => {
    if (period === 'week') {
      // offset=0: 지난 주, offset=1: 2주 전, ...
      const thisWeekStart = startOfWeek(now);
      const anchor = new Date(thisWeekStart);
      anchor.setDate(thisWeekStart.getDate() - 7 * (offset + 1));
      const s = startOfWeek(anchor);
      const e = endOfWeek(anchor);
      const t: Date[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(s);
        d.setDate(s.getDate() + i);
        t.push(d);
      }
      const m = s.getMonth() + 1;
      const weekOfMonth = Math.ceil((s.getDate() + new Date(s.getFullYear(), s.getMonth(), 1).getDay()) / 7);
      return { rangeStart: s, rangeEnd: e, ticks: t, periodLabel: `${m}월 ${weekOfMonth}주차` };
    } else {
      // offset=0: 지난 달, offset=1: 2달 전
      const anchor = new Date(now.getFullYear(), now.getMonth() - 1 - offset, 15);
      const s = startOfMonth(anchor);
      const e = endOfMonth(anchor);
      const t: Date[] = [];
      const weeks = Math.ceil(e.getDate() / 7);
      for (let i = 0; i <= weeks; i++) {
        const d = new Date(s);
        d.setDate(Math.min(s.getDate() + i * 7, e.getDate()));
        t.push(d);
      }
      return { rangeStart: s, rangeEnd: e, ticks: t, periodLabel: `${s.getFullYear()}년 ${s.getMonth() + 1}월` };
    }
  }, [period, offset, now]);

  const activeProjects = useMemo(() => {
    return projects.filter(p => {
      if (p.status === 'archived') return false;
      const created = p.createdAt ? new Date(p.createdAt) : null;
      const completed = p.completedAt ? new Date(p.completedAt) : null;

      // 완료/아카이브된 프로젝트는 완료 시점이 기간 내에 있어야만 표시
      if (completed) {
        return completed >= rangeStart && completed <= rangeEnd;
      }
      // 진행 중인 프로젝트: 이미 시작됐고 아직 완료 안 됐으면 기간에 걸쳐있음
      if (created && created <= rangeEnd) return true;
      return false;
    });
  }, [projects, rangeStart, rangeEnd]);

  const projectMetrics = useMemo(() => {
    return activeProjects.map(p => {
      const eps = episodes.filter(e => e.projectId === p.id);
      const partnerSum = eps.reduce((a, e) => a + (e.budget?.partnerPayment ?? 0), 0);
      const managerSum = eps.reduce((a, e) => a + (e.budget?.managementFee ?? 0), 0);
      const created = p.createdAt ? new Date(p.createdAt) : null;
      const completed = p.completedAt ? new Date(p.completedAt) : null;
      const isStartInPeriod = !!created && created >= rangeStart && created <= rangeEnd;
      const isEndInPeriod = !!completed && completed >= rangeStart && completed <= rangeEnd;
      return {
        project: p,
        partnerSum,
        managerSum,
        episodeCount: eps.length,
        isStartInPeriod,
        isEndInPeriod,
      };
    });
  }, [activeProjects, episodes, rangeStart, rangeEnd]);

  const totals = useMemo(() => {
    const started = projectMetrics.filter(m => m.isStartInPeriod).length;
    const ended = projectMetrics.filter(m => m.isEndInPeriod).length;
    const ongoing = projectMetrics.length - started - ended;
    const partnerSum = projectMetrics.reduce((a, m) => a + m.partnerSum, 0);
    const managerSum = projectMetrics.reduce((a, m) => a + m.managerSum, 0);
    const partnerSet = new Set<string>();
    projectMetrics.forEach(m => (m.project.partnerIds ?? []).forEach(id => partnerSet.add(id)));
    return {
      count: projectMetrics.length,
      started, ended, ongoing,
      partnerCount: partnerSet.size,
      partnerSum, managerSum,
    };
  }, [projectMetrics]);

  const sidebarItems: { key: SidebarKey; label: string; sub: string; disabled?: boolean }[] = [
    { key: 'projects', label: '프로젝트', sub: `${totals.count}건 · ${periodLabel}` },
    { key: 'partners', label: '파트너 활동', sub: `${totals.partnerCount}명` },
    { key: 'manager', label: '매니저 수익', sub: `${fmtMoney(totals.managerSum)}원` },
    { key: 'inquiries', label: '신규 의뢰', sub: '0건', disabled: true },
    { key: 'marketing', label: '마케팅', sub: '0건', disabled: true },
  ];

  return (
    <div className="space-y-5">
      {/* 기간 토글 + 네비게이션 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex p-0.5 bg-ink-100 rounded-lg">
          <button
            onClick={() => { setPeriod('week'); setOffset(0); }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${period === 'week' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
          >주간</button>
          <button
            onClick={() => { setPeriod('month'); setOffset(0); }}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${period === 'month' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}
          >월간</button>
        </div>

        <div className="inline-flex items-center gap-1 bg-white border border-ink-200 rounded-lg px-1 py-0.5">
          <button
            onClick={() => setOffset(offset + 1)}
            className="p-1 text-ink-500 hover:text-ink-900 hover:bg-ink-100 rounded transition-colors"
            aria-label="이전"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div className="px-2 text-xs font-semibold text-ink-900 min-w-[84px] text-center tabular-nums">
            {periodLabel}
          </div>
          <button
            onClick={() => setOffset(Math.max(0, offset - 1))}
            disabled={offset === 0}
            className="p-1 text-ink-500 hover:text-ink-900 hover:bg-ink-100 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            aria-label="다음"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        {offset > 0 && (
          <button
            onClick={() => setOffset(0)}
            className="text-xs text-brand-500 font-semibold hover:underline"
          >최신으로</button>
        )}
      </div>

      {/* 상단 요약 카드 3개 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-ink-100">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
            {periodLabel} 프로젝트
          </div>
          <div className="text-2xl font-bold mt-1">{totals.count}</div>
          <div className="text-[11px] text-ink-500 mt-1">
            시작 {totals.started} · 진행 {totals.ongoing} · 마감 {totals.ended}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-ink-100">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-400">신규 의뢰</div>
          <div className="text-2xl font-bold text-ink-300 mt-1">0</div>
          <div className="text-[11px] text-ink-400 mt-1">아직 기록 없음</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-ink-100">
          <div className="text-[11px] font-bold uppercase tracking-wider text-ink-400">마케팅</div>
          <div className="text-2xl font-bold text-ink-300 mt-1">0</div>
          <div className="text-[11px] text-ink-400 mt-1">아직 기록 없음</div>
        </div>
      </div>

      {/* 타임라인 프레임 */}
      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-0">
        {/* 사이드바 */}
        <div className="bg-ink-50 p-3 rounded-2xl md:rounded-r-none border border-ink-100 md:border-r-0">
          {sidebarItems.map(item => (
            <button
              key={item.key}
              onClick={() => !item.disabled && setActiveSidebar(item.key)}
              disabled={item.disabled}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold mb-1 transition-colors ${
                item.disabled ? 'text-ink-300 cursor-not-allowed' :
                activeSidebar === item.key ? 'bg-white text-brand-500 shadow-sm' : 'text-ink-600 hover:bg-white/60'
              }`}
            >
              <div>{item.label}</div>
              <div className="text-[11px] font-medium text-ink-400 mt-0.5">{item.sub}</div>
            </button>
          ))}
        </div>

        {/* 메인 */}
        <div className="bg-white p-5 rounded-2xl md:rounded-l-none border border-ink-100">
          {loading ? (
            <div className="text-center text-ink-400 py-12 text-sm">불러오는 중...</div>
          ) : activeSidebar === 'projects' ? (
            <ProjectActivity
              period={period}
              periodLabel={periodLabel}
              ticks={ticks}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              episodes={episodes}
              projectMetrics={projectMetrics}
            />
          ) : activeSidebar === 'partners' ? (
            <PartnerRanking metrics={projectMetrics} partnerNameMap={partnerNameMap} episodes={episodes} />
          ) : activeSidebar === 'manager' ? (
            <ManagerSummary totals={totals} projectCount={projectMetrics.length} />
          ) : (
            <EmptyState label={activeSidebar === 'inquiries' ? '신규 의뢰' : '마케팅'} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectActivity({
  period, periodLabel, ticks, rangeStart, rangeEnd, episodes, projectMetrics,
}: {
  period: Period;
  periodLabel: string;
  ticks: Date[];
  rangeStart: Date;
  rangeEnd: Date;
  episodes: (Episode & { projectId: string })[];
  projectMetrics: { project: Project; partnerSum: number; managerSum: number; episodeCount: number; isStartInPeriod: boolean; isEndInPeriod: boolean }[];
}) {
  // 일자별(주간=7점, 월간=주별) 완료 회차 수 집계
  const bucketCount = period === 'week' ? 7 : ticks.length;
  const buckets = new Array(bucketCount).fill(0) as number[];
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();

  episodes.forEach(e => {
    const endStr = e.endDate || e.completedAt;
    if (!endStr) return;
    const d = new Date(endStr);
    if (d < rangeStart || d > rangeEnd) return;
    const idx = Math.min(bucketCount - 1, Math.floor(((d.getTime() - rangeStart.getTime()) / totalMs) * bucketCount));
    buckets[idx] += 1;
  });

  const total = buckets.reduce((a, b) => a + b, 0);
  // 눈금이 정수로 떨어지도록 상단 여유(headroom) 추가
  const rawMax = Math.max(1, ...buckets);
  const maxVal = rawMax <= 2 ? rawMax + 1 : Math.ceil(rawMax * 1.2);
  const W = 640, H = 260, PAD_L = 40, PAD_R = 20, PAD_T = 24, PAD_B = 36;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const step = bucketCount > 1 ? chartW / (bucketCount - 1) : chartW;

  const points = buckets.map((v, i) => ({
    x: PAD_L + i * step,
    y: PAD_T + chartH - (v / maxVal) * chartH,
    v,
  }));

  // 부드러운 곡선 (카디널 스플라인 풍)
  const pathD = points.map((p, i) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const prev = points[i - 1];
    const cx1 = prev.x + (p.x - prev.x) / 2;
    const cx2 = prev.x + (p.x - prev.x) / 2;
    return `C${cx1},${prev.y} ${cx2},${p.y} ${p.x},${p.y}`;
  }).join(' ');

  const areaD = `${pathD} L${points[points.length - 1].x},${PAD_T + chartH} L${points[0].x},${PAD_T + chartH} Z`;

  const axisLabels = period === 'week'
    ? ['월', '화', '수', '목', '금', '토', '일']
    : ticks.map(t => fmtKor(t));

  // Y축 눈금 (0, 중간, 최대)
  const yTicks = maxVal <= 4
    ? Array.from({ length: maxVal + 1 }, (_, i) => i)
    : [0, Math.round(maxVal / 2), maxVal];

  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-400">일자별 완료 회차</div>
      <div className="text-lg font-bold mt-0.5 mb-3">{periodLabel} · {total}화 완료</div>

      {total === 0 ? (
        <div className="text-center text-ink-400 py-12 text-sm border border-dashed border-ink-200 rounded-xl">
          아직 완료된 회차가 없어요
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', aspectRatio: `${W}/${H}`, display: 'block' }}>
          <defs>
            <linearGradient id="mgmtReportArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* 가로 가이드라인 */}
          {yTicks.map((v, i) => {
            const y = PAD_T + chartH - (v / maxVal) * chartH;
            return (
              <g key={i}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#f5f5f4" strokeDasharray="3 4" />
                <text x={PAD_L - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#a8a29e" fontFamily="inherit">{v}</text>
              </g>
            );
          })}
          {/* 면적 */}
          <path d={areaD} fill="url(#mgmtReportArea)" />
          {/* 라인 */}
          <path d={pathD} fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {/* 도트 + 값 라벨 */}
          {points.map((p, i) => {
            const labelY = p.y < PAD_T + 18 ? p.y + 18 : p.y - 12;
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={5} fill="white" stroke="#f97316" strokeWidth="2.5" />
                {p.v > 0 && (
                  <text x={p.x} y={labelY} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1c1917" fontFamily="inherit">{p.v}</text>
                )}
              </g>
            );
          })}
          {/* X축 라벨 */}
          <g fontSize="11" fill="#78716c" fontFamily="inherit" fontWeight="600" textAnchor="middle">
            {points.map((p, i) => (
              <text key={i} x={p.x} y={H - 12}>{axisLabels[i] ?? ''}</text>
            ))}
          </g>
        </svg>
      )}

      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-400 mt-6 mb-2">진행 프로젝트</div>
      {projectMetrics.length === 0 ? (
        <div className="text-center text-ink-400 py-6 text-sm">활성 프로젝트가 없어요</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          <AnimatePresence>
            {projectMetrics.map(m => {
              const chip = statusChip(m.project.status);
              const label = m.isStartInPeriod ? '시작' : m.isEndInPeriod ? '마감' : chip.label;
              const labelClass = m.isStartInPeriod ? 'bg-blue-100 text-blue-700' :
                m.isEndInPeriod ? 'bg-ok-50 text-ok-700' : chip.className;
              return (
                <motion.div
                  key={m.project.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-ink-50 border border-ink-100 rounded-xl p-3"
                >
                  <div className="text-sm font-semibold truncate">{m.project.title}</div>
                  <div className="text-[11px] text-ink-500 mt-0.5 truncate">
                    {m.project.client || '-'} · {m.episodeCount}화
                  </div>
                  <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-md font-semibold mt-2 ${labelClass}`}>{label}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function PartnerRanking({ metrics, partnerNameMap, episodes }: {
  metrics: { project: Project; partnerSum: number; episodeCount: number }[];
  partnerNameMap: Map<string, string>;
  episodes: (Episode & { projectId: string })[];
}) {
  const byPartner = new Map<string, { amt: number; projectIds: Set<string>; episodeCount: number }>();
  metrics.forEach(m => {
    const pids = m.project.partnerIds ?? [];
    if (pids.length === 0) return;
    const share = m.partnerSum / pids.length;
    pids.forEach(id => {
      const cur = byPartner.get(id) ?? { amt: 0, projectIds: new Set<string>(), episodeCount: 0 };
      cur.amt += share;
      cur.projectIds.add(m.project.id);
      cur.episodeCount += episodes.filter(e => e.projectId === m.project.id && e.assignee === id).length;
      byPartner.set(id, cur);
    });
  });
  const sorted = Array.from(byPartner.entries())
    .map(([id, v]) => ({ id, name: partnerNameMap.get(id) ?? '(알 수 없음)', amt: v.amt, projectCount: v.projectIds.size, episodeCount: v.episodeCount }))
    .sort((a, b) => b.amt - a.amt);
  if (sorted.length === 0) {
    return <div className="text-center text-ink-400 py-12 text-sm">활동한 파트너가 없어요</div>;
  }
  const maxAmt = Math.max(1, ...sorted.map(s => s.amt));
  const totalAmt = sorted.reduce((a, s) => a + s.amt, 0);

  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-400">파트너별 지급 랭킹</div>
      <div className="text-lg font-bold mt-0.5 mb-3">{sorted.length}명 활동 · {totalAmt.toLocaleString()}원</div>

      <div>
        {sorted.map((s, i) => {
          const w = (s.amt / maxAmt) * 100;
          const isGold = i === 0;
          return (
            <div key={s.id} className="grid grid-cols-[28px_1fr_100px] sm:grid-cols-[28px_130px_1fr_100px] gap-3 items-center py-2.5 border-b border-ink-100 last:border-0">
              <div className={`text-center text-sm font-bold ${isGold ? 'text-warn-500' : 'text-ink-400'}`}>
                {i + 1}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{s.name}</div>
                <div className="text-[11px] text-ink-500 mt-0.5">{s.projectCount}개 프로젝트</div>
              </div>
              <div className="hidden sm:block h-2 bg-ink-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${w}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #0891b2, #06b6d4)' }}
                />
              </div>
              <div className="text-right text-sm font-bold tabular-nums">{s.amt.toLocaleString()}원</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ManagerSummary({ totals, projectCount }: { totals: { managerSum: number; partnerSum: number }; projectCount: number }) {
  return (
    <div>
      <div className="text-xs text-ink-500">매니저 수익 총합</div>
      <div className="text-3xl font-bold mt-1">{totals.managerSum.toLocaleString()}원</div>
      <div className="text-[11px] text-ink-500 mt-1">프로젝트 {projectCount}건 기준</div>
      <div className="mt-4 pt-4 border-t border-ink-100">
        <div className="text-xs text-ink-500">파트너 지급 총합</div>
        <div className="text-xl font-bold mt-1 text-cyan-600">{totals.partnerSum.toLocaleString()}원</div>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-16">
      <div className="text-6xl font-bold text-stone-200 leading-none">0</div>
      <div className="text-sm text-ink-500 mt-3 font-medium">{label} 기록 없음</div>
      <div className="text-[11px] text-ink-400 mt-1">해당 기능이 추가되면 여기에 표시됩니다</div>
    </div>
  );
}
