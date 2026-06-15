'use client';

import { useState, useEffect } from 'react';
import {
  Grid3x3,
  List,
  Eye,
  EyeOff,
  Calendar,
  User,
  Tag,
  Download,
  Share2,
  CheckCircle,
  Plus,
  X,
  ChevronDown,
  Pencil,
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
} from 'lucide-react';
import { PortfolioItem, Partner } from '@/types';
import { FloatingLabelInput, FloatingLabelTextarea } from '@/components/FloatingLabelInput';
import { SearchInput } from '@/components/SearchInput';
import { TabBar, type TabItem } from '@/components/TabBar';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import {
  getPortfolioItems,
  insertPortfolioItem,
  updatePortfolioItem,
  deletePortfolioItem,
  togglePortfolioPublished,
  getPartners,
} from '@/lib/supabase/db';
import { useToast } from '@/contexts/ToastContext';

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'published' | 'unpublished';
type SortBy = 'displayOrder' | 'newest' | 'oldest' | 'title';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'displayOrder', label: '표시 순서' },
  { value: 'newest',       label: '최신순' },
  { value: 'oldest',       label: '오래된순' },
  { value: 'title',        label: '제목순' },
];

// 유튜브 URL에서 비디오 ID 추출
const extractYouTubeId = (url: string): string | null => {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
};

const getYouTubeThumbnail = (url: string): string | null => {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
};

export default function PortfolioPage() {
  const toast = useToast();
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 추가/수정 모달 통합 — formMode가 null이면 닫힘
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const emptyFormItem: Partial<PortfolioItem> = {
    title: '', description: '', client: '', partnerId: '',
    category: '기타', completedAt: '', tags: [],
    youtubeUrl: '', isPublished: false,
  };
  const [formItem, setFormItem] = useState<Partial<PortfolioItem>>(emptyFormItem);
  const [editingId, setEditingId] = useState<string | null>(null); // edit 모드 대상 id
  const [tagInput, setTagInput] = useState('');
  const [isPartnerDropdownOpen, setIsPartnerDropdownOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 일괄 추가 관련 상태
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkItems, setBulkItems] = useState<Array<{ _uid: string; title: string; client: string; category: string; youtubeUrl: string }>>(
    Array.from({ length: 5 }, () => ({ _uid: crypto.randomUUID(), title: '', client: '', category: '기타', youtubeUrl: '' }))
  );
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // 카테고리 관련 상태
  const [categoryFilter, setCategoryFilter] = useState<string>('전체');
  const [categories, setCategories] = useState<string[]>([]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryInput, setEditCategoryInput] = useState('');
  const [inlineCatItemId, setInlineCatItemId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleInput, setEditingTitleInput] = useState('');

  // 정렬 / 다중 선택 / 오버플로 메뉴
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [bulkCatPickerOpen, setBulkCatPickerOpen] = useState(false);

  const INITIAL_CATEGORIES = ['광고', '뮤직비디오', '기업홍보', '숏폼', '기타'];

  // 로컬스토리지에서 카테고리 목록 불러오기
  useEffect(() => {
    const saved = localStorage.getItem('vm_portfolio_categories_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as string[];
        // "기타"는 항상 포함
        if (!parsed.includes('기타')) parsed.push('기타');
        setCategories(parsed);
      } catch {
        setCategories([...INITIAL_CATEGORIES]);
      }
    } else {
      setCategories([...INITIAL_CATEGORIES]);
    }
  }, []);

  // 아이템에서 사용된 카테고리도 합치기 (DB에는 있지만 목록에 없는 경우)
  const allCategories = Array.from(new Set([
    ...categories,
    ...portfolioItems.map(i => i.category).filter(Boolean) as string[],
  ]));

  const saveCategoryList = (list: string[]) => {
    // "기타"는 항상 포함
    if (!list.includes('기타')) list.push('기타');
    setCategories(list);
    localStorage.setItem('vm_portfolio_categories_v2', JSON.stringify(list));
  };

  const handleAddCategory = () => {
    const name = newCategoryInput.trim();
    if (!name || allCategories.includes(name)) return;
    saveCategoryList([...categories, name]);
    setNewCategoryInput('');
  };

  // 카테고리 이름 변경 — 해당 카테고리의 포트폴리오 아이템도 일괄 업데이트
  const handleRenameCategory = async (oldName: string) => {
    const newName = editCategoryInput.trim();
    if (!newName || newName === oldName || allCategories.includes(newName)) {
      setEditingCategory(null);
      return;
    }

    // DB의 포트폴리오 아이템 카테고리 일괄 변경
    const itemsToUpdate = portfolioItems.filter(i => i.category === oldName);
    const results = await Promise.all(
      itemsToUpdate.map(i => updatePortfolioItem(i.id, { category: newName }))
    );
    if (results.some(ok => !ok)) {
      toast.error('일부 항목의 카테고리 변경에 실패했습니다.');
    }

    // 로컬 상태 반영
    setPortfolioItems(prev => prev.map(i => i.category === oldName ? { ...i, category: newName } : i));

    // 카테고리 목록에서 이름 변경
    saveCategoryList(categories.map(c => c === oldName ? newName : c));

    if (categoryFilter === oldName) setCategoryFilter(newName);
    setEditingCategory(null);
    toast.success(`"${oldName}" → "${newName}" 변경 완료`);
  };

  // 카테고리 삭제 — 해당 아이템은 "기타"로 변경
  const handleRemoveCategory = async (cat: string) => {
    const itemsToUpdate = portfolioItems.filter(i => i.category === cat);
    if (itemsToUpdate.length > 0) {
      if (!confirm(`"${cat}" 카테고리에 ${itemsToUpdate.length}개의 포트폴리오가 있습니다.\n삭제하면 "기타"로 변경됩니다. 계속할까요?`)) return;
      await Promise.all(itemsToUpdate.map(i => updatePortfolioItem(i.id, { category: '기타' })));
      setPortfolioItems(prev => prev.map(i => i.category === cat ? { ...i, category: '기타' } : i));
    }

    // 목록에서 제거
    saveCategoryList(categories.filter(c => c !== cat));
    if (categoryFilter === cat) setCategoryFilter('전체');
    toast.success(`"${cat}" 카테고리가 삭제되었습니다.`);
  };

  useEffect(() => {
    async function load() {
      const [items, partnersList] = await Promise.all([
        getPortfolioItems(),
        getPartners(),
      ]);
      setPortfolioItems(items);
      setPartners(partnersList);
      setLoading(false);
    }
    load();
  }, []);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    if (!inlineCatItemId) return;
    const handler = () => setInlineCatItemId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [inlineCatItemId]);

  const filteredItems = portfolioItems.filter(item => {
    if (filter === 'published' && !item.isPublished) return false;
    if (filter === 'unpublished' && item.isPublished) return false;
    if (categoryFilter !== '전체' && item.category !== categoryFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(query) ||
        item.client.toLowerCase().includes(query) ||
        item.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }
    return true;
  });

  // 정렬
  const sortedItems = [...filteredItems].sort((a, b) => {
    switch (sortBy) {
      case 'displayOrder': {
        const ao = a.displayOrder ?? 999_999;
        const bo = b.displayOrder ?? 999_999;
        if (ao !== bo) return ao - bo;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'title':
        return a.title.localeCompare(b.title, 'ko');
      case 'newest':
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  // ───── 다중 선택 ─────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllVisible = () => setSelectedIds(new Set(sortedItems.map(i => i.id)));

  const bulkSetPublished = async (publish: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const results = await Promise.all(ids.map(id => togglePortfolioPublished(id, publish)));
    const failed = results.filter(ok => !ok).length;
    setPortfolioItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, isPublished: publish } : i));
    if (failed) toast.error(`${failed}건 변경 실패`);
    else toast.success(`${ids.length}건을 ${publish ? '공개' : '비공개'}로 변경`);
    clearSelection();
  };

  const bulkSetCategory = async (cat: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await Promise.all(ids.map(id => updatePortfolioItem(id, { category: cat })));
    setPortfolioItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, category: cat } : i));
    toast.success(`${ids.length}건 카테고리를 "${cat}"(으)로 변경`);
    setBulkCatPickerOpen(false);
    clearSelection();
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}건을 삭제하시겠어요?`)) return;
    await Promise.all(ids.map(id => deletePortfolioItem(id)));
    setPortfolioItems(prev => prev.filter(i => !ids.includes(i.id)));
    toast.success(`${ids.length}건 삭제 완료`);
    clearSelection();
  };

  // ───── displayOrder 순서 조정 ─────
  const moveOrder = async (id: string, direction: 'up' | 'down') => {
    // displayOrder 정렬 기준 인덱스
    const idx = sortedItems.findIndex(i => i.id === id);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sortedItems.length) return;
    const a = sortedItems[idx];
    const b = sortedItems[targetIdx];
    const ao = a.displayOrder ?? idx;
    const bo = b.displayOrder ?? targetIdx;
    // 둘 다 같은 값이면 명시값 차등 부여
    const [newA, newB] = ao === bo
      ? (direction === 'up' ? [bo - 1, bo] : [bo + 1, bo])
      : [bo, ao];
    await Promise.all([
      updatePortfolioItem(a.id, { displayOrder: newA }),
      updatePortfolioItem(b.id, { displayOrder: newB }),
    ]);
    setPortfolioItems(prev => prev.map(i => {
      if (i.id === a.id) return { ...i, displayOrder: newA };
      if (i.id === b.id) return { ...i, displayOrder: newB };
      return i;
    }));
  };

  const togglePublish = async (itemId: string) => {
    const item = portfolioItems.find(i => i.id === itemId);
    if (!item) return;
    const newPublished = !item.isPublished;
    const ok = await togglePortfolioPublished(itemId, newPublished);
    if (ok) {
      setPortfolioItems(items =>
        items.map(i => i.id === itemId ? { ...i, isPublished: newPublished } : i)
      );
    } else {
      toast.error('공개 상태 변경에 실패했습니다.');
    }
  };

  // ───── 폼 모달 열기/닫기 ─────
  const openAddForm = () => {
    setFormItem({ ...emptyFormItem, completedAt: new Date().toISOString().split('T')[0] });
    setEditingId(null);
    setTagInput('');
    setFormMode('add');
  };
  const openEditForm = (item: PortfolioItem) => {
    setFormItem({ ...item });
    setEditingId(item.id);
    setTagInput('');
    setFormMode('edit');
  };
  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setFormItem(emptyFormItem);
    setTagInput('');
    setIsPartnerDropdownOpen(false);
  };

  const handleShareItem = async (item: PortfolioItem) => {
    try {
      await navigator.clipboard.writeText(item.youtubeUrl);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success('링크가 복사되었습니다.');
    } catch {
      toast.error('복사에 실패했습니다.');
    }
  };

  const handleDownloadThumbnail = (item: PortfolioItem) => {
    const videoId = extractYouTubeId(item.youtubeUrl);
    if (!videoId) { toast.error('유효한 유튜브 URL이 없습니다.'); return; }
    const link = document.createElement('a');
    link.href = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    link.download = `${item.title}-thumbnail.jpg`;
    link.target = '_blank';
    link.click();
  };

  // ───── 폼 제출 — add/edit 통합 ─────
  const handleSubmitForm = async () => {
    if (!formItem.title || !formItem.client) {
      toast.warning('제목과 클라이언트는 필수 입력 항목입니다.');
      return;
    }
    if (!formItem.youtubeUrl) {
      toast.warning('유튜브 URL을 입력해주세요.');
      return;
    }
    const videoId = extractYouTubeId(formItem.youtubeUrl);
    if (!videoId) {
      toast.warning('올바른 유튜브 URL을 입력해주세요. (예: https://www.youtube.com/watch?v=VIDEO_ID)');
      return;
    }

    if (formMode === 'edit' && editingId) {
      const ok = await updatePortfolioItem(editingId, {
        title: formItem.title,
        description: formItem.description,
        client: formItem.client,
        partnerId: formItem.partnerId,
        category: formItem.category,
        completedAt: formItem.completedAt,
        tags: formItem.tags,
        youtubeUrl: formItem.youtubeUrl,
        isPublished: formItem.isPublished,
      });
      if (ok) {
        setPortfolioItems(items => items.map(i =>
          i.id === editingId ? { ...i, ...formItem } as PortfolioItem : i
        ));
        toast.success('수정되었습니다.');
        closeForm();
      } else {
        toast.error('수정에 실패했습니다. 다시 시도해주세요.');
      }
      return;
    }

    // add 모드
    const itemToInsert: Omit<PortfolioItem, 'id' | 'createdAt' | 'updatedAt'> = {
      title: formItem.title!,
      description: formItem.description || '',
      client: formItem.client!,
      partnerId: formItem.partnerId || undefined,
      category: formItem.category || '기타',
      completedAt: formItem.completedAt || new Date().toISOString().split('T')[0],
      tags: formItem.tags || [],
      youtubeUrl: formItem.youtubeUrl!,
      isPublished: formItem.isPublished || false,
    };
    const inserted = await insertPortfolioItem(itemToInsert);
    if (!inserted) {
      toast.error('포트폴리오 추가에 실패했습니다. 다시 시도해주세요.');
      return;
    }
    setPortfolioItems(prev => [inserted, ...prev]);
    toast.success('추가되었습니다.');
    closeForm();
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formItem.tags?.includes(tagInput.trim())) {
      setFormItem({ ...formItem, tags: [...(formItem.tags || []), tagInput.trim()] });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormItem({ ...formItem, tags: formItem.tags?.filter(tag => tag !== tagToRemove) || [] });
  };

  const handleDelete = async (itemId: string) => {
    if (confirm('이 포트폴리오를 삭제하시겠습니까?')) {
      const ok = await deletePortfolioItem(itemId);
      if (ok) {
        setPortfolioItems(items => items.filter(item => item.id !== itemId));
        toast.success('삭제되었습니다.');
      } else {
        toast.error('삭제에 실패했습니다. 다시 시도해주세요.');
      }
    }
  };

  const handleBulkAdd = async () => {
    const validItems = bulkItems.filter(item => item.title.trim() && item.client.trim() && item.youtubeUrl.trim());
    if (validItems.length === 0) {
      toast.error('최소 1건 이상의 유효한 데이터를 입력해주세요.');
      return;
    }

    // URL 유효성 검증
    const invalidUrls = validItems.filter(item => !extractYouTubeId(item.youtubeUrl));
    if (invalidUrls.length > 0) {
      toast.error('유효하지 않은 유튜브 URL이 ' + invalidUrls.length + '건 있습니다. 확인해주세요.');
      return;
    }

    setIsBulkSubmitting(true);
    let successCount = 0;
    let failCount = 0;

    for (const item of validItems) {
      const inserted = await insertPortfolioItem({
        title: item.title.trim(),
        description: '',
        client: item.client.trim(),
        category: item.category || '기타',
        completedAt: new Date().toISOString().split('T')[0],
        tags: [],
        youtubeUrl: item.youtubeUrl.trim(),
        isPublished: false,
      });
      if (inserted) {
        setPortfolioItems(prev => [inserted, ...prev]);
        successCount++;
      } else {
        failCount++;
      }
    }

    setIsBulkSubmitting(false);
    setIsBulkModalOpen(false);

    if (failCount === 0) {
      toast.success(successCount + '건이 등록되었습니다.');
    } else {
      toast.error('성공 ' + successCount + '건, 실패 ' + failCount + '건');
    }
  };

  const updateBulkItem = (index: number, field: string, value: string) => {
    setBulkItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const removeBulkRow = (index: number) => {
    if (bulkItems.length <= 1) return;
    setBulkItems(prev => prev.filter((_, i) => i !== index));
  };

  const addBulkRow = () => {
    setBulkItems(prev => [...prev, { _uid: crypto.randomUUID(), title: '', client: '', category: '기타', youtubeUrl: '' }]);
  };

  const stats = {
    total: portfolioItems.length,
    published: portfolioItems.filter(item => item.isPublished).length,
    unpublished: portfolioItems.filter(item => !item.isPublished).length,
  };

  return (
    <div className="space-y-5">
      <style jsx global>{`
        @keyframes portfolio-modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-portfolio-modal { animation: portfolio-modal-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      `}</style>
      {/* 브레드크럼 */}
      <div className="flex items-center gap-2 text-[12px]">
        <a href="/marketing" className="text-[#78716c] hover:text-[#1c1917] transition-colors">
          마케팅
        </a>
        <span className="text-[var(--color-ink-300)]">/</span>
        <span className="text-[#1c1917] font-medium">포트폴리오</span>
      </div>

      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-page">포트폴리오</h1>
          {/* 통계 chip — 카드 3개에서 압축 */}
          <div className="flex items-center gap-1 text-[11px] font-semibold">
            <span className="text-[#78716c] tabular-nums">{stats.total}</span>
            <span className="text-[var(--color-ink-300)]">·</span>
            <span className="text-green-600 tabular-nums flex items-center gap-0.5">
              <Eye size={10} />
              {stats.published}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setBulkItems(Array.from({ length: 5 }, () => ({ _uid: crypto.randomUUID(), title: '', client: '', category: '기타', youtubeUrl: '' })));
              setIsBulkModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 text-[13px] font-semibold transition-colors"
          >
            <List size={14} />
            일괄 추가
          </button>
          <button
            type="button"
            onClick={() => openAddForm()}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[13px] font-semibold transition-colors"
          >
            <Plus size={14} />
            포트폴리오 추가
          </button>
          {/* 오버플로 메뉴 — 빈도 낮은 액션 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setActionMenuOpen(v => !v)}
              className="p-2 rounded-lg border border-divider bg-white text-[#44403c] hover:bg-[#fafaf9] transition-colors"
              aria-label="추가 메뉴"
            >
              <MoreHorizontal size={14} />
            </button>
            {actionMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setActionMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 bg-white border border-divider rounded-lg shadow-lg z-40 py-1 min-w-[180px]">
                  <button
                    type="button"
                    onClick={() => {
                      setActionMenuOpen(false);
                      const url = typeof window !== 'undefined' ? window.location.href : '';
                      navigator.clipboard.writeText(url).then(() => toast.success('페이지 링크가 복사되었습니다.')).catch(() => toast.error('복사에 실패했습니다.'));
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#44403c] hover:bg-[#fafaf9] transition-colors"
                  >
                    <Share2 size={13} className="text-[var(--color-ink-400)]" />
                    페이지 링크 공유
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActionMenuOpen(false); setIsCategoryModalOpen(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#44403c] hover:bg-[#fafaf9] transition-colors"
                  >
                    <Tag size={13} className="text-[var(--color-ink-400)]" />
                    카테고리 관리
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 컨트롤 바 — 검색 / 필터 / 정렬 / 뷰모드 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="제목, 클라이언트, 태그 검색..."
            className="flex-1 min-w-[200px] max-w-md"
          />
          <TabBar<FilterType>
            items={[
              { key: 'all', label: '전체', count: stats.total },
              { key: 'published', label: '공개됨', count: stats.published },
              { key: 'unpublished', label: '비공개', count: stats.unpublished },
            ] satisfies TabItem<FilterType>[]}
            active={filter}
            onChange={setFilter}
            fullWidthMobile={false}
          />
        </div>
        <div className="flex items-center gap-2">
          {/* 정렬 셀렉트 */}
          <div className="relative inline-flex items-center gap-1.5 px-3 py-2 border border-divider rounded-lg bg-white text-[13px] text-[#44403c] hover:bg-[#fafaf9] transition-colors">
            <ArrowUpDown size={13} className="text-[var(--color-ink-400)]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="bg-transparent text-[13px] font-semibold outline-none cursor-pointer appearance-none pr-1"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {/* 뷰 모드 */}
          <div className="inline-flex gap-1 p-1 bg-white border border-divider rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                  : 'text-[#78716c] hover:text-[#44403c]'
              }`}
              aria-label="그리드 뷰"
            >
              <Grid3x3 size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                  : 'text-[#78716c] hover:text-[#44403c]'
              }`}
              aria-label="리스트 뷰"
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-[#78716c] mr-1">카테고리</span>
        {['전체', ...allCategories].map(cat => {
          const count = cat === '전체' ? portfolioItems.length : portfolioItems.filter(i => i.category === cat).length;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                categoryFilter === cat
                  ? 'bg-orange-500 text-white'
                  : 'bg-white border border-divider text-[#78716c] hover:bg-[#fafaf9]'
              }`}
            >
              {cat}
              <span className={`ml-1 ${categoryFilter === cat ? 'text-orange-100' : 'text-[var(--color-ink-400)]'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 포트폴리오 목록 */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-ink-100">
          <LoadingState label="로딩 중..." />
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-ink-100 py-2">
          <EmptyState
            icon={Grid3x3}
            title="포트폴리오가 없습니다"
            description={
              searchQuery
                ? '검색 조건에 맞는 포트폴리오가 없습니다'
                : filter === 'published'
                ? '공개된 포트폴리오가 없습니다'
                : filter === 'unpublished'
                ? '비공개 포트폴리오가 없습니다'
                : '포트폴리오 추가 버튼을 클릭하여 작업물을 업로드하세요'
            }
            action={!searchQuery && filter === 'all' ? { label: '첫 포트폴리오 추가하기', onClick: () => openAddForm() } : undefined}
          />
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {sortedItems.map((item, idx) => {
            const partner = partners.find(p => p.id === item.partnerId);
            const isSelected = selectedIds.has(item.id);
            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden group ${
                  isSelected ? 'border-orange-400 ring-2 ring-orange-200' : 'border-ink-100 hover:shadow-md'
                }`}
              >
                <div className="aspect-video bg-gray-900 relative overflow-hidden">
                  {getYouTubeThumbnail(item.youtubeUrl) && (
                    <img
                      src={getYouTubeThumbnail(item.youtubeUrl)!}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = `https://img.youtube.com/vi/${extractYouTubeId(item.youtubeUrl)}/hqdefault.jpg`;
                      }}
                    />
                  )}
                  {/* 체크박스 — 호버 또는 선택 시 노출 */}
                  <label
                    className={`absolute top-3 left-3 flex items-center justify-center w-6 h-6 rounded-md cursor-pointer transition-opacity ${
                      isSelected ? 'opacity-100' : 'sm:opacity-0 sm:group-hover:opacity-100'
                    } ${isSelected ? 'bg-orange-500 border-orange-500' : 'bg-white/90 border border-divider hover:bg-white'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.id)}
                      className="sr-only"
                    />
                    {isSelected && <CheckCircle size={14} className="text-white" />}
                  </label>
                  {/* 순서 조정 (displayOrder 정렬 시만) */}
                  {sortBy === 'displayOrder' && (
                    <div className="absolute bottom-3 left-3 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); moveOrder(item.id, 'up'); }}
                        disabled={idx === 0}
                        className="p-1.5 rounded-md bg-white/90 text-[#44403c] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        title="위로"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); moveOrder(item.id, 'down'); }}
                        disabled={idx === sortedItems.length - 1}
                        className="p-1.5 rounded-md bg-white/90 text-[#44403c] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        title="아래로"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  )}
                  <div className="absolute top-3 right-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => togglePublish(item.id)}
                      className={`p-2 rounded-lg backdrop-blur-sm transition-colors ${
                        item.isPublished
                          ? 'bg-green-500/90 text-white'
                          : 'bg-black/40 text-white hover:bg-gray-900/70'
                      }`}
                      title={item.isPublished ? '공개됨' : '비공개'}
                    >
                      {item.isPublished ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      className="p-2 rounded-lg bg-red-500/90 text-white hover:bg-red-600/90 backdrop-blur-sm transition-colors"
                      title="삭제"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <a
                      href={item.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center text-white hover:bg-red-700 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </a>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-[#1c1917] line-clamp-1">{item.title}</h3>
                      {item.category && (
                        <span className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded text-[11px] font-medium flex-shrink-0">
                          {item.category}
                        </span>
                      )}
                    </div>
                    {item.isPublished && (
                      <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium flex-shrink-0">
                        공개
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[#78716c] mb-4 line-clamp-2">{item.description}</p>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-xs text-[#78716c]">
                      <User size={12} className="mr-1.5" />
                      <span>{item.client}</span>
                    </div>
                    {partner && (
                      <div className="flex items-center text-xs text-[#44403c]">
                        <div className="w-4 h-4 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mr-1.5">
                          <User size={8} className="text-orange-500" />
                        </div>
                        <span>{partner.name}</span>
                      </div>
                    )}
                    <div className="flex items-center text-xs text-[#78716c]">
                      <Calendar size={12} className="mr-1.5" />
                      <span>{item.completedAt ? new Date(item.completedAt).toLocaleDateString('ko-KR') : '-'}</span>
                    </div>
                  </div>
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="px-2 py-1 bg-[var(--color-ink-100)] text-[#44403c] rounded text-xs">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => openEditForm(item)} className="flex-1 px-3 py-2 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition-colors text-sm font-medium">
                      수정
                    </button>
                    <button type="button" onClick={() => handleShareItem(item)} className="px-3 py-2 bg-[#fafaf9] text-[#44403c] rounded-lg hover:bg-[var(--color-ink-100)] transition-colors" title="링크 복사">
                      {copiedId === item.id ? <CheckCircle size={16} className="text-green-500" /> : <Share2 size={16} />}
                    </button>
                    <button type="button" onClick={() => handleDownloadThumbnail(item)} className="px-3 py-2 bg-[#fafaf9] text-[#44403c] rounded-lg hover:bg-[var(--color-ink-100)] transition-colors" title="썸네일 다운로드">
                      <Download size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-ink-100 divide-y divide-[#f8f7f6]">
          {sortedItems.map((item, idx) => {
            const partner = partners.find(p => p.id === item.partnerId);
            const isSelected = selectedIds.has(item.id);
            return (
              <div
                key={item.id}
                className={`px-6 py-4 transition-colors ${
                  isSelected ? 'bg-orange-50/40' : 'hover:bg-[#fafaf9]'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* 체크박스 */}
                  <label className="flex items-center justify-center pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.id)}
                      className="w-4 h-4 accent-orange-500 cursor-pointer"
                    />
                  </label>
                  {/* 순서 조정 */}
                  {sortBy === 'displayOrder' && (
                    <div className="flex flex-col gap-0.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => moveOrder(item.id, 'up')}
                        disabled={idx === 0}
                        className="p-0.5 rounded text-[var(--color-ink-400)] hover:text-orange-500 hover:bg-orange-50 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="위로"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveOrder(item.id, 'down')}
                        disabled={idx === sortedItems.length - 1}
                        className="p-0.5 rounded text-[var(--color-ink-400)] hover:text-orange-500 hover:bg-orange-50 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="아래로"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  )}
                  <div className="w-44 h-28 flex-shrink-0 bg-gray-900 rounded-lg relative overflow-hidden group/thumb">
                    {getYouTubeThumbnail(item.youtubeUrl) && (
                      <img
                        src={getYouTubeThumbnail(item.youtubeUrl)!}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = `https://img.youtube.com/vi/${extractYouTubeId(item.youtubeUrl)}/hqdefault.jpg`;
                        }}
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity bg-black/30">
                      <a
                        href={item.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center text-white hover:bg-red-700 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </a>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {editingTitleId === item.id ? (
                          <input
                            type="text"
                            value={editingTitleInput}
                            onChange={(e) => setEditingTitleInput(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const newTitle = editingTitleInput.trim();
                                if (newTitle && newTitle !== item.title) {
                                  await updatePortfolioItem(item.id, { title: newTitle });
                                  setPortfolioItems(prev => prev.map(i => i.id === item.id ? { ...i, title: newTitle } : i));
                                  toast.success('제목이 변경되었습니다.');
                                }
                                setEditingTitleId(null);
                              }
                              if (e.key === 'Escape') setEditingTitleId(null);
                            }}
                            onBlur={async () => {
                              const newTitle = editingTitleInput.trim();
                              if (newTitle && newTitle !== item.title) {
                                await updatePortfolioItem(item.id, { title: newTitle });
                                setPortfolioItems(prev => prev.map(i => i.id === item.id ? { ...i, title: newTitle } : i));
                                toast.success('제목이 변경되었습니다.');
                              }
                              setEditingTitleId(null);
                            }}
                            autoFocus
                            className="text-base font-semibold text-[#1c1917] px-1 py-0 border border-orange-300 rounded focus:ring-1 focus:ring-orange-500 focus:border-transparent outline-none"
                          />
                        ) : (
                          <h3
                            className="text-base font-semibold text-[#1c1917] cursor-pointer hover:text-orange-600 transition-colors"
                            onClick={() => { setEditingTitleId(item.id); setEditingTitleInput(item.title); }}
                            title="클릭하여 제목 수정"
                          >
                            {item.title}
                          </h3>
                        )}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setInlineCatItemId(inlineCatItemId === item.id ? null : item.id); }}
                            className="px-2 py-0.5 bg-orange-50 text-orange-600 rounded text-xs font-medium hover:bg-orange-100 transition-colors cursor-pointer"
                          >
                            {item.category || '기타'} <ChevronDown size={10} className="inline" />
                          </button>
                          {inlineCatItemId === item.id && (
                            <div className="absolute top-full left-0 mt-1 bg-white border border-divider rounded-lg shadow-lg z-20 py-1 min-w-[120px]">
                              {allCategories.map(cat => (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (cat !== item.category) {
                                      await updatePortfolioItem(item.id, { category: cat });
                                      setPortfolioItems(prev => prev.map(i => i.id === item.id ? { ...i, category: cat } : i));
                                      toast.success(`카테고리를 "${cat}"(으)로 변경했습니다.`);
                                    }
                                    setInlineCatItemId(null);
                                  }}
                                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-orange-50 transition-colors ${cat === item.category ? 'text-orange-600 font-medium bg-orange-50/50' : 'text-[#44403c]'}`}
                                >
                                  {cat}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {item.isPublished && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium flex items-center gap-1">
                            <CheckCircle size={10} />
                            공개
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => togglePublish(item.id)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                            item.isPublished
                              ? 'bg-[var(--color-ink-100)] text-[#44403c] hover:bg-[var(--color-ink-200)]'
                              : 'bg-orange-500 text-white hover:bg-orange-600'
                          }`}
                        >
                          {item.isPublished ? (
                            <><EyeOff size={14} />비공개</>
                          ) : (
                            <><Eye size={14} />공개</>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mb-1.5 text-sm text-[#78716c]">
                      <div className="flex items-center gap-1">
                        <User size={13} />
                        <span>{item.client}</span>
                      </div>
                      {partner && (
                        <div className="flex items-center gap-1">
                          <div className="w-4 h-4 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <User size={8} className="text-orange-500" />
                          </div>
                          <span>{partner.name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Calendar size={13} />
                        <span>{item.completedAt ? new Date(item.completedAt).toLocaleDateString('ko-KR') : '-'}</span>
                      </div>
                    </div>
                    {item.description && (
                      <p className="text-sm text-[#78716c] mb-1.5 line-clamp-1">{item.description}</p>
                    )}
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.tags.map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 bg-[var(--color-ink-100)] text-[#78716c] rounded text-xs">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 포트폴리오 추가/수정 모달 (통합) */}
      {formMode !== null && (
        <div className="fixed inset-0 z-50 overflow-y-auto animate-modal-overlay">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => closeForm()}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full animate-portfolio-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-divider flex items-center justify-between">
                <h2 className="text-[16px] font-bold text-[#1c1917]">{formMode === 'edit' ? '포트폴리오 수정' : '새 포트폴리오 추가'}</h2>
                <button
                  type="button"
                  onClick={() => closeForm()}
                  className="p-2 hover:bg-[var(--color-ink-100)] rounded-full transition-colors"
                >
                  <X size={20} className="text-[#78716c]" />
                </button>
              </div>
              <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                <FloatingLabelInput
                  label="제목"
                  required
                  type="text"
                  value={formItem.title}
                  onChange={(e) => setFormItem({ ...formItem, title: e.target.value })}
                />
                <FloatingLabelTextarea
                  label="설명"
                  value={formItem.description}
                  onChange={(e) => setFormItem({ ...formItem, description: e.target.value })}
                  rows={3}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FloatingLabelInput
                    label="클라이언트"
                    required
                    type="text"
                    value={formItem.client}
                    onChange={(e) => setFormItem({ ...formItem, client: e.target.value })}
                  />
                  <div>
                    <label className="block text-sm font-medium text-[#44403c] mb-1">카테고리</label>
                    <select
                      value={formItem.category || '기타'}
                      onChange={(e) => setFormItem({ ...formItem, category: e.target.value })}
                      className="w-full px-3 py-2 border border-divider rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
                    >
                      {allCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <div>
                    <label className="block text-sm font-medium text-[#44403c] mb-1">담당 파트너</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsPartnerDropdownOpen(!isPartnerDropdownOpen)}
                        className="w-full px-3 py-2 border border-divider rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          {formItem.partnerId ? (
                            <>
                              <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <User size={12} className="text-orange-500" />
                              </div>
                              <span className="text-[#1c1917]">
                                {partners.find(p => p.id === formItem.partnerId)?.name}
                              </span>
                            </>
                          ) : (
                            <span className="text-[#78716c]">선택 안 함</span>
                          )}
                        </div>
                        <ChevronDown size={16} className="text-[var(--color-ink-400)]" />
                      </button>
                      {isPartnerDropdownOpen && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-divider rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => { setFormItem({ ...formItem, partnerId: '' }); setIsPartnerDropdownOpen(false); }}
                            className={`w-full px-3 py-2 text-left hover:bg-[#fafaf9] transition-colors ${formItem.partnerId === '' ? 'bg-orange-50 text-orange-700 font-medium' : 'text-[#44403c]'}`}
                          >
                            선택 안 함
                          </button>
                          {partners.map((partner) => (
                            <button
                              key={partner.id}
                              type="button"
                              onClick={() => { setFormItem({ ...formItem, partnerId: partner.id }); setIsPartnerDropdownOpen(false); }}
                              className={`w-full px-3 py-2 text-left hover:bg-[#fafaf9] transition-colors flex items-center gap-2 ${formItem.partnerId === partner.id ? 'bg-orange-50 text-orange-700 font-medium' : 'text-[#44403c]'}`}
                            >
                              <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <User size={12} className="text-orange-500" />
                              </div>
                              <span>{partner.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#44403c] mb-1">완료일</label>
                  <input
                    type="date"
                    value={formItem.completedAt}
                    onChange={(e) => setFormItem({ ...formItem, completedAt: e.target.value })}
                    className="w-full px-3 py-2 border border-divider rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <div className="flex gap-2 mb-2">
                    <FloatingLabelInput
                      label="태그"
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-4 py-2 bg-[var(--color-ink-100)] text-[#44403c] rounded-lg hover:bg-[var(--color-ink-200)] transition-colors h-[50px] mt-auto"
                    >
                      추가
                    </button>
                  </div>
                  {formItem.tags && formItem.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formItem.tags.map((tag) => (
                        <span key={tag} className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm flex items-center gap-2">
                          #{tag}
                          <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-orange-900">
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <FloatingLabelInput
                    label="유튜브 URL"
                    required
                    id="youtube-url"
                    type="text"
                    value={formItem.youtubeUrl || ''}
                    onChange={(e) => setFormItem({ ...formItem, youtubeUrl: e.target.value })}
                    autoComplete="off"
                  />
                  <p className="text-xs text-[#78716c] mt-1">
                    유튜브 영상 URL을 입력하거나 붙여넣기 하세요 (Ctrl+V 또는 Cmd+V)
                  </p>
                  {formItem.youtubeUrl && getYouTubeThumbnail(formItem.youtubeUrl) && (
                    <div className="mt-3 p-2 border border-divider rounded-lg">
                      <p className="text-xs text-[#78716c] mb-2">썸네일 미리보기:</p>
                      <img
                        src={getYouTubeThumbnail(formItem.youtubeUrl)!}
                        alt="YouTube Thumbnail"
                        className="w-full rounded max-w-md"
                        onError={(e) => {
                          const videoId = extractYouTubeId(formItem.youtubeUrl!);
                          if (videoId) e.currentTarget.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="publish"
                    checked={formItem.isPublished}
                    onChange={(e) => setFormItem({ ...formItem, isPublished: e.target.checked })}
                    className="w-4 h-4 text-orange-600 border-divider rounded focus:ring-orange-500"
                  />
                  <label htmlFor="publish" className="ml-2 text-sm text-[#44403c]">바로 공개하기</label>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-divider flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => closeForm()}
                  className="px-4 py-2 text-[#44403c] hover:bg-[var(--color-ink-100)] rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSubmitForm}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                >
                  {formMode === 'edit' ? '저장' : '추가'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 추가 모달 */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isBulkSubmitting && setIsBulkModalOpen(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full animate-portfolio-modal" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-divider flex items-center justify-between">
                <div>
                  <h2 className="text-[16px] font-bold text-[#1c1917]">포트폴리오 일괄 추가</h2>
                  <p className="text-sm text-[#78716c] mt-0.5">여러 포트폴리오를 한 번에 등록합니다. 빈 행은 자동으로 제외됩니다.</p>
                </div>
                <button type="button" onClick={() => !isBulkSubmitting && setIsBulkModalOpen(false)} className="p-2 hover:bg-[var(--color-ink-100)] rounded-full transition-colors">
                  <X size={20} className="text-[#78716c]" />
                </button>
              </div>
              <div className="p-4 max-h-[65vh] overflow-y-auto">
                {/* 헤더 */}
                <div className="grid grid-cols-[1fr_1fr_140px_1fr_36px] gap-2 mb-2 px-1">
                  <span className="text-xs font-medium text-[#78716c]">제목 *</span>
                  <span className="text-xs font-medium text-[#78716c]">클라이언트 *</span>
                  <span className="text-xs font-medium text-[#78716c]">카테고리</span>
                  <span className="text-xs font-medium text-[#78716c]">유튜브 URL *</span>
                  <span />
                </div>
                {/* 행 목록 */}
                <div className="space-y-2">
                  {bulkItems.map((item, index) => (
                    <div key={item._uid} className="grid grid-cols-[1fr_1fr_140px_1fr_36px] gap-2 items-center">
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => updateBulkItem(index, 'title', e.target.value)}
                        placeholder="제목"
                        className="px-3 py-2 border border-divider rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                      <input
                        type="text"
                        value={item.client}
                        onChange={(e) => updateBulkItem(index, 'client', e.target.value)}
                        placeholder="클라이언트"
                        className="px-3 py-2 border border-divider rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                      <select
                        value={item.category}
                        onChange={(e) => updateBulkItem(index, 'category', e.target.value)}
                        className="px-2 py-2 border border-divider rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
                      >
                        {allCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={item.youtubeUrl}
                        onChange={(e) => updateBulkItem(index, 'youtubeUrl', e.target.value)}
                        placeholder="https://youtube.com/watch?v=..."
                        className={`px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                          item.youtubeUrl && !extractYouTubeId(item.youtubeUrl) ? 'border-red-300 bg-red-50' : 'border-divider'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => removeBulkRow(index)}
                        disabled={bulkItems.length <= 1}
                        className="p-2 text-[var(--color-ink-400)] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                {/* 행 추가 버튼 */}
                <button
                  type="button"
                  onClick={addBulkRow}
                  className="mt-3 px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Plus size={16} />
                  행 추가
                </button>
              </div>
              <div className="px-6 py-4 border-t border-divider flex items-center justify-between">
                <span className="text-sm text-[#78716c]">
                  유효한 항목: {bulkItems.filter(item => item.title.trim() && item.client.trim() && item.youtubeUrl.trim() && extractYouTubeId(item.youtubeUrl)).length}건
                </span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(false)}
                    disabled={isBulkSubmitting}
                    className="px-4 py-2 text-[#44403c] hover:bg-[var(--color-ink-100)] rounded-lg transition-colors disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkAdd}
                    disabled={isBulkSubmitting || bulkItems.filter(item => item.title.trim() && item.client.trim() && item.youtubeUrl.trim()).length === 0}
                    className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isBulkSubmitting ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        등록 중...
                      </>
                    ) : '일괄 등록'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 카테고리 관리 모달 */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsCategoryModalOpen(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full animate-portfolio-modal" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-divider flex items-center justify-between">
                <h2 className="text-[16px] font-bold text-[#1c1917]">카테고리 관리</h2>
                <button type="button" onClick={() => setIsCategoryModalOpen(false)} className="p-2 hover:bg-[var(--color-ink-100)] rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 space-y-4">
                {/* 새 카테고리 추가 */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                    placeholder="새 카테고리 이름"
                    className="flex-1 px-3 py-2 border border-divider rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    disabled={!newCategoryInput.trim() || allCategories.includes(newCategoryInput.trim())}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    추가
                  </button>
                </div>

                {/* 카테고리 목록 */}
                <div className="space-y-1">
                  {allCategories.map(cat => {
                    const count = portfolioItems.filter(i => i.category === cat).length;
                    const isEditing = editingCategory === cat;
                    const isProtected = cat === '기타'; // 기타는 삭제/수정 불가
                    return (
                      <div key={cat} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[#fafaf9] group">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Tag size={14} className="text-[var(--color-ink-400)] shrink-0" />
                          {isEditing ? (
                            <input
                              type="text"
                              value={editCategoryInput}
                              onChange={(e) => setEditCategoryInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') { e.preventDefault(); handleRenameCategory(cat); }
                                if (e.key === 'Escape') setEditingCategory(null);
                              }}
                              onBlur={() => handleRenameCategory(cat)}
                              autoFocus
                              className="flex-1 px-2 py-0.5 border border-orange-300 rounded text-sm focus:ring-1 focus:ring-orange-500 focus:border-transparent"
                            />
                          ) : (
                            <>
                              <span className="text-sm text-[#1c1917]">{cat}</span>
                              <span className="text-xs text-[var(--color-ink-400)]">{count}개</span>
                            </>
                          )}
                        </div>
                        {!isProtected && !isEditing && (
                          <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all">
                            <button
                              type="button"
                              onClick={() => { setEditingCategory(cat); setEditCategoryInput(cat); }}
                              className="p-1 text-[var(--color-ink-400)] hover:text-orange-500 hover:bg-orange-50 rounded"
                              title="이름 변경"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveCategory(cat)}
                              className="p-1 text-[var(--color-ink-400)] hover:text-red-500 hover:bg-red-50 rounded"
                              title="삭제"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 다중 선택 floating action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#1c1917] text-white rounded-2xl shadow-2xl shadow-black/30 px-5 py-3 flex items-center gap-3 animate-portfolio-modal">
          <span className="text-[13px] font-semibold">
            <span className="tabular-nums">{selectedIds.size}</span>개 선택됨
          </span>
          <button
            type="button"
            onClick={selectAllVisible}
            className="text-[11px] font-semibold text-orange-300 hover:text-orange-200"
          >
            전체 선택 ({sortedItems.length})
          </button>
          <span className="w-px h-5 bg-white/20" />
          <button
            type="button"
            onClick={() => bulkSetPublished(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-300 hover:bg-green-500/30 text-[12px] font-semibold transition-colors"
          >
            <Eye size={13} />
            공개로
          </button>
          <button
            type="button"
            onClick={() => bulkSetPublished(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 text-[12px] font-semibold transition-colors"
          >
            <EyeOff size={13} />
            비공개로
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setBulkCatPickerOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white/80 hover:bg-white/20 text-[12px] font-semibold transition-colors"
            >
              <Tag size={13} />
              카테고리
              <ChevronDown size={11} />
            </button>
            {bulkCatPickerOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setBulkCatPickerOpen(false)} />
                <div className="absolute bottom-full mb-2 left-0 bg-white border border-divider rounded-lg shadow-lg z-40 py-1 min-w-[140px] max-h-60 overflow-y-auto">
                  {allCategories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => bulkSetCategory(cat)}
                      className="w-full text-left px-3 py-1.5 text-[12px] text-[#44403c] hover:bg-orange-50 hover:text-orange-600 transition-colors"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={bulkDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 text-[12px] font-semibold transition-colors"
          >
            <Trash2 size={13} />
            삭제
          </button>
          <span className="w-px h-5 bg-white/20" />
          <button
            type="button"
            onClick={clearSelection}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="선택 해제"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
