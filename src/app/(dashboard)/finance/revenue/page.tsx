'use client';
/**
 * 매출 관리 — 청구(세금계산서 발행) + 수금(입금)을 한 파이프라인으로 통합.
 *  거래처·월 합산 bill이 단계를 따라 흐른다: 미발행 → 미수금(발행완료·미입금) → 연체(D+N) → 입금완료.
 *  - 발행은 홈택스에서(도우미는 품목·금액만 — 거래처 사업자정보는 홈택스가 자동 채움).
 *  - 발행/입금은 GET + 상태 기록(invoiceStatus·invoiceDate / paymentStatus·paymentDate).
 *  - 금액: budget.totalAmount = 공급가액 → 부가세 10% 가산.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Building2, Check, ChevronDown, Coins, Copy, ExternalLink, Info, Receipt, RefreshCw, X,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { StatusBadge, type StatusTone } from '@/components/StatusBadge';
import { getAllEpisodes, getProjects, getClients, updateEpisodeFields } from '@/lib/supabase/db';
import type { Client, Episode, Project } from '@/types';

const HOMETAX_URL = 'https://www.hometax.go.kr';
const won = (n: number) => Math.round(n).toLocaleString('ko-KR');
const todayStr = () => new Date().toISOString().slice(0, 10);
const billMonth = (e: Episode) => ((e.endDate || e.dueDate || e.startDate || '').slice(0, 7) || '월 미정');
const daysSince = (from: string, to: string) => Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000);

type Ep = Episode & { projectId: string };
type Stage = 'unissued' | 'receivable' | 'overdue' | 'paid';
type Filter = 'all' | 'unissued' | 'receivable' | 'overdue' | 'paid';

interface Bill {
  key: string;
  clientName: string;
  client?: Client;
  month: string;
  episodes: Ep[];
  projectTitles: string[];
  supply: number;
  vat: number;
  total: number;
  dueDate?: string;
  paymentDate?: string;
  stage: Stage;
  overdueDays: number;
}

const STAGE_META: Record<Stage, { tone: StatusTone; label: string; dot?: boolean }> = {
  unissued: { tone: 'neutral', label: '미발행' },
  receivable: { tone: 'warn', label: '미수금' },
  overdue: { tone: 'danger', label: '연체' },
  paid: { tone: 'ok', label: '입금완료', dot: true },
};

export default function RevenuePage() {
  const toast = useToast();
  const [episodes, setEpisodes] = useState<Ep[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // 발행 도우미
  const [issuingKey, setIssuingKey] = useState<string | null>(null);
  const [issueDate, setIssueDate] = useState(todayStr);
  const [approvalNo, setApprovalNo] = useState('');
  const [showBizNo, setShowBizNo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [e, p, c] = await Promise.all([getAllEpisodes(), getProjects(), getClients()]);
    setEpisodes(e as Ep[]);
    setProjects(p);
    setClients(c);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const clientByName = useMemo(() => new Map(clients.map((c) => [c.name, c])), [clients]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const bills = useMemo<Bill[]>(() => {
    const today = todayStr();
    const map = new Map<string, Bill>();
    for (const ep of episodes) {
      const proj = projectMap.get(ep.projectId);
      const clientName = ep.client || proj?.client || '거래처 미지정';
      const client = (ep.clientId ? clientById.get(ep.clientId) : undefined) || clientByName.get(clientName);
      const month = billMonth(ep);
      const key = `${clientName}__${month}`;
      let b = map.get(key);
      if (!b) {
        b = { key, clientName, client, month, episodes: [], projectTitles: [], supply: 0, vat: 0, total: 0, stage: 'paid', overdueDays: 0 };
        map.set(key, b);
      }
      b.episodes.push(ep);
      const pt = proj?.title;
      if (pt && !b.projectTitles.includes(pt)) b.projectTitles.push(pt);
      b.supply += ep.budget?.totalAmount ?? 0;
    }
    const out: Bill[] = [];
    for (const b of map.values()) {
      const eps = b.episodes;
      const allPaid = eps.every((e) => e.paymentStatus === 'completed');
      const allIssued = eps.every((e) => e.invoiceStatus === 'completed');
      const dues = (eps.filter((e) => e.paymentStatus !== 'completed').map((e) => e.paymentDueDate).filter(Boolean) as string[]).sort();
      const dueDate = dues[0];
      const overdueDays = dueDate ? Math.max(0, daysSince(dueDate, today)) : 0;
      const paid = (eps.map((e) => e.paymentDate).filter(Boolean) as string[]).sort().slice(-1)[0];
      const stage: Stage = allPaid ? 'paid' : !allIssued ? 'unissued' : overdueDays > 0 ? 'overdue' : 'receivable';
      b.vat = Math.round(b.supply * 0.1);
      b.total = b.supply + b.vat;
      out.push({ ...b, dueDate, paymentDate: paid, stage, overdueDays });
    }
    const rank: Record<Stage, number> = { overdue: 0, receivable: 1, unissued: 2, paid: 3 };
    return out.sort((a, b) => (rank[a.stage] - rank[b.stage]) || (a.month < b.month ? 1 : -1) || a.clientName.localeCompare(b.clientName));
  }, [episodes, projectMap, clientByName, clientById]);

  const kpi = useMemo(() => {
    const f = (pred: (b: Bill) => boolean) => bills.filter(pred);
    const unissued = f((b) => b.stage === 'unissued');
    const receivable = f((b) => b.stage === 'receivable' || b.stage === 'overdue');
    const overdue = f((b) => b.stage === 'overdue');
    const paid = f((b) => b.stage === 'paid');
    const sum = (a: Bill[]) => a.reduce((s, b) => s + b.total, 0);
    return {
      unissuedSum: sum(unissued), receivableSum: sum(receivable), overdueSum: sum(overdue), paidSum: sum(paid),
      counts: { all: bills.length, unissued: unissued.length, receivable: receivable.length, overdue: overdue.length, paid: paid.length },
    };
  }, [bills]);

  const filtered = useMemo(() => bills.filter((b) => {
    if (filter === 'unissued') return b.stage === 'unissued';
    if (filter === 'receivable') return b.stage === 'receivable' || b.stage === 'overdue';
    if (filter === 'overdue') return b.stage === 'overdue';
    if (filter === 'paid') return b.stage === 'paid';
    return true;
  }), [bills, filter]);

  const issuing = useMemo(() => bills.find((b) => b.key === issuingKey) ?? null, [bills, issuingKey]);

  const itemLabel = (b: Bill) =>
    (b.projectTitles[0] ?? `${b.episodes.length}건`) + (b.projectTitles.length > 1 ? ` 외 ${b.projectTitles.length - 1}건` : '');

  const copy = useCallback((text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(`${label} 복사됨`)).catch(() => {});
  }, [toast]);

  const markPaid = useCallback(async (b: Bill) => {
    setBusyKey(b.key);
    try {
      const date = todayStr();
      const r = await Promise.all(b.episodes.map((ep) => updateEpisodeFields(ep.id, { paymentStatus: 'completed', paymentDate: date })));
      if (r.every(Boolean)) { toast.success(`${b.clientName} ${b.month} 입금 완료 처리되었습니다.`); await load(); }
      else toast.error('입금 완료 처리에 실패했습니다.');
    } finally { setBusyKey(null); }
  }, [toast, load]);

  const markIssued = useCallback(async (b: Bill) => {
    setBusyKey(b.key);
    try {
      const r = await Promise.all(b.episodes.map((ep) => updateEpisodeFields(ep.id, { invoiceStatus: 'completed', invoiceDate: issueDate })));
      if (r.every(Boolean)) { toast.success(`${b.clientName} ${b.month} 발행 완료 — 미수금으로 전환되었습니다.`); setIssuingKey(null); setApprovalNo(''); await load(); }
      else toast.error('발행 완료 처리에 실패했습니다.');
    } finally { setBusyKey(null); }
  }, [issueDate, toast, load]);

  const openIssue = (b: Bill) => { setIssuingKey(b.key); setIssueDate(todayStr()); setApprovalNo(''); setShowBizNo(false); };

  const FILTERS: { key: Filter; label: string; danger?: boolean }[] = [
    { key: 'all', label: '전체' },
    { key: 'unissued', label: '미발행' },
    { key: 'receivable', label: '미수금' },
    { key: 'overdue', label: '연체', danger: true },
    { key: 'paid', label: '입금완료' },
  ];

  const stageCard = (icon: React.ReactNode, label: string, sum: number, count: number, sub?: React.ReactNode, tone?: 'amber' | 'ok') => (
    <div className="flex-1 bg-white rounded-2xl border border-ink-100 px-4 py-3.5 shadow-sm">
      <p className="text-[11px] font-bold text-ink-500 flex items-center gap-1.5">{icon} {label}</p>
      <p className={`text-[21px] font-extrabold mt-1.5 tracking-tight ${tone === 'amber' ? 'text-amber-600' : tone === 'ok' ? 'text-ok-600' : 'text-ink-900'}`}>
        {loading ? '—' : won(sum)}<span className="text-[12px] text-ink-400 font-bold"> 원 · {count}건</span>
      </p>
      {sub}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-page">매출 관리</h1>
          <p className="text-[12px] text-ink-500 mt-0.5">청구(세금계산서 발행) → 수금(입금)을 한 흐름으로 · 발행은 홈택스, ERP는 준비·추적</p>
        </div>
        <button onClick={load} disabled={loading} className="w-9 h-9 rounded-lg border border-divider bg-white text-ink-500 hover:bg-ink-50 flex items-center justify-center disabled:opacity-50" aria-label="새로고침">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
        <a href={HOMETAX_URL} target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-1.5 h-9 px-4 rounded-lg bg-orange-500 text-white text-[12.5px] font-bold hover:bg-orange-600">
          <ExternalLink size={15} /> 홈택스 바로가기
        </a>
      </div>

      {/* 퍼널 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-0">
        {stageCard(<Receipt size={14} className="text-ink-400" />, '미발행 (곧 청구)', kpi.unissuedSum, kpi.counts.unissued)}
        <div className="hidden sm:flex items-center px-2.5 text-ink-300"><ArrowRight size={18} /></div>
        {stageCard(<Coins size={14} className="text-amber-500" />, '미수금 (발행완료·미입금)', kpi.receivableSum, kpi.counts.receivable,
          kpi.counts.overdue > 0 ? (
            <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-extrabold text-red-600 bg-red-50 px-2 py-1 rounded-md">
              <AlertTriangle size={12} /> 연체 {kpi.counts.overdue}건 · {won(kpi.overdueSum)}원
            </span>
          ) : undefined, 'amber')}
        <div className="hidden sm:flex items-center px-2.5 text-ink-300"><ArrowRight size={18} /></div>
        {stageCard(<Check size={14} className="text-ok-600" />, '입금완료', kpi.paidSum, kpi.counts.paid, undefined, 'ok')}
      </div>

      {/* 필터 */}
      <div className="inline-flex bg-white border border-divider rounded-lg p-[3px] gap-[2px] overflow-x-auto no-scrollbar max-w-full">
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`h-8 px-3.5 rounded-md text-[12.5px] font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors ${on ? (f.danger ? 'bg-red-600 text-white' : 'bg-orange-500 text-white') : 'text-ink-500 hover:bg-ink-50'}`}>
              {f.label}
              <span className={`text-[10.5px] font-extrabold px-1.5 rounded-full ${on ? 'bg-white/25' : 'bg-ink-100 text-ink-500'}`}>{kpi.counts[f.key]}</span>
            </button>
          );
        })}
      </div>

      {/* 리스트 */}
      <div className="bg-white rounded-2xl border border-ink-100 shadow-sm overflow-hidden">
        {loading ? (
          <LoadingState size="compact" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Coins} size="compact" title="해당하는 건이 없습니다" description="회차 금액이 있는 거래처가 여기에 모입니다." />
        ) : (
          <ul>
            {filtered.map((b) => {
              const meta = STAGE_META[b.stage];
              const dueText = b.stage === 'paid' ? (b.paymentDate ? `입금 ${b.paymentDate}` : '입금 완료')
                : b.stage === 'unissued' ? '청구 전'
                : (b.dueDate ? `예정 ${b.dueDate}` : '예정일 없음');
              return (
                <li key={b.key} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-ink-100 last:border-0 hover:bg-ink-50/60 transition-colors">
                  <div className="w-9 h-9 rounded-[10px] bg-ink-100 text-ink-400 flex items-center justify-center flex-shrink-0"><Building2 size={16} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-bold text-ink-900 truncate">{b.clientName}</div>
                    <div className="text-[11.5px] text-ink-400 truncate mt-0.5">{itemLabel(b)} · {b.month}</div>
                  </div>
                  <div className="hidden sm:flex items-center w-[112px] justify-center flex-shrink-0">
                    <StatusBadge tone={meta.tone} dot={meta.dot}>{meta.label}{b.stage === 'overdue' ? ` D+${b.overdueDays}` : ''}</StatusBadge>
                  </div>
                  <div className="text-right flex-shrink-0 w-[118px]">
                    <div className="text-[14px] font-extrabold text-ink-900 tabular-nums">{won(b.total)}원</div>
                    <div className={`text-[11px] mt-0.5 ${b.stage === 'overdue' ? 'text-red-600 font-bold' : 'text-ink-400'}`}>{dueText}</div>
                  </div>
                  <div className="flex justify-end flex-shrink-0 w-[112px]">
                    {b.stage === 'unissued' ? (
                      <button onClick={() => openIssue(b)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-orange-500 text-white text-[12px] font-bold hover:bg-orange-600">
                        <Receipt size={13} /> 발행 도우미
                      </button>
                    ) : b.stage === 'paid' ? (
                      <StatusBadge tone="ok" dot>완료</StatusBadge>
                    ) : (
                      <button onClick={() => markPaid(b)} disabled={busyKey === b.key} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-orange-500 text-white text-[12px] font-bold hover:bg-orange-600 disabled:bg-ink-300 disabled:cursor-not-allowed">
                        <Check size={13} /> {busyKey === b.key ? '처리…' : '입금 완료'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 발행 도우미 (간소화) */}
      {issuing && (
        <div className="fixed inset-0 z-50 modal-overlay flex items-center justify-center p-4" onClick={() => setIssuingKey(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-ink-100">
              <div className="w-9 h-9 rounded-[10px] bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0"><Receipt size={18} /></div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-extrabold">세금계산서 발행 도우미</div>
                <div className="text-[11.5px] text-ink-400 truncate">{issuing.clientName} · {issuing.month}</div>
              </div>
              <button onClick={() => setIssuingKey(null)} className="w-8 h-8 rounded-lg text-ink-400 hover:bg-ink-50 flex items-center justify-center"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex gap-2.5 bg-ink-50 border border-ink-100 rounded-[10px] px-3.5 py-3 mb-4">
                <Info size={15} className="text-ink-400 flex-shrink-0 mt-0.5" />
                <div className="text-[12px] leading-relaxed text-ink-600">
                  홈택스에서 <b className="text-ink-900 font-bold">{issuing.clientName}</b> 거래처를 선택한 뒤 아래 <b className="text-ink-900 font-bold">품목·금액</b>을 입력하세요. 거래처 사업자정보는 홈택스에 저장돼 자동으로 채워집니다.
                </div>
              </div>
              {[
                ['작성일자', issueDate],
                ['품목', itemLabel(issuing)],
              ].map(([l, v]) => (
                <div key={l} className="flex items-center gap-2.5 py-2.5 border-b border-[#f8f7f6]">
                  <span className="text-[12px] font-semibold text-ink-400 w-[60px] flex-shrink-0">{l}</span>
                  <span className="flex-1 text-[13.5px] font-bold text-ink-900 min-w-0 truncate">{v}</span>
                  <button onClick={() => copy(String(v), String(l))} className="w-7 h-7 rounded-lg border border-divider bg-white text-ink-400 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-100 flex items-center justify-center"><Copy size={13} /></button>
                </div>
              ))}
              <div className="flex items-center mt-4 mb-2">
                <span className="text-[11.5px] font-extrabold text-ink-400">금액 — 홈택스에 입력</span>
                <button onClick={() => copy(`공급가액 ${won(issuing.supply)}\n세액 ${won(issuing.vat)}\n합계 ${won(issuing.total)}`, '금액 전체')} className="ml-auto text-[11px] font-bold text-orange-600 inline-flex items-center gap-1"><Copy size={12} /> 전체 복사</button>
              </div>
              <div className="border border-ink-100 rounded-[10px] overflow-hidden">
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[#f8f7f6]">
                  <span className="flex-1 text-[12.5px] text-ink-500 font-semibold">공급가액</span>
                  <span className="text-[14px] font-bold tabular-nums">{won(issuing.supply)} 원</span>
                  <button onClick={() => copy(String(issuing.supply), '공급가액')} className="w-7 h-7 rounded-lg border border-divider bg-white text-ink-400 hover:bg-orange-50 hover:text-orange-600 flex items-center justify-center"><Copy size={12} /></button>
                </div>
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[#f8f7f6]">
                  <span className="flex-1 text-[12.5px] text-ink-500 font-semibold">세액 (부가세 10%)</span>
                  <span className="text-[14px] font-bold tabular-nums">{won(issuing.vat)} 원</span>
                  <button onClick={() => copy(String(issuing.vat), '세액')} className="w-7 h-7 rounded-lg border border-divider bg-white text-ink-400 hover:bg-orange-50 hover:text-orange-600 flex items-center justify-center"><Copy size={12} /></button>
                </div>
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-orange-50">
                  <span className="flex-1 text-[13px] text-ink-900 font-extrabold">합계금액</span>
                  <span className="text-[18px] font-extrabold text-orange-600 tabular-nums">{won(issuing.total)} 원</span>
                  <button onClick={() => copy(String(issuing.total), '합계')} className="w-7 h-7 rounded-lg border border-orange-100 bg-white text-orange-600 hover:bg-orange-100 flex items-center justify-center"><Copy size={12} /></button>
                </div>
              </div>
              <div className="mt-3">
                <button onClick={() => setShowBizNo((v) => !v)} className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-400 hover:text-ink-600 py-1">
                  <ChevronDown size={14} className={showBizNo ? 'rotate-180 transition-transform' : 'transition-transform'} /> 거래처 사업자번호 (홈택스에 거래처가 없을 때만)
                </button>
                {showBizNo && (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 mt-1 bg-ink-50 border border-ink-100 rounded-lg">
                    <span className="text-[11.5px] text-ink-400 font-semibold">사업자번호</span>
                    <span className="flex-1 text-[12.5px] font-bold">{issuing.client?.businessNumber || '미입력 — 거래처에서 입력 가능'}</span>
                    {issuing.client?.businessNumber && (
                      <button onClick={() => copy(issuing.client!.businessNumber!, '사업자번호')} className="w-7 h-7 rounded-lg border border-divider bg-white text-ink-400 hover:bg-orange-50 hover:text-orange-600 flex items-center justify-center"><Copy size={12} /></button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-ink-100">
              <a href={HOMETAX_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 h-10 rounded-lg bg-orange-500 text-white text-[13px] font-bold hover:bg-orange-600">
                <ExternalLink size={15} /> 홈택스에서 발행
              </a>
            </div>
            <div className="px-5 py-4 bg-ink-50 border-t border-ink-100">
              <div className="text-[11px] font-extrabold text-ink-500 mb-2">발행 완료 기록 → 미수금으로 전환</div>
              <div className="flex items-center gap-2">
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="h-9 px-2.5 rounded-lg border border-divider bg-white text-[12.5px] font-semibold outline-none focus:border-orange-400" />
                <input value={approvalNo} onChange={(e) => setApprovalNo(e.target.value)} placeholder="국세청 승인번호 (선택)" className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-divider bg-white text-[12.5px] outline-none focus:border-orange-400 placeholder:text-ink-400" />
                <button onClick={() => markIssued(issuing)} disabled={busyKey === issuing.key} className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-orange-500 text-white text-[12.5px] font-bold hover:bg-orange-600 disabled:bg-ink-300 flex-shrink-0">
                  <Check size={14} /> {busyKey === issuing.key ? '처리…' : '발행 완료'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
