'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Mail,
  Clock,
  CheckCircle,
  X,
  ChevronDown,
  Trash2,
  Save,
  ExternalLink,
  Phone,
  Play,
  User,
  Briefcase,
  DollarSign,
  Calendar,
  FileText,
  Link2,
  AlertCircle,
} from 'lucide-react';
import { Inquiry, InquiryStatus, PortfolioItem } from '@/types';
import {
  getInquiries,
  updateInquiryStatus,
  updateInquiryNotes,
  deleteInquiry,
  getPortfolioItems,
} from '@/lib/supabase/db';
import { useToast } from '@/contexts/ToastContext';
import { useSupabaseRealtime } from '@/hooks/useSupabaseRealtime';
import { TabBar } from '@/components/TabBar';
import { StatusBadge, type StatusTone } from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { SearchInput } from '@/components/SearchInput';

type FilterStatus = 'all' | InquiryStatus;

const STATUS_CONFIG: Record<InquiryStatus, { label: string; tone: StatusTone; dotColor: string }> = {
  new: { label: '새 문의', tone: 'info', dotColor: 'bg-blue-500' },
  contacted: { label: '연락 완료', tone: 'info', dotColor: 'bg-blue-500' },
  in_progress: { label: '진행 중', tone: 'brand', dotColor: 'bg-orange-500' },
  completed: { label: '완료', tone: 'ok', dotColor: 'bg-green-500' },
  rejected: { label: '거절', tone: 'danger', dotColor: 'bg-red-500' },
};

const STATUS_OPTIONS: { value: InquiryStatus; label: string }[] = [
  { value: 'new', label: '새 문의' },
  { value: 'contacted', label: '연락 완료' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'completed', label: '완료' },
  { value: 'rejected', label: '거절' },
];

export default function InquiryManageView() {
  const toast = useToast();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [filter, setFilter] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 상세 모달 상태
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState<InquiryStatus>('new');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    try {
      setLoadError(false);
      const [items, portfolio] = await Promise.all([getInquiries(), getPortfolioItems()]);
      setInquiries(items);
      setPortfolioItems(portfolio);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useSupabaseRealtime(['inquiries'], loadData);

  // 상태 드롭다운: 바깥 클릭 / Esc 닫기
  useEffect(() => {
    if (!isStatusDropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsStatusDropdownOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isStatusDropdownOpen]);

  // 포트폴리오 레퍼런스 문자열에서 매칭되는 포트폴리오 아이템 찾기
  const findPortfolioItem = (ref: string | { id: string; title: string; category: string; client: string }): PortfolioItem | undefined => {
    if (typeof ref !== 'string') {
      return portfolioItems.find(p => p.id === ref.id || p.title === ref.title);
    }
    // "[카테고리] 제목 (클라이언트)" 형태 파싱
    const match = ref.match(/^\[(.+?)\]\s*(.+?)(?:\s*\((.+?)\))?$/);
    if (match) {
      const [, , title] = match;
      return portfolioItems.find(p => p.title === title.trim());
    }
    // 제목만으로 매칭
    return portfolioItems.find(p => ref.includes(p.title));
  };

  const getYoutubeEmbedUrl = (url: string): string | null => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  const getYoutubeThumbnail = (url: string): string | null => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
    return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
  };

  const filteredInquiries = inquiries.filter(item => {
    if (filter !== 'all' && item.status !== filter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(query) ||
        item.phone.toLowerCase().includes(query) ||
        item.projectType.toLowerCase().includes(query) ||
        (item.email && item.email.toLowerCase().includes(query)) ||
        item.message.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const openDetail = (inquiry: Inquiry) => {
    setSelectedInquiry(inquiry);
    setEditNotes(inquiry.notes || '');
    setEditStatus(inquiry.status);
    setShowDeleteConfirm(false);
    setIsStatusDropdownOpen(false);
    setIsDetailModalOpen(true);
  };

  const handleStatusChange = async (newStatus: InquiryStatus) => {
    if (!selectedInquiry) return;
    const ok = await updateInquiryStatus(selectedInquiry.id, newStatus);
    if (ok) {
      setInquiries(items =>
        items.map(i => i.id === selectedInquiry.id ? { ...i, status: newStatus, updatedAt: new Date().toISOString() } : i)
      );
      setSelectedInquiry({ ...selectedInquiry, status: newStatus });
      setEditStatus(newStatus);
      setIsStatusDropdownOpen(false);
      toast.success('상태가 변경되었습니다.');
    } else {
      toast.error('상태 변경에 실패했습니다.');
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedInquiry) return;
    setIsSavingNotes(true);
    const ok = await updateInquiryNotes(selectedInquiry.id, editNotes);
    if (ok) {
      setInquiries(items =>
        items.map(i => i.id === selectedInquiry.id ? { ...i, notes: editNotes, updatedAt: new Date().toISOString() } : i)
      );
      setSelectedInquiry({ ...selectedInquiry, notes: editNotes });
      toast.success('메모가 저장되었습니다.');
    } else {
      toast.error('메모 저장에 실패했습니다.');
    }
    setIsSavingNotes(false);
  };

  const handleDelete = async () => {
    if (!selectedInquiry) return;
    setIsDeleting(true);
    const ok = await deleteInquiry(selectedInquiry.id);
    if (ok) {
      setInquiries(items => items.filter(i => i.id !== selectedInquiry.id));
      setIsDetailModalOpen(false);
      setSelectedInquiry(null);
      toast.success('문의가 삭제되었습니다.');
    } else {
      toast.error('삭제에 실패했습니다.');
    }
    setIsDeleting(false);
    setShowDeleteConfirm(false);
  };

  const stats = {
    total: inquiries.length,
    new: inquiries.filter(i => i.status === 'new').length,
    in_progress: inquiries.filter(i => i.status === 'in_progress').length,
    completed: inquiries.filter(i => i.status === 'completed').length,
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatBudget = (budget?: string) => {
    if (!budget) return '-';
    return budget;
  };

  return (
    <div className="space-y-5">
      <style jsx global>{`
        @keyframes inquiry-modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-inquiry-modal { animation: inquiry-modal-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      `}</style>

      {/* 컨트롤 바 */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="이름, 연락처, 프로젝트 유형 검색..."
          className="flex-1 min-w-[200px] max-w-md"
        />
        <div className="flex-1 sm:flex-none">
          <TabBar<FilterStatus>
            items={[
              { key: 'all', label: '전체' },
              { key: 'new', label: '새 문의' },
              { key: 'contacted', label: '연락 완료' },
              { key: 'in_progress', label: '진행 중' },
              { key: 'completed', label: '완료' },
              { key: 'rejected', label: '거절' },
            ]}
            active={filter}
            onChange={setFilter}
            fullWidthMobile={false}
          />
        </div>
      </div>

      {/* 문의 목록 테이블 */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-ink-100">
          <LoadingState label="로딩 중..." />
        </div>
      ) : loadError ? (
        <div className="bg-white rounded-2xl border border-ink-100">
          <EmptyState
            icon={AlertCircle}
            title="문의를 불러오지 못했습니다"
            description="네트워크 상태를 확인한 뒤 다시 시도해 주세요"
            iconColor="text-red-500"
            iconBgColor="bg-red-50"
            action={{ label: '다시 시도', onClick: () => { setLoading(true); loadData(); } }}
          />
        </div>
      ) : filteredInquiries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-ink-100">
          <EmptyState
            icon={MessageSquare}
            title="문의가 없습니다"
            description={
              searchQuery
                ? '검색 조건에 맞는 문의가 없습니다'
                : filter !== 'all'
                ? '해당 상태의 문의가 없습니다'
                : '아직 접수된 문의가 없습니다'
            }
          />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-ink-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#fafaf9] border-b border-[#f8f7f6]">
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[var(--color-ink-500)] uppercase tracking-wider">이름</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[var(--color-ink-500)] uppercase tracking-wider">연락처</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[var(--color-ink-500)] uppercase tracking-wider">프로젝트 유형</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[var(--color-ink-500)] uppercase tracking-wider">예산</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[var(--color-ink-500)] uppercase tracking-wider">상태</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-[var(--color-ink-500)] uppercase tracking-wider">날짜</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8f7f6]">
                {filteredInquiries.map((inquiry) => {
                  const statusConfig = STATUS_CONFIG[inquiry.status];
                  return (
                    <tr
                      key={inquiry.id}
                      onClick={() => openDetail(inquiry)}
                      className="hover:bg-[#fafaf9] transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-orange-50 rounded-full flex items-center justify-center flex-shrink-0">
                            <User size={13} className="text-orange-500" />
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-[#1c1917]">{inquiry.name}</p>
                            {inquiry.email && (
                              <p className="text-[11px] text-[var(--color-ink-400)]">{inquiry.email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-[12px] text-[#44403c]">
                        {inquiry.phone}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-[12px] text-[#44403c]">
                        {inquiry.projectType}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-[12px] text-[#44403c]">
                        {formatBudget(inquiry.budget)}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <StatusBadge tone={statusConfig.tone} dot>
                          {statusConfig.label}
                        </StatusBadge>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-[11px] text-[var(--color-ink-400)]">
                        {formatDate(inquiry.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 상세 모달 */}
      {isDetailModalOpen && selectedInquiry && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsDetailModalOpen(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full animate-inquiry-modal" onClick={(e) => e.stopPropagation()}>
              {/* 모달 헤더 */}
              <div className="px-6 py-4 border-b border-[#f8f7f6] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-bold text-[#1c1917]">문의 상세</h2>
                  <StatusBadge tone={STATUS_CONFIG[selectedInquiry.status].tone} dot>
                    {STATUS_CONFIG[selectedInquiry.status].label}
                  </StatusBadge>
                </div>
                <button type="button" onClick={() => setIsDetailModalOpen(false)} className="p-1.5 hover:bg-[#fafaf9] rounded-lg transition-colors" aria-label="닫기">
                  <X size={16} className="text-[var(--color-ink-400)]" />
                </button>
              </div>

              {/* 모달 내용 */}
              <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
                {/* 기본 정보 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-start gap-3">
                    <User size={16} className="text-[var(--color-ink-400)] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-[#78716c]">이름</p>
                      <p className="text-sm font-medium text-[#1c1917]">{selectedInquiry.name}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail size={16} className="text-[var(--color-ink-400)] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-[#78716c]">이메일</p>
                      <p className="text-sm font-medium text-[#1c1917]">{selectedInquiry.email || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone size={16} className="text-[var(--color-ink-400)] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-[#78716c]">연락처</p>
                      <p className="text-sm font-medium text-[#1c1917]">{selectedInquiry.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Briefcase size={16} className="text-[var(--color-ink-400)] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-[#78716c]">프로젝트 유형</p>
                      <p className="text-sm font-medium text-[#1c1917]">{selectedInquiry.projectType}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <DollarSign size={16} className="text-[var(--color-ink-400)] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-[#78716c]">예산</p>
                      <p className="text-sm font-medium text-[#1c1917]">{formatBudget(selectedInquiry.budget)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Calendar size={16} className="text-[var(--color-ink-400)] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-[#78716c]">접수일</p>
                      <p className="text-sm font-medium text-[#1c1917]">{formatDate(selectedInquiry.createdAt)}</p>
                    </div>
                  </div>
                </div>

                {/* 유입 경로 */}
                {selectedInquiry.referralSource && (
                  <div className="flex items-start gap-3">
                    <ExternalLink size={16} className="text-[var(--color-ink-400)] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-[#78716c]">유입 경로</p>
                      <p className="text-sm font-medium text-[#1c1917]">{selectedInquiry.referralSource}</p>
                    </div>
                  </div>
                )}

                {/* 문의 내용 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={16} className="text-[var(--color-ink-400)]" />
                    <p className="text-xs font-medium text-[#78716c] uppercase tracking-wider">문의 내용</p>
                  </div>
                  <div className="bg-[#fafaf9] rounded-lg p-4">
                    <p className="text-sm text-[#1c1917] whitespace-pre-wrap">{selectedInquiry.message}</p>
                  </div>
                </div>

                {/* 참고 링크 */}
                {selectedInquiry.referencesLinks && selectedInquiry.referencesLinks.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Link2 size={16} className="text-[var(--color-ink-400)]" />
                      <p className="text-xs font-medium text-[#78716c] uppercase tracking-wider">참고 링크</p>
                    </div>
                    <div className="space-y-1">
                      {selectedInquiry.referencesLinks.map((link, idx) => (
                        <a
                          key={idx}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 hover:underline"
                        >
                          <ExternalLink size={12} />
                          {link}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 포트폴리오 참고 */}
                {selectedInquiry.portfolioReferences && selectedInquiry.portfolioReferences.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Briefcase size={16} className="text-[var(--color-ink-400)]" />
                      <p className="text-xs font-medium text-[#78716c] uppercase tracking-wider">참고 포트폴리오</p>
                    </div>
                    <div className="space-y-2">
                      {selectedInquiry.portfolioReferences.map((ref, idx) => {
                        const isString = typeof ref === 'string';
                        const label = isString ? ref : ref.title;
                        const portfolioItem = findPortfolioItem(ref);
                        const hasVideo = !!portfolioItem?.youtubeUrl;
                        const category = !isString && ref.category ? ref.category : portfolioItem?.category;
                        const client = !isString && ref.client ? ref.client : portfolioItem?.client;

                        return (
                          <button
                            key={isString ? idx : ref.id ?? idx}
                            type="button"
                            onClick={() => {
                              if (hasVideo) {
                                const embedUrl = getYoutubeEmbedUrl(portfolioItem!.youtubeUrl);
                                if (embedUrl) setPlayingVideoUrl(embedUrl);
                              }
                            }}
                            className={`w-full flex items-center gap-3 bg-[#fafaf9] rounded-lg p-3 text-left transition-colors ${hasVideo ? 'hover:bg-orange-50 cursor-pointer' : 'cursor-default'}`}
                          >
                            <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${hasVideo ? 'bg-red-100' : 'bg-orange-100'}`}>
                              {hasVideo ? (
                                <Play size={14} className="text-red-500 fill-red-500" />
                              ) : (
                                <Briefcase size={14} className="text-orange-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#1c1917] truncate">{label}</p>
                              {category && (
                                <p className="text-xs text-[#78716c]">{category}{client ? ` · ${client}` : ''}</p>
                              )}
                            </div>
                            {hasVideo && (
                              <ExternalLink size={14} className="text-[var(--color-ink-300)] flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 상태 변경 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={16} className="text-[var(--color-ink-400)]" />
                    <p className="text-xs font-medium text-[#78716c] uppercase tracking-wider">상태 변경</p>
                  </div>
                  <div className="relative" ref={statusDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                      aria-haspopup="listbox"
                      aria-expanded={isStatusDropdownOpen}
                      className="w-full px-3 py-2 border border-divider rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[editStatus].dotColor}`} />
                        <span className="text-sm text-[#1c1917]">{STATUS_CONFIG[editStatus].label}</span>
                      </div>
                      <ChevronDown size={16} className="text-[var(--color-ink-400)]" />
                    </button>
                    {isStatusDropdownOpen && (
                      <div role="listbox" className="absolute z-10 w-full mt-1 bg-white border border-divider rounded-lg shadow-lg overflow-hidden">
                        {STATUS_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={editStatus === option.value}
                            onClick={() => handleStatusChange(option.value)}
                            className={`w-full px-3 py-2 text-left hover:bg-[#fafaf9] transition-colors flex items-center gap-2 text-sm ${
                              editStatus === option.value ? 'bg-orange-50 text-orange-700 font-medium' : 'text-[#44403c]'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[option.value].dotColor}`} />
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 메모 */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={16} className="text-[var(--color-ink-400)]" />
                    <p className="text-xs font-medium text-[#78716c] uppercase tracking-wider">메모</p>
                  </div>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={4}
                    placeholder="문의에 대한 메모를 작성하세요..."
                    className="w-full px-3 py-2 border border-divider rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none text-sm"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                      <Save size={14} />
                      {isSavingNotes ? '저장 중...' : '메모 저장'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 모달 푸터 */}
              <div className="px-6 py-4 border-t border-divider flex items-center justify-between">
                <div>
                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-red-600 font-medium">정말 삭제하시겠습니까?</span>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {isDeleting ? '삭제 중...' : '확인'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1.5 text-[#44403c] hover:bg-[var(--color-ink-100)] rounded-lg transition-colors text-sm"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <Trash2 size={14} />
                      삭제
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-4 py-2 text-[#44403c] hover:bg-[var(--color-ink-100)] rounded-lg transition-colors text-sm"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 영상 재생 모달 */}
      <AnimatePresence>
        {playingVideoUrl && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            onClick={() => setPlayingVideoUrl(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="fixed inset-0 bg-black/70" />
            <motion.div
              className="relative w-full max-w-3xl aspect-video rounded-xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <button
                onClick={() => setPlayingVideoUrl(null)}
                className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
              <iframe
                src={`${playingVideoUrl}?autoplay=1`}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
