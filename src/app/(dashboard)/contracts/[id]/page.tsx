'use client';
/**
 * 계약 상세.
 *  계약정보 + 금액(공급가/VAT/총액 + 분배표) + 연결(출처 문의 · 연결 프로젝트 1:N · 없으면 생성) +
 *  상태 타임라인(6단계) + 상태 전환 + 편집/삭제.
 *  "프로젝트 생성" → insertProject({ contractId, budget 시드 ... }) → invalidateTable('projects') → 상세 갱신.
 *  읽기=cached(getContracts/getClients/getProjects), 쓰기=insert/update/delete(서버액션).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Pencil, Trash2, FileText, Coins, Link2, MessageSquare, FolderKanban,
  ExternalLink, Plus, Clock, CheckCircle2, XCircle, Building2, Calendar,
} from 'lucide-react';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/contexts/ToastContext';
import { getContracts, getClients, getProjects } from '@/lib/supabase/db/cached';
import { getInquiries } from '@/lib/supabase/db';
import { updateContract, deleteContract, insertProject } from '@/lib/supabase/db';
import { invalidateTable } from '@/lib/supabase/cache';
import type { Client, Contract, ContractStatus, Inquiry, Project } from '@/types';
import {
  won, longDate, daysUntil, STATUS_META, TYPE_LABEL, TIMELINE, stageState,
} from '../contract-meta';
import { ContractFormModal } from '../ContractFormModal';

// 상태 전환 후보(현재 상태 → 진행 가능한 다음 액션들)
const NEXT_ACTIONS: Record<ContractStatus, { to: ContractStatus; label: string; tone: 'brand' | 'ok' | 'danger' }[]> = {
  draft: [{ to: 'sent', label: '발송 처리', tone: 'brand' }, { to: 'cancelled', label: '해지', tone: 'danger' }],
  sent: [{ to: 'signed', label: '서명완료', tone: 'brand' }, { to: 'cancelled', label: '해지', tone: 'danger' }],
  signed: [{ to: 'active', label: '진행 시작', tone: 'brand' }, { to: 'cancelled', label: '해지', tone: 'danger' }],
  active: [{ to: 'completed', label: '완료 처리', tone: 'ok' }, { to: 'cancelled', label: '해지', tone: 'danger' }],
  completed: [],
  cancelled: [{ to: 'draft', label: '초안으로 복구', tone: 'brand' }],
};

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const toast = useToast();

  const [contract, setContract] = useState<Contract | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [cs, cl, ps, iq] = await Promise.all([getContracts(), getClients(), getProjects(), getInquiries()]);
      setContract(cs.find((c) => c.id === id) ?? null);
      setClients(cl);
      setProjects(ps);
      setInquiries(iq);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const client = useMemo(() => (contract ? clients.find((c) => c.id === contract.clientId) ?? null : null), [contract, clients]);
  const linkedProjects = useMemo(() => (contract ? projects.filter((p) => p.contractId === contract.id) : []), [contract, projects]);
  const sourceInquiry = useMemo(
    () => (contract?.inquiryId ? inquiries.find((q) => q.id === contract.inquiryId) ?? null : null),
    [contract, inquiries],
  );

  const refresh = useCallback(() => { invalidateTable('contracts'); load(); }, [load]);

  const changeStatus = useCallback(async (to: ContractStatus) => {
    if (!contract) return;
    setBusy(true);
    try {
      const patch: Partial<Contract> = { status: to };
      if (to === 'signed' && !contract.signedDate) patch.signedDate = new Date().toISOString().slice(0, 10);
      const ok = await updateContract(contract.id, patch);
      if (ok) { toast.success('계약 상태가 변경되었습니다.'); refresh(); }
      else toast.error('상태 변경에 실패했습니다.');
    } finally { setBusy(false); }
  }, [contract, toast, refresh]);

  const handleDelete = useCallback(async () => {
    if (!contract) return;
    setBusy(true);
    try {
      const ok = await deleteContract(contract.id);
      if (ok) {
        toast.success('계약이 삭제되었습니다.');
        invalidateTable('contracts');
        router.push('/contracts');
      } else { toast.error('삭제에 실패했습니다.'); setBusy(false); setConfirmDelete(false); }
    } catch {
      setBusy(false); setConfirmDelete(false);
    }
  }, [contract, toast, router]);

  const handleCreateProject = useCallback(async () => {
    if (!contract) return;
    setCreatingProject(true);
    try {
      const saved = await insertProject({
        title: contract.title,
        description: contract.memo ?? '',
        client: client?.name ?? '',
        clientId: contract.clientId,
        partnerId: '',
        partnerIds: [],
        managerIds: [],
        category: TYPE_LABEL[contract.contractType],
        channels: [],
        status: 'planning',
        budget: {
          totalAmount: contract.supplyAmount,
          partnerPayment: contract.partnerPayment,
          managementFee: contract.managementFee,
          marginRate: contract.marginRate,
        },
        tags: [],
        contractId: contract.id,
      });
      if (saved) {
        toast.success('연결 프로젝트가 생성되었습니다.');
        invalidateTable('projects');
        load();
      } else toast.error('프로젝트 생성에 실패했습니다.');
    } finally { setCreatingProject(false); }
  }, [contract, client, toast, load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState onRetry={load} />;
  if (!contract) {
    return (
      <div className="space-y-5">
        <Link href="/contracts" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-orange-600">
          <ArrowLeft size={14} /> 계약 목록
        </Link>
        <div className="bg-white rounded-2xl border border-ink-100">
          <EmptyState icon={FileText} title="계약을 찾을 수 없습니다" description="삭제되었거나 접근 권한이 없는 계약입니다." />
        </div>
      </div>
    );
  }

  const meta = STATUS_META[contract.status];
  const distSum = contract.partnerPayment + contract.managementFee;
  const marginAmount = Math.max(0, contract.supplyAmount - distSum);
  const pct = (n: number) => (contract.supplyAmount > 0 ? Math.round((n / contract.supplyAmount) * 100) : 0);
  const actions = NEXT_ACTIONS[contract.status];
  const endD = daysUntil(contract.endDate);

  const field = (k: string, v: React.ReactNode, full = false) => (
    <div className={full ? 'sm:col-span-2' : ''}>
      <div className="text-[12px] text-ink-500 mb-1">{k}</div>
      <div className="text-[13.5px] font-medium text-ink-800">{v}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Link href="/contracts" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-500 hover:text-orange-600">
        <ArrowLeft size={14} /> 계약 목록
      </Link>

      {/* 타이틀 */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-page truncate">{contract.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-500">
            <span className="inline-flex items-center gap-1.5"><Building2 size={13} /> {client?.name ?? '거래처 미지정'}</span>
            <span className="inline-flex items-center gap-1.5"><Calendar size={13} /> 계약일 {longDate(contract.contractDate)}</span>
            <StatusBadge tone={meta.tone} dot={meta.dot}>{meta.label}</StatusBadge>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setEditOpen(true)} className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-divider bg-white text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50">
            <Pencil size={14} /> <span className="hidden sm:inline">편집</span>
          </button>
          <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-divider bg-white text-[12.5px] font-semibold text-bad-500 hover:bg-bad-50">
            <Trash2 size={14} /> <span className="hidden sm:inline">삭제</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* 좌측 */}
        <div className="space-y-5">
          {/* 계약 정보 */}
          <section className="bg-white rounded-2xl border border-ink-100">
            <div className="px-5 py-3.5 border-b border-ink-100">
              <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-ink-900"><FileText size={15} className="text-ink-400" /> 계약 정보</h3>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('계약 유형', TYPE_LABEL[contract.contractType])}
              {field('담당자', contract.managerId || '—')}
              {field('계약 기간', <span className="tabular-nums">{contract.startDate || contract.endDate ? `${longDate(contract.startDate)} ~ ${longDate(contract.endDate)}` : '미정'}</span>)}
              {field('체결일 / 서명일', <span className="tabular-nums">{longDate(contract.contractDate)} / {longDate(contract.signedDate)}</span>)}
              {field('결제조건', contract.paymentTerms || '—', true)}
              {contract.memo && field('메모', <span className="font-normal text-ink-600">{contract.memo}</span>, true)}
            </div>
          </section>

          {/* 금액 */}
          <section className="bg-white rounded-2xl border border-ink-100">
            <div className="px-5 py-3.5 border-b border-ink-100">
              <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-ink-900"><Coins size={15} className="text-ink-400" /> 금액</h3>
            </div>
            <div className="px-5 py-4">
              <div className="bg-ink-50 border border-ink-100 rounded-xl px-4 py-3 space-y-2">
                <div className="flex justify-between text-[13px]"><span className="text-ink-600">공급가액</span><span className="font-semibold text-ink-900 tabular-nums">{won(contract.supplyAmount)}원</span></div>
                <div className="flex justify-between text-[13px] pt-2 border-t border-dashed border-ink-200"><span className="text-ink-600">부가세 (10%)</span><span className="font-semibold text-ink-900 tabular-nums">{won(contract.vatAmount)}원</span></div>
                <div className="flex justify-between items-center pt-2 border-t border-dashed border-ink-200"><span className="font-bold text-ink-900 text-[13.5px]">총 계약금액</span><span className="font-bold text-orange-600 text-[18px] tabular-nums">{won(contract.totalAmount)}원</span></div>
              </div>
              {distSum > 0 ? (
                <>
                  <div className="text-[12px] font-bold text-ink-500 mt-4 mb-1">분배 구조</div>
                  <table className="w-full">
                    <tbody>
                      <tr className="border-b border-ink-100"><td className="py-2 text-[13px] text-ink-600">파트너 지급분</td><td className="py-2 text-right text-[13px] font-semibold text-ink-900 tabular-nums">{won(contract.partnerPayment)}원</td><td className="py-2 text-right text-[12px] text-ink-400 tabular-nums w-14">{pct(contract.partnerPayment)}%</td></tr>
                      <tr className="border-b border-ink-100"><td className="py-2 text-[13px] text-ink-600">관리비</td><td className="py-2 text-right text-[13px] font-semibold text-ink-900 tabular-nums">{won(contract.managementFee)}원</td><td className="py-2 text-right text-[12px] text-ink-400 tabular-nums">{pct(contract.managementFee)}%</td></tr>
                      <tr><td className="py-2 text-[13px] text-ink-600">마진{contract.marginRate ? ` (${contract.marginRate}%)` : ''}</td><td className="py-2 text-right text-[13px] font-semibold text-ink-900 tabular-nums">{won(marginAmount)}원</td><td className="py-2 text-right text-[12px] text-ink-400 tabular-nums">{pct(marginAmount)}%</td></tr>
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="text-[12px] text-ink-400 mt-3">분배 구조가 입력되지 않았습니다. 편집에서 파트너 지급·관리비·마진율을 설정할 수 있습니다.</p>
              )}
            </div>
          </section>

          {/* 연결 */}
          <section className="bg-white rounded-2xl border border-ink-100">
            <div className="px-5 py-3.5 border-b border-ink-100">
              <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-ink-900"><Link2 size={15} className="text-ink-400" /> 연결</h3>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              {sourceInquiry && (
                <Link href={`/inquiries?selected=${sourceInquiry.id}`} className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-ink-100 hover:bg-ink-50 transition-colors">
                  <div className="w-9 h-9 rounded-[10px] bg-ink-50 text-ink-400 flex items-center justify-center flex-shrink-0"><MessageSquare size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-ink-500">출처 문의</div>
                    <div className="text-[13px] font-semibold text-ink-800 truncate">{sourceInquiry.name} · {sourceInquiry.projectType}</div>
                  </div>
                  <ExternalLink size={15} className="text-orange-600 flex-shrink-0" />
                </Link>
              )}

              {linkedProjects.length > 0 ? (
                linkedProjects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-ink-100 hover:bg-ink-50 transition-colors">
                    <div className="w-9 h-9 rounded-[10px] bg-ink-50 text-ink-400 flex items-center justify-center flex-shrink-0"><FolderKanban size={16} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-ink-500">연결 프로젝트</div>
                      <div className="text-[13px] font-semibold text-ink-800 truncate">{p.title}</div>
                    </div>
                    <ExternalLink size={15} className="text-orange-600 flex-shrink-0" />
                  </Link>
                ))
              ) : (
                <div className="px-4 py-5 border border-dashed border-ink-200 rounded-xl text-center">
                  <p className="text-[13px] text-ink-500 mb-3">연결된 프로젝트가 없습니다. 계약 금액을 budget 시드로 프로젝트를 생성하세요.</p>
                  <button onClick={handleCreateProject} disabled={creatingProject} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-orange-500 text-white text-[12.5px] font-bold hover:bg-orange-600 disabled:bg-ink-300">
                    <Plus size={14} /> {creatingProject ? '생성 중…' : '프로젝트 생성'}
                  </button>
                </div>
              )}
              {linkedProjects.length > 0 && (
                <button onClick={handleCreateProject} disabled={creatingProject} className="w-full flex items-center justify-center gap-1.5 h-9 rounded-lg border border-dashed border-ink-200 text-ink-500 text-[12.5px] font-semibold hover:bg-ink-50 disabled:opacity-50">
                  <Plus size={14} /> {creatingProject ? '생성 중…' : '프로젝트 추가 생성'}
                </button>
              )}
            </div>
          </section>
        </div>

        {/* 우측 */}
        <div className="space-y-5">
          {/* 타임라인 */}
          <section className="bg-white rounded-2xl border border-ink-100">
            <div className="px-5 py-3.5 border-b border-ink-100">
              <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-ink-900"><Clock size={15} className="text-ink-400" /> 상태 타임라인</h3>
            </div>
            <div className="px-5 py-4">
              {contract.status === 'cancelled' && (
                <div className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-bad-600 bg-bad-50 px-3 py-2 rounded-lg">
                  <XCircle size={14} /> 해지된 계약입니다
                </div>
              )}
              <ol className="relative">
                {TIMELINE.map((step, i) => {
                  const st = stageState(step.key, contract.status);
                  const last = i === TIMELINE.length - 1;
                  const dotCls = st === 'done' ? 'bg-ok-500' : st === 'cur' ? 'bg-orange-500' : 'bg-ink-200';
                  return (
                    <li key={step.key} className="flex gap-3 pb-4 last:pb-0 relative">
                      {!last && <span className={`absolute left-[6px] top-4 bottom-0 w-0.5 ${st === 'done' ? 'bg-ok-500/40' : 'bg-ink-100'}`} />}
                      <span className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white z-[1] ${dotCls}`} />
                      <div className="min-w-0">
                        <div className={`text-[13px] font-semibold ${st === 'todo' ? 'text-ink-400' : 'text-ink-800'}`}>{step.label}</div>
                        {st === 'cur' && <div className="text-[11.5px] text-ink-500 mt-0.5">현재 단계</div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {actions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-ink-100">
                  {actions.map((a) => (
                    <button key={a.to} onClick={() => changeStatus(a.to)} disabled={busy}
                      className={`h-8 px-3 rounded-lg text-[12px] font-bold disabled:opacity-50 ${
                        a.tone === 'danger'
                          ? 'border border-divider bg-white text-bad-500 hover:bg-bad-50'
                          : a.tone === 'ok'
                          ? 'bg-ok-500 text-white hover:bg-ok-600'
                          : 'bg-orange-500 text-white hover:bg-orange-600'
                      }`}>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 요약 */}
          <section className="bg-white rounded-2xl border border-ink-100">
            <div className="px-5 py-3.5 border-b border-ink-100">
              <h3 className="flex items-center gap-2 text-[13.5px] font-bold text-ink-900"><CheckCircle2 size={15} className="text-ink-400" /> 요약</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              {field('거래처', client ? <Link href={`/clients?selected=${client.id}`} className="inline-flex items-center gap-1 text-orange-600 hover:underline">{client.name}<ExternalLink size={12} /></Link> : '미지정')}
              {field('잔여 기간', endD === null ? '종료일 미정' : endD >= 0 ? `약 ${Math.ceil(endD / 30)}개월 (D-${endD})` : `만료 ${-endD}일 경과`)}
              {field('연결 프로젝트', `${linkedProjects.length}개`)}
            </div>
          </section>
        </div>
      </div>

      <ContractFormModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        clients={clients}
        editing={contract}
        onSaved={(saved) => { setEditOpen(false); setContract(saved); invalidateTable('contracts'); load(); }}
      />

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="이 계약을 삭제할까요?"
        description={<>&quot;{contract.title}&quot; 계약을 삭제합니다. 연결된 프로젝트는 삭제되지 않지만 계약 링크가 끊어집니다.</>}
        tone="danger"
        confirmLabel="삭제"
        busy={busy}
      />
    </div>
  );
}
