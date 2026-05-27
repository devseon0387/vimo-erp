'use client';

import { useState, useEffect } from 'react';
import { Receipt, Check, AlertTriangle, Clock } from 'lucide-react';
import { Episode, Project } from '@/types';
import { motion } from 'framer-motion';
import { getAllEpisodes, getProjects, updateEpisodeFields } from '@/lib/supabase/db';

type PaymentFilter = 'all' | 'pending' | 'completed' | 'overdue';

interface PaymentRow {
  episode: Episode & { projectId: string };
  project?: Project;
  isOverdue: boolean;
}

export default function PaymentsPage() {
  const [episodes, setEpisodes] = useState<(Episode & { projectId: string })[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    const [e, p] = await Promise.all([getAllEpisodes(), getProjects()]);
    setEpisodes(e);
    setProjects(p);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const projectMap = new Map(projects.map(p => [p.id, p]));

  const rows: PaymentRow[] = episodes
    .map(ep => ({
      episode: ep,
      project: projectMap.get(ep.projectId),
      isOverdue: ep.paymentStatus === 'pending' && !!ep.paymentDueDate && ep.paymentDueDate < today,
    }))
    .sort((a, b) => {
      // 입금예정일 오름차순 (없으면 뒤로)
      const da = a.episode.paymentDueDate ?? '9999';
      const db = b.episode.paymentDueDate ?? '9999';
      return da.localeCompare(db);
    });

  const filtered = rows.filter(r => {
    if (filter === 'pending') return r.episode.paymentStatus === 'pending' && !r.isOverdue;
    if (filter === 'completed') return r.episode.paymentStatus === 'completed';
    if (filter === 'overdue') return r.isOverdue;
    return true;
  });

  const pendingCount = rows.filter(r => r.episode.paymentStatus === 'pending' && !r.isOverdue).length;
  const overdueCount = rows.filter(r => r.isOverdue).length;
  const totalReceivable = rows
    .filter(r => r.episode.paymentStatus === 'pending')
    .reduce((s, r) => s + (r.episode.budget?.totalAmount ?? 0), 0);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const actionableIds = filtered.filter(r => r.episode.paymentStatus === 'pending').map(r => r.episode.id);
    if (actionableIds.every(id => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(actionableIds));
    }
  };

  const handleBatchComplete = async () => {
    if (selected.size === 0) return;
    setUpdating(true);
    await Promise.all(
      Array.from(selected).map(id =>
        updateEpisodeFields(id, { paymentStatus: 'completed' })
      )
    );
    setSelected(new Set());
    await load();
    setUpdating(false);
  };

  const filters: { key: PaymentFilter; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'pending', label: '입금대기' },
    { key: 'completed', label: '입금완료' },
    { key: 'overdue', label: '연체' },
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
        <h1 className="text-3xl font-bold text-gray-900">입금 관리</h1>
        <p className="text-gray-500 mt-2">입금 현황을 추적하고 관리하세요</p>
      </div>

      {/* 필터 탭 */}
      <div className="bg-white rounded-2xl p-2 shadow-sm border border-divider inline-flex gap-2">
        {filters.map(({ key, label }) => (
          <button key={key} onClick={() => { setFilter(key); setSelected(new Set()); }} className="relative px-5 py-2.5 rounded-xl font-semibold text-sm">
            {filter === key && (
              <motion.div
                layoutId="payment-filter-pill"
                className="absolute inset-0 bg-orange-500 rounded-xl shadow-lg shadow-orange-500/30"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className={`relative transition-colors duration-200 ${filter === key ? 'text-white' : 'text-gray-600 hover:text-gray-900'}`}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* 요약 바 */}
      <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-orange-600" />
          <span className="text-sm font-medium text-orange-800">대기 {pendingCount}건</span>
        </div>
        <div className="h-4 w-px bg-orange-200 hidden sm:block" />
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-600" />
          <span className="text-sm font-medium text-red-700">연체 {overdueCount}건</span>
        </div>
        <div className="h-4 w-px bg-orange-200 hidden sm:block" />
        <span className="text-sm font-medium text-orange-800">총 미수금 {(totalReceivable / 10000).toFixed(0)}만원</span>
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
            {updating ? '처리 중...' : `입금 완료 처리 (${selected.size}건)`}
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
              <Receipt className="mx-auto mb-3 text-gray-200" size={36} />
              <p className="font-medium text-gray-500">데이터가 없습니다</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(({ episode, project, isOverdue }) => {
                const isPending = episode.paymentStatus === 'pending';
                return (
                  <div
                    key={episode.id}
                    className={`px-4 py-3 flex items-start gap-3 transition-colors ${isOverdue ? 'bg-red-50' : 'hover:bg-gray-50'}`}
                  >
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
                        {episode.paymentDueDate && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className={`tabular-nums ${isOverdue ? 'text-red-600 font-semibold' : ''}`}>{episode.paymentDueDate}</span>
                          </>
                        )}
                        <span className={`ml-auto px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                          isOverdue ? 'bg-red-100 text-red-700' : isPending ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                        }`}>
                          {isOverdue ? '연체' : isPending ? '대기' : '완료'}
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
          <div className="min-w-[750px]">
            <div className="px-6 py-3 bg-gray-50 grid grid-cols-[32px_1fr_100px_120px_100px_100px_80px] gap-4 text-xs font-semibold text-gray-400 uppercase tracking-wide items-center">
              <span>
                <input
                  type="checkbox"
                  checked={filtered.filter(r => r.episode.paymentStatus === 'pending').length > 0 && filtered.filter(r => r.episode.paymentStatus === 'pending').every(r => selected.has(r.episode.id))}
                  onChange={toggleAll}
                  className="rounded border-gray-300"
                />
              </span>
              <span>프로젝트</span>
              <span>회차</span>
              <span>클라이언트</span>
              <span className="text-right">금액</span>
              <span>입금예정일</span>
              <span>상태</span>
            </div>
            <div className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <Receipt className="mx-auto mb-3 text-gray-200" size={36} />
                  <p className="font-medium text-gray-500">데이터가 없습니다</p>
                </div>
              ) : (
                filtered.map(({ episode, project, isOverdue }) => {
                  const isPending = episode.paymentStatus === 'pending';
                  return (
                    <div
                      key={episode.id}
                      className={`px-6 py-4 transition-colors grid grid-cols-[32px_1fr_100px_120px_100px_100px_80px] gap-4 items-center ${
                        isOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'
                      }`}
                    >
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
                      <p className={`text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                        {episode.paymentDueDate ?? '-'}
                      </p>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        isOverdue
                          ? 'bg-red-100 text-red-700'
                          : isPending
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-green-50 text-green-700'
                      }`}>
                        {isOverdue ? '연체' : isPending ? '대기' : '완료'}
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
