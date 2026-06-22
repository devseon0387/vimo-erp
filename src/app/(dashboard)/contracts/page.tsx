'use client';
/**
 * 계약 관리 — 목록.
 *  영업 퍼널(문의→계약→프로젝트)의 중간 고리. 문의를 약정 금액·당사자로 확정하고 프로젝트의 상위 근거를 만든다.
 *  KPI 4: 진행중 계약수 / 진행중 약정액(공급가 합) / 만료 임박(30일) / 이번달 신규.
 *  상태 탭(전체·초안·발송·서명·진행중·완료) + 검색(계약명·거래처).
 *  읽기=cached(getContracts/getClients), 쓰기=insert/update(서버액션) 후 invalidateTable('contracts')+재조회.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, CheckCircle2, Coins, AlertTriangle, CalendarPlus, Building2, Plus, RefreshCw, AlertCircle,
} from 'lucide-react';
import { KPICard } from '@/components/KPICard';
import { TabBar, type TabItem } from '@/components/TabBar';
import { SearchInput } from '@/components/SearchInput';
import { StatusBadge } from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { getContracts, getClients } from '@/lib/supabase/db/cached';
import { invalidateTable } from '@/lib/supabase/cache';
import type { Client, Contract, ContractStatus } from '@/types';
import {
  won, shortDate, daysUntil, STATUS_META, TYPE_LABEL, isExpiringSoon, isThisMonth,
} from './contract-meta';
import { ContractFormModal } from './ContractFormModal';

type Tab = 'all' | ContractStatus;

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'draft', label: '초안' },
  { key: 'sent', label: '발송' },
  { key: 'signed', label: '서명' },
  { key: 'active', label: '진행중' },
  { key: 'completed', label: '완료' },
];

export default function ContractsPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [c, cl] = await Promise.all([getContracts(), getClients()]);
      setContracts(c); setClients(cl);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const clientName = useMemo(() => {
    const m = new Map(clients.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) ?? '거래처 미지정';
  }, [clients]);

  const kpi = useMemo(() => {
    const active = contracts.filter((c) => c.status === 'active');
    const activeSum = active.reduce((s, c) => s + (c.supplyAmount || 0), 0);
    const expiring = contracts.filter(isExpiringSoon);
    const expiringSoonest = expiring
      .map((c) => ({ c, d: daysUntil(c.endDate) ?? 999 }))
      .sort((a, b) => a.d - b.d)[0];
    const newThis = contracts.filter((c) => isThisMonth(c.contractDate));
    const newDraft = newThis.filter((c) => c.status === 'draft').length;
    const newSent = newThis.filter((c) => c.status === 'sent').length;
    return {
      activeCount: active.length,
      signedWaiting: contracts.filter((c) => c.status === 'signed').length,
      activeSum,
      expiringCount: expiring.length,
      expiringLabel: expiringSoonest
        ? `${clientName(expiringSoonest.c.clientId)} D-${expiringSoonest.d}`
        : '임박 계약 없음',
      newCount: newThis.length,
      newSub: newThis.length ? `초안 ${newDraft} · 발송 ${newSent}` : '신규 없음',
    };
  }, [contracts, clientName]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: contracts.length, draft: 0, sent: 0, signed: 0, active: 0, completed: 0, cancelled: 0 } as Record<Tab, number>;
    for (const ct of contracts) c[ct.status] = (c[ct.status] ?? 0) + 1;
    return c;
  }, [contracts]);

  const tabItems: TabItem<Tab>[] = TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] }));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contracts.filter((c) => {
      if (tab !== 'all' && c.status !== tab) return false;
      if (!q) return true;
      return c.title.toLowerCase().includes(q) || clientName(c.clientId).toLowerCase().includes(q);
    });
  }, [contracts, tab, query, clientName]);

  const onSaved = useCallback(() => {
    setFormOpen(false);
    invalidateTable('contracts');
    load();
  }, [load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-page">계약 관리</h1>
          <p className="text-[12px] text-ink-500 mt-0.5">문의를 약정 금액·당사자로 확정하고 프로젝트의 상위 근거를 만듭니다</p>
        </div>
        <button onClick={load} className="w-9 h-9 rounded-lg border border-divider bg-white text-ink-500 hover:bg-ink-50 flex items-center justify-center" aria-label="새로고침">
          <RefreshCw size={15} />
        </button>
        <button onClick={() => setFormOpen(true)} className="flex items-center gap-1.5 h-9 px-3 sm:px-4 rounded-lg bg-orange-500 text-white text-[12.5px] font-bold hover:bg-orange-600">
          <Plus size={15} /> <span className="hidden sm:inline">새 계약</span>
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          label="진행중 계약" tone="ok"
          icon={<CheckCircle2 size={12} className="text-ok-600" />}
          value={<>{kpi.activeCount}<span className="text-[12px] text-ink-400 font-bold"> 건</span></>}
          sub={kpi.signedWaiting > 0 ? `서명완료 ${kpi.signedWaiting}건 대기` : '서명 대기 없음'}
        />
        <KPICard
          label="진행중 약정액" tone="brand"
          icon={<Coins size={12} className="text-orange-500" />}
          value={<>{won(kpi.activeSum)}<span className="text-[12px] text-ink-400 font-bold"> 원</span></>}
          sub="공급가액 기준 (VAT 별도)"
        />
        <KPICard
          label="만료 임박 (30일)" tone={kpi.expiringCount > 0 ? 'warn' : 'default'}
          icon={<AlertTriangle size={12} className="text-warn-600" />}
          value={<>{kpi.expiringCount}<span className="text-[12px] text-ink-400 font-bold"> 건</span></>}
          sub={kpi.expiringLabel}
        />
        <KPICard
          label="이번달 신규" tone="default"
          icon={<CalendarPlus size={12} className="text-info-500" />}
          value={<>{kpi.newCount}<span className="text-[12px] text-ink-400 font-bold"> 건</span></>}
          sub={kpi.newSub}
        />
      </div>

      {/* 탭 + 검색 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <TabBar items={tabItems} active={tab} onChange={setTab} fullWidthMobile={false} />
        <SearchInput value={query} onChange={setQuery} placeholder="계약명·거래처 검색" className="sm:ml-auto sm:max-w-[260px] sm:w-[260px]" />
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-2xl border border-ink-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={FileText} size="compact"
            title={contracts.length === 0 ? '등록된 계약이 없습니다' : '조건에 맞는 계약이 없습니다'}
            description={contracts.length === 0 ? '문의를 약정으로 확정해 첫 계약을 등록해 보세요.' : '다른 상태 탭이나 검색어로 다시 시도해보세요.'}
            iconColor="text-orange-500" iconBgColor="bg-orange-50"
            action={contracts.length === 0 ? { label: '+ 새 계약', onClick: () => setFormOpen(true) } : undefined}
          />
        ) : (
          <>
            {/* 데스크탑 테이블 */}
            <table className="w-full hidden md:table">
              <thead>
                <tr className="bg-ink-50 border-b border-ink-100">
                  <th className="text-left text-[11.5px] font-bold text-ink-500 px-4 py-3">계약명</th>
                  <th className="text-left text-[11.5px] font-bold text-ink-500 px-4 py-3">거래처</th>
                  <th className="text-left text-[11.5px] font-bold text-ink-500 px-4 py-3">유형</th>
                  <th className="text-right text-[11.5px] font-bold text-ink-500 px-4 py-3">공급가액</th>
                  <th className="text-left text-[11.5px] font-bold text-ink-500 px-4 py-3">상태</th>
                  <th className="text-left text-[11.5px] font-bold text-ink-500 px-4 py-3">계약기간</th>
                  <th className="text-left text-[11.5px] font-bold text-ink-500 px-4 py-3">담당자</th>
                  <th className="text-left text-[11.5px] font-bold text-ink-500 px-4 py-3">계약일</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const meta = STATUS_META[c.status];
                  const d = daysUntil(c.endDate);
                  const warnDday = isExpiringSoon(c) && d !== null;
                  return (
                    <tr key={c.id} onClick={() => router.push(`/contracts/${c.id}`)}
                      className="border-b border-ink-100 last:border-0 hover:bg-orange-50/60 cursor-pointer transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="text-[13px] font-bold text-ink-900">{c.title}</div>
                        {c.memo && <div className="text-[11.5px] text-ink-400 mt-0.5 truncate max-w-[260px]">{c.memo}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-[13px] font-medium text-ink-700">{clientName(c.clientId)}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-block text-[11.5px] font-medium text-ink-600 bg-ink-100 px-2 py-0.5 rounded-md">{TYPE_LABEL[c.contractType]}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-[13px] font-bold text-ink-900 tabular-nums">{won(c.supplyAmount)}</td>
                      <td className="px-4 py-3.5"><StatusBadge tone={meta.tone} dot={meta.dot}>{meta.label}</StatusBadge></td>
                      <td className="px-4 py-3.5">
                        <span className="text-[12.5px] text-ink-500 tabular-nums">{c.startDate || c.endDate ? `${shortDate(c.startDate)} ~ ${shortDate(c.endDate)}` : '미정'}</span>
                        {warnDday && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-[10.5px] font-bold text-warn-600 bg-warn-50 px-1.5 py-0.5 rounded-full">
                            <AlertCircle size={10} /> D-{d}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-[12.5px] text-ink-500">{c.managerId || '—'}</td>
                      <td className="px-4 py-3.5 text-[12.5px] text-ink-500 tabular-nums">{shortDate(c.contractDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* 모바일 카드 */}
            <ul className="md:hidden">
              {filtered.map((c) => {
                const meta = STATUS_META[c.status];
                const d = daysUntil(c.endDate);
                const warnDday = isExpiringSoon(c) && d !== null;
                return (
                  <li key={c.id} onClick={() => router.push(`/contracts/${c.id}`)}
                    className="flex items-center gap-3 px-4 py-3.5 border-b border-ink-100 last:border-0 active:bg-orange-50/60 cursor-pointer">
                    <div className="w-9 h-9 rounded-[10px] bg-ink-100 text-ink-400 flex items-center justify-center flex-shrink-0"><Building2 size={16} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-ink-900 truncate">{c.title}</div>
                      <div className="text-[11.5px] text-ink-400 mt-0.5 flex items-center gap-1.5">
                        <span className="truncate">{clientName(c.clientId)} · {TYPE_LABEL[c.contractType]}</span>
                        {warnDday && <span className="flex-shrink-0 text-warn-600 font-bold">D-{d}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[13px] font-bold text-ink-900 tabular-nums">{won(c.supplyAmount)}</div>
                      <div className="mt-1 flex justify-end"><StatusBadge tone={meta.tone} dot={meta.dot}>{meta.label}</StatusBadge></div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <ContractFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} clients={clients} editing={null} onSaved={onSaved} />
    </div>
  );
}
