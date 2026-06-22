'use client';
/**
 * 계약 생성/편집 모달 — 목록·상세 공용.
 *  - 거래처 드롭다운(getClients) · 계약명 · 유형 · 상태 · 금액(공급가 입력→VAT 10%·총액 자동, 면세 vat 수정 가능)
 *  - 분배 접이식(파트너지급·관리비·마진율) · 기간 · 결제조건 · 메모
 *  - 저장 = insert/update 후 onSaved(저장된 계약) 콜백. 캐시 무효화/재조회는 호출자 책임.
 */
import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight, Coins, Calendar, FileText } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { useToast } from '@/contexts/ToastContext';
import { insertContract, updateContract } from '@/lib/supabase/db';
import type { Client, Contract, ContractStatus, ContractType } from '@/types';
import { todayStr } from './contract-meta';

const TYPE_OPTS: { value: ContractType; label: string }[] = [
  { value: 'single', label: '단건' },
  { value: 'annual', label: '연간' },
  { value: 'retainer', label: '리테이너' },
];
const STATUS_OPTS: { value: ContractStatus; label: string }[] = [
  { value: 'draft', label: '초안 (견적)' },
  { value: 'sent', label: '발송' },
  { value: 'signed', label: '서명완료' },
  { value: 'active', label: '진행중' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '해지' },
];

const num = (s: string) => parseInt((s || '').replace(/[^0-9]/g, ''), 10) || 0;
const grp = (n: number) => (n ? n.toLocaleString('ko-KR') : '');

interface FormState {
  clientId: string;
  title: string;
  contractType: ContractType;
  status: ContractStatus;
  supply: string;
  vat: string;
  partnerPayment: string;
  managementFee: string;
  marginRate: string;
  startDate: string;
  endDate: string;
  paymentTerms: string;
  manager: string;
  memo: string;
}

function blankForm(): FormState {
  return {
    clientId: '', title: '', contractType: 'single', status: 'draft',
    supply: '', vat: '', partnerPayment: '', managementFee: '', marginRate: '',
    startDate: '', endDate: '', paymentTerms: '', manager: '', memo: '',
  };
}

function fromContract(c: Contract): FormState {
  return {
    clientId: c.clientId,
    title: c.title,
    contractType: c.contractType,
    status: c.status,
    supply: grp(c.supplyAmount),
    vat: grp(c.vatAmount),
    partnerPayment: grp(c.partnerPayment),
    managementFee: grp(c.managementFee),
    marginRate: c.marginRate ? String(c.marginRate) : '',
    startDate: c.startDate ?? '',
    endDate: c.endDate ?? '',
    paymentTerms: c.paymentTerms ?? '',
    manager: c.managerId ?? '',
    memo: c.memo ?? '',
  };
}

export function ContractFormModal({
  isOpen,
  onClose,
  clients,
  editing,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  /** null = 신규, Contract = 편집 */
  editing: Contract | null;
  onSaved: (saved: Contract) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(blankForm);
  const [vatTouched, setVatTouched] = useState(false);
  const [showDist, setShowDist] = useState(false);
  const [saving, setSaving] = useState(false);

  // 모달 열릴 때마다 초기화(신규/편집)
  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setForm(fromContract(editing));
      setVatTouched(true); // 기존 값 보존(자동 덮어쓰기 방지)
      setShowDist(!!(editing.partnerPayment || editing.managementFee || editing.marginRate));
    } else {
      setForm(blankForm());
      setVatTouched(false);
      setShowDist(false);
    }
  }, [isOpen, editing]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // 공급가 입력 → vat 미수정 시 10% 자동
  const onSupplyChange = (v: string) => {
    const supply = num(v);
    setForm((f) => ({
      ...f,
      supply: grp(supply),
      vat: vatTouched ? f.vat : grp(Math.round(supply * 0.1)),
    }));
  };

  const supply = num(form.supply);
  const vat = num(form.vat);
  const total = supply + vat;

  const distSum = useMemo(() => {
    const pp = num(form.partnerPayment);
    const mf = num(form.managementFee);
    return pp + mf;
  }, [form.partnerPayment, form.managementFee]);

  const canSave = form.clientId && form.title.trim() && supply > 0 && !saving;

  const handleSave = async () => {
    if (!form.clientId) { toast.error('거래처를 선택해주세요.'); return; }
    if (!form.title.trim()) { toast.error('계약명을 입력해주세요.'); return; }
    setSaving(true);
    const payload = {
      clientId: form.clientId,
      inquiryId: editing?.inquiryId,
      title: form.title.trim(),
      contractType: form.contractType,
      supplyAmount: supply,
      vatAmount: vat,
      totalAmount: total,
      partnerPayment: num(form.partnerPayment),
      managementFee: num(form.managementFee),
      marginRate: parseFloat(form.marginRate) || 0,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      status: form.status,
      contractDate: editing?.contractDate ?? todayStr(),
      signedDate: editing?.signedDate,
      paymentTerms: form.paymentTerms.trim() || undefined,
      managerId: form.manager.trim() || undefined,
      memo: form.memo.trim() || undefined,
    };
    try {
      if (editing) {
        const ok = await updateContract(editing.id, payload);
        if (ok) {
          toast.success('계약이 수정되었습니다.');
          onSaved({ ...editing, ...payload, updatedAt: new Date().toISOString() } as Contract);
        } else toast.error('수정에 실패했습니다.');
      } else {
        const saved = await insertContract(payload);
        if (saved) {
          toast.success('계약이 등록되었습니다.');
          onSaved(saved);
        } else toast.error('등록에 실패했습니다.');
      }
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full h-10 px-3 rounded-lg border border-divider bg-white text-[13px] text-ink-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100';
  const labelCls = 'block text-[12px] font-semibold text-ink-600 mb-1.5';
  const moneyCls = `${inputCls} text-right tabular-nums pr-9`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? '계약 편집' : '새 계약'} size="xl">
      <div className="space-y-6">
        {/* 거래처 & 기본 */}
        <section>
          <h4 className="flex items-center gap-1.5 text-[13px] font-bold text-ink-700 mb-3">
            <Building2 size={14} className="text-ink-400" /> 거래처 &amp; 기본 정보
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>거래처<span className="text-bad-500 ml-0.5">*</span></label>
              <select value={form.clientId} onChange={(e) => set({ clientId: e.target.value })} className={inputCls}>
                <option value="">거래처 선택</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>담당자</label>
              <input value={form.manager} onChange={(e) => set({ manager: e.target.value })} placeholder="담당 매니저" className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>계약명<span className="text-bad-500 ml-0.5">*</span></label>
              <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="예: 2026 브랜드필름 시리즈 제작" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>계약 유형<span className="text-bad-500 ml-0.5">*</span></label>
              <select value={form.contractType} onChange={(e) => set({ contractType: e.target.value as ContractType })} className={inputCls}>
                {TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>상태</label>
              <select value={form.status} onChange={(e) => set({ status: e.target.value as ContractStatus })} className={inputCls}>
                {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* 금액 */}
        <section>
          <h4 className="flex items-center gap-1.5 text-[13px] font-bold text-ink-700 mb-3">
            <Coins size={14} className="text-ink-400" /> 금액
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>공급가액 (VAT 별도)<span className="text-bad-500 ml-0.5">*</span></label>
              <div className="relative">
                <input value={form.supply} onChange={(e) => onSupplyChange(e.target.value)} inputMode="numeric" placeholder="0" className={moneyCls} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 text-[13px]">원</span>
              </div>
              <p className="text-[11px] text-ink-400 mt-1.5">회차·프로젝트 budget과 동일 단위(공급가)로 통일됩니다</p>
            </div>
            <div>
              <label className={labelCls}>부가세</label>
              <div className="relative">
                <input value={form.vat} onChange={(e) => { setVatTouched(true); set({ vat: grp(num(e.target.value)) }); }} inputMode="numeric" placeholder="0" className={moneyCls} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 text-[13px]">원</span>
              </div>
              <p className="text-[11px] text-ink-400 mt-1.5">기본 공급가×10%, 면세 시 수정 가능</p>
            </div>
          </div>
          <div className="bg-orange-50 rounded-lg px-4 py-3 mt-3 space-y-1">
            <div className="flex justify-between text-[13px]"><span className="text-ink-600">공급가액</span><span className="font-semibold text-ink-800 tabular-nums">{grp(supply) || 0}원</span></div>
            <div className="flex justify-between text-[13px]"><span className="text-ink-600">부가세 (10%)</span><span className="font-semibold text-ink-800 tabular-nums">{grp(vat) || 0}원</span></div>
            <div className="flex justify-between text-[14px] pt-1 border-t border-orange-100"><span className="font-bold text-ink-900">총 계약금액</span><span className="font-bold text-orange-600 tabular-nums">{grp(total) || 0}원</span></div>
          </div>

          {/* 분배 접이식 */}
          <button type="button" onClick={() => setShowDist((v) => !v)} className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-600 hover:text-ink-800 mt-3 py-1">
            <ChevronRight size={14} className={`transition-transform ${showDist ? 'rotate-90' : ''}`} />
            분배 상세 (파트너 지급 · 관리비 · 마진율)
          </button>
          {showDist && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div>
                <label className={labelCls}>파트너 지급분</label>
                <div className="relative">
                  <input value={form.partnerPayment} onChange={(e) => set({ partnerPayment: grp(num(e.target.value)) })} inputMode="numeric" placeholder="0" className={moneyCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 text-[13px]">원</span>
                </div>
              </div>
              <div>
                <label className={labelCls}>관리비</label>
                <div className="relative">
                  <input value={form.managementFee} onChange={(e) => set({ managementFee: grp(num(e.target.value)) })} inputMode="numeric" placeholder="0" className={moneyCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 text-[13px]">원</span>
                </div>
              </div>
              <div>
                <label className={labelCls}>마진율</label>
                <div className="relative">
                  <input value={form.marginRate} onChange={(e) => set({ marginRate: e.target.value.replace(/[^0-9.]/g, '') })} inputMode="decimal" placeholder="0" className={moneyCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 text-[13px]">%</span>
                </div>
                {supply > 0 && distSum > supply && (
                  <p className="text-[11px] text-bad-500 mt-1.5">분배 합({grp(distSum)})이 공급가({grp(supply)})를 초과합니다</p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 기간 & 조건 */}
        <section>
          <h4 className="flex items-center gap-1.5 text-[13px] font-bold text-ink-700 mb-3">
            <Calendar size={14} className="text-ink-400" /> 기간 &amp; 조건
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>계약 시작일</label>
              <input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>계약 종료일</label>
              <input type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>결제조건</label>
              <input value={form.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder="예: 계약금 50% 착수, 잔금 50% 납품 후" className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>메모</label>
              <textarea value={form.memo} onChange={(e) => set({ memo: e.target.value })} rows={3} placeholder="내부 메모 (계약서 PDF는 외부 링크/메모로 대체)" className={`${inputCls} h-auto py-2.5 resize-y min-h-[72px]`} />
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-2 pt-2 border-t border-divider">
          <button onClick={onClose} disabled={saving} className="px-4 h-10 rounded-lg border border-divider text-[13px] font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50">취소</button>
          <button onClick={handleSave} disabled={!canSave} className="flex items-center gap-1.5 px-4 h-10 rounded-lg bg-orange-500 text-white text-[13px] font-bold hover:bg-orange-600 disabled:bg-ink-300 disabled:cursor-not-allowed">
            <FileText size={14} /> {saving ? '저장 중…' : editing ? '변경 저장' : '계약 저장'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
