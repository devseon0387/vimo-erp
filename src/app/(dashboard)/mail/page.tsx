'use client';

import { useState } from 'react';
import DOMPurify from 'dompurify';
import { Archive, Mail, X, Send, AlertCircle } from 'lucide-react';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

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

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday
    ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export default function AllMailPage() {
  // 메일 백엔드 라우트(/api/hiworks/*, /api/mail/sent) 미구현 — 빈 상태 + 배너 안내로 고정
  const [emails] = useState<UnifiedEmail[]>([]);
  const [loading] = useState(false);
  const [selected, setSelected] = useState<UnifiedEmail | null>(null);

  const getDate = (e: UnifiedEmail) => e.type === 'received' ? e.date : e.createdAt;
  const getDisplayName = (e: UnifiedEmail) =>
    e.type === 'received' ? (e.fromName || e.from || '(발신자 없음)') : e.to.join(', ');
  const getPreview = (e: UnifiedEmail) =>
    e.type === 'received'
      ? (e.preview || '(본문 없음)')
      : (e.content.replace(/<[^>]*>/g, '').slice(0, 100) || '(본문 없음)');

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-page">전체 메일함</h1>
        <p className="text-ink-500 mt-1 text-sm">받은 메일과 보낸 메일을 모두 확인합니다</p>
      </div>

      {/* 백엔드 미연결 배너 */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
        <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-amber-900">메일 백엔드 연결 준비 중</p>
          <p className="text-[12px] text-amber-800 mt-0.5">
            메일 수신·발송 API가 아직 구현되지 않아 메일 기능을 일시 비활성화했습니다. 후속 릴리스에서 복원됩니다.
          </p>
        </div>
      </div>

      {/* 메일 목록 카드 */}
      <div className="bg-white rounded-2xl border border-ink-100">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-ink-100">
          <Archive size={16} className="text-orange-500" />
          <h2 className="text-section">전체 메일</h2>
          {!loading && emails.length > 0 && (
            <span className="text-[11px] font-semibold text-ink-400">{emails.length}건</span>
          )}
        </div>

        {loading ? (
          <LoadingState size="compact" label="메일을 불러오는 중..." />
        ) : emails.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="메일이 없습니다"
            description="받은 메일과 보낸 메일이 여기에 표시됩니다."
            size="compact"
          />
        ) : (
          <ul>
            {emails.map((email, idx) => (
              <li key={email.type === 'received' ? `r-${email.uid}` : `s-${email.id}`}>
                <button
                  onClick={() => setSelected(email)}
                  className={`w-full flex items-start gap-3 px-6 py-3.5 text-left hover:bg-ink-50 transition-colors ${
                    idx < emails.length - 1 ? 'border-b border-ink-100' : ''
                  }`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0 ${
                    email.type === 'received'
                      ? 'bg-orange-50 text-orange-500'
                      : 'bg-ink-100 text-ink-600'
                  }`}>
                    {email.type === 'received'
                      ? getDisplayName(email).charAt(0).toUpperCase()
                      : <Send size={14} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                          email.type === 'received'
                            ? 'bg-orange-50 text-orange-500'
                            : 'bg-ink-100 text-ink-600'
                        }`}>
                          {email.type === 'received' ? '받음' : '보냄'}
                        </span>
                        <span className="text-[13px] font-semibold text-ink-900 truncate">
                          {getDisplayName(email)}
                        </span>
                      </div>
                      <span className="text-[11px] text-ink-400 flex-shrink-0">
                        {formatDate(getDate(email))}
                      </span>
                    </div>
                    <p className="text-[13px] font-medium text-ink-700 mt-0.5 truncate">
                      {email.subject}
                    </p>
                    <p className="text-[12px] text-ink-400 mt-0.5 truncate">
                      {getPreview(email)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 메일 상세 모달 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-ink-100">
              <div className="min-w-0">
                <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md mb-2 ${
                  selected.type === 'received'
                    ? 'bg-orange-50 text-orange-500'
                    : 'bg-ink-100 text-ink-600'
                }`}>
                  {selected.type === 'received' ? '받은 메일' : '보낸 메일'}
                </span>
                <h3 className="text-[16px] font-semibold text-ink-900 break-words">
                  {selected.subject}
                </h3>
                <div className="mt-2 text-[12px] text-ink-500 space-y-0.5">
                  {selected.type === 'received' ? (
                    <>
                      <p><strong className="font-semibold">보낸 사람:</strong> {selected.fromName ? `${selected.fromName} <${selected.from}>` : selected.from}</p>
                      <p><strong className="font-semibold">받는 사람:</strong> {selected.to}</p>
                      {selected.cc && <p><strong className="font-semibold">참조:</strong> {selected.cc}</p>}
                      <p><strong className="font-semibold">날짜:</strong> {selected.date ? new Date(selected.date).toLocaleString('ko-KR') : ''}</p>
                    </>
                  ) : (
                    <>
                      <p><strong className="font-semibold">보낸 사람:</strong> {selected.senderEmail}</p>
                      <p><strong className="font-semibold">받는 사람:</strong> {selected.to.join(', ')}</p>
                      {selected.cc && selected.cc.length > 0 && <p><strong className="font-semibold">참조:</strong> {selected.cc.join(', ')}</p>}
                      {selected.bcc && selected.bcc.length > 0 && <p><strong className="font-semibold">숨은 참조:</strong> {selected.bcc.join(', ')}</p>}
                      <p><strong className="font-semibold">날짜:</strong> {new Date(selected.createdAt).toLocaleString('ko-KR')}</p>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-ink-400 hover:text-ink-700 p-1 flex-shrink-0"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 py-5">
              {selected.type === 'received' ? (
                selected.html ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.html) }}
                    className="text-[13px] leading-relaxed text-ink-900 overflow-x-auto [&_img]:max-w-full [&_table]:max-w-full"
                  />
                ) : (
                  <pre className="text-[13px] leading-relaxed text-ink-700 whitespace-pre-wrap break-words font-sans">
                    {selected.text || '(본문 없음)'}
                  </pre>
                )
              ) : (
                <div
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.content) }}
                  className="text-[13px] leading-relaxed text-ink-900 overflow-x-auto [&_img]:max-w-full [&_table]:max-w-full"
                />
              )}
            </div>

            <div className="flex justify-end px-6 py-3 border-t border-ink-100">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-1.5 rounded-lg border border-divider bg-white text-[12px] font-medium text-ink-700 hover:bg-ink-50"
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
