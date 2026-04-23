'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Save, Sparkles, Check, ChevronDown, User, Search, Wallet, Users, Calendar } from 'lucide-react';
import { Project, Partner, Episode } from '@/types';
import { getProjects, getPartners, getAllEpisodes, updateEpisodeFields } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { useToast } from '@/contexts/ToastContext';
import DateTripleModal from '@/components/DateTripleModal';

// ── 제목에서 금액 힌트 추출
function extractPriceHint(title: string): number | null {
  const m1 = title.match(/(\d+)\s*만\s*원/);
  if (m1) return parseInt(m1[1]) * 10000;
  const m2 = title.match(/([\d,]+)\s*원/);
  if (m2) {
    const v = parseInt(m2[1].replace(/,/g, ''));
    if (v >= 10000) return v;
  }
  return null;
}



// ── 미입력 필드 체크
interface MissingFlags {
  cost: boolean;       // 파트너 비용
  mgmt: boolean;       // 매니징 비용
  date: boolean;       // 정산 예정일
  assignee: boolean;   // 담당 파트너
  manager: boolean;    // 담당 매니저
  startDate: boolean;  // 작업 시작일
  dueDate: boolean;    // 마감일
}

function isValidDateStr(v: string | undefined | null): boolean {
  if (!v) return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
}

// ISO 날짜 → YYYY-MM-DD 정규화
function normalizeDate(v: string | undefined | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function checkMissing(ep: Episode): MissingFlags {
  const partnerPay = ep.budget?.partnerPayment ?? 0;
  const total = ep.budget?.totalAmount ?? 0;
  const mgmtFee = ep.budget?.managementFee ?? 0;
  const mgmtMissing = mgmtFee === 0 && (total - partnerPay) > 0;

  return {
    cost: partnerPay === 0,
    mgmt: mgmtMissing,
    date: !isValidDateStr(ep.paymentDueDate),
    assignee: !ep.assignee || ep.assignee === '',
    manager: !ep.manager || ep.manager === '',
    startDate: !isValidDateStr(ep.startDate),
    dueDate: !isValidDateStr(ep.dueDate),
  };
}

function hasMissing(flags: MissingFlags): boolean {
  return Object.values(flags).some(Boolean);
}

function countMissing(flags: MissingFlags): number {
  return Object.values(flags).filter(Boolean).length;
}

interface BatchRow {
  episode: Episode & { projectId: string };
  project: Project | undefined;
  partner: Partner | undefined;
  managerPartner: Partner | undefined;
  suggestedCost: number | null;
  missing: MissingFlags;
}

// 편집 가능한 필드
interface EditFields {
  cost?: number;
  mgmt?: number;
  total?: number;
  date?: string;
  assignee?: string;
  manager?: string;
  startDate?: string;
  dueDate?: string;
}

type FilterKey = 'all' | 'cost' | 'date' | 'person' | 'schedule';

export default function ManagementMissing({ onMissingCount }: { onMissingCount?: (count: number) => void }) {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [allEpisodes, setAllEpisodes] = useState<(Episode & { projectId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  const [edits, setEdits] = useState<Record<string, EditFields>>({});
  const [activeEpId, setActiveEpId] = useState<string | null>(null);

  const [dateModalEpId, setDateModalEpId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([getProjects(), getPartners(), getAllEpisodes()])
      .then(([p, pa, ep]) => {
        setProjects(p); setPartners(pa); setAllEpisodes(ep); setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);
  const hasEdits = Object.keys(edits).length > 0;
  useSupabaseRealtime(['episodes', 'projects', 'partners'], useCallback(() => {
    if (!hasEdits) loadData();
  }, [hasEdits, loadData]));

  // 활성 파트너 목록 (드롭다운용)
  const activePartners = useMemo(() =>
    partners.filter(p => p.status === 'active').sort((a, b) => a.name.localeCompare(b.name)),
    [partners]
  );
  const managerPartners = useMemo(() =>
    activePartners.filter(p => p.position === 'manager' || p.position === 'executive'),
    [activePartners]
  );

  // 커스텀 드롭다운 상태
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setDropdownSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── 아카이브 프로젝트 ID
  const archivedProjectIds = useMemo(() =>
    new Set(projects.filter(p => p.status === 'archived').map(p => p.id)),
    [projects]
  );

  // ── 미입력 에피소드 추출 (아카이브 + v1 제외)
  const V1_CUTOFF = '2026-03';
  const rows: BatchRow[] = useMemo(() => {
    return allEpisodes
      .map(ep => {
        // 아카이브 프로젝트 제외
        if (archivedProjectIds.has(ep.projectId)) return null;
        // v1 데이터 제외: 작업 시작일 또는 마감일이 2026년 3월 이전이면 과거 데이터
        const workDate = ep.startDate || ep.dueDate || '';
        if (workDate && workDate.slice(0, 7) < V1_CUTOFF) return null;

        const missing = checkMissing(ep);
        if (!hasMissing(missing)) return null;
        const project = projects.find(p => p.id === ep.projectId);
        const partner = partners.find(pa => pa.id === ep.assignee || pa.name === ep.assignee);
        const managerPartner = partners.find(pa => pa.id === ep.manager || pa.name === ep.manager);
        return {
          episode: ep, project, partner, managerPartner,
          suggestedCost: extractPriceHint(ep.title),
          missing,
        };
      })
      .filter((r): r is BatchRow => r !== null)
      .sort((a, b) => {
        // 미입력 많은 순 → 파트너 이름순 → 프로젝트 → 회차
        const mc = countMissing(b.missing) - countMissing(a.missing);
        if (mc !== 0) return mc;
        const pa = (a.partner?.name ?? 'ㅎ').localeCompare(b.partner?.name ?? 'ㅎ');
        if (pa !== 0) return pa;
        const pr = (a.project?.title ?? '').localeCompare(b.project?.title ?? '');
        if (pr !== 0) return pr;
        return a.episode.episodeNumber - b.episode.episodeNumber;
      });
  }, [allEpisodes, projects, partners, archivedProjectIds]);

  // ── 필터
  const filtered = useMemo(() => {
    let list = rows;
    if (filter === 'cost') list = list.filter(r => r.missing.cost || r.missing.mgmt);
    else if (filter === 'date') list = list.filter(r => r.missing.date);
    else if (filter === 'person') list = list.filter(r => r.missing.assignee || r.missing.manager);
    else if (filter === 'schedule') list = list.filter(r => r.missing.startDate || r.missing.dueDate);

    return list;
  }, [rows, filter]);

  // 활성 회차
  const activeIdx = useMemo(() => filtered.findIndex(r => r.episode.id === activeEpId), [filtered, activeEpId]);
  const activeRow = activeIdx >= 0 ? filtered[activeIdx] : null;
  // 방향 감지 (다음=1, 이전=-1)
  const prevIdxRef = useRef<number>(activeIdx);
  const [direction, setDirection] = useState(0);
  useEffect(() => {
    if (activeIdx !== prevIdxRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDirection(activeIdx > prevIdxRef.current ? 1 : -1);
      prevIdxRef.current = activeIdx;
    }
  }, [activeIdx]);

  // 필터 변경 시 활성 회차 자동 보정
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (filtered.length === 0) {
      setActiveEpId(null);
    } else if (!activeEpId || !filtered.some(r => r.episode.id === activeEpId)) {
      setActiveEpId(filtered[0].episode.id);
    }
  }, [filtered, activeEpId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const goPrev = useCallback(() => {
    if (activeIdx > 0) setActiveEpId(filtered[activeIdx - 1].episode.id);
  }, [activeIdx, filtered]);
  const goNext = useCallback(() => {
    if (activeIdx >= 0 && activeIdx < filtered.length - 1) setActiveEpId(filtered[activeIdx + 1].episode.id);
  }, [activeIdx, filtered]);

  // 키보드 네비게이션
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const isInput = tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable;
      if (e.key === 'ArrowLeft' && !isInput) { e.preventDefault(); goPrev(); }
      else if (e.key === 'ArrowRight' && !isInput) { e.preventDefault(); goNext(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [goPrev, goNext]);

  const missingCostCount = rows.filter(r => r.missing.cost || r.missing.mgmt).length;
  const missingDateCount = rows.filter(r => r.missing.date).length;
  const missingPersonCount = rows.filter(r => r.missing.assignee || r.missing.manager).length;
  const missingScheduleCount = rows.filter(r => r.missing.startDate || r.missing.dueDate).length;
  const editCount = Object.keys(edits).length;

  // 부모에게 미입력 건수 전달
  useEffect(() => {
    onMissingCount?.(rows.length);
  }, [rows.length, onMissingCount]);

  // ── 편집
  const updateEdit = (epId: string, field: keyof EditFields, value: number | string) => {
    setEdits(prev => ({
      ...prev,
      [epId]: { ...prev[epId], [field]: value },
    }));
  };

  const applySuggestion = (epId: string, cost: number) => {
    setEdits(prev => ({ ...prev, [epId]: { ...prev[epId], cost } }));
  };

  // ── 저장
  const handleSave = async () => {
    const entries = Object.entries(edits);
    if (entries.length === 0) return;

    setSaving(true);
    const results = await Promise.all(
      entries.map(([episodeId, changes]) => {
        const original = allEpisodes.find(ep => ep.id === episodeId);
        const fields: Partial<Episode> = {};

        if (changes.cost !== undefined || changes.mgmt !== undefined || changes.total !== undefined) {
          fields.budget = {
            totalAmount: changes.total ?? original?.budget?.totalAmount ?? 0,
            partnerPayment: changes.cost ?? original?.budget?.partnerPayment ?? 0,
            managementFee: changes.mgmt ?? original?.budget?.managementFee ?? 0,
          };
        }
        if (changes.date !== undefined) fields.paymentDueDate = changes.date;
        if (changes.assignee !== undefined) fields.assignee = changes.assignee;
        if (changes.manager !== undefined) fields.manager = changes.manager;
        if (changes.startDate !== undefined) fields.startDate = changes.startDate;
        if (changes.dueDate !== undefined) fields.dueDate = changes.dueDate;

        return updateEpisodeFields(episodeId, fields);
      })
    );

    const ok = results.filter(Boolean).length;
    const fail = results.length - ok;
    if (fail === 0) toast.success(`${ok}건 저장 완료`);
    else toast.warning(`${ok}건 성공, ${fail}건 실패`);

    setEdits({});
    loadData();
    setSaving(false);
  };

  // ── 값 가져오기 (편집값 우선)
  const getVal = (row: BatchRow, field: keyof EditFields): string => {
    const ep = row.episode;
    const edited = edits[ep.id]?.[field];
    if (edited !== undefined) return String(edited);
    switch (field) {
      case 'cost': { const v = ep.budget?.partnerPayment ?? 0; return v > 0 ? String(v) : ''; }
      case 'mgmt': { const v = ep.budget?.managementFee ?? 0; return v > 0 ? String(v) : ''; }
      case 'total': { const v = ep.budget?.totalAmount ?? 0; return v > 0 ? String(v) : ''; }
      case 'date': return normalizeDate(ep.paymentDueDate);
      case 'assignee': return ep.assignee ?? '';
      case 'manager': return ep.manager ?? '';
      case 'startDate': return normalizeDate(ep.startDate);
      case 'dueDate': return normalizeDate(ep.dueDate);
    }
    return '';
  };

  const isEdited = (id: string) => !!edits[id];

  // ── 입력 스타일
  const inputCls = (epId: string, field: keyof EditFields, isMissing: boolean) => {
    const edited = edits[epId]?.[field] !== undefined;
    const filled = edited && getVal({ episode: { id: epId } } as BatchRow, field) !== '';
    if (edited && filled) return 'border-ok-500 bg-ok-50/50 text-ok-700';
    if (isMissing) return 'border-dashed border-brand-200 bg-brand-50/30';
    return 'border-[var(--color-ink-200)] bg-[var(--color-ink-50)]';
  };

  // ── 탭
  const tabs: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: rows.length },
    { key: 'cost', label: '비용', count: missingCostCount },
    { key: 'date', label: '정산일', count: missingDateCount },
    { key: 'person', label: '담당자', count: missingPersonCount },
    { key: 'schedule', label: '일정', count: missingScheduleCount },
  ];

  // ── 커스텀 드롭다운 렌더
  const renderPersonDropdown = (
    epId: string,
    field: 'assignee' | 'manager',
    currentValue: string,
    options: Partner[],
    isMissing: boolean,
    placeholder: string,
  ) => {
    const isManager = field === 'manager';
    const accentBg = isManager ? 'bg-purple-500' : 'bg-brand-500';
    const accentBgLight = isManager ? 'bg-purple-50' : 'bg-brand-50';
    const accentText = isManager ? 'text-purple-500' : 'text-brand-500';

    const dropdownId = `${epId}-${field}`;
    const isOpen = openDropdown === dropdownId;
    const selectedPartner = partners.find(p => p.id === currentValue || p.name === currentValue);
    const filteredOptions = options.filter(p =>
      p.name.toLowerCase().includes(dropdownSearch.toLowerCase())
    );
    const edited = edits[epId]?.[field] !== undefined;

    return (
      <div className="relative" ref={isOpen ? dropdownRef : undefined}>
        <div
          onClick={() => {
            if (isOpen) { setOpenDropdown(null); setDropdownSearch(''); }
            else { setOpenDropdown(dropdownId); setDropdownSearch(''); }
          }}
          className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg border cursor-pointer transition-all ${
            edited && selectedPartner
              ? 'border-ok-500 bg-ok-50/50'
              : isMissing
                ? 'border-dashed border-brand-200 bg-brand-50/30'
                : 'border-[var(--color-ink-200)] bg-[var(--color-ink-50)]'
          } ${isOpen ? 'border-brand-500 bg-white shadow-[0_0_0_3px_rgba(249,115,22,0.08)]' : 'hover:border-[#d6cec8]'}`}
        >
          {selectedPartner ? (
            <>
              <div className={`w-5 h-5 rounded-full ${accentBg} flex items-center justify-center flex-shrink-0`}>
                <User size={10} className="text-white" />
              </div>
              <span className="text-[12px] font-medium text-ink-900 truncate">{selectedPartner.name}</span>
            </>
          ) : (
            <>
              <div className={`w-5 h-5 rounded-full ${accentBgLight} flex items-center justify-center flex-shrink-0`}>
                <User size={10} className={accentText} />
              </div>
              <span className="text-[12px] text-[var(--color-ink-400)]">{placeholder}</span>
            </>
          )}
          <ChevronDown size={12} className={`ml-auto text-[var(--color-ink-400)] flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="absolute top-full left-0 mt-1 z-20 w-[200px] bg-white/95 backdrop-blur-xl border border-ink-200 rounded-xl shadow-2xl max-h-72 overflow-hidden"
            >
              <div className="sticky top-0 p-2 border-b border-ink-100 bg-white/95">
                <div className="flex items-center gap-1.5 px-2 py-1.5 border border-ink-200 rounded-lg bg-white">
                  <Search size={12} className="text-ink-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={dropdownSearch}
                    onChange={e => setDropdownSearch(e.target.value)}
                    placeholder="검색..."
                    className="w-full text-[12px] bg-transparent outline-none"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                </div>
              </div>
              <div className="max-h-52 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    updateEdit(epId, field, '');
                    setOpenDropdown(null);
                    setDropdownSearch('');
                  }}
                  className="w-full flex items-center px-3 py-2 hover:bg-ink-50 transition-colors text-left border-b border-gray-50"
                >
                  <span className="text-[12px] text-ink-400">선택 안함</span>
                </button>
                {filteredOptions.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      updateEdit(epId, field, p.id);
                      setOpenDropdown(null);
                      setDropdownSearch('');
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-ink-50 transition-colors text-left ${
                      currentValue === p.id ? accentBgLight : ''
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full ${accentBg} flex items-center justify-center flex-shrink-0`}>
                      <User size={10} className="text-white" />
                    </div>
                    <span className="text-[12px] font-medium text-ink-900">{p.name}</span>
                    {currentValue === p.id && <Check size={12} className={`ml-auto ${accentText}`} />}
                  </button>
                ))}
                {filteredOptions.length === 0 && (
                  <div className="px-3 py-4 text-center text-[12px] text-ink-400">결과 없음</div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* 통합 카드 */}
      <div className="bg-white rounded-xl sm:rounded-2xl border border-ink-100">
        {/* 툴바 */}
        <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-[var(--color-ink-200)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[20px] sm:text-[22px] font-extrabold tracking-tight">
              {rows.length}<span className="text-[13px] text-[var(--color-ink-400)] font-medium ml-1">건</span>
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-brand-50)] rounded-full">
              <AlertTriangle size={12} className="text-brand-500" />
              <span className="text-[11px] font-semibold text-brand-500">
                비용 {missingCostCount} · 정산일 {missingDateCount} · 담당자 {missingPersonCount} · 일정 {missingScheduleCount}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 탭 */}
            <div className="inline-flex gap-0.5 p-1 bg-[#f5f4f2] rounded-xl">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className="relative px-2.5 py-1.5 rounded-lg text-[11px] sm:text-[12px] font-semibold"
                >
                  {filter === tab.key && (
                    <motion.div
                      layoutId="batch-tab"
                      className="absolute inset-0 bg-brand-500 rounded-lg shadow-sm shadow-orange-500/20"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className={`relative z-10 whitespace-nowrap ${filter === tab.key ? 'text-white' : 'text-[var(--color-ink-500)]'}`}>
                    {tab.label} {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* 저장 */}
            <button
              onClick={handleSave}
              disabled={editCount === 0 || saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                editCount > 0
                  ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-orange-500/20'
                  : 'bg-[#e7e5e4] text-[var(--color-ink-400)] cursor-not-allowed'
              }`}
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save size={14} />
              )}
              전체 저장{editCount > 0 ? ` (${editCount})` : ''}
            </button>
          </div>
        </div>

        {/* 스플릿 뷰 */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Check className="mx-auto mb-3 text-ok-500" size={36} />
            <p className="font-medium text-ink-500">미입력 항목이 없습니다</p>
            <p className="text-xs mt-1 text-[var(--color-ink-400)]">모든 에피소드의 정보가 입력되었습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] min-h-[560px]">
            {/* 왼쪽 리스트 */}
            <div className="border-r border-ink-100 bg-ink-50 overflow-y-auto max-h-[640px] p-3">
              <div className="px-2 pb-2 flex justify-between items-center sticky top-0 bg-ink-50 z-10">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">미입력 {filtered.length}건</span>
                <span className="text-[10px] text-ink-400">누락 많은 순</span>
              </div>
              <div className="space-y-1">
                {filtered.map(row => {
                  const epId = row.episode.id;
                  const isActive = epId === activeEpId;
                  const missingCount = countMissing(row.missing);
                  const total = 7; // 전체 필드 수
                  const filledPct = Math.round(((total - missingCount) / total) * 100);
                  const missTags = ([
                    { key: 'cost', label: '파트너' },
                    { key: 'mgmt', label: '매니징' },
                    { key: 'date', label: '정산일' },
                    { key: 'assignee', label: '담당자' },
                    { key: 'manager', label: '매니저' },
                    { key: 'startDate', label: '시작일' },
                    { key: 'dueDate', label: '마감일' },
                  ] as const).filter(t => row.missing[t.key]);
                  const edited = isEdited(epId);

                  return (
                    <button
                      key={epId}
                      type="button"
                      onClick={() => setActiveEpId(epId)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg relative transition-[background-color,box-shadow] duration-200 ${
                        isActive ? 'bg-white shadow-sm' : 'hover:bg-white/60'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2 relative">
                        <div className="min-w-0 flex-1">
                          <div className={`text-[13px] font-semibold truncate ${isActive ? 'text-brand-500' : 'text-ink-700'}`}>
                            {row.project?.title ?? '-'} <span className="text-ink-400 font-normal">·</span> {row.episode.episodeNumber}화
                          </div>
                          <div className="text-[11px] text-ink-400 font-medium truncate mt-0.5">
                            {row.project?.client ?? ''}
                          </div>
                        </div>
                        {edited ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-ok-50 text-ok-600 font-semibold shrink-0 inline-flex items-center gap-0.5">
                            <Check size={9} /> 수정
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold shrink-0 bg-brand-50 text-brand-500 tabular-nums">
                            {missingCount}
                          </span>
                        )}
                      </div>
                      {missTags.length > 0 && (
                        <div className="text-[10px] text-ink-400 mt-1.5 truncate relative">
                          {missTags.slice(0, 3).map(t => t.label).join(' · ')}
                          {missTags.length > 3 && ` 외 ${missTags.length - 3}`}
                        </div>
                      )}
                      <div className="mt-2 h-[2px] bg-ink-200/60 rounded-full overflow-hidden relative">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${filledPct}%`,
                            background: filledPct === 100 ? '#a3d9a5' : '#fb923c',
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 오른쪽 상세 */}
            <AnimatePresence mode="wait">
              {activeRow ? (
                <motion.div
                  key={activeRow.episode.id}
                  initial={{ opacity: 0, y: direction >= 0 ? 10 : -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: direction >= 0 ? -10 : 10 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                  <DetailPane
                    row={activeRow}
                    idx={activeIdx}
                    total={filtered.length}
                    activePartners={activePartners}
                    managerPartners={managerPartners}
                    edits={edits}
                    getVal={getVal}
                    inputCls={inputCls}
                    updateEdit={updateEdit}
                    applySuggestion={applySuggestion}
                    renderPersonDropdown={renderPersonDropdown}
                    onOpenDateModal={setDateModalEpId}
                    onPrev={goPrev}
                    onNext={goNext}
                    onSaveAndNext={async () => {
                      await handleSave();
                    }}
                  />
                </motion.div>
              ) : (
                <div className="flex items-center justify-center text-[var(--color-ink-400)] text-sm">회차를 선택하세요</div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 날짜 트리플 모달 */}
      {dateModalEpId && (() => {
        const row = rows.find(r => r.episode.id === dateModalEpId);
        if (!row) return null;
        return (
          <DateTripleModal
            isOpen={true}
            onClose={() => setDateModalEpId(null)}
            fields={[
              { label: '정산 예정일', value: getVal(row, 'date'), onChange: v => updateEdit(dateModalEpId, 'date', v), isMissing: row.missing.date },
              { label: '작업 시작일', value: getVal(row, 'startDate'), onChange: v => updateEdit(dateModalEpId, 'startDate', v), isMissing: row.missing.startDate },
              { label: '마감일', value: getVal(row, 'dueDate'), onChange: v => updateEdit(dateModalEpId, 'dueDate', v), isMissing: row.missing.dueDate },
            ]}
          />
        );
      })()}
    </div>
  );
}

// ─── 상세 편집 패널 ───
interface DetailPaneProps {
  row: BatchRow;
  idx: number;
  total: number;
  activePartners: Partner[];
  managerPartners: Partner[];
  edits: Record<string, EditFields>;
  getVal: (row: BatchRow, field: keyof EditFields) => string;
  inputCls: (epId: string, field: keyof EditFields, isMissing: boolean) => string;
  updateEdit: (epId: string, field: keyof EditFields, value: number | string) => void;
  applySuggestion: (epId: string, cost: number) => void;
  renderPersonDropdown: (
    epId: string,
    field: 'assignee' | 'manager',
    currentValue: string,
    options: Partner[],
    isMissing: boolean,
    placeholder: string,
  ) => React.ReactNode;
  onOpenDateModal: (epId: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onSaveAndNext: () => void | Promise<void>;
}

function DetailPane({
  row, idx, total, activePartners, managerPartners, edits,
  getVal, inputCls, updateEdit, applySuggestion,
  renderPersonDropdown, onOpenDateModal, onPrev, onNext, onSaveAndNext,
}: DetailPaneProps) {
  const epId = row.episode.id;
  const isEdited = !!edits[epId];
  const missingKeys: { key: keyof MissingFlags; label: string }[] = [
    { key: 'cost', label: '파트너 비용' },
    { key: 'mgmt', label: '매니징 비용' },
    { key: 'assignee', label: '담당 파트너' },
    { key: 'manager', label: '담당 매니저' },
    { key: 'date', label: '정산 예정일' },
    { key: 'startDate', label: '작업 시작일' },
    { key: 'dueDate', label: '마감일' },
  ];
  const missing = missingKeys.filter(k => row.missing[k.key]);
  const countMissAmount = (row.missing.cost ? 1 : 0) + (row.missing.mgmt ? 1 : 0);
  const countMissPerson = (row.missing.assignee ? 1 : 0) + (row.missing.manager ? 1 : 0);
  const countMissSchedule = (row.missing.date ? 1 : 0) + (row.missing.startDate ? 1 : 0) + (row.missing.dueDate ? 1 : 0);

  const dateVal = (field: 'date' | 'startDate' | 'dueDate') => {
    const v = getVal(row, field);
    if (!v || v.length < 10) return '-';
    return `${v.slice(2, 4)}.${v.slice(5, 7)}.${v.slice(8, 10)}`;
  };
  const dateBtnCls = (field: 'date' | 'startDate' | 'dueDate', isMissing: boolean) => {
    const v = getVal(row, field);
    const hasVal = v && v.length === 10;
    const edited = edits[epId]?.[field] !== undefined;
    if (edited && hasVal) return 'border-ok-500 bg-ok-50/50 text-ok-700';
    if (hasVal) return 'border-[var(--color-ink-200)] bg-[var(--color-ink-50)] text-ink-700';
    if (isMissing) return 'border-dashed border-brand-200 bg-brand-50/30 text-[var(--color-ink-400)]';
    return 'border-[var(--color-ink-200)] bg-[var(--color-ink-50)] text-[var(--color-ink-400)]';
  };

  return (
    <div className="flex flex-col min-h-[560px]">
      {/* 진척 세그먼트 */}
      <div className="px-6 pt-5">
        <div className="flex gap-[3px]">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`flex-1 h-1 rounded-full ${
                i < idx ? 'bg-green-400' :
                i === idx ? 'bg-brand-500' :
                'bg-ink-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* 헤더 */}
      <div className="px-6 pt-4 pb-5 flex justify-between items-start gap-4">
        <div className="min-w-0">
          <div className="text-[12px] text-[var(--color-ink-500)] font-semibold">{idx + 1} / {total}</div>
          <div className="text-[20px] font-bold mt-1 truncate">
            {row.project?.title ?? '-'} · {row.episode.episodeNumber}화
          </div>
          <div className="text-[13px] text-[var(--color-ink-500)] mt-0.5 truncate">
            {row.project?.client ?? ''}{row.episode.title ? ` · ${row.episode.title}` : ''}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onPrev}
            disabled={idx <= 0}
            className="px-2.5 py-1.5 border border-[var(--color-ink-200)] bg-white rounded-lg text-[12px] font-semibold hover:border-brand-500 hover:text-brand-500 disabled:opacity-40 disabled:hover:border-[var(--color-ink-200)] disabled:hover:text-inherit disabled:cursor-not-allowed"
            aria-label="이전"
          >← 이전</button>
          <button
            type="button"
            onClick={onNext}
            disabled={idx >= total - 1}
            className="px-2.5 py-1.5 border border-[var(--color-ink-200)] bg-white rounded-lg text-[12px] font-semibold hover:border-brand-500 hover:text-brand-500 disabled:opacity-40 disabled:hover:border-[var(--color-ink-200)] disabled:hover:text-inherit disabled:cursor-not-allowed"
            aria-label="다음"
          >다음 →</button>
        </div>
      </div>

      <div className="px-6 flex-1 space-y-4">
        {/* 알림 */}
        {missing.length > 0 && (
          <div className="bg-gradient-to-br from-[var(--color-brand-50)] to-[#ffedd5] border border-orange-200 rounded-xl p-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-orange-400 text-white flex items-center justify-center shrink-0">
              <AlertTriangle size={14} />
            </div>
            <div className="text-[13px] text-brand-700">
              <strong className="font-bold">{missing.length}개 항목</strong>이 비어있어요 — {missing.map(m => m.label).join(', ')}
            </div>
          </div>
        )}

        {/* 금액 */}
        <div className="bg-[var(--color-ink-50)] rounded-xl p-4">
          <h5 className="text-[12px] font-bold text-[var(--color-ink-600)] mb-3 flex items-center gap-1.5">
            <Wallet size={13} className="text-ink-500" /> 금액
            {countMissAmount > 0 && (
              <span className="text-[10px] bg-brand-50 text-brand-500 px-1.5 py-0.5 rounded-md font-semibold">{countMissAmount}</span>
            )}
          </h5>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="text-[11px] text-[var(--color-ink-500)] font-semibold block mb-1">총액</label>
              <input
                type="text"
                inputMode="numeric"
                value={(() => { const v = getVal(row, 'total'); return v && v !== '0' ? Number(v).toLocaleString('ko-KR') : ''; })()}
                onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); updateEdit(epId, 'total', raw ? parseInt(raw) : 0); }}
                placeholder="0원"
                className={`w-full px-3 py-2 text-right text-[13px] font-medium rounded-lg border outline-none transition-all ${inputCls(epId, 'total', false)} focus:border-brand-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)]`}
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--color-ink-500)] font-semibold block mb-1 flex items-center gap-1">
                파트너 비용
                {row.missing.cost && <span className="text-[9px] bg-bad-100 text-bad-700 px-1 py-px rounded font-bold">필요</span>}
              </label>
              <div className="flex items-center gap-1.5">
                {row.suggestedCost && row.missing.cost && !edits[epId]?.cost && (
                  <button
                    onClick={() => applySuggestion(epId, row.suggestedCost!)}
                    className="flex items-center gap-0.5 px-1.5 py-1 bg-brand-50 text-brand-600 rounded text-[10px] font-bold hover:bg-brand-100 shrink-0"
                  >
                    <Sparkles size={9} />
                    {(row.suggestedCost / 10000)}만
                  </button>
                )}
                <input
                  type="text"
                  inputMode="numeric"
                  value={(() => { const v = getVal(row, 'cost'); return v && v !== '0' ? Number(v).toLocaleString('ko-KR') : ''; })()}
                  onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); updateEdit(epId, 'cost', raw ? parseInt(raw) : 0); }}
                  placeholder="0원"
                  className={`flex-1 px-3 py-2 text-right text-[13px] font-medium rounded-lg border outline-none transition-all ${inputCls(epId, 'cost', row.missing.cost)} focus:border-brand-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)]`}
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-[var(--color-ink-500)] font-semibold block mb-1">매니징 비용</label>
              <input
                type="text"
                inputMode="numeric"
                value={(() => { const v = getVal(row, 'mgmt'); return v && v !== '0' ? Number(v).toLocaleString('ko-KR') : ''; })()}
                onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); updateEdit(epId, 'mgmt', raw ? parseInt(raw) : 0); }}
                placeholder="0원"
                className={`w-full px-3 py-2 text-right text-[13px] font-medium rounded-lg border outline-none transition-all ${inputCls(epId, 'mgmt', row.missing.mgmt)} focus:border-brand-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)]`}
              />
            </div>
          </div>
        </div>

        {/* 인원 */}
        <div className="bg-[var(--color-ink-50)] rounded-xl p-4">
          <h5 className="text-[12px] font-bold text-[var(--color-ink-600)] mb-3 flex items-center gap-1.5">
            <Users size={13} className="text-ink-500" /> 인원
            {countMissPerson > 0 && (
              <span className="text-[10px] bg-brand-50 text-brand-500 px-1.5 py-0.5 rounded-md font-semibold">{countMissPerson}</span>
            )}
          </h5>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] text-[var(--color-ink-500)] font-semibold block mb-1">담당 파트너</label>
              {renderPersonDropdown(epId, 'assignee', getVal(row, 'assignee'), activePartners, row.missing.assignee, '미지정')}
            </div>
            <div>
              <label className="text-[11px] text-[var(--color-ink-500)] font-semibold block mb-1">담당 매니저</label>
              {renderPersonDropdown(epId, 'manager', getVal(row, 'manager'), managerPartners, row.missing.manager, '미지정')}
            </div>
          </div>
        </div>

        {/* 일정 */}
        <div className="bg-[var(--color-ink-50)] rounded-xl p-4">
          <h5 className="text-[12px] font-bold text-[var(--color-ink-600)] mb-3 flex items-center gap-1.5">
            <Calendar size={13} className="text-ink-500" /> 일정
            {countMissSchedule > 0 && (
              <span className="text-[10px] bg-brand-50 text-brand-500 px-1.5 py-0.5 rounded-md font-semibold">{countMissSchedule}</span>
            )}
          </h5>
          <div className="grid grid-cols-3 gap-2.5">
            {([
              { key: 'date' as const, label: '정산 예정일', missing: row.missing.date },
              { key: 'startDate' as const, label: '작업 시작일', missing: row.missing.startDate },
              { key: 'dueDate' as const, label: '마감일', missing: row.missing.dueDate },
            ]).map(item => (
              <div key={item.key}>
                <label className="text-[11px] text-[var(--color-ink-500)] font-semibold block mb-1">{item.label}</label>
                <button
                  type="button"
                  onClick={() => onOpenDateModal(epId)}
                  className={`w-full px-3 py-2 rounded-lg border text-[13px] font-medium text-left transition-all hover:border-[#d6cec8] ${dateBtnCls(item.key, item.missing)}`}
                >
                  {dateVal(item.key)}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 푸터 */}
      <div className="px-6 py-4 mt-4 border-t border-[var(--color-ink-200)] bg-[var(--color-ink-50)] flex justify-between items-center flex-wrap gap-3">
        <div className="text-[11px] text-[var(--color-ink-500)]">
          <kbd className="inline-block px-1.5 py-0.5 bg-white border border-[#e7e5e4] rounded text-[10px] font-mono mx-0.5">←</kbd>
          <kbd className="inline-block px-1.5 py-0.5 bg-white border border-[#e7e5e4] rounded text-[10px] font-mono mx-0.5">→</kbd>
          회차 이동
        </div>
        <button
          type="button"
          onClick={() => { if (isEdited) onSaveAndNext(); else onNext(); }}
          className={`px-4 py-2 rounded-lg text-[13px] font-bold transition-colors ${
            isEdited ? 'bg-brand-500 text-white hover:bg-brand-600' : 'bg-white border border-[var(--color-ink-200)] text-[var(--color-ink-600)] hover:border-[var(--color-ink-900)]'
          }`}
        >
          {isEdited ? '저장 후 다음 ↓' : '다음 →'}
        </button>
      </div>
    </div>
  );
}
