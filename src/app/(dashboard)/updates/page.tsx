'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import type { ChangeType } from './data';

type Tab = 'erp' | 'bibot';

interface UpdateEntry {
  id: string;
  app: string;
  version: string;
  title: string;
  date: string;
  tag?: string | null;
  changes: { type: ChangeType; text: string }[];
}

const CHANGE_ICON: Record<ChangeType, { label: string; cls: string; name: string }> = {
  feat:    { label: '+', cls: 'bg-blue-100 text-blue-500', name: '새 기능' },
  fix:     { label: '!', cls: 'bg-red-100 text-red-500', name: '버그 수정' },
  improve: { label: '↑', cls: 'bg-green-100 text-green-600', name: '개선' },
  style:   { label: '◆', cls: 'bg-purple-100 text-purple-500', name: '디자인' },
};

function fmtDate(d: string) {
  const [y, m, dd] = d.split('-').map(Number);
  return `${y}년 ${m}월 ${dd}일`;
}

function daysAgo(d: string) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  return `${diff}일 전`;
}

function TagBadge({ tag }: { tag?: string | null }) {
  if (tag === 'latest') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-green-50 text-green-500">최신</span>;
  if (tag === 'major') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-500">대규모</span>;
  return null;
}

function UpdateCard({ entry, isLatest, index, id }: { entry: UpdateEntry; isLatest: boolean; index: number; id: string }) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: 'easeOut' }}
      className={`bg-white border rounded-2xl px-6 py-5 relative transition-shadow hover:shadow-md ${
        isLatest ? 'border-orange-200 shadow-sm' : 'border-divider'
      }`}
    >
      {isLatest && (
        <span className="absolute top-4 right-5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-orange-500 text-white">
          NEW
        </span>
      )}

      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[15px] font-extrabold text-orange-500">{entry.version}</span>
        <TagBadge tag={entry.tag} />
      </div>

      <div className="text-[11px] text-[#a8a29e] mb-3">{fmtDate(entry.date)}</div>
      <div className="text-[16px] font-bold text-[#1c1917] mb-3">{entry.title}</div>

      <ul className="space-y-0">
        {entry.changes.map((c, i) => {
          const icon = CHANGE_ICON[c.type];
          return (
            <li key={i} className="flex items-start gap-2.5 py-2 border-b border-[#f8f7f6] last:border-b-0">
              <span className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 ${icon.cls}`}>
                {icon.label}
              </span>
              <span className="text-[13px] text-[#44403c] leading-relaxed">{c.text}</span>
            </li>
          );
        })}
      </ul>
    </motion.div>
  );
}

export default function UpdatesPage() {
  const [tab, setTab] = useState<Tab>('erp');
  const [updates, setUpdates] = useState<UpdateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVersion, setActiveVersion] = useState<string | null>(null);

  const loadUpdates = useCallback(async (app: string) => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('app_updates')
      .select('*')
      .eq('app', app)
      .order('date', { ascending: false });
    setUpdates((data as UpdateEntry[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUpdates(tab);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [tab, loadUpdates]);

  const latest = updates[0];

  const stats = useMemo(() => {
    const counts: Record<ChangeType, number> = { feat: 0, fix: 0, improve: 0, style: 0 };
    updates.forEach(u => u.changes.forEach(c => counts[c.type]++));
    return counts;
  }, [updates]);

  const totalChanges = Object.values(stats).reduce((a, b) => a + b, 0);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'erp', label: 'ERP' },
    { key: 'bibot', label: '비봇' },
  ];

  const scrollTo = (version: string) => {
    const el = document.getElementById(`update-${version}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setActiveVersion(version);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-page">업데이트</h1>
        <p className="text-gray-500 mt-1 text-sm">ERP와 비봇의 최신 변경 사항을 확인하세요</p>
      </div>

      <div className="inline-flex gap-1 p-1 bg-white border border-divider rounded-xl">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setActiveVersion(null); }}
            className="relative px-5 py-2.5 rounded-lg text-[14px] font-semibold"
          >
            {tab === t.key && (
              <motion.div
                layoutId="update-tab"
                className="absolute inset-0 bg-orange-500 rounded-lg shadow-sm shadow-orange-500/20"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className={`relative z-10 ${tab === t.key ? 'text-white' : 'text-[#78716c]'}`}>
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex gap-6 items-start"
          >
            {/* 카드 리스트 */}
            <div className="flex-1 min-w-0 space-y-4">
              {updates.map((entry, idx) => (
                <UpdateCard
                  key={entry.id}
                  entry={entry}
                  isLatest={idx === 0}
                  index={idx}
                  id={`update-${entry.version}`}
                />
              ))}
              {updates.length === 0 && (
                <div className="py-20 text-center text-[#a8a29e]">
                  <p className="font-medium text-gray-500">업데이트 내역이 없습니다</p>
                </div>
              )}
            </div>

            {/* 우측 사이드바 */}
            <div className="hidden lg:block w-[250px] flex-shrink-0 sticky top-6 space-y-4">
              {latest && (
                <div className="bg-white border border-divider rounded-2xl p-4">
                  <div className="text-[10px] font-bold text-[#a8a29e] tracking-wider uppercase mb-3">현재 버전</div>
                  <div className="flex items-center gap-3 bg-[#fff7ed] rounded-xl p-3">
                    <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-[11px] font-extrabold text-white flex-shrink-0">
                      {tab === 'erp' ? 'ERP' : '비봇'}
                    </div>
                    <div>
                      <div className="text-[15px] font-extrabold text-orange-500">{latest.version}</div>
                      <div className="text-[11px] text-[#a8a29e]">{daysAgo(latest.date)} 업데이트</div>
                    </div>
                  </div>
                </div>
              )}

              {updates.length > 0 && (
                <div className="bg-white border border-divider rounded-2xl p-4">
                  <div className="text-[10px] font-bold text-[#a8a29e] tracking-wider uppercase mb-3">버전 히스토리</div>
                  <div className="space-y-0.5">
                    {updates.map((u, i) => {
                      const isActive = activeVersion ? activeVersion === u.version : i === 0;
                      return (
                        <button
                          key={u.id}
                          onClick={() => scrollTo(u.version)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
                            isActive ? 'bg-[#fff7ed] text-orange-600' : 'text-[#78716c] hover:bg-[#fafaf9]'
                          }`}
                        >
                          <div className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${isActive ? 'bg-orange-500' : 'bg-[#d6cec8]'}`} />
                          <div className="min-w-0">
                            <div className={`text-[12px] font-semibold truncate ${isActive ? 'text-orange-600' : ''}`}>
                              {u.version} — {u.title}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {totalChanges > 0 && (
                <div className="bg-white border border-divider rounded-2xl p-4">
                  <div className="text-[10px] font-bold text-[#a8a29e] tracking-wider uppercase mb-3">변경 유형 통계</div>
                  <div className="space-y-2">
                    {(Object.keys(CHANGE_ICON) as ChangeType[]).map(type => {
                      const icon = CHANGE_ICON[type];
                      const count = stats[type];
                      const pct = totalChanges > 0 ? (count / totalChanges) * 100 : 0;
                      return (
                        <div key={type} className="flex items-center gap-2.5">
                          <span className={`w-[16px] h-[16px] rounded-[4px] flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${icon.cls}`}>
                            {icon.label}
                          </span>
                          <span className="text-[12px] text-[#78716c] w-[52px]">{icon.name}</span>
                          <div className="flex-1 h-[6px] bg-[#f5f4f2] rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
                              className={`h-full rounded-full ${
                                type === 'feat' ? 'bg-blue-400' :
                                type === 'fix' ? 'bg-red-400' :
                                type === 'improve' ? 'bg-green-400' : 'bg-purple-400'
                              }`}
                            />
                          </div>
                          <span className="text-[12px] font-bold text-[#1c1917] w-[28px] text-right">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
