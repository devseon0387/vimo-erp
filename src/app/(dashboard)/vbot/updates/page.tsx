'use client';

import { useState, useEffect } from 'react';
import {
  Bot, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { getAppUpdates } from '@/lib/supabase/db/app-updates';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

interface AppUpdate {
  id: string;
  app: string;
  version: string;
  title: string;
  date: string;
  tag?: string;
  changes: { type: 'feat' | 'fix' | 'improve' | 'style'; text: string }[];
  created_at: string;
}

const CHANGE_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  feat:    { bg: '#dbeafe', text: '#1e40af', label: '새 기능' },
  fix:     { bg: '#fee2e2', text: '#991b1b', label: '버그 수정' },
  improve: { bg: '#dcfce7', text: '#166534', label: '개선' },
  style:   { bg: '#f3e8ff', text: '#6b21a8', label: '스타일' },
};

export default function VbotUpdatesPage() {
  const [updates, setUpdates] = useState<AppUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUpdate, setExpandedUpdate] = useState<string | null>(null);

  useEffect(() => {
    loadUpdates();
  }, []);

  const loadUpdates = async () => {
    setLoading(true);
    try {
      const data = await getAppUpdates('bibot', 30);
      // 첫 번째 항목은 자동 펼침
      if (data && data.length > 0) {
        setExpandedUpdate(data[0].id);
      }
      setUpdates(data as unknown as AppUpdate[]);
    } catch {
      setUpdates([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1c1917', margin: 0 }}>비봇 업데이트</h1>
            <p style={{ fontSize: '13px', color: '#78716c', margin: 0 }}>릴리즈 노트 및 변경 내역</p>
          </div>
        </div>
        <button
          onClick={loadUpdates}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px',
            border: '1px solid #e7e5e4', background: '#fff',
            cursor: 'pointer', fontSize: '13px', color: '#78716c',
            transition: 'all 0.15s',
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          새로고침
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {loading ? (
        <LoadingState label="업데이트 내역을 불러오는 중..." />
      ) : updates.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="아직 업데이트 내역이 없습니다"
          description="비봇의 릴리즈 노트와 변경 내역이 여기에 표시됩니다."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {updates.map((update, idx) => {
            const isExpanded = expandedUpdate === update.id;
            const isLatest = idx === 0;
            return (
              <div
                key={update.id}
                style={{
                  background: '#fff', borderRadius: '12px',
                  border: isLatest ? '1px solid #2563eb' : '1px solid #e7e5e4',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => setExpandedUpdate(isExpanded ? null : update.id)}
                  style={{
                    width: '100%', padding: '18px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      fontSize: '13px', fontWeight: 700, color: isLatest ? '#2563eb' : '#78716c',
                      background: isLatest ? '#dbeafe' : '#f5f4f2',
                      padding: '4px 10px', borderRadius: '6px',
                      fontVariantNumeric: 'tabular-nums',
                    }}>{update.version}</span>
                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#1c1917' }}>
                      {update.title}
                    </span>
                    {isLatest && (
                      <span style={{
                        fontSize: '11px', fontWeight: 600, color: '#fff',
                        background: '#2563eb', padding: '2px 8px', borderRadius: '4px',
                      }}>최신</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: '#a8a29e' }}>
                      {new Date(update.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                    {isExpanded ? <ChevronUp size={16} color="#a8a29e" /> : <ChevronDown size={16} color="#a8a29e" />}
                  </div>
                </button>

                {isExpanded && (
                  <div style={{
                    padding: '0 20px 18px', borderTop: '1px solid #f5f4f2',
                  }}>
                    <div style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {update.changes.map((change, ci) => {
                        const changeStyle = CHANGE_TYPE_STYLES[change.type] ?? CHANGE_TYPE_STYLES.feat;
                        return (
                          <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                              fontSize: '11px', fontWeight: 600,
                              color: changeStyle.text, background: changeStyle.bg,
                              padding: '2px 8px', borderRadius: '4px',
                              minWidth: '56px', textAlign: 'center',
                            }}>{changeStyle.label}</span>
                            <span style={{ fontSize: '14px', color: '#44403c' }}>{change.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
