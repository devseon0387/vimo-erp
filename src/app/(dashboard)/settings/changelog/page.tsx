'use client';

import { useState } from 'react';
import { ArrowLeft, Plus, X, ChevronDown, ChevronUp, Sparkles, Wrench, Zap, AlertCircle, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { defaultChangelogs, type UpdateType, type ChangelogItem } from '@/config/changelog';
import EmptyState from '@/components/EmptyState';

const TYPE_CONFIG: Record<UpdateType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  feature: { label: '새 기능', color: 'text-orange-700', bg: 'bg-orange-100', icon: <Sparkles size={14} /> },
  fix: { label: '버그 수정', color: 'text-red-700', bg: 'bg-red-100', icon: <Wrench size={14} /> },
  improvement: { label: '개선', color: 'text-green-700', bg: 'bg-green-100', icon: <Zap size={14} /> },
  breaking: { label: '주요 변경', color: 'text-orange-700', bg: 'bg-orange-100', icon: <AlertCircle size={14} /> },
};

const STORAGE_KEY = 'video-moment-changelog';

function getChangelogs(): ChangelogItem[] {
  if (typeof window === 'undefined') return defaultChangelogs;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : defaultChangelogs;
  } catch {
    return defaultChangelogs;
  }
}

function saveChangelogs(items: ChangelogItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function ChangelogPage() {
  const [changelogs, setChangelogs] = useState<ChangelogItem[]>(() => getChangelogs());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(['1']));
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState<Partial<ChangelogItem>>({
    type: 'feature',
    details: [],
  });
  const [newDetail, setNewDetail] = useState('');

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddDetail = () => {
    if (!newDetail.trim()) return;
    setNewItem(prev => ({ ...prev, details: [...(prev.details || []), newDetail.trim()] }));
    setNewDetail('');
  };

  const handleRemoveDetail = (index: number) => {
    setNewItem(prev => ({ ...prev, details: prev.details?.filter((_, i) => i !== index) }));
  };

  const handleSave = () => {
    if (!newItem.version || !newItem.title || !newItem.date) return;
    const item: ChangelogItem = {
      id: Date.now().toString(),
      version: newItem.version!,
      date: newItem.date!,
      title: newItem.title!,
      description: newItem.description || '',
      type: newItem.type as UpdateType,
      details: newItem.details || [],
    };
    const updated = [item, ...changelogs];
    setChangelogs(updated);
    saveChangelogs(updated);
    setIsAdding(false);
    setNewItem({ type: 'feature', details: [] });
    setExpandedIds(prev => new Set([item.id, ...prev]));
  };

  const handleDelete = (id: string) => {
    const updated = changelogs.filter(c => c.id !== id);
    setChangelogs(updated);
    saveChangelogs(updated);
  };

  return (
    <div className="space-y-8 pb-20 max-w-3xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <button className="p-2 hover:bg-[#f5f5f4] rounded-lg transition-colors">
              <ArrowLeft size={24} className="text-[#57534e]" />
            </button>
          </Link>
          <div>
            <h1 className="text-page">업데이트 기록</h1>
            <p className="text-[#78716c] mt-1">기능 추가 및 변경 이력</p>
          </div>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium text-sm"
        >
          <Plus size={16} />
          업데이트 추가
        </button>
      </div>

      {/* 추가 폼 */}
      {isAdding && (
        <div className="bg-white border-2 border-green-200 rounded-2xl p-4 shadow-lg space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-[#1c1917]">새 업데이트 추가</h2>
            <button onClick={() => setIsAdding(false)} className="p-1 hover:bg-[#f5f5f4] rounded-full">
              <X size={20} className="text-[#78716c]" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-[#44403c]">버전</label>
              <input
                type="text"
                placeholder="예: v1.2.0"
                value={newItem.version || ''}
                onChange={e => setNewItem(prev => ({ ...prev, version: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-[#44403c]">날짜</label>
              <input
                type="date"
                value={newItem.date || ''}
                onChange={e => setNewItem(prev => ({ ...prev, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-[#44403c]">유형</label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(TYPE_CONFIG) as UpdateType[]).map(type => {
                const cfg = TYPE_CONFIG[type];
                const isSelected = newItem.type === type;
                return (
                  <button
                    key={type}
                    onClick={() => setNewItem(prev => ({ ...prev, type }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                      isSelected
                        ? `${cfg.bg} ${cfg.color} border-current`
                        : 'bg-white text-[#78716c] border-divider hover:border-gray-300'
                    }`}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-[#44403c]">제목</label>
            <input
              type="text"
              placeholder="업데이트 제목"
              value={newItem.title || ''}
              onChange={e => setNewItem(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-[#44403c]">설명</label>
            <textarea
              placeholder="간단한 설명 (선택)"
              value={newItem.description || ''}
              onChange={e => setNewItem(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-[#44403c]">상세 항목</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="항목 입력 후 추가"
                value={newDetail}
                onChange={e => setNewDetail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddDetail()}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <button
                onClick={handleAddDetail}
                className="px-3 py-2 bg-[#f5f5f4] text-[#44403c] rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                추가
              </button>
            </div>
            {(newItem.details || []).length > 0 && (
              <ul className="space-y-1 mt-2">
                {newItem.details!.map((detail, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[#44403c]">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="flex-1">{detail}</span>
                    <button onClick={() => handleRemoveDetail(i)} className="text-[#a8a29e] hover:text-red-500 transition-colors">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setIsAdding(false)}
              className="flex-1 py-2.5 bg-[#f5f5f4] text-[#44403c] rounded-xl font-medium hover:bg-gray-200 transition-colors text-sm"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={!newItem.version || !newItem.title || !newItem.date}
              className="flex-1 py-2.5 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-colors text-sm disabled:bg-gray-200 disabled:text-[#a8a29e] disabled:cursor-not-allowed"
            >
              저장
            </button>
          </div>
        </div>
      )}

      {/* 타임라인 */}
      <div className="space-y-4">
        {changelogs.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="업데이트 기록이 없습니다"
            description="오른쪽 상단 버튼으로 추가해보세요"
            action={{ label: '업데이트 추가', onClick: () => setIsAdding(true) }}
          />
        )}
        {changelogs.map(item => {
          const cfg = TYPE_CONFIG[item.type];
          const isExpanded = expandedIds.has(item.id);
          return (
            <div key={item.id} className="bg-white border border-divider rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-start gap-3 hover:bg-[#fafaf9] transition-colors">
                <div
                  className="flex-1 min-w-0 p-5 cursor-pointer"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-bold text-[#a8a29e] font-mono">{item.version}</span>
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                      {cfg.icon}
                      {cfg.label}
                    </span>
                    <span className="text-xs text-[#a8a29e]">{item.date}</span>
                  </div>
                  <h3 className="font-semibold text-[#1c1917]">{item.title}</h3>
                  {item.description && (
                    <p className="text-sm text-[#78716c] mt-0.5 line-clamp-1">{item.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 p-5">
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 text-[#a8a29e] hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X size={14} />
                  </button>
                  <div className="cursor-pointer" onClick={() => toggleExpand(item.id)}>
                    {isExpanded ? <ChevronUp size={18} className="text-[#a8a29e]" /> : <ChevronDown size={18} className="text-[#a8a29e]" />}
                  </div>
                </div>
              </div>

              {isExpanded && item.details.length > 0 && (
                <div className="px-5 pb-5 border-t border-divider">
                  <ul className="space-y-2 mt-4">
                    {item.details.map((detail, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-[#44403c]">
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.bg.replace('bg-', 'bg-').replace('100', '500')}`} />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
