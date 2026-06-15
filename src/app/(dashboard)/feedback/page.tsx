'use client';

import { useState, useEffect } from 'react';
import { Lightbulb } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { getFeedbacks, updateFeedbackStatus } from '@/lib/supabase/db';
import { TabBar } from '@/components/TabBar';
import { StatusBadge, type StatusTone } from '@/components/StatusBadge';
import EmptyState from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import type { Feedback, FeedbackStatus } from '@/types';

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  pending: '대기',
  reviewed: '검토',
  done: '완료',
};

const STATUS_TONES: Record<FeedbackStatus, StatusTone> = {
  pending:  'warn',
  reviewed: 'info',
  done:     'ok',
};

type FilterTab = 'all' | FeedbackStatus;

export default function FeedbackPage() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    getFeedbacks().then(data => {
      if (!cancelled) { setItems(data); setLoading(false); }
    }).catch(() => {
      if (!cancelled) { toast.error('목록을 불러오지 못했습니다'); setLoading(false); }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStatusChange = async (id: string, status: FeedbackStatus) => {
    const ok = await updateFeedbackStatus(id, status);
    if (ok) {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status } : item))
      );
      toast.success(`상태가 "${STATUS_LABELS[status]}"(으)로 변경되었습니다`);
    } else {
      toast.error('상태 변경에 실패했습니다');
    }
  };

  const filtered =
    filter === 'all' ? items : items.filter((item) => item.status === filter);

  const tabItems: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: items.length },
    { key: 'pending', label: '대기', count: items.filter((i) => i.status === 'pending').length },
    { key: 'reviewed', label: '검토', count: items.filter((i) => i.status === 'reviewed').length },
    { key: 'done', label: '완료', count: items.filter((i) => i.status === 'done').length },
  ];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h1 className="text-page mb-6">개선사항</h1>

      {/* 필터 탭 — 매니지먼트 스타일 */}
      <TabBar
        items={tabItems}
        active={filter}
        onChange={setFilter}
        className="mb-6"
      />

      {/* 목록 */}
      {loading ? (
        <LoadingState label="불러오는 중..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="개선사항이 없습니다"
          description={
            filter === 'all'
              ? '아직 등록된 개선사항이 없습니다.'
              : `"${STATUS_LABELS[filter as FeedbackStatus]}" 상태의 개선사항이 없습니다.`
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map((item) => {
            return (
              <div
                key={item.id}
                style={{
                  background: '#fff',
                  border: '1px solid #ede9e6',
                  borderRadius: '16px',
                  padding: '20px',
                  boxShadow: '0 1px 2px rgba(0,0,0,.05)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', color: '#1c1917', whiteSpace: 'pre-line', marginBottom: '12px', lineHeight: 1.6 }}>
                      {item.content}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#a8a29e' }}>
                      <span>{item.pagePath}</span>
                      <span>·</span>
                      <span>
                        {new Date(item.createdAt).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <StatusBadge tone={STATUS_TONES[item.status]}>
                      {STATUS_LABELS[item.status]}
                    </StatusBadge>
                    <select
                      value={item.status}
                      onChange={(e) =>
                        handleStatusChange(item.id, e.target.value as FeedbackStatus)
                      }
                      style={{
                        fontSize: '12px',
                        border: '1px solid #ede9e6',
                        borderRadius: '8px',
                        padding: '4px 8px',
                        color: '#78716c',
                        background: '#fff',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      <option value="pending">대기</option>
                      <option value="reviewed">검토</option>
                      <option value="done">완료</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
