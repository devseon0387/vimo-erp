'use client';

import { useState } from 'react';
import DOMPurify from 'dompurify';
import { Send, Mail, X, AlertCircle } from 'lucide-react';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

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

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday
    ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export default function SentMailPage() {
  // 메일 발송 기록 라우트(/api/mail/sent) 미구현 — 빈 상태 + 배너 안내로 고정
  const [emails] = useState<SentEmail[]>([]);
  const [loading] = useState(false);
  const [selected, setSelected] = useState<SentEmail | null>(null);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-page">보낸 메일함</h1>
        <p className="text-ink-500 mt-1 text-sm">발송한 메일 내역을 확인합니다</p>
      </div>

      {/* 백엔드 미연결 배너 */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
        <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[13px] font-semibold text-amber-900">메일 백엔드 연결 준비 중</p>
          <p className="text-[12px] text-amber-800 mt-0.5">
            발송 기록 조회 API가 아직 구현되지 않아 보낸 메일함을 일시 비활성화했습니다. 후속 릴리스에서 복원됩니다.
          </p>
        </div>
      </div>

      {/* 메일 목록 카드 */}
      <div className="bg-white rounded-2xl border border-ink-100">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-ink-100">
          <Send size={16} className="text-orange-500" />
          <h2 className="text-section">보낸 메일</h2>
          {!loading && emails.length > 0 && (
            <span className="text-[11px] font-semibold text-ink-400">{emails.length}건</span>
          )}
        </div>

        {loading ? (
          <LoadingState size="compact" label="메일을 불러오는 중..." />
        ) : emails.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="보낸 메일이 없습니다"
            description="발송한 메일이 여기에 표시됩니다."
            size="compact"
          />
        ) : (
          <ul>
            {emails.map((email, idx) => (
              <li key={email.id}>
                <button
                  onClick={() => setSelected(email)}
                  className={`w-full flex items-start gap-3 px-6 py-3.5 text-left hover:bg-ink-50 transition-colors ${
                    idx < emails.length - 1 ? 'border-b border-ink-100' : ''
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center flex-shrink-0">
                    <Send size={14} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ink-900 truncate">
                        {email.to.join(', ')}
                      </span>
                      <span className="text-[11px] text-ink-400 flex-shrink-0">
                        {formatDate(email.createdAt)}
                      </span>
                    </div>
                    <p className="text-[13px] font-medium text-ink-700 mt-0.5 truncate">
                      {email.subject}
                    </p>
                    <p className="text-[12px] text-ink-400 mt-0.5 truncate">
                      {email.content.replace(/<[^>]*>/g, '').slice(0, 100) || '(본문 없음)'}
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
                <h3 className="text-[16px] font-semibold text-ink-900 break-words">
                  {selected.subject}
                </h3>
                <div className="mt-2 text-[12px] text-ink-500 space-y-0.5">
                  <p><strong className="font-semibold">보낸 사람:</strong> {selected.senderEmail}</p>
                  <p><strong className="font-semibold">받는 사람:</strong> {selected.to.join(', ')}</p>
                  {selected.cc && selected.cc.length > 0 && <p><strong className="font-semibold">참조:</strong> {selected.cc.join(', ')}</p>}
                  {selected.bcc && selected.bcc.length > 0 && <p><strong className="font-semibold">숨은 참조:</strong> {selected.bcc.join(', ')}</p>}
                  <p><strong className="font-semibold">날짜:</strong> {new Date(selected.createdAt).toLocaleString('ko-KR')}</p>
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
              <div
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.content) }}
                className="text-[13px] leading-relaxed text-ink-900 overflow-x-auto [&_img]:max-w-full [&_table]:max-w-full"
              />
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
