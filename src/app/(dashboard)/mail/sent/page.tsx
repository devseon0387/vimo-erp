'use client';
/**
 * 보낸 메일함 — 받은편지함과 동일한 스플릿 뷰(목록 + 흰색 리딩 패널).
 *  - md↑ : 목록(340~380px) + 리딩 패널. (읽기 전용 — 답장 없음)
 *  - 모바일: 목록 → 선택 시 풀스크린 상세
 *  발송 이력은 GET 전용. 관리자=전사 발송분, 직원=본인+담당 주소 발송분.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { AlertCircle, ArrowLeft, Mail, RefreshCw, Search, Send, X } from 'lucide-react';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { StatusBadge } from '@/components/StatusBadge';
import type { SentEmail } from '@/types';

const localPart = (addr: string) => (addr || '').split('@')[0];

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return '어제';
  return d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

const recipientLabel = (e: SentEmail) => (e.to && e.to.length ? e.to.join(', ') : '(받는사람 없음)');
const stripTags = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export default function SentMailPage() {
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selected, setSelected] = useState<SentEmail | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/mail/sent');
      const d = await res.json();
      if (!res.ok) { setError(true); return; }
      setEmails(Array.isArray(d.emails) ? d.emails : []);
      setIsAdmin(Boolean(d.isAdmin));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return emails;
    return emails.filter((e) => {
      const hay = `${recipientLabel(e)} ${e.senderEmail} ${e.subject} ${stripTags(e.content || '')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [emails, query]);

  // ── 리딩 패널 본문 (데스크톱/모바일 공용) ──
  const readingBody = selected && (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.content || '') }}
        className="text-[13.5px] leading-relaxed text-ink-700 [&_p]:mb-3 max-w-[680px] overflow-x-auto [&_img]:max-w-full [&_table]:max-w-full"
      />
    </div>
  );

  return (
    <div className="flex flex-col md:h-[calc(100dvh-9rem)] md:min-h-0">
      {/* ══ 모바일 헤더 (md 미만) ══ */}
      <div className="md:hidden flex items-center gap-3 px-1 pt-1 pb-3">
        <h1 className="text-page">보낸 메일함</h1>
        <span className="flex-1" />
        <button
          onClick={load}
          disabled={loading}
          className="w-9 h-9 rounded-lg border border-divider bg-white text-ink-700 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="새로고침"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ══ 스플릿 (md↑: 목록+리딩 / 모바일: 목록만) ══ */}
      <div className="flex-1 min-h-0 flex">
        {/* 목록 컬럼 */}
        <div className="w-full md:w-[340px] xl:w-[380px] md:flex-shrink-0 md:border-r border-divider bg-white flex flex-col min-h-0 rounded-2xl md:rounded-none border md:border-y-0 md:border-l-0 border-ink-100">
          {/* 목록 헤더 (md↑) */}
          <div className="hidden md:flex items-center gap-2 px-4 pt-4 pb-3">
            <div className="flex-1 flex items-center gap-2 bg-white border border-divider rounded-[10px] px-3 py-2 focus-within:border-orange-400">
              <Search size={13} className="text-ink-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="보낸 메일 검색"
                className="flex-1 text-[12.5px] outline-none placeholder:text-ink-400"
              />
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="w-9 h-9 rounded-[10px] border border-divider bg-white text-ink-500 hover:bg-ink-50 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="새로고침"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* 목록 */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {error && emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center px-6 py-12">
                <AlertCircle size={28} className="text-ink-400" />
                <p className="mt-3 text-[13px] font-semibold text-ink-700">메일을 불러오지 못했습니다</p>
                <p className="mt-1 text-[12px] text-ink-400">잠시 후 다시 시도해주세요.</p>
                <button
                  onClick={load}
                  className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-orange-500 text-white text-[12px] font-bold hover:bg-orange-600 transition-colors"
                >
                  <RefreshCw size={13} />
                  다시 시도
                </button>
              </div>
            ) : loading && emails.length === 0 ? (
              <LoadingState size="compact" label="메일을 불러오는 중..." />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Mail}
                size="compact"
                title={query ? '검색 결과가 없습니다' : '보낸 메일이 없습니다'}
                description={query ? '다른 검색어로 시도해보세요.' : '발송한 메일이 여기에 표시됩니다.'}
              />
            ) : (
              <ul className="pb-4 md:pb-0">
                {filtered.map((email) => {
                  const sel = selected?.id === email.id;
                  return (
                    <li key={email.id}>
                      <button
                        onClick={() => setSelected(email)}
                        className={`w-full flex items-start gap-2.5 px-4 py-3 text-left border-b border-ink-100 transition-colors ${
                          sel ? 'bg-orange-50' : 'hover:bg-ink-50'
                        }`}
                      >
                        <div className="w-[34px] h-[34px] rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-[12.5px] font-extrabold flex-shrink-0">
                          {recipientLabel(email).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[12.5px] font-bold text-ink-700 truncate">{recipientLabel(email)}</span>
                            <span className="ml-auto text-[10.5px] text-ink-400 flex-shrink-0">{formatDate(email.createdAt)}</span>
                          </div>
                          <div className="text-[12.5px] font-semibold text-ink-600 truncate mt-0.5">{email.subject}</div>
                          <p className="text-[11.5px] text-ink-400 mt-0.5 truncate">{stripTags(email.content || '') || '(본문 없음)'}</p>
                          {isAdmin && (
                            <div className="mt-1.5">
                              <StatusBadge tone="brand">{localPart(email.senderEmail)}@</StatusBadge>
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* 리딩 패널 (md↑, 흰 배경) */}
        <div className="hidden md:flex flex-1 min-w-0 flex-col bg-white">
          {selected ? (
            <>
              <div className="px-6 pt-5 pb-4 border-b border-ink-100">
                <h2 className="text-[16.5px] font-extrabold tracking-[-0.01em] text-ink-900 break-words">
                  {selected.subject}
                </h2>
                <div className="flex items-center gap-2.5 mt-3">
                  <div className="w-[34px] h-[34px] rounded-full bg-orange-50 text-orange-500 flex items-center justify-center flex-shrink-0">
                    <Send size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-ink-900 truncate">
                      보낸 사람 <span className="font-semibold text-ink-400">&lt;{selected.senderEmail}&gt;</span>
                    </div>
                    <div className="text-[11.5px] text-ink-400 mt-px truncate">
                      받는 사람 {recipientLabel(selected)}
                      {selected.cc && selected.cc.length > 0 ? ` · 참조 ${selected.cc.join(', ')}` : ''}
                      {selected.createdAt ? ` · ${new Date(selected.createdAt).toLocaleString('ko-KR')}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="w-9 h-9 rounded-lg border border-divider bg-white text-ink-500 flex items-center justify-center hover:bg-ink-50"
                    title="닫기"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
              {readingBody}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <EmptyState
                icon={Send}
                title="메일을 선택하세요"
                description="보낸 메일을 선택하면 여기에 표시됩니다."
              />
            </div>
          )}
        </div>
      </div>

      {/* ══ 모바일: 풀스크린 상세 ══ */}
      {selected && (
        <div className="md:hidden fixed inset-0 z-[60] bg-white flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-ink-100">
            <button onClick={() => setSelected(null)} aria-label="뒤로" className="w-9 h-9 -ml-1.5 flex items-center justify-center text-ink-700">
              <ArrowLeft size={19} />
            </button>
            <span className="text-[13.5px] font-bold text-ink-500">보낸 메일함</span>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink-900 leading-snug break-words">
              {selected.subject}
            </h2>
            <div className="flex items-center gap-2.5 my-4">
              <div className="w-[34px] h-[34px] rounded-full bg-orange-50 text-orange-500 flex items-center justify-center flex-shrink-0">
                <Send size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-ink-900 truncate">받는 사람 {recipientLabel(selected)}</div>
                <div className="text-[11px] text-ink-400">
                  {localPart(selected.senderEmail)}@ · {selected.createdAt ? new Date(selected.createdAt).toLocaleString('ko-KR') : ''}
                </div>
              </div>
            </div>
            <div
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.content || '') }}
              className="text-[13.5px] leading-relaxed text-ink-700 [&_p]:mb-3 overflow-x-auto [&_img]:max-w-full [&_table]:max-w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
