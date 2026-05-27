'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Copy, Check, Landmark, Receipt, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, CheckCircle, Clock, Coins, Download } from 'lucide-react';
import { toPng } from 'html-to-image';
import { motion, AnimatePresence } from 'framer-motion';
import { Project, Partner, Episode } from '@/types';
import { getProjects, getPartners, getAllEpisodes, updateEpisodeFields } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { useToast } from '@/contexts/ToastContext';
import Link from 'next/link';
import DatePicker from '@/components/DatePicker';

function calcNetAmount(amount: number, partnerType?: 'freelancer' | 'business') {
  if (partnerType === 'business') return Math.round(amount * 1.1);
  return Math.round(amount * (1 - 0.033));
}

function getNetLabel(partnerType?: 'freelancer' | 'business') {
  if (partnerType === 'business') return '부가세 10%';
  return '3.3%';
}

function getDday(dateStr: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return { label: 'D-day', urgent: true };
  if (diff < 0) return { label: `D+${Math.abs(diff)}`, urgent: true };
  if (diff <= 3) return { label: `D-${diff}`, urgent: false };
  return { label: `D-${diff}`, urgent: false };
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

interface SettlementRow {
  id: string;
  episodeId: string;
  type: 'management' | 'work';
  projectTitle: string;
  episodeNumber: number;
  episodeTitle: string;
  amount: number;
  paymentDueDate?: string;
  paymentStatus?: string;
  budgetTotal: number;
  budgetPartner: number;
  budgetManagement: number;
}

export default function ManagerSettlementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [manager, setManager] = useState<Partner | null>(null);
  const [allEpisodes, setAllEpisodes] = useState<(Episode & { projectId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(false);
  const [editingRow, setEditingRow] = useState<SettlementRow | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editStatus, setEditStatus] = useState<'pending' | 'completed'>('pending');
  const [saving, setSaving] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [mobileFilter, setMobileFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const [selectedDate, setSelectedDate] = useState(() => {
    const y = searchParams.get('year');
    const m = searchParams.get('month');
    const now = new Date();
    return { year: y ? parseInt(y) : now.getFullYear(), month: m ? parseInt(m) : now.getMonth() + 1 };
  });

  const prevMonth = () => setSelectedDate(prev => prev.month === 1 ? { year: prev.year - 1, month: 12 } : { year: prev.year, month: prev.month - 1 });
  const isMinMonth = selectedDate.year === 2026 && selectedDate.month === 3;
  const nextMonth = () => setSelectedDate(prev => prev.month === 12 ? { year: prev.year + 1, month: 1 } : { year: prev.year, month: prev.month + 1 });

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([getProjects(), getPartners(), getAllEpisodes()]).then(
      ([p, pa, ep]) => { setProjects(p); setManager(pa.find(x => x.id === id) ?? null); setAllEpisodes(ep); setLoading(false); }
    ).catch(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);
  useSupabaseRealtime(['episodes', 'projects', 'partners'], loadData);

  const selectedYM = `${selectedDate.year}-${String(selectedDate.month).padStart(2, '0')}`;

  const episodesMap = useMemo(() => {
    const map: Record<string, (Episode & { projectId: string })[]> = {};
    allEpisodes.forEach(ep => { if (!map[ep.projectId]) map[ep.projectId] = []; map[ep.projectId].push(ep); });
    return map;
  }, [allEpisodes]);

  // 통합 정산 데이터 (매니징 + 작업)
  const rows: SettlementRow[] = useMemo(() => {
    if (!manager) return [];
    const result: SettlementRow[] = [];

    // 매니징 비용
    projects.forEach(project => {
      if (!project.managerIds?.includes(manager.id)) return;
      (episodesMap[project.id] || []).forEach(ep => {
        if ((ep.manager !== manager.id && ep.manager !== manager.name) || ep.paymentDueDate?.slice(0, 7) !== selectedYM) return;
        const amt = ep.budget?.managementFee ?? 0;
        result.push({ id: `mgmt-${ep.id}`, episodeId: ep.id, type: 'management', projectTitle: project.title, episodeNumber: ep.episodeNumber, episodeTitle: ep.title || '', amount: amt, paymentDueDate: ep.paymentDueDate, paymentStatus: ep.paymentStatus, budgetTotal: ep.budget?.totalAmount ?? 0, budgetPartner: ep.budget?.partnerPayment ?? 0, budgetManagement: ep.budget?.managementFee ?? 0 });
      });
    });

    // 작업 비용
    projects.forEach(project => {
      (episodesMap[project.id] || []).forEach(ep => {
        if ((ep.assignee !== manager.id && ep.assignee !== manager.name) || ep.paymentDueDate?.slice(0, 7) !== selectedYM) return;
        const amt = ep.budget?.partnerPayment ?? 0;
        result.push({ id: `work-${ep.id}`, episodeId: ep.id, type: 'work', projectTitle: project.title, episodeNumber: ep.episodeNumber, episodeTitle: ep.title || '', amount: amt, paymentDueDate: ep.paymentDueDate, paymentStatus: ep.paymentStatus, budgetTotal: ep.budget?.totalAmount ?? 0, budgetPartner: ep.budget?.partnerPayment ?? 0, budgetManagement: ep.budget?.managementFee ?? 0 });
      });
    });

    return result.filter(r => r.amount > 0).sort((a, b) => (a.paymentDueDate ?? '').localeCompare(b.paymentDueDate ?? ''));
  }, [manager, projects, episodesMap, selectedYM]);

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const paidAmount = rows.filter(r => r.paymentStatus === 'completed').reduce((s, r) => s + r.amount, 0);
  const unpaidAmount = totalAmount - paidAmount;
  const totalNetAmount = calcNetAmount(totalAmount, manager?.partnerType);
  const paidPct = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;

  const managementTotal = rows.filter(r => r.type === 'management').reduce((s, r) => s + r.amount, 0);
  const workTotal = rows.filter(r => r.type === 'work').reduce((s, r) => s + r.amount, 0);

  const copyAccount = () => {
    if (manager?.bank && manager?.bankAccount) {
      navigator.clipboard.writeText(`${manager.bank} ${manager.bankAccount}`);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const openEdit = (row: SettlementRow) => {
    setEditingRow(row);
    setEditDate(row.paymentDueDate ?? '');
    setEditAmount(String(row.amount));
    setEditStatus(row.paymentStatus === 'completed' ? 'completed' : 'pending');
  };

  const handleSave = async () => {
    if (!editingRow) return;
    setSaving(true);
    const newAmount = parseInt(editAmount) || 0;
    const budget = editingRow.type === 'management'
      ? { totalAmount: editingRow.budgetTotal, partnerPayment: editingRow.budgetPartner, managementFee: newAmount }
      : { totalAmount: editingRow.budgetTotal, partnerPayment: newAmount, managementFee: editingRow.budgetManagement };
    const ok = await updateEpisodeFields(editingRow.episodeId, {
      paymentDueDate: editDate || undefined,
      paymentStatus: editStatus,
      budget,
    });
    setSaving(false);
    if (!ok) {
      toast.error('저장 실패. 권한 또는 네트워크를 확인해주세요.');
      return;
    }
    setEditingRow(null);
    loadData();
  };

  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!exportRef.current || !manager) return;
    setExporting(true);
    try {
      const el = exportRef.current;
      // 캡처 순간만 화면에 표시
      el.style.position = 'fixed';
      el.style.left = '0';
      el.style.top = '0';
      el.style.zIndex = '9999';
      await new Promise(r => setTimeout(r, 200));
      const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      el.style.zIndex = '-1';
      const link = document.createElement('a');
      link.download = `정산_${manager.name}_${selectedYM}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error('Export failed:', e);
    }
    setExporting(false);
  };

  const hasUnpaid = rows.some(r => r.paymentStatus !== 'completed');

  const handleCompleteAll = async () => {
    const unpaidRows = rows.filter(r => r.paymentStatus !== 'completed');
    if (unpaidRows.length === 0) return;
    setSaving(true);
    // 같은 episodeId 중복 제거 후 병렬 처리
    const uniqueIds = Array.from(new Set(unpaidRows.map(r => r.episodeId)));
    const results = await Promise.all(
      uniqueIds.map(id => updateEpisodeFields(id, { paymentStatus: 'completed' }))
    );
    const okCount = results.filter(Boolean).length;
    const failCount = results.length - okCount;
    setSaving(false);
    if (failCount === 0) toast.success(`${okCount}건 정산 완료`);
    else toast.warning(`${okCount}건 성공, ${failCount}건 실패`);
    loadData();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" /></div>;
  if (!manager) return <div className="flex flex-col items-center justify-center h-64 gap-4"><p className="text-gray-500">매니저를 찾을 수 없습니다.</p><Link href="/finance/partner-settlement" className="text-sm text-orange-500">← 목록으로</Link></div>;

  return (
    <div className="space-y-5">
      {/* 헤더 카드 */}
      <div className="bg-white rounded-2xl border border-divider px-5 py-4">
        <div className="flex items-center gap-3">
          <Link href="/finance/partner-settlement" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft size={18} className="text-[#a8a29e]" />
          </Link>
          <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-[11px] font-bold text-white">
            {manager.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[21px] font-extrabold tracking-tight">{manager.name}</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-50 text-purple-600">
                매니저 · {manager.partnerType === 'business' ? '사업자' : '프리랜서'} · {getNetLabel(manager.partnerType)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[#a8a29e] mt-0.5">
              <span>정산 내역 · {rows.length}건</span>
              {managementTotal > 0 && <><span className="text-[#ede9e6]">·</span><span>매니징 {managementTotal.toLocaleString()}</span></>}
              {workTotal > 0 && <><span className="text-[#ede9e6]">·</span><span>작업 {workTotal.toLocaleString()}</span></>}
            </div>
          </div>
        </div>
        {/* 모바일: 헤더 내 프로그레스 바 */}
        {rows.length > 0 && (
          <div className="sm:hidden mt-3 pt-3 border-t border-[#f0ece9]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-[#a8a29e] font-semibold">실 지급 <b className="text-blue-600">{totalNetAmount.toLocaleString()}원</b></span>
              <span className="text-[10px] text-[#a8a29e]">{paidPct}% 지급됨</span>
            </div>
            <div className="h-[6px] bg-[#f0ece9] rounded-full overflow-hidden flex gap-0.5">
              <motion.div initial={{ width: 0 }} animate={{ width: `${paidPct}%` }} transition={{ duration: 0.6, delay: 0.2, ease: [0.4, 0, 0.2, 1] }} className="h-full bg-green-500 rounded-full" />
              <motion.div initial={{ width: 0 }} animate={{ width: `${100 - paidPct}%` }} transition={{ duration: 0.6, delay: 0.3, ease: [0.4, 0, 0.2, 1] }} className="h-full bg-orange-500 rounded-full" />
            </div>
          </div>
        )}
      </div>

      {/* 월 이동 + 모두 정산 완료 */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-white border border-divider rounded-[10px] px-1 py-1 w-fit">
          <button onClick={prevMonth} disabled={isMinMonth} className={`p-1.5 rounded-lg transition-colors ${isMinMonth ? 'invisible' : 'hover:bg-gray-100'}`}>
            <ChevronLeft size={14} className="text-[#a8a29e]" />
          </button>
          <div className="px-2.5 py-1 min-w-[90px] text-center overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={`${selectedDate.year}-${selectedDate.month}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="block text-[13px] font-semibold text-gray-800 tabular-nums">
                {String(selectedDate.year).slice(2)}년 {String(selectedDate.month).padStart(2, '0')}월
              </motion.span>
            </AnimatePresence>
          </div>
          <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronRight size={14} className="text-[#a8a29e]" />
          </button>
        </div>
        {hasUnpaid && (
          <button
            onClick={handleCompleteAll}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white rounded-xl text-[12px] font-semibold hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            <CheckCircle size={14} />
            {saving ? '처리 중...' : '모두 정산 완료'}
          </button>
        )}
        <button
          onClick={handleExport}
          disabled={exporting || rows.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-divider text-[#44403c] rounded-xl text-[12px] font-semibold hover:bg-[#fafaf9] transition-colors disabled:opacity-50"
        >
          <Download size={14} />
          {exporting ? '내보내는 중...' : '내보내기'}
        </button>
      </div>

      {/* 통합 카드: 통계 + 테이블 */}
      <div className="bg-white rounded-2xl border border-divider" style={{ overflow: 'clip' }}>
        {/* 통계 바 (모바일 숨김 — 헤더 진행률로 대체) */}
        <div className="hidden sm:block px-5 py-4 border-b border-[#f0ece9]">
          <div className="flex items-baseline justify-between mb-1.5">
            <motion.span key={`label-${selectedYM}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="text-[13px] text-[#a8a29e]">
              총 정산 · 실 지급 <b className="text-blue-600">{totalNetAmount.toLocaleString()}원</b>
            </motion.span>
            <motion.span key={`total-${selectedYM}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-[22px] font-extrabold tracking-tight">
              {totalAmount.toLocaleString()}<span className="text-[13px] text-[#78716c] font-medium ml-0.5">원</span>
            </motion.span>
          </div>
          <div className="h-[6px] bg-[#f0ece9] rounded-full overflow-hidden flex gap-0.5 mb-1.5">
            <motion.div initial={false} animate={{ width: `${paidPct}%` }} transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }} className="h-full bg-green-500 rounded-full" />
            <motion.div initial={false} animate={{ width: `${100 - paidPct}%` }} transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }} className="h-full bg-orange-500 rounded-full" />
          </div>
          <motion.div key={`legend-${selectedYM}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.1 }} className="flex justify-between text-[12px]">
            <div className="flex items-center gap-1.5"><div className="w-2 h-1 bg-green-500 rounded-sm" /><span className="text-green-600 font-semibold">완료 {paidAmount.toLocaleString()}</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-1 bg-orange-500 rounded-sm" /><span className="text-orange-500 font-semibold">대기 {unpaidAmount.toLocaleString()}</span></div>
          </motion.div>
        </div>

        {rows.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <Receipt className="mx-auto mb-3 text-gray-200" size={36} />
            <p className="font-medium text-gray-500">정산 내역이 없어요</p>
            <p className="text-xs mt-1">{selectedDate.year}년 {selectedDate.month}월에 해당하는 내역이 없습니다</p>
          </div>
        ) : (
          <>
            {/* 모바일: 시안 3B — 컴팩트 회차 행 (펼침) */}
            <div className="sm:hidden">
              {/* 합계 카드 */}
              <div className="px-4 py-3 bg-orange-50/40 border-b border-[#f0ece9]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#a8a29e] font-semibold">정산 합계</span>
                  <span className="text-orange-600 font-bold text-[16px] tabular-nums">{totalAmount.toLocaleString()}<span className="text-[10px] ml-0.5">원</span></span>
                </div>
              </div>

              {/* 필터 칩 */}
              <div className="px-4 py-3 flex gap-1.5 border-b border-[#f0ece9] overflow-x-auto">
                {(['all', 'pending', 'completed'] as const).map(f => {
                  const cnt = f === 'all' ? rows.length : rows.filter(r => f === 'completed' ? r.paymentStatus === 'completed' : r.paymentStatus !== 'completed').length;
                  const label = f === 'all' ? '전체' : f === 'pending' ? '미정산' : '완료';
                  const active = mobileFilter === f;
                  return (
                    <button key={f} onClick={() => setMobileFilter(f)} className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${active ? 'bg-orange-500 text-white' : 'bg-white border border-divider text-[#44403c]'}`}>
                      {label} {cnt}
                    </button>
                  );
                })}
              </div>

              {/* 회차 리스트 */}
              {(() => {
                const filteredRows = rows.filter(r => mobileFilter === 'all' ? true : mobileFilter === 'completed' ? r.paymentStatus === 'completed' : r.paymentStatus !== 'completed');
                if (filteredRows.length === 0) {
                  return (
                    <div className="py-10 text-center text-[12px] text-[#a8a29e]">
                      해당 상태의 정산 내역이 없습니다
                    </div>
                  );
                }
                return (
                  <div className="divide-y divide-[#f0ece9]">
                    {filteredRows.map((row, idx) => {
                      const expanded = expandedRowId === row.id;
                      const epNet = calcNetAmount(row.amount, manager.partnerType);
                      const taxAmount = Math.abs(epNet - row.amount);
                      const isCompleted = row.paymentStatus === 'completed';
                      return (
                        <motion.div key={row.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: idx * 0.03 }}>
                          <button onClick={() => setExpandedRowId(expanded ? null : row.id)} className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${expanded ? 'bg-orange-50/40' : 'hover:bg-[#fafaf9]'}`}>
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${row.type === 'management' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'}`}>{row.type === 'management' ? '매니징' : '작업'}</span>
                                <span className="text-[12px] font-semibold truncate">{row.projectTitle}</span>
                              </div>
                              <div className="text-[10px] text-[#a8a29e] mt-0.5 truncate">
                                {row.episodeNumber}편 {row.episodeTitle}{row.paymentDueDate ? ` · ${fmtDate(row.paymentDueDate)}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                              <span className={`badge text-[8px] px-1.5 py-0.5 rounded font-bold ${isCompleted ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>{isCompleted ? '완료' : '미정산'}</span>
                              <div className="text-right">
                                <div className={`text-[12px] font-bold tabular-nums ${isCompleted ? 'text-[#44403c]' : 'text-orange-600'}`}>{row.amount.toLocaleString()}</div>
                              </div>
                              {expanded ? <ChevronUp size={12} className="text-[#a8a29e]" /> : <ChevronDown size={12} className="text-[#a8a29e]" />}
                            </div>
                          </button>
                          {expanded && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.2 }} className="px-4 py-3 bg-[#fafaf9] text-[11px] space-y-1.5 border-t border-[#f0ece9] overflow-hidden">
                              <div className="flex justify-between"><span className="text-[#a8a29e]">매출액</span><span className="tabular-nums">{row.budgetTotal.toLocaleString()}원</span></div>
                              <div className="flex justify-between"><span className="text-[#a8a29e]">파트너 지급</span><span className="tabular-nums">{row.budgetPartner.toLocaleString()}원</span></div>
                              <div className="flex justify-between"><span className="text-[#a8a29e]">{manager.partnerType === 'business' ? '부가세' : '원천징수'}</span><span className="tabular-nums">{manager.partnerType === 'business' ? '+' : '−'}{taxAmount.toLocaleString()}원</span></div>
                              <div className="flex justify-between"><span className="text-[#a8a29e]">실 수령</span><span className="font-bold text-blue-600 tabular-nums">{epNet.toLocaleString()}원</span></div>
                              <div className="flex gap-1.5 mt-2 pt-2 border-t border-[#ede9e6]">
                                <button onClick={(e) => { e.stopPropagation(); openEdit(row); }} className="flex-1 py-2 text-[11px] font-semibold bg-white border border-divider text-[#44403c] rounded-lg hover:bg-[#fafaf9] transition-colors">편집</button>
                                {!isCompleted && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const ok = await updateEpisodeFields(row.episodeId, { paymentStatus: 'completed' });
                                      if (ok) { toast.success('정산 완료'); loadData(); } else { toast.error('저장 실패'); }
                                    }}
                                    className="flex-1 py-2 text-[11px] font-semibold bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                                  >
                                    정산 완료 처리
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* 데스크탑: 매니징 비용 섹션 */}
            <div className="hidden sm:block">
            {(() => {
              const mgmtRows = rows.filter(r => r.type === 'management');
              const mgmtNet = calcNetAmount(managementTotal, manager.partnerType);
              if (mgmtRows.length === 0) return null;
              return (
                <div className="border-b border-[#f0ece9]">
                  <div className="px-5 py-2.5 flex items-center gap-2 border-b border-[#f0ece9]">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span className="text-[13px] font-bold">매니징 비용</span>
                    <span className="text-[11px] text-[#a8a29e]">{mgmtRows.length}건</span>
                    <span className="ml-auto text-[13px] font-bold tabular-nums">{managementTotal.toLocaleString()}원</span>
                  </div>
                  <div style={{ overflowX: 'clip' }}>
                    <div className="min-w-[600px]">
                      <div className="grid grid-cols-[1fr_120px_100px_90px_100px] gap-2 px-5 py-2 text-[10px] font-semibold text-[#a8a29e] border-b border-[#f5f4f2]">
                        <span>프로젝트 · 회차</span><span className="text-right">정산일</span><span className="text-right">금액</span><span className="text-right">{manager.partnerType === 'business' ? '부가세' : '원천징수'}</span><span className="text-right">실 수령</span>
                      </div>
                      <div className="divide-y divide-[#f8f7f6]">
                        {mgmtRows.map((row, idx) => {
                          const epNet = calcNetAmount(row.amount, manager.partnerType);
                          const taxAmount = Math.abs(epNet - row.amount);
                          const dday = row.paymentDueDate ? getDday(row.paymentDueDate) : null;
                          return (
                            <motion.div key={row.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: idx * 0.03 }}>
                              <div onClick={() => openEdit(row)} className="grid grid-cols-[1fr_120px_100px_90px_100px] gap-2 px-5 py-3 items-center hover:bg-[#fafaf9] transition-colors cursor-pointer">
                                <div className="min-w-0"><span className="text-[13px] font-semibold">{row.projectTitle}</span><span className="text-[12px] text-[#a8a29e] ml-1.5">{row.episodeNumber}편 {row.episodeTitle}</span></div>
                                <div className="text-right whitespace-nowrap">{row.paymentDueDate ? (<div className="flex items-center justify-end gap-1.5"><span className="text-[12px] tabular-nums text-[#44403c]">{fmtDate(row.paymentDueDate)}</span>{dday && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${dday.urgent ? 'bg-red-100 text-red-600' : 'bg-[#f5f5f4] text-[#a8a29e]'}`}>{dday.label}</span>}</div>) : <span className="text-[12px] text-[#d6d3d1]">-</span>}</div>
                                <span className="text-[14px] font-semibold text-right tabular-nums">{row.amount.toLocaleString()}</span>
                                <span className="text-[12px] text-[#a8a29e] text-right tabular-nums">{manager.partnerType === 'business' ? '+' : '−'}{taxAmount.toLocaleString()}</span>
                                <span className="text-[14px] font-bold text-blue-600 text-right tabular-nums">{epNet.toLocaleString()}</span>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                      {/* 매니징 소계 */}
                      <div className="grid grid-cols-[1fr_120px_100px_90px_100px] gap-2 px-5 py-2.5 items-center bg-[#fafaf9] border-t border-[#f0ece9] text-[12px]">
                        <span className="font-semibold text-[#78716c]">소계</span><span /><span className="font-bold text-right tabular-nums">{managementTotal.toLocaleString()}</span><span className="text-[#a8a29e] text-right tabular-nums">{manager.partnerType === 'business' ? '+' : '−'}{Math.abs(mgmtNet - managementTotal).toLocaleString()}</span><span className="font-bold text-blue-600 text-right tabular-nums">{mgmtNet.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 작업 비용 섹션 */}
            {(() => {
              const workRows = rows.filter(r => r.type === 'work');
              const workNet = calcNetAmount(workTotal, manager.partnerType);
              if (workRows.length === 0) return null;
              return (
                <div>
                  <div className="px-5 py-2.5 flex items-center gap-2 border-b border-[#f0ece9]">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    <span className="text-[13px] font-bold">작업 비용</span>
                    <span className="text-[11px] text-[#a8a29e]">{workRows.length}건</span>
                    <span className="ml-auto text-[13px] font-bold tabular-nums">{workTotal.toLocaleString()}원</span>
                  </div>
                  <div style={{ overflowX: 'clip' }}>
                    <div className="min-w-[600px]">
                      <div className="grid grid-cols-[1fr_120px_100px_90px_100px] gap-2 px-5 py-2 text-[10px] font-semibold text-[#a8a29e] border-b border-[#f5f4f2]">
                        <span>프로젝트 · 회차</span><span className="text-right">정산일</span><span className="text-right">금액</span><span className="text-right">{manager.partnerType === 'business' ? '부가세' : '원천징수'}</span><span className="text-right">실 수령</span>
                      </div>
                      <div className="divide-y divide-[#f8f7f6]">
                        {workRows.map((row, idx) => {
                          const epNet = calcNetAmount(row.amount, manager.partnerType);
                          const taxAmount = Math.abs(epNet - row.amount);
                          const dday = row.paymentDueDate ? getDday(row.paymentDueDate) : null;
                          return (
                            <motion.div key={row.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: idx * 0.03 }}>
                              <div onClick={() => openEdit(row)} className="grid grid-cols-[1fr_120px_100px_90px_100px] gap-2 px-5 py-3 items-center hover:bg-[#fafaf9] transition-colors cursor-pointer">
                                <div className="min-w-0"><span className="text-[13px] font-semibold">{row.projectTitle}</span><span className="text-[12px] text-[#a8a29e] ml-1.5">{row.episodeNumber}편 {row.episodeTitle}</span></div>
                                <div className="text-right whitespace-nowrap">{row.paymentDueDate ? (<div className="flex items-center justify-end gap-1.5"><span className="text-[12px] tabular-nums text-[#44403c]">{fmtDate(row.paymentDueDate)}</span>{dday && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${dday.urgent ? 'bg-red-100 text-red-600' : 'bg-[#f5f5f4] text-[#a8a29e]'}`}>{dday.label}</span>}</div>) : <span className="text-[12px] text-[#d6d3d1]">-</span>}</div>
                                <span className="text-[14px] font-semibold text-right tabular-nums">{row.amount.toLocaleString()}</span>
                                <span className="text-[12px] text-[#a8a29e] text-right tabular-nums">{manager.partnerType === 'business' ? '+' : '−'}{taxAmount.toLocaleString()}</span>
                                <span className="text-[14px] font-bold text-blue-600 text-right tabular-nums">{epNet.toLocaleString()}</span>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                      {/* 작업 소계 */}
                      <div className="grid grid-cols-[1fr_120px_100px_90px_100px] gap-2 px-5 py-2.5 items-center bg-[#fafaf9] border-t border-[#f0ece9] text-[12px]">
                        <span className="font-semibold text-[#78716c]">소계</span><span /><span className="font-bold text-right tabular-nums">{workTotal.toLocaleString()}</span><span className="text-[#a8a29e] text-right tabular-nums">{manager.partnerType === 'business' ? '+' : '−'}{Math.abs(workNet - workTotal).toLocaleString()}</span><span className="font-bold text-blue-600 text-right tabular-nums">{workNet.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            </div>
          </>
        )}

        {/* 합계 */}
        {rows.length > 0 && (
          <div className="px-5 py-3.5 border-t border-[#f0ece9] bg-[#fafaf9] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#78716c]">합계</span>
              {manager.bank && manager.bankAccount ? (
                <button onClick={copyAccount} className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 bg-white border border-divider rounded-lg hover:border-[#d6d3d1] transition-colors">
                  <Landmark size={11} className="text-[#a8a29e]" />
                  <span className="text-[#78716c]">{manager.bank} {manager.bankAccount}</span>
                  {copiedId ? <Check size={11} className="text-green-500" /> : <Copy size={11} className="text-[#d6d3d1]" />}
                </button>
              ) : (
                <Link href="/partners" className="text-[11px] px-2.5 py-1 bg-orange-50 text-orange-500 rounded-lg hover:bg-orange-100 transition-colors">계좌 미등록</Link>
              )}
            </div>
            <div className="flex items-center gap-2 tabular-nums">
              <span className="text-[15px] font-bold">{totalAmount.toLocaleString()}</span>
              <span className="text-[#d6d3d1]">{manager.partnerType === 'business' ? '+' : '−'}</span>
              <span className="text-[13px] text-[#a8a29e]">{Math.abs(totalNetAmount - totalAmount).toLocaleString()}</span>
              <span className="text-[#d6d3d1]">=</span>
              <span className="text-[18px] font-extrabold text-blue-600">{totalNetAmount.toLocaleString()}<span className="text-[12px] font-medium ml-0.5">원</span></span>
            </div>
          </div>
        )}
      </div>
      {/* A4 내보내기용 (Portal로 body에 렌더) */}
      {typeof window !== 'undefined' && createPortal(
      <div ref={exportRef} style={{ width: '794px', padding: '48px 40px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', position: 'fixed', left: '-9999px', top: '0', zIndex: -1 }}>
        {manager && (() => {
          const mgmtRows = rows.filter(r => r.type === 'management');
          const workRows = rows.filter(r => r.type === 'work');
          const mgmtNet = calcNetAmount(managementTotal, manager.partnerType);
          const workNet = calcNetAmount(workTotal, manager.partnerType);
          const taxLabel = manager.partnerType === 'business' ? '부가세' : '원천징수';
          const taxSign = manager.partnerType === 'business' ? '+' : '−';

          const renderTable = (title: string, color: string, items: SettlementRow[], subtotal: number, subtotalNet: number) => (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                <span style={{ fontSize: '14px', fontWeight: 700 }}>{title}</span>
                <span style={{ fontSize: '12px', color: '#a8a29e' }}>{items.length}건</span>
                <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 700 }}>{subtotal.toLocaleString()}원</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #f0ece9' }}>
                    <th style={{ textAlign: 'left', padding: '8px 6px', color: '#a8a29e', fontWeight: 600 }}>프로젝트 · 회차</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', color: '#a8a29e', fontWeight: 600 }}>정산일</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', color: '#a8a29e', fontWeight: 600 }}>금액</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', color: '#a8a29e', fontWeight: 600 }}>{taxLabel}</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', color: '#a8a29e', fontWeight: 600 }}>실 수령</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(row => {
                    const epNet = calcNetAmount(row.amount, manager.partnerType);
                    const tax = Math.abs(epNet - row.amount);
                    return (
                      <tr key={row.id} style={{ borderBottom: '1px solid #f5f4f2' }}>
                        <td style={{ padding: '10px 6px' }}>
                          <span style={{ fontWeight: 600 }}>{row.projectTitle}</span>
                          <span style={{ color: '#a8a29e', marginLeft: '6px' }}>{row.episodeNumber}편 {row.episodeTitle}</span>
                        </td>
                        <td style={{ textAlign: 'right', padding: '10px 6px', color: '#44403c' }}>{row.paymentDueDate ? fmtDate(row.paymentDueDate) : '-'}</td>
                        <td style={{ textAlign: 'right', padding: '10px 6px', fontWeight: 600 }}>{row.amount.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', padding: '10px 6px', color: '#a8a29e' }}>{taxSign}{tax.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', padding: '10px 6px', fontWeight: 700, color: '#2563eb' }}>{epNet.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #f0ece9', background: '#fafaf9' }}>
                    <td style={{ padding: '10px 6px', fontWeight: 600, color: '#78716c' }}>소계</td>
                    <td />
                    <td style={{ textAlign: 'right', padding: '10px 6px', fontWeight: 700 }}>{subtotal.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '10px 6px', color: '#a8a29e' }}>{taxSign}{Math.abs(subtotalNet - subtotal).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', padding: '10px 6px', fontWeight: 700, color: '#2563eb' }}>{subtotalNet.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          );

          return (
            <>
              {/* 헤더 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div>
                  <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0 }}>{manager.name} 정산 내역서</h1>
                  <p style={{ fontSize: '13px', color: '#a8a29e', margin: '4px 0 0' }}>
                    {manager.partnerType === 'business' ? '사업자' : '프리랜서'} · {getNetLabel(manager.partnerType)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>{selectedDate.year}년 {selectedDate.month}월</p>
                  <p style={{ fontSize: '11px', color: '#a8a29e', margin: '2px 0 0' }}>발행일 {new Date().toLocaleDateString('ko-KR')}</p>
                </div>
              </div>
              <div style={{ height: '2px', background: 'linear-gradient(to right, #f97316, #f97316)', borderRadius: '1px', marginBottom: '24px' }} />

              {/* 요약 */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '28px' }}>
                <div style={{ flex: 1, background: '#fafaf9', borderRadius: '12px', padding: '16px' }}>
                  <p style={{ fontSize: '11px', color: '#a8a29e', margin: '0 0 4px' }}>총 정산액</p>
                  <p style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>{totalAmount.toLocaleString()}<span style={{ fontSize: '12px', fontWeight: 500 }}>원</span></p>
                </div>
                <div style={{ flex: 1, background: '#eff6ff', borderRadius: '12px', padding: '16px' }}>
                  <p style={{ fontSize: '11px', color: '#a8a29e', margin: '0 0 4px' }}>실 지급액</p>
                  <p style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#2563eb' }}>{totalNetAmount.toLocaleString()}<span style={{ fontSize: '12px', fontWeight: 500 }}>원</span></p>
                </div>
              </div>

              {/* 테이블 */}
              {mgmtRows.length > 0 && renderTable('매니징 비용', '#a855f7', mgmtRows, managementTotal, mgmtNet)}
              {workRows.length > 0 && renderTable('작업 비용', '#f97316', workRows, workTotal, workNet)}

              {/* 합계 */}
              <div style={{ borderTop: '2px solid #1c1917', padding: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700 }}>합계</span>
                  {manager.bank && manager.bankAccount && (
                    <span style={{ fontSize: '12px', color: '#78716c', background: '#f5f5f4', padding: '4px 10px', borderRadius: '6px' }}>
                      {manager.bank} {manager.bankAccount}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px', fontWeight: 700 }}>{totalAmount.toLocaleString()}</span>
                  <span style={{ color: '#d6d3d1' }}>{taxSign}</span>
                  <span style={{ fontSize: '13px', color: '#a8a29e' }}>{Math.abs(totalNetAmount - totalAmount).toLocaleString()}</span>
                  <span style={{ color: '#d6d3d1' }}>=</span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#2563eb' }}>{totalNetAmount.toLocaleString()}<span style={{ fontSize: '12px', fontWeight: 500, marginLeft: '2px' }}>원</span></span>
                </div>
              </div>

              {/* 푸터 */}
              <div style={{ marginTop: '32px', textAlign: 'center', fontSize: '10px', color: '#d6d3d1' }}>
                VIMO ERP · 비모
              </div>
            </>
          );
        })()}
      </div>,
      document.body
      )}

      {/* 편집 모달 (Portal) */}
      {typeof window !== 'undefined' && createPortal(
        <AnimatePresence>
          {editingRow && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/30 z-50"
                onClick={() => setEditingRow(null)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="fixed z-50 bg-white rounded-2xl shadow-2xl w-[calc(100%-32px)] max-w-md top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              >
              <div className="px-5 pt-4 pb-2 flex items-center justify-between border-b border-[#f0ece9]">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-bold">{editingRow.projectTitle}</h3>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      editingRow.type === 'management' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-500'
                    }`}>{editingRow.type === 'management' ? '매니징' : '작업'}</span>
                  </div>
                  <p className="text-[12px] text-[#a8a29e]">{editingRow.episodeNumber}편 {editingRow.episodeTitle}</p>
                </div>
                <button onClick={() => setEditingRow(null)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                  <X size={18} className="text-[#a8a29e]" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-4">
                {/* 정산 상태 */}
                <div>
                  <label className="text-[11px] font-semibold text-[#a8a29e] mb-1.5 block">정산 상태</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditStatus('completed')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${
                        editStatus === 'completed'
                          ? 'bg-green-500 text-white'
                          : 'bg-[#f5f5f4] text-[#78716c] hover:bg-[#ede9e6]'
                      }`}
                    >
                      <CheckCircle size={15} />
                      정산 완료
                    </button>
                    <button
                      onClick={() => setEditStatus('pending')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-colors ${
                        editStatus === 'pending'
                          ? 'bg-orange-500 text-white'
                          : 'bg-[#f5f5f4] text-[#78716c] hover:bg-[#ede9e6]'
                      }`}
                    >
                      <Clock size={15} />
                      대기
                    </button>
                  </div>
                </div>
                {/* 정산일 */}
                <div>
                  <label className="text-[11px] font-semibold text-[#a8a29e] mb-1.5 block">정산일</label>
                  <DatePicker
                    value={editDate}
                    onChange={setEditDate}
                    placeholder="정산일 선택"
                  />
                </div>
                {/* 금액 */}
                <div>
                  <label className="text-[11px] font-semibold text-[#a8a29e] mb-1.5 flex items-center gap-1">
                    <Coins size={12} />
                    {editingRow.type === 'management' ? '매니징 비용' : '작업 비용'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editAmount ? parseInt(editAmount).toLocaleString() : ''}
                      onChange={e => setEditAmount(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full px-3 py-2.5 border border-divider rounded-xl text-[14px] font-semibold tabular-nums focus:outline-none focus:border-orange-400 transition-colors pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#a8a29e]">원</span>
                  </div>
                </div>
              </div>
              <div className="px-5 pb-5 pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3 bg-orange-500 text-white rounded-xl text-[14px] font-bold hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
