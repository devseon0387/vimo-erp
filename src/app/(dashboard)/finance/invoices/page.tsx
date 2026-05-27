'use client';

import { useState, useEffect } from 'react';
import { FileText, Check } from 'lucide-react';
import { Episode, Project, Client } from '@/types';
import { motion } from 'framer-motion';
import { getAllEpisodes, getProjects, updateEpisodeFields } from '@/lib/supabase/db';

type InvoiceFilter = 'all' | 'pending' | 'completed';

interface InvoiceRow {
  episode: Episode & { projectId: string };
  project?: Project;
}

export default function InvoicesPage() {
  const [episodes, setEpisodes] = useState<(Episode & { projectId: string })[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<InvoiceFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    const [e, p] = await Promise.all([getAllEpisodes(), getProjects()]);
    setEpisodes(e);
    setProjects(p);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const projectMap = new Map(projects.map(p => [p.id, p]));

  const rows: InvoiceRow[] = episodes.map(ep => ({
    episode: ep,
    project: projectMap.get(ep.projectId),
  }));

  const filtered = rows.filter(r => {
    if (filter === 'pending') return r.episode.invoiceStatus === 'pending';
    if (filter === 'completed') return r.episode.invoiceStatus === 'completed';
    return true;
  });

  const pendingCount = rows.filter(r => r.episode.invoiceStatus === 'pending').length;
  const pendingAmount = rows
    .filter(r => r.episode.invoiceStatus === 'pending')
    .reduce((s, r) => s + (r.episode.budget?.totalAmount ?? 0), 0);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const pendingIds = filtered.filter(r => r.episode.invoiceStatus === 'pending').map(r => r.episode.id);
    if (pendingIds.every(id => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingIds));
    }
  };

  const handleBatchComplete = async () => {
    if (selected.size === 0) return;
    setUpdating(true);
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all(
      Array.from(selected).map(id =>
        updateEpisodeFields(id, { invoiceStatus: 'completed', invoiceDate: today })
      )
    );
    setSelected(new Set());
    await load();
    setUpdating(false);
  };

  const filters: { key: InvoiceFilter; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'pending', label: '미발행' },
    { key: 'completed', label: '발행완료' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-page">세금계산서 관리</h1>
        <p className="text-caption mt-0.5">세금계산서 발행 현황을 확인하고 관리하세요</p>
      </div>

      {/* 필터 탭 — 매니지먼트 스타일 */}
      <div className="inline-flex gap-1 p-1 bg-white border border-divider rounded-xl">
        {filters.map(({ key, label }) => (
          <button key={key} onClick={() => { setFilter(key); setSelected(new Set()); }} className="relative px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg text-[13px] sm:text-[14px] font-semibold">
            {filter === key && (
              <motion.div
                layoutId="invoice-filter-pill"
                className="absolute inset-0 bg-orange-500 rounded-lg shadow-sm shadow-orange-500/20"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className={`relative transition-colors duration-200 ${filter === key ? 'text-white' : 'text-[#78716c]'}`}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* 요약 바 */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-amber-600" />
          <span className="text-sm font-medium text-amber-800">미발행 {pendingCount}건</span>
        </div>
        <div className="h-4 w-px bg-amber-200 hidden sm:block" />
        <span className="text-sm font-medium text-amber-800">총 금액 {(pendingAmount / 10000).toFixed(0)}만원</span>
      </div>

      {/* 일괄 처리 버튼 */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleBatchComplete}
            disabled={updating}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors disabled:opacity-50"
          >
            <Check size={14} />
            {updating ? '처리 중...' : `발행 완료 처리 (${selected.size}건)`}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-500 hover:text-gray-700">선택 해제</button>
        </div>
      )}

      {/* 테이블 / 카드 */}
      <div className="bg-white rounded-2xl shadow-sm border border-divider overflow-hidden">
        {/* 모바일 카드 */}
        <div className="sm:hidden">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <FileText className="mx-auto mb-3 text-gray-200" size={36} />
              <p className="font-medium text-gray-500">데이터가 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(({ episode, project }) => {
                const isPending = episode.invoiceStatus === 'pending';
                return (
                  <div key={episode.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                    {isPending && (
                      <input
                        type="checkbox"
                        checked={selected.has(episode.id)}
                        onChange={() => toggleSelect(episode.id)}
                        className="rounded border-gray-300 mt-1 flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900 text-sm truncate">{project?.title ?? '-'}</p>
                        <span className="text-sm font-bold text-gray-900 flex-shrink-0 tabular-nums">{((episode.budget?.totalAmount ?? 0) / 10000).toFixed(0)}만</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[11px] text-gray-500">
                        <span className="font-medium">{episode.episodeNumber}회차</span>
                        <span className="text-gray-300">·</span>
                        <span className="truncate">{episode.client ?? project?.client ?? '-'}</span>
                        {episode.invoiceDate && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="tabular-nums">{episode.invoiceDate}</span>
                          </>
                        )}
                        <span className={`ml-auto px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                          isPending ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                        }`}>
                          {isPending ? '미발행' : '발행완료'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 데스크탑 테이블 */}
        <div className="hidden sm:block overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="px-6 py-3 bg-gray-50 grid grid-cols-[32px_1fr_100px_120px_100px_80px_80px] gap-4 text-xs font-semibold text-gray-400 uppercase tracking-wide items-center">
              <span>
                <input
                  type="checkbox"
                  checked={filtered.filter(r => r.episode.invoiceStatus === 'pending').length > 0 && filtered.filter(r => r.episode.invoiceStatus === 'pending').every(r => selected.has(r.episode.id))}
                  onChange={toggleAll}
                  className="rounded border-gray-300"
                />
              </span>
              <span>프로젝트</span>
              <span>회차</span>
              <span>클라이언트</span>
              <span className="text-right">금액</span>
              <span>발행일</span>
              <span>상태</span>
            </div>
            <div className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <FileText className="mx-auto mb-3 text-gray-200" size={36} />
                  <p className="font-medium text-gray-500">데이터가 없습니다</p>
                </div>
              ) : (
                filtered.map(({ episode, project }) => {
                  const isPending = episode.invoiceStatus === 'pending';
                  return (
                    <div key={episode.id} className="px-6 py-4 hover:bg-gray-50 transition-colors grid grid-cols-[32px_1fr_100px_120px_100px_80px_80px] gap-4 items-center">
                      <span>
                        {isPending && (
                          <input
                            type="checkbox"
                            checked={selected.has(episode.id)}
                            onChange={() => toggleSelect(episode.id)}
                            className="rounded border-gray-300"
                          />
                        )}
                      </span>
                      <p className="font-medium text-gray-900 truncate">{project?.title ?? '-'}</p>
                      <p className="text-sm text-gray-600">{episode.episodeNumber}회차</p>
                      <p className="text-sm text-gray-600 truncate">{episode.client ?? project?.client ?? '-'}</p>
                      <p className="text-sm font-semibold text-gray-900 text-right">{((episode.budget?.totalAmount ?? 0) / 10000).toFixed(0)}만</p>
                      <p className="text-sm text-gray-500">{episode.invoiceDate ?? '-'}</p>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isPending ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                      }`}>
                        {isPending ? '미발행' : '발행완료'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
