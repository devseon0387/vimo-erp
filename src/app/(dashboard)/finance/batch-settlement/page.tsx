'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Save, Sparkles, Check, CheckCircle, ChevronDown, ChevronUp, User, Search } from 'lucide-react';
import { Project, Partner, Episode } from '@/types';
import { getProjects, getPartners, getAllEpisodes, updateEpisodeFields } from '@/lib/supabase/db';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { useToast } from '@/contexts/ToastContext';
import DatePickerModal from '@/components/DatePickerModal';
import DateTripleModal from '@/components/DateTripleModal';
import { TabBar } from '@/components/TabBar';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

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

  return {
    cost: partnerPay === 0,
    // 매니징 비용 0원은 의도된 정상값 (0원 회차도 존재) — 미입력 분류에서 제외
    mgmt: false,
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
  date?: string;
  assignee?: string;
  manager?: string;
  startDate?: string;
  dueDate?: string;
}

type FilterKey = 'all' | 'cost' | 'date' | 'person' | 'schedule';

export default function BatchSettlementPage() {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [allEpisodes, setAllEpisodes] = useState<(Episode & { projectId: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  const [edits, setEdits] = useState<Record<string, EditFields>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [bulkDate, setBulkDate] = useState('');
  const [showBulkDate, setShowBulkDate] = useState(false);
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
    if (filter === 'cost') return rows.filter(r => r.missing.cost || r.missing.mgmt);
    if (filter === 'date') return rows.filter(r => r.missing.date);
    if (filter === 'person') return rows.filter(r => r.missing.assignee || r.missing.manager);
    if (filter === 'schedule') return rows.filter(r => r.missing.startDate || r.missing.dueDate);
    return rows;
  }, [rows, filter]);

  const missingCostCount = rows.filter(r => r.missing.cost || r.missing.mgmt).length;
  const missingDateCount = rows.filter(r => r.missing.date).length;
  const missingPersonCount = rows.filter(r => r.missing.assignee || r.missing.manager).length;
  const missingScheduleCount = rows.filter(r => r.missing.startDate || r.missing.dueDate).length;
  const editCount = Object.keys(edits).length;

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

  // ── 선택
  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.episode.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.episode.id)));
  };
  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── 선택 항목 일괄 정산일 적용
  const applyBulkDate = () => {
    if (!bulkDate) return;
    setEdits(prev => {
      const next = { ...prev };
      selected.forEach(id => { next[id] = { ...next[id], date: bulkDate }; });
      return next;
    });
    setShowBulkDate(false);
    toast.success(`${selected.size}건에 정산일 적용됨`);
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

        if (changes.cost !== undefined || changes.mgmt !== undefined) {
          fields.budget = {
            totalAmount: original?.budget?.totalAmount ?? 0,
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
    setSelected(new Set());
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
    if (edited && filled) return 'border-green-400 bg-green-50/50 text-green-700';
    if (isMissing) return 'border-dashed border-orange-300 bg-orange-50/30';
    return 'border-divider bg-[#fafaf9]';
  };

  // ── 상태 뱃지
  const getStatusBadge = (row: BatchRow) => {
    const epId = row.episode.id;
    const ed = edits[epId];
    if (!ed) {
      const cnt = countMissing(row.missing);
      if (cnt >= 4) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#fee2e2] text-red-500 font-semibold">{cnt}개 미입력</span>;
      if (cnt >= 2) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#fff7ed] text-orange-500 font-semibold">{cnt}개 미입력</span>;
      return <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#fef9c3] text-yellow-600 font-semibold">1개 미입력</span>;
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#f0fdf4] text-green-600 font-semibold">
        <Check size={10} />수정됨
      </span>
    );
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
    const accentBg = isManager ? 'bg-purple-500' : 'bg-orange-500';
    const accentBgLight = isManager ? 'bg-purple-50' : 'bg-orange-50';
    const accentText = isManager ? 'text-purple-500' : 'text-orange-500';

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
              ? 'border-green-400 bg-green-50/50'
              : isMissing
                ? 'border-dashed border-orange-300 bg-orange-50/30'
                : 'border-divider bg-[#fafaf9]'
          } ${isOpen ? 'border-orange-500 bg-white shadow-[0_0_0_3px_rgba(249,115,22,0.08)]' : 'hover:border-[#d6cec8]'}`}
        >
          {selectedPartner ? (
            <>
              <div className={`w-5 h-5 rounded-full ${accentBg} flex items-center justify-center flex-shrink-0`}>
                <User size={10} className="text-white" />
              </div>
              <span className="text-[12px] font-medium text-[#1c1917] truncate">{selectedPartner.name}</span>
            </>
          ) : (
            <>
              <div className={`w-5 h-5 rounded-full ${accentBgLight} flex items-center justify-center flex-shrink-0`}>
                <User size={10} className={accentText} />
              </div>
              <span className="text-[12px] text-[#a8a29e]">{placeholder}</span>
            </>
          )}
          <ChevronDown size={12} className={`ml-auto text-[#a8a29e] flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="absolute top-full left-0 mt-1 z-20 w-[200px] bg-white/95 backdrop-blur-xl border border-divider rounded-xl shadow-2xl max-h-72 overflow-hidden"
            >
              <div className="sticky top-0 p-2 border-b border-divider bg-white/95">
                <div className="flex items-center gap-1.5 px-2 py-1.5 border border-divider rounded-lg bg-white">
                  <Search size={12} className="text-[#a8a29e] flex-shrink-0" />
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
                  className="w-full flex items-center px-3 py-2 hover:bg-[#fafaf9] transition-colors text-left border-b border-gray-50"
                >
                  <span className="text-[12px] text-[#a8a29e]">선택 안함</span>
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
                    className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-[#fafaf9] transition-colors text-left ${
                      currentValue === p.id ? accentBgLight : ''
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full ${accentBg} flex items-center justify-center flex-shrink-0`}>
                      <User size={10} className="text-white" />
                    </div>
                    <span className="text-[12px] font-medium text-[#1c1917]">{p.name}</span>
                    {currentValue === p.id && <Check size={12} className={`ml-auto ${accentText}`} />}
                  </button>
                ))}
                {filteredOptions.length === 0 && (
                  <div className="px-3 py-4 text-center text-[12px] text-[#a8a29e]">결과 없음</div>
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
      {/* 헤더 */}
      <div>
        <h1 className="text-page">미입력 일괄 처리</h1>
        <p className="text-[#78716c] mt-1 text-sm">비용, 정산일, 담당자, 일정이 비어있는 에피소드를 한눈에 확인하고 처리합니다</p>
      </div>

      {/* 통합 카드 */}
      <div className="bg-white rounded-2xl border border-divider">
        {/* 툴바 */}
        <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-[#f0ece9] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[20px] sm:text-[22px] font-extrabold tracking-tight">
              {rows.length}<span className="text-[13px] text-[#a8a29e] font-medium ml-1">건</span>
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#fff7ed] rounded-full">
              <AlertTriangle size={12} className="text-orange-500" />
              <span className="text-[11px] font-semibold text-orange-500">
                비용 {missingCostCount} · 정산일 {missingDateCount} · 담당자 {missingPersonCount} · 일정 {missingScheduleCount}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 탭 */}
            <TabBar<FilterKey>
              items={tabs}
              active={filter}
              onChange={setFilter}
              fullWidthMobile={false}
            />

            {/* 선택 항목 일괄 정산일 */}
            {selected.size > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowBulkDate(!showBulkDate)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f5f4f2] hover:bg-[#ede9e6] rounded-lg text-[12px] font-semibold text-[#44403c] transition-colors"
                >
                  선택 {selected.size}건 정산일 일괄
                  {showBulkDate ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showBulkDate && (
                  <div className="absolute right-0 top-full mt-2 bg-white border border-divider rounded-xl shadow-lg p-3 z-30 flex items-center gap-2">
                    <DatePickerModal
                      value={bulkDate}
                      onChange={v => setBulkDate(v)}
                      placeholder="날짜 선택"
                    />
                    <button onClick={applyBulkDate} className="px-3 py-2 bg-orange-500 text-white rounded-lg text-[12px] font-semibold hover:bg-orange-600 transition-colors whitespace-nowrap">
                      적용
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 저장 */}
            <button
              onClick={handleSave}
              disabled={editCount === 0 || saving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all ${
                editCount > 0
                  ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm shadow-orange-500/20'
                  : 'bg-[#e7e5e4] text-[#a8a29e] cursor-not-allowed'
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

        {/* 모바일 안내 — 인라인 편집 10컬럼 그리드라 가로 스크롤 발생.
            해당 회차 상세 페이지(/projects/[id]/episodes/[episodeId])에서 개별 편집을 권장. */}
        <div className="sm:hidden mb-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-800">
          <p className="font-semibold mb-0.5">데스크탑에서 사용하는 것을 권장합니다</p>
          <p className="text-[11px] text-amber-700">이 페이지는 10개 열의 일괄 편집 그리드라 모바일에선 가로 스크롤 필요. 회차 1개씩 편집은 회차 상세 페이지가 빠릅니다.</p>
        </div>

        {/* 테이블 */}
        {loading ? (
          <LoadingState size="compact" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="미입력 항목이 없습니다"
            description="모든 에피소드의 정보가 입력되었습니다"
            size="compact"
            iconColor="text-green-500"
            iconBgColor="bg-green-50"
          />
        ) : (
          <div className="overflow-x-auto">
            {/* 헤더 */}
            <div className="grid grid-cols-[32px_1fr_120px_110px_110px_120px_100px_100px_100px_70px] gap-1.5 px-4 py-2.5 text-[10px] font-semibold text-[#a8a29e] border-b border-[#f0ece9] bg-[#fafaf9] min-w-[1080px] uppercase tracking-wide">
              <div className="flex items-center justify-center">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-[14px] h-[14px] accent-orange-500 cursor-pointer" />
              </div>
              <span>프로젝트 · 회차</span>
              <span>담당 파트너</span>
              <span>담당 매니저</span>
              <span className="text-right">파트너 비용</span>
              <span className="text-right">매니징 비용</span>
              <span>정산 예정일</span>
              <span>작업 시작일</span>
              <span>마감일</span>
              <span className="text-center">상태</span>
            </div>

            {/* 행 */}
            <div className="divide-y divide-[#f8f7f6] min-w-[1080px]">
              {filtered.map((row, idx) => {
                const epId = row.episode.id;
                const edited = isEdited(epId);

                return (
                  <motion.div
                    key={epId}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(idx * 0.015, 0.4) }}
                    className={`grid grid-cols-[32px_1fr_120px_110px_110px_120px_100px_100px_100px_70px] gap-1.5 px-4 py-2.5 items-center transition-colors ${
                      edited ? 'bg-orange-50/40' : 'hover:bg-[#fafaf9]'
                    }`}
                  >
                    {/* 체크 */}
                    <div className="flex items-center justify-center">
                      <input type="checkbox" checked={selected.has(epId)} onChange={() => toggleRow(epId)} className="w-[14px] h-[14px] accent-orange-500 cursor-pointer" />
                    </div>

                    {/* 프로젝트 · 회차 */}
                    <div className="min-w-0">
                      <div className="text-[11px] text-[#a8a29e] font-medium truncate">{row.project?.title ?? ''}</div>
                      <div className="text-[13px] text-[#1c1917] font-medium truncate">{row.episode.title || `${row.episode.episodeNumber}회차`}</div>
                    </div>

                    {/* 담당 파트너 */}
                    <div>
                      {renderPersonDropdown(epId, 'assignee', getVal(row, 'assignee'), activePartners, row.missing.assignee, '미지정')}
                    </div>

                    {/* 담당 매니저 */}
                    <div>
                      {renderPersonDropdown(epId, 'manager', getVal(row, 'manager'), managerPartners, row.missing.manager, '미지정')}
                    </div>

                    {/* 파트너 비용 */}
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-1">
                        {row.suggestedCost && row.missing.cost && !edits[epId]?.cost && (
                          <button
                            onClick={() => applySuggestion(epId, row.suggestedCost!)}
                            className="flex items-center gap-0.5 px-1 py-0.5 bg-orange-50 text-orange-600 rounded text-[9px] font-semibold hover:bg-orange-100 transition-colors flex-shrink-0"
                          >
                            <Sparkles size={8} />
                            {(row.suggestedCost / 10000)}만
                          </button>
                        )}
                        <input
                          type="text"
                          inputMode="numeric"
                          value={(() => {
                            const v = getVal(row, 'cost');
                            if (!v || v === '0') return '';
                            return Number(v).toLocaleString('ko-KR');
                          })()}
                          onChange={e => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            updateEdit(epId, 'cost', raw ? parseInt(raw) : 0);
                          }}
                          placeholder="0원"
                          className={`w-[100px] px-2 py-1.5 text-right text-[12px] font-medium rounded-lg border outline-none transition-all ${inputCls(epId, 'cost', row.missing.cost)} focus:border-orange-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)]`}
                        />
                      </div>
                    </div>

                    {/* 매니징 비용 */}
                    <div className="flex justify-end">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={(() => {
                          const v = getVal(row, 'mgmt');
                          if (!v || v === '0') return '';
                          return Number(v).toLocaleString('ko-KR');
                        })()}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          updateEdit(epId, 'mgmt', raw ? parseInt(raw) : 0);
                        }}
                        placeholder="0원"
                        className={`w-[100px] px-2 py-1.5 text-right text-[12px] font-medium rounded-lg border outline-none transition-all ${inputCls(epId, 'mgmt', row.missing.mgmt)} focus:border-orange-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)]`}
                      />
                    </div>

                    {/* 정산 예정일 */}
                    {[
                      { field: 'date' as const, missing: row.missing.date },
                      { field: 'startDate' as const, missing: row.missing.startDate },
                      { field: 'dueDate' as const, missing: row.missing.dueDate },
                    ].map(({ field, missing }) => {
                      const val = getVal(row, field);
                      const hasVal = val && val.length === 10;
                      const editedField = edits[epId]?.[field] !== undefined;
                      return (
                        <div key={field}>
                          <button
                            type="button"
                            onClick={() => setDateModalEpId(epId)}
                            className={`w-full px-2 py-1.5 rounded-lg border text-[12px] font-medium text-left transition-all ${
                              editedField && hasVal
                                ? 'border-green-400 bg-green-50/50 text-green-700'
                                : hasVal
                                  ? 'border-divider bg-[#fafaf9] text-[#44403c]'
                                  : missing
                                    ? 'border-dashed border-orange-300 bg-orange-50/30 text-[#a8a29e]'
                                    : 'border-divider bg-[#fafaf9] text-[#a8a29e]'
                            } hover:border-[#d6cec8]`}
                          >
                            {hasVal ? `${val.slice(2, 4)}.${val.slice(5, 7)}.${val.slice(8, 10)}` : '-'}
                          </button>
                        </div>
                      );
                    })}

                    {/* 상태 */}
                    <div className="text-center">
                      {getStatusBadge(row)}
                    </div>
                  </motion.div>
                );
              })}
            </div>
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
