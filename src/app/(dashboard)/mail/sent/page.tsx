'use client';

import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { Send, RefreshCw, Mail, X } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

interface SentEmail {
  id: string;
  senderEmail: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  content: string;
  status: string;
  createdAt: string;
}

export default function SentMailPage() {
  const toast = useToast();

  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SentEmail | null>(null);

  const fetchEmails = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/mail/sent');
      const data = await res.json();

      if (!res.ok) {
        if (!silent) toast.error(data.error || '보낸 메일을 불러올 수 없습니다.');
        return;
      }

      setEmails(data.emails || []);
    } catch {
      if (!silent) toast.error('보낸 메일 조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchEmails();
    const interval = setInterval(() => fetchEmails(true), 30000);
    return () => clearInterval(interval);
  }, [fetchEmails]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  const recipientDisplay = (email: SentEmail) => {
    return email.to.join(', ');
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }} className="space-y-6">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900">보낸 메일함</h1>
        </div>
        <p className="text-gray-500 mt-2">발송한 메일 내역을 확인합니다.</p>
      </div>

      {/* 메일 목록 */}
      <div className="bg-white rounded-lg shadow" style={{ border: '1px solid #ede9e6' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0ece9' }}>
          <div className="flex items-center gap-2">
            <Send size={20} style={{ color: '#f97316' }} />
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1c1917' }}>보낸 메일</h2>
            {!loading && <span style={{ fontSize: '13px', color: '#a8a29e' }}>({emails.length})</span>}
          </div>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

        {loading ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <RefreshCw size={24} style={{ color: '#d6d3d1', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
            <p style={{ color: '#a8a29e', fontSize: '14px', marginTop: '12px' }}>메일을 불러오는 중...</p>
          </div>
        ) : emails.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <Mail size={32} style={{ color: '#d6d3d1', margin: '0 auto' }} />
            <p style={{ color: '#a8a29e', fontSize: '14px', marginTop: '12px' }}>보낸 메일이 없습니다.</p>
          </div>
        ) : (
          <div>
            {emails.map(email => (
              <button
                key={email.id}
                onClick={() => setSelected(email)}
                style={{
                  display: 'flex',
                  width: '100%',
                  padding: '14px 24px',
                  gap: '16px',
                  alignItems: 'flex-start',
                  background: 'transparent',
                  border: 'none',
                  borderBlockEnd: '1px solid #f5f3f1',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fafaf9'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* 아바타 */}
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#fef4ed',
                  color: '#f97316',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 600,
                  flexShrink: 0,
                }}>
                  <Send size={14} />
                </div>

                {/* 내용 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {recipientDisplay(email)}
                    </span>
                    <span style={{ fontSize: '12px', color: '#a8a29e', flexShrink: 0 }}>{formatDate(email.createdAt)}</span>
                  </div>
                  <p style={{ fontSize: '14px', color: '#44403c', fontWeight: 500, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {email.subject}
                  </p>
                  <p style={{ fontSize: '13px', color: '#a8a29e', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {email.content.replace(/<[^>]*>/g, '').slice(0, 100) || '(본문 없음)'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 메일 상세 모달 */}
      {selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '700px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0ece9', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1c1917', wordBreak: 'break-word' }}>
                  {selected.subject}
                </h3>
                <div style={{ marginTop: '8px', fontSize: '13px', color: '#78716c' }} className="space-y-1">
                  <p><strong>보낸 사람:</strong> {selected.senderEmail}</p>
                  <p><strong>받는 사람:</strong> {selected.to.join(', ')}</p>
                  {selected.cc && selected.cc.length > 0 && <p><strong>참조:</strong> {selected.cc.join(', ')}</p>}
                  {selected.bcc && selected.bcc.length > 0 && <p><strong>숨은 참조:</strong> {selected.bcc.join(', ')}</p>}
                  <p><strong>날짜:</strong> {new Date(selected.createdAt).toLocaleString('ko-KR')}</p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a29e', padding: '4px', flexShrink: 0 }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 모달 본문 */}
            <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
              <div
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.content) }}
                style={{ fontSize: '14px', lineHeight: '1.7', color: '#1c1917' }}
              />
            </div>

            {/* 모달 하단 */}
            <div style={{ padding: '12px 24px', borderTop: '1px solid #f0ece9', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelected(null)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: '1px solid #d6d3d1',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#44403c',
                  fontWeight: 500,
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
