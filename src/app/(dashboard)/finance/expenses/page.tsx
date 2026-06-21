'use client';

import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Plus, Trash2, ChevronLeft, ChevronRight, X, RefreshCw, Ban, CalendarClock, Undo2, AlertTriangle } from 'lucide-react';
import { Expense, ExpenseCategory, PaymentType, SubscriptionStatus } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { getExpenses, insertExpense, updateExpense, deleteExpense } from '@/lib/supabase/db';
import { TabBar } from '@/components/TabBar';
import { StatusBadge } from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { useConfirm } from '@/contexts/ConfirmContext';

const CATEGORIES: ExpenseCategory[] = ['운영비', '장비', '교통', '식비', '숙박', '소프트웨어', '기타'];

const CATEGORY_COLORS: Record<ExpenseCategory, { bg: string; text: string; bar: string }> = {
  '운영비': { bg: 'bg-blue-50', text: 'text-blue-700', bar: '#3b82f6' },
  '장비': { bg: 'bg-purple-50', text: 'text-purple-700', bar: '#a855f7' },
  '교통': { bg: 'bg-green-50', text: 'text-green-700', bar: '#22c55e' },
  '식비': { bg: 'bg-orange-50', text: 'text-orange-700', bar: '#f97316' },
  '숙박': { bg: 'bg-pink-50', text: 'text-pink-700', bar: '#ec4899' },
  '소프트웨어': { bg: 'bg-cyan-50', text: 'text-cyan-700', bar: '#06b6d4' },
  '기타': { bg: 'bg-gray-100', text: 'text-gray-700', bar: '#a8a29e' },
};

const PAYMENT_TYPES: { value: PaymentType; label: string; short: string }[] = [
  { value: 'one_time', label: '일회성', short: '일회성' },
  { value: 'monthly', label: '월 구독', short: '월구독' },
  { value: 'yearly', label: '연 구독', short: '연구독' },
];

const PAYMENT_COLORS: Record<PaymentType, { bg: string; text: string }> = {
  one_time: { bg: 'bg-gray-50', text: 'text-gray-600' },
  monthly: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  yearly: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
};

function formatAmount(value: string): string {
  const num = value.replace(/[^\d]/g, '');
  if (!num) return '';
  return Number(num).toLocaleString();
}

function parseAmount(formatted: string): number {
  return Number(formatted.replace(/[^\d]/g, '') || '0');
}

function calcNextRenewal(date: string, type: PaymentType): string | undefined {
  if (type === 'one_time') return undefined;
  const d = new Date(date);
  if (type === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

type ModalMode = null | 'add' | 'edit';
type CancelModal = null | { expense: Expense };

interface FormData {
  title: string;
  amount: string;
  category: ExpenseCategory;
  paymentType: PaymentType;
  expenseDate: string;
  description: string;
  spenderName: string;
}

const emptyForm: FormData = {
  title: '', amount: '', category: '운영비', paymentType: 'one_time',
  expenseDate: new Date().toISOString().slice(0, 10),
  description: '', spenderName: '',
};

export default function ExpensesPage() {
  const confirm = useConfirm();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [catFilter, setCatFilter] = useState<ExpenseCategory | 'all'>('all');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [cancelModal, setCancelModal] = useState<CancelModal>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth() + 1);
  const viewYM = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;

  const load = useCallback(async () => {
    setError(false);
    try {
      const e = await getExpenses();
      setExpenses(e);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isMinMonth = viewYear === 2026 && viewMonth === 3;
  const prevMonth = () => { if (isMinMonth) return; if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12); } else setViewMonth(viewMonth - 1); };
  const nextMonth = () => { if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1); } else setViewMonth(viewMonth + 1); };

  // 구독 현황 (전체 기간)
  const activeSubscriptions = expenses.filter(e => e.paymentType !== 'one_time' && e.status === 'active');
  const cancellingSubscriptions = expenses.filter(e => e.paymentType !== 'one_time' && e.status === 'cancelling');
  const monthlySubTotal = activeSubscriptions.filter(e => e.paymentType === 'monthly').reduce((s, e) => s + e.amount, 0);
  const yearlySubTotal = activeSubscriptions.filter(e => e.paymentType === 'yearly').reduce((s, e) => s + e.amount, 0);
  const monthlyEquivalent = monthlySubTotal + Math.round(yearlySubTotal / 12);

  // 이번 달 실제 지출
  const monthExpensesActual = expenses.filter(e => e.expenseDate.slice(0, 7) === viewYM);

  // 활성 구독 중 expenseDate가 이번 달이 아닌 것 → 예정 지출로 추가
  const monthSubscriptionExpected = activeSubscriptions.filter(sub => {
    if (sub.expenseDate.slice(0, 7) === viewYM) return false; // 이미 이번 달 실제 지출에 포함됨
    if (sub.paymentType === 'monthly') return true;
    if (sub.paymentType === 'yearly' && sub.nextRenewalDate) {
      return sub.nextRenewalDate.slice(0, 7) === viewYM;
    }
    return false;
  });

  const expectedIds = new Set(monthSubscriptionExpected.map(e => e.id));
  const monthExpenses = [...monthExpensesActual, ...monthSubscriptionExpected];
  const filtered = catFilter === 'all' ? monthExpenses : monthExpenses.filter(e => e.category === catFilter);
  const totalMonthExpense = monthExpenses.reduce((s, e) => s + e.amount, 0);

  const categoryTotals = CATEGORIES.map(cat => ({
    category: cat,
    total: monthExpenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  const openAdd = () => { setForm({ ...emptyForm }); setEditId(null); setModalMode('add'); };
  const openEdit = (expense: Expense) => {
    setForm({
      title: expense.title,
      amount: formatAmount(String(expense.amount)),
      category: expense.category,
      paymentType: expense.paymentType,
      expenseDate: expense.expenseDate,
      description: expense.description ?? '',
      spenderName: expense.spenderName ?? '',
    });
    setEditId(expense.id); setModalMode('edit');
  };

  const handleSubmit = async () => {
    const amt = parseAmount(form.amount);
    if (!form.title || !amt) return;
    setSaving(true);
    const nextRenewal = calcNextRenewal(form.expenseDate, form.paymentType);
    if (modalMode === 'add') {
      await insertExpense({
        id: crypto.randomUUID(), title: form.title, amount: amt,
        category: form.category, paymentType: form.paymentType,
        expenseDate: form.expenseDate, nextRenewalDate: nextRenewal,
        status: 'active',
        description: form.description || undefined,
        spenderName: form.spenderName || undefined,
      });
    } else if (modalMode === 'edit' && editId) {
      await updateExpense(editId, {
        title: form.title, amount: amt,
        category: form.category, paymentType: form.paymentType,
        expenseDate: form.expenseDate, nextRenewalDate: nextRenewal,
        description: form.description || undefined,
        spenderName: form.spenderName || undefined,
      });
    }
    setModalMode(null); setSaving(false); await load();
  };

  const handleDelete = async (id: string) => { if (!(await confirm({ title: '이 지출을 삭제할까요?', tone: 'danger', confirmLabel: '삭제' }))) return; await deleteExpense(id); await load(); };

  const handleScheduleCancel = async () => {
    if (!cancelModal) return;
    setSaving(true);
    await updateExpense(cancelModal.expense.id, {
      status: 'cancelling',
      cancelReason: cancelReason || undefined,
    });
    setCancelModal(null); setCancelReason(''); setSaving(false); await load();
  };

  const handleUndoCancel = async (e: React.MouseEvent, expense: Expense) => {
    e.stopPropagation();
    await updateExpense(expense.id, {
      status: 'active',
      cancelReason: undefined,
      nextRenewalDate: calcNextRenewal(new Date().toISOString().slice(0, 10), expense.paymentType),
    });
    await load();
  };

  const handleReactivate = async (e: React.MouseEvent, expense: Expense) => {
    e.stopPropagation();
    if (!(await confirm({ title: '구독을 다시 활성화할까요?', tone: 'brand', confirmLabel: '활성화' }))) return;
    await updateExpense(expense.id, {
      status: 'active',
      cancelReason: undefined,
      nextRenewalDate: calcNextRenewal(new Date().toISOString().slice(0, 10), expense.paymentType),
    });
    await load();
  };

  const paymentLabel = (type: PaymentType) => PAYMENT_TYPES.find(p => p.value === type)?.short ?? type;

  const statusBadge = (expense: Expense) => {
    if (expense.paymentType === 'one_time') return null;
    if (expense.status === 'cancelling') return <span className="ml-1.5 text-[10px] text-amber-500 font-medium">해지 예정</span>;
    if (expense.status === 'cancelled') return <span className="ml-1.5 text-[10px] text-red-400 font-medium">해지됨</span>;
    return null;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingState /></div>;

  if (error) return (
    <div className="bg-white rounded-2xl border border-divider">
      <EmptyState
        icon={AlertTriangle}
        title="지출 내역을 불러오지 못했습니다"
        description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
        action={{ label: '다시 시도', onClick: () => { setLoading(true); load(); } }}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="space-y-3">
        <div>
          <h1 className="text-page">지출 관리</h1>
          <p className="text-[#78716c] mt-1 text-sm">{viewYear}년 {viewMonth}월</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white border border-divider rounded-[10px] px-1 py-1">
            <button onClick={prevMonth} disabled={isMinMonth} className={`p-1.5 rounded-lg transition-colors ${isMinMonth ? 'invisible' : 'hover:bg-[#f5f5f4]'}`}><ChevronLeft size={14} className="text-[#a8a29e]" /></button>
            <div className="px-2.5 py-1 min-w-[90px] text-center overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={`${viewYear}-${viewMonth}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="block text-[13px] font-semibold text-[#1c1917] tabular-nums">
                  {viewYear}년 {viewMonth}월
                </motion.span>
              </AnimatePresence>
            </div>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[#f5f5f4] transition-colors"><ChevronRight size={14} className="text-[#a8a29e]" /></button>
          </div>
          <button onClick={openAdd} className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-colors flex-shrink-0 inline-flex items-center gap-1.5">
            <Plus size={16} /> 지출 추가
          </button>
        </div>
      </div>

      {/* 구독 현황 카드 */}
      {(activeSubscriptions.length > 0 || cancellingSubscriptions.length > 0) && (
        <div className="bg-white rounded-2xl border border-divider p-4">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw size={14} className="text-emerald-600" />
            <span className="text-[13px] font-bold text-[#1c1917]">구독 현황</span>
            <span className="text-[11px] text-[#a8a29e] ml-auto">월 환산 약 {monthlyEquivalent.toLocaleString()}원</span>
          </div>
          <div className="space-y-2">
            {[...activeSubscriptions, ...cancellingSubscriptions]
              .sort((a, b) => (a.nextRenewalDate ?? '').localeCompare(b.nextRenewalDate ?? ''))
              .map(sub => (
                <div key={sub.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${sub.status === 'cancelling' ? 'bg-amber-50/60' : 'bg-[#fafaf9]'} hover:bg-[#f5f5f4]`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold truncate">{sub.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${PAYMENT_COLORS[sub.paymentType].bg} ${PAYMENT_COLORS[sub.paymentType].text}`}>{paymentLabel(sub.paymentType)}</span>
                      {sub.status === 'cancelling' && <StatusBadge tone="warn">해지 예정</StatusBadge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {sub.nextRenewalDate && sub.status === 'active' && (
                        <span className="text-[11px] text-[#a8a29e] flex items-center gap-1">
                          <CalendarClock size={10} /> 다음 갱신 {sub.nextRenewalDate}
                        </span>
                      )}
                      {sub.status === 'cancelling' && sub.nextRenewalDate && (
                        <span className="text-[11px] text-amber-600 flex items-center gap-1">
                          <CalendarClock size={10} /> {sub.nextRenewalDate}에 해지
                        </span>
                      )}
                      {sub.cancelReason && <span className="text-[11px] text-[#a8a29e]">· {sub.cancelReason}</span>}
                    </div>
                  </div>
                  <span className="text-[14px] font-semibold tabular-nums whitespace-nowrap">{sub.amount.toLocaleString()}원</span>
                  {sub.status === 'active' && (
                    <button onClick={(e) => { e.stopPropagation(); setCancelModal({ expense: sub }); }} className="p-1.5 rounded-lg hover:bg-red-50 text-[#78716c] hover:text-red-500 transition-colors" title="해지 예약">
                      <Ban size={14} />
                    </button>
                  )}
                  {sub.status === 'cancelling' && (
                    <button onClick={(e) => handleUndoCancel(e, sub)} className="p-1.5 rounded-lg hover:bg-blue-50 text-[#78716c] hover:text-blue-500 transition-colors" title="해지 철회">
                      <Undo2 size={14} />
                    </button>
                  )}
                </div>
              ))}
          </div>
          {/* 해지된 구독 (접힌 상태) */}
          {expenses.filter(e => e.paymentType !== 'one_time' && e.status === 'cancelled').length > 0 && (
            <details className="mt-3">
              <summary className="text-[11px] text-[#a8a29e] cursor-pointer hover:text-[#78716c] transition-colors">
                해지된 구독 {expenses.filter(e => e.paymentType !== 'one_time' && e.status === 'cancelled').length}건
              </summary>
              <div className="space-y-1.5 mt-2">
                {expenses.filter(e => e.paymentType !== 'one_time' && e.status === 'cancelled').map(sub => (
                  <div key={sub.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[#fafaf9]/60 opacity-60">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold truncate line-through">{sub.title}</span>
                        <StatusBadge tone="danger">해지됨</StatusBadge>
                      </div>
                      {sub.cancelReason && <span className="text-[11px] text-[#a8a29e] block mt-0.5">{sub.cancelReason}</span>}
                    </div>
                    <span className="text-[13px] text-[#a8a29e] tabular-nums whitespace-nowrap">{sub.amount.toLocaleString()}원</span>
                    <button onClick={(e) => handleReactivate(e, sub)} className="p-1.5 rounded-lg hover:bg-green-50 text-[#78716c] hover:text-green-500 transition-colors" title="재활성화">
                      <RefreshCw size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* 지출 내역 카드 */}
      <div className="bg-white rounded-2xl border border-divider" style={{ overflow: 'clip' }}>
        {/* 통계 바 */}
        <div className="px-5 py-4 border-b border-[#f0ece9]">
          <div className="flex items-baseline justify-between mb-2">
            <motion.span key={`label-${viewYM}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13px] text-[#a8a29e]">이번 달 총 지출 · {monthExpenses.length}건</motion.span>
            <motion.span key={`total-${viewYM}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-[22px] font-extrabold tracking-tight">
              {totalMonthExpense.toLocaleString()}<span className="text-[13px] text-[#78716c] font-medium ml-0.5">원</span>
            </motion.span>
          </div>
          {totalMonthExpense > 0 && (
            <>
              <div className="h-2 rounded-full overflow-hidden flex gap-0.5 mb-2">
                {categoryTotals.map(ct => (
                  <motion.div
                    key={ct.category}
                    initial={false}
                    animate={{ width: `${(ct.total / totalMonthExpense) * 100}%` }}
                    transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: CATEGORY_COLORS[ct.category].bar }}
                  />
                ))}
              </div>
              <div className="hidden sm:flex gap-3 flex-wrap text-[11px]">
                {categoryTotals.map(ct => (
                  <span key={ct.category} className="flex items-center gap-1">
                    <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: CATEGORY_COLORS[ct.category].bar }} />
                    <span className="text-[#78716c]">{ct.category} {ct.total.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 카테고리 필터 — 모바일: 칩+금액 가로 스크롤 */}
        <div className="md:hidden px-4 py-2.5 border-b border-[#f0ece9] flex gap-1.5 overflow-x-auto no-scrollbar">
          <button onClick={() => setCatFilter('all')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-semibold transition-colors flex-shrink-0 ${catFilter === 'all' ? 'bg-[#1c1917] text-white' : 'bg-[#f5f5f4] text-[#78716c] hover:bg-[#ede9e6]'}`}>
            전체 <span className={`text-[10px] tabular-nums ${catFilter === 'all' ? 'opacity-70' : 'opacity-50'}`}>{totalMonthExpense.toLocaleString()}</span>
          </button>
          {categoryTotals.map(ct => (
            <button key={ct.category} onClick={() => setCatFilter(ct.category)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-semibold transition-colors flex-shrink-0 ${catFilter === ct.category ? 'bg-[#1c1917] text-white' : 'bg-[#f5f5f4] text-[#78716c] hover:bg-[#ede9e6]'}`}>
              <span className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[ct.category].bar }} />
              {ct.category} <span className={`text-[10px] tabular-nums ${catFilter === ct.category ? 'opacity-70' : 'opacity-50'}`}>{ct.total.toLocaleString()}</span>
            </button>
          ))}
        </div>
        {/* 카테고리 필터 — 데스크탑 */}
        <div className="hidden md:block px-5 py-2.5 border-b border-[#f0ece9]">
          <TabBar<ExpenseCategory | 'all'>
            items={[
              { key: 'all', label: '전체' },
              ...CATEGORIES.map(cat => ({ key: cat, label: cat })),
            ]}
            active={catFilter}
            onChange={setCatFilter}
            fullWidthMobile={false}
          />
        </div>

        {/* 모바일 카드 리스트 */}
        <div className="md:hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="지출 내역이 없습니다"
              description="이번 달에 기록된 지출이 없습니다. 지출을 추가해 관리해 보세요."
              size="compact"
            />
          ) : (
            <div className="divide-y divide-[#f8f7f6]">
              {[...filtered].sort((a, b) => {
                const dateA = expectedIds.has(a.id) ? (a.nextRenewalDate ?? a.expenseDate) : a.expenseDate;
                const dateB = expectedIds.has(b.id) ? (b.nextRenewalDate ?? b.expenseDate) : b.expenseDate;
                return dateB.localeCompare(dateA);
              }).map((expense, idx) => {
                const isExpected = expectedIds.has(expense.id);
                const dimmed = expense.status === 'cancelled';
                return (
                  <motion.div
                    key={expense.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.04 }}
                    onClick={() => !isExpected && openEdit(expense)}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#fafaf9] transition-colors ${dimmed ? 'opacity-40' : ''} ${isExpected ? 'opacity-60' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] font-semibold truncate">{expense.title}</span>
                        {isExpected && <StatusBadge tone="info" className="flex-shrink-0">예정</StatusBadge>}
                        {!isExpected && statusBadge(expense)}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1 text-[10px] text-[#a8a29e]">
                        <span className="tabular-nums flex-shrink-0">{isExpected ? (expense.nextRenewalDate?.slice(5).replace('-', '/') ?? '예정') : expense.expenseDate.slice(5).replace('-', '/')}</span>
                        <span className={`px-1.5 py-0.5 rounded-md font-semibold flex-shrink-0 ${CATEGORY_COLORS[expense.category].bg} ${CATEGORY_COLORS[expense.category].text}`}>{expense.category}</span>
                        <span className={`px-1.5 py-0.5 rounded-md font-semibold flex-shrink-0 ${PAYMENT_COLORS[expense.paymentType].bg} ${PAYMENT_COLORS[expense.paymentType].text}`}>{paymentLabel(expense.paymentType)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="text-[15px] font-bold tabular-nums">{expense.amount.toLocaleString()}<span className="text-[10px] text-[#78716c] font-medium">원</span></span>
                      {!isExpected && (
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(expense.id); }} className="p-1.5 rounded-lg hover:bg-red-50 text-[#78716c] hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* 데스크탑 테이블 */}
        <div className="hidden md:block" style={{ overflowX: 'clip' }}>
          <div>
            <div className="grid grid-cols-[60px_1fr_80px_70px_115px_28px] gap-2 px-5 py-2 text-[10px] font-semibold text-[#a8a29e] border-b border-[#f0ece9]">
              <span>날짜</span><span>내용</span><span>카테고리</span><span>유형</span><span className="text-right">금액</span><span />
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="지출 내역이 없습니다"
                description="이번 달에 기록된 지출이 없습니다. 지출을 추가해 관리해 보세요."
                size="compact"
              />
            ) : (
              <div className="divide-y divide-[#f8f7f6]">
                {[...filtered].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate)).map((expense, idx) => {
                  const isExpected = expectedIds.has(expense.id);
                  const dimmed = expense.status === 'cancelled';
                  return (
                    <motion.div key={expense.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: idx * 0.03 }}>
                      <div className={`grid grid-cols-[60px_1fr_80px_70px_115px_28px] gap-2 px-5 py-3 items-center hover:bg-[#fafaf9] transition-colors cursor-pointer ${dimmed ? 'opacity-40' : ''} ${isExpected ? 'opacity-60' : ''}`} onClick={() => !isExpected && openEdit(expense)}>
                        <span className="text-[12px] text-[#a8a29e] tabular-nums">{isExpected ? (expense.nextRenewalDate?.slice(5).replace('-', '/') ?? '예정') : expense.expenseDate.slice(5).replace('-', '/')}</span>
                        <div className="min-w-0">
                          <span className="text-[13px] font-semibold block truncate">
                            {expense.title}
                            {isExpected && <span className="ml-1.5 text-[10px] text-blue-500 font-medium">예정</span>}
                            {!isExpected && statusBadge(expense)}
                          </span>
                          {(expense.spenderName || expense.description) && (
                            <span className="text-[11px] text-[#a8a29e] block truncate mt-0.5">
                              {expense.spenderName}{expense.spenderName && expense.description ? ' · ' : ''}{expense.description}
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold text-center truncate ${CATEGORY_COLORS[expense.category].bg} ${CATEGORY_COLORS[expense.category].text}`}>{expense.category}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold text-center truncate ${PAYMENT_COLORS[expense.paymentType].bg} ${PAYMENT_COLORS[expense.paymentType].text}`}>{paymentLabel(expense.paymentType)}</span>
                        <span className="text-[14px] font-semibold text-right tabular-nums whitespace-nowrap">{expense.amount.toLocaleString()}</span>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(expense.id); }} className="p-1 rounded-lg hover:bg-red-50 text-[#78716c] hover:text-red-500 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 추가/수정 모달 */}
      <AnimatePresence>
        {modalMode && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40" onClick={() => setModalMode(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] sm:w-[440px] bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#f0ece9]">
                <h3 className="text-[15px] font-extrabold">{modalMode === 'add' ? '지출 추가' : '지출 수정'}</h3>
                <button onClick={() => setModalMode(null)} className="p-1.5 rounded-lg hover:bg-[#f5f5f4] text-[#a8a29e]"><X size={16} /></button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1">제목 *</label>
                  <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="지출 내용" className="w-full px-3 py-2 border-[1.5px] border-divider rounded-[10px] text-[14px] font-medium focus:border-[#f97316] focus:outline-none transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1">금액 *</label>
                    <div className="relative">
                      <input
                        value={form.amount}
                        onChange={e => setForm({ ...form, amount: formatAmount(e.target.value) })}
                        placeholder="0"
                        inputMode="numeric"
                        className="w-full px-3 py-2 pr-7 border-[1.5px] border-divider rounded-[10px] text-[14px] font-medium focus:border-[#f97316] focus:outline-none transition-colors tabular-nums"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#a8a29e]">원</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1">날짜</label>
                    <input type="date" value={form.expenseDate} onChange={e => setForm({ ...form, expenseDate: e.target.value })} className="w-full px-3 py-2 border-[1.5px] border-divider rounded-[10px] text-[14px] font-medium focus:border-[#f97316] focus:outline-none transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1">카테고리</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {CATEGORIES.map(cat => (
                      <button key={cat} onClick={() => setForm({ ...form, category: cat })} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${form.category === cat ? 'bg-orange-500 text-white' : 'bg-[#f5f5f4] text-[#78716c]'}`}>{cat}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1">결제 유형</label>
                  <div className="flex gap-1.5">
                    {PAYMENT_TYPES.map(pt => (
                      <button key={pt.value} onClick={() => setForm({ ...form, paymentType: pt.value })} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${form.paymentType === pt.value ? 'bg-orange-500 text-white' : 'bg-[#f5f5f4] text-[#78716c]'}`}>{pt.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1">지출자</label>
                  <input value={form.spenderName} onChange={e => setForm({ ...form, spenderName: e.target.value })} placeholder="이름" className="w-full px-3 py-2 border-[1.5px] border-divider rounded-[10px] text-[13px] focus:border-[#f97316] focus:outline-none transition-colors" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1">메모</label>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="선택사항" className="w-full px-3 py-2 border-[1.5px] border-divider rounded-[10px] text-[13px] focus:border-[#f97316] focus:outline-none transition-colors" />
                </div>
              </div>
              <div className="px-5 pb-5">
                <button onClick={handleSubmit} disabled={saving || !form.title || !form.amount} className="w-full py-2.5 bg-orange-500 text-white rounded-xl text-[13px] font-semibold hover:bg-orange-600 transition-colors disabled:bg-gray-200 disabled:text-gray-400">
                  {saving ? '저장 중...' : modalMode === 'add' ? '추가' : '저장'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 해지 예약 모달 */}
      <AnimatePresence>
        {cancelModal && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40" onClick={() => { setCancelModal(null); setCancelReason(''); }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] sm:w-[380px] bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-5 pt-5 pb-3 border-b border-[#f0ece9]">
                <h3 className="text-[15px] font-extrabold">구독 해지 예약</h3>
                <p className="text-[12px] text-[#a8a29e] mt-1">
                  <span className="font-semibold text-[#44403c]">{cancelModal.expense.title}</span>, 다음 갱신일
                  {cancelModal.expense.nextRenewalDate && <span className="font-semibold text-amber-600"> ({cancelModal.expense.nextRenewalDate})</span>}
                  에 해지합니다
                </p>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-[#a8a29e] block mb-1">해지 사유 (선택)</label>
                  <input
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    placeholder="ex) 더 이상 사용하지 않음"
                    className="w-full px-3 py-2 border-[1.5px] border-divider rounded-[10px] text-[13px] focus:border-[#f97316] focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="px-5 pb-5 flex gap-2">
                <button onClick={() => { setCancelModal(null); setCancelReason(''); }} className="flex-1 py-2.5 bg-[#f5f5f4] text-[#78716c] rounded-xl text-[13px] font-semibold hover:bg-[#ede9e6] transition-colors">
                  취소
                </button>
                <button onClick={handleScheduleCancel} disabled={saving} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-[13px] font-semibold hover:bg-red-600 transition-colors disabled:bg-gray-200 disabled:text-gray-400">
                  {saving ? '처리 중...' : '해지 예약'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
