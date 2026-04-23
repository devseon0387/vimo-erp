'use client';

import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { Archive, RefreshCw, Mail, X, Inbox, Send } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

interface ReceivedEmail {
  type: 'received';
  id: string;
  uid: string;
  from: string;
  fromName: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  preview: string;
  text: string;
  html: string;
}

interface SentEmail {
  type: 'sent';
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

type UnifiedEmail = ReceivedEmail | SentEmail;

export default function AllMailPage() {
  const toast = useToast();

  const [emails, setEmails] = useState<UnifiedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UnifiedEmail | null>(null);

  const fetchEmails = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [inboxRes, sentRes] = await Promise.all([
        fetch('/api/hiworks/emails'),
        fetch('/api/mail/sent'),
      ]);

      const inboxData = await inboxRes.json();
      const sentData = await sentRes.json();

      const received: UnifiedEmail[] = (inboxData.emails || []).map((e: ReceivedEmail) => ({
        ...e,
        type: 'received' as const,
      }));

      const sent: UnifiedEmail[] = (sentData.emails || []).map((e: SentEmail) => ({
        ...e,
        type: 'sent' as const,
      }));

      const all = [...received, ...sent].sort((a, b) => {
        const dateA = new Date(a.type === 'received' ? a.date : a.createdAt).getTime();
        const dateB = new Date(b.type === 'received' ? b.date : b.createdAt).getTime();
        return dateB - dateA;
      });

      setEmails(all);
    } catch {
      if (!silent) toast.error('메일 조회 중 오류가 발생했습니다.');
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

  const getDate = (email: UnifiedEmail) =>
    email.type === 'received' ? email.date : email.createdAt;

  const getDisplayName = (email: UnifiedEmail) => {
    if (email.type === 'received') {
      return email.fromName || email.from || '(발신자 없음)';
    }
    return email.to.join(', ');
  };

  const getPreview = (email: UnifiedEmail) => {
    if (email.type === 'received') {
      return email.preview || '(본문 없음)';
    }
    return email.content.replace(/<[^>]*>/g, '').slice(0, 100) || '(본문 없음)';
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }} className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">전체 메일함</h1>
        <p className="text-gray-500 mt-2">받은 메일과 보낸 메일을 모두 확인합니다.</p>
      </div>

      {/* 메일 목록 */}
      <div className="bg-white rounded-lg shadow" style={{ border: '1px solid #ede9e6' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0ece9' }}>
          <div className="flex items-center gap-2">
            <Archive size={20} style={{ color: '#f97316' }} />
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1c1917' }}>전체 메일</h2>
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
            <p style={{ color: '#a8a29e', fontSize: '14px', marginTop: '12px' }}>메일이 없습니다.</p>
          </div>
        ) : (
          <div>
            {emails.map(email => (
              <button
                key={email.type === 'received' ? `r-${email.uid}` : `s-${email.id}`}
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
                  background: email.type === 'received' ? '#fef4ed' : '#eff6ff',
                  color: email.type === 'received' ? '#f97316' : '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 600,
                  flexShrink: 0,
                }}>
                  {email.type === 'received'
                    ? getDisplayName(email).charAt(0).toUpperCase()
                    : <Send size={14} />
                  }
                </div>

                {/* 내용 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        flexShrink: 0,
                        background: email.type === 'received' ? '#fef4ed' : '#eff6ff',
                        color: email.type === 'received' ? '#f97316' : '#2563eb',
                      }}>
                        {email.type === 'received' ? '받음' : '보냄'}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getDisplayName(email)}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#a8a29e', flexShrink: 0 }}>{formatDate(getDate(email))}</span>
                  </div>
                  <p style={{ fontSize: '14px', color: '#44403c', fontWeight: 500, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {email.subject}
                  </p>
                  <p style={{ fontSize: '13px', color: '#a8a29e', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getPreview(email)}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: selected.type === 'received' ? '#fef4ed' : '#eff6ff',
                    color: selected.type === 'received' ? '#f97316' : '#2563eb',
                  }}>
                    {selected.type === 'received' ? '받은 메일' : '보낸 메일'}
                  </span>
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1c1917', wordBreak: 'break-word' }}>
                  {selected.subject}
                </h3>
                <div style={{ marginTop: '8px', fontSize: '13px', color: '#78716c' }} className="space-y-1">
                  {selected.type === 'received' ? (
                    <>
                      <p><strong>보낸 사람:</strong> {selected.fromName ? `${selected.fromName} <${selected.from}>` : selected.from}</p>
                      <p><strong>받는 사람:</strong> {selected.to}</p>
                      {selected.cc && <p><strong>참조:</strong> {selected.cc}</p>}
                      <p><strong>날짜:</strong> {selected.date ? new Date(selected.date).toLocaleString('ko-KR') : ''}</p>
                    </>
                  ) : (
                    <>
                      <p><strong>보낸 사람:</strong> {selected.senderEmail}</p>
                      <p><strong>받는 사람:</strong> {selected.to.join(', ')}</p>
                      {selected.cc && selected.cc.length > 0 && <p><strong>참조:</strong> {selected.cc.join(', ')}</p>}
                      {selected.bcc && selected.bcc.length > 0 && <p><strong>숨은 참조:</strong> {selected.bcc.join(', ')}</p>}
                      <p><strong>날짜:</strong> {new Date(selected.createdAt).toLocaleString('ko-KR')}</p>
                    </>
                  )}
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
              {selected.type === 'received' ? (
                selected.html ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.html) }}
                    style={{ fontSize: '14px', lineHeight: '1.7', color: '#1c1917' }}
                  />
                ) : (
                  <pre style={{
                    fontSize: '14px',
                    lineHeight: '1.7',
                    color: '#44403c',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'inherit',
                    margin: 0,
                  }}>
                    {selected.text || '(본문 없음)'}
                  </pre>
                )
              ) : (
                <div
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.content) }}
                  style={{ fontSize: '14px', lineHeight: '1.7', color: '#1c1917' }}
                />
              )}
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
