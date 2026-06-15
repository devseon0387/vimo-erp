'use client';
/**
 * 받은 메일함 — 메일 허브(시안 B) 스플릿 뷰.
 *  - md↑ : 목록(360px) + 흰색 리딩 패널, 인라인 빠른 답장(받은 주소로 발신)
 *  - 모바일: 폴더 칩 + 리스트 + 플로팅 쓰기 → 선택 시 풀스크린 상세 + 하단 답장 바,
 *            폴더 전체는 바텀시트
 *  - 폴더 필터: ?box=all|mine|<주소>|unmatched (폴더 패널/칩/시트가 링크)
 *  - 읽음 상태: localStorage(이 브라우저 기준)
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import DOMPurify from 'dompurify';
import {
  AlertCircle, Archive, ArrowLeft, ChevronDown, Inbox, Mail, PenLine,
  RefreshCw, Reply, Search, Send, User, Users, X,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import {
  fetchInbox, getInboxCache, getSeenSet, markSeen, subscribeInbox,
  type InboxData, type InboxEmail,
} from '@/lib/mail/inbox-shared';

const localPart = (addr: string) => addr.split('@')[0];

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

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxView />
    </Suspense>
  );
}

function InboxView() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<InboxData | null>(getInboxCache());
  const [loading, setLoading] = useState(!getInboxCache());
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<InboxEmail | null>(null);
  const [query, setQuery] = useState('');
  const [seenVer, setSeenVer] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    const result = await fetchInbox(force);
    // fetchInbox는 실패 시 캐시(null일 수 있음)를 반환한다. 캐시조차 없으면 로드 실패.
    setError(result === null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsub = subscribeInbox(() => {
      setData(getInboxCache());
      setSeenVer((v) => v + 1);
    });
    load();
    return unsub;
  }, [load]);

  const emails = useMemo(() => data?.emails ?? [], [data]);
  const isAdmin = data?.isAdmin ?? false;
  const myBoxes = useMemo(() => data?.myBoxes ?? [], [data]);
  const myPersonal = useMemo(
    () => myBoxes.filter((b) => b.type === 'personal').map((b) => b.address.toLowerCase()),
    [myBoxes],
  );
  const sharedSource = useMemo(
    () => (isAdmin && data?.sharedBoxes ? data.sharedBoxes : myBoxes.filter((b) => b.type === 'shared')),
    [isAdmin, data, myBoxes],
  );

  // 폴더(박스) 목록 — 칩/시트 공용
  const folderTabs = useMemo(() => {
    const tabs: { key: string; label: string; icon: React.ElementType; amber?: boolean }[] = [
      ...(isAdmin ? [{ key: 'all', label: '전체', icon: Inbox }] : []),
      ...(myPersonal.length > 0 ? [{ key: 'mine', label: '내 메일함', icon: User }] : []),
      ...sharedSource.map((b) => ({
        key: b.address.toLowerCase(),
        label: b.label || localPart(b.address),
        icon: Users,
      })),
      ...(isAdmin ? [{ key: 'unmatched', label: '미분류', icon: Inbox, amber: true }] : []),
    ];
    return tabs;
  }, [isAdmin, myPersonal, sharedSource]);

  const defaultBox = isAdmin ? 'all' : (folderTabs[0]?.key ?? 'mine');
  const box = searchParams.get('box') || defaultBox;

  const setBox = useCallback((key: string) => {
    router.replace(`/mail/inbox?box=${encodeURIComponent(key)}`);
    setSheetOpen(false);
  }, [router]);

  // 필터링 (폴더 + 검색)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return emails.filter((e) => {
      if (box !== 'all') {
        if (box === 'unmatched') {
          if (e.unmatched !== true) return false;
        } else {
          const addrs = (e.boxes ?? []).map((b) => b.address.toLowerCase());
          if (box === 'mine') {
            if (!addrs.some((a) => myPersonal.includes(a))) return false;
          } else if (!addrs.includes(box)) return false;
        }
      }
      if (q) {
        const hay = `${e.fromName} ${e.from} ${e.subject} ${e.preview}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [emails, box, query, myPersonal]);

  const seen = useMemo(() => {
    void seenVer;
    return typeof window !== 'undefined' ? getSeenSet() : new Set<string>();
  }, [seenVer]);

  const select = useCallback((e: InboxEmail) => {
    setSelected(e);
    setReply('');
    markSeen(e.uid);
  }, []);

  const senderDisplay = (e: InboxEmail) => e.fromName || e.from || '(발신자 없음)';

  const boxChip = (e: InboxEmail) => {
    if (e.unmatched) return { text: '미분류', amber: true };
    const first = (e.boxes ?? [])[0];
    return first ? { text: `→ ${localPart(first.address)}@`, amber: false } : null;
  };

  // 빠른 답장 — 발신 주소는 "이 메일이 들어온 박스 중 내가 소유/담당하는 것". 없으면 내 첫 박스.
  // (관리자는 비담당 공용함 메일도 보므로 boxes[0]을 무조건 쓰면 발신권한 없는 주소가 잡혀
  //  send 라우트가 거부 → 답장 실패. 내가 보낼 수 있는 주소로 좁혀 화면=실제 발신을 일치시킨다.)
  const myAddrSet = new Set(myBoxes.map((b) => b.address.toLowerCase()));
  const replyFrom =
    (selected?.boxes ?? []).find((b) => myAddrSet.has(b.address.toLowerCase()))?.address ??
    myBoxes[0]?.address ??
    '';
  const handleReply = useCallback(async () => {
    if (!selected) return;
    const body = reply.trim();
    if (!body) { toast.error('답장 내용을 입력해주세요.'); return; }
    if (!selected.from) { toast.error('발신자 주소를 알 수 없어 답장할 수 없습니다.'); return; }
    setSending(true);
    try {
      const subject = /^re:/i.test(selected.subject) ? selected.subject : `RE: ${selected.subject}`;
      const html = body.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`).join('');
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: [selected.from], subject, content: html, from: replyFrom || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || '답장 발송에 실패했습니다.'); return; }
      toast.success('답장이 발송되었습니다.');
      setReply('');
    } catch {
      toast.error('답장 발송 중 오류가 발생했습니다.');
    } finally {
      setSending(false);
    }
  }, [selected, reply, replyFrom, toast]);

  const activeTab = folderTabs.find((t) => t.key === box);

  // ─── 본문 렌더 (데스크톱 리딩 패널 / 모바일 오버레이 공용) ───
  const readingBody = selected && (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {selected.html ? (
        <div
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.html) }}
          className="text-[13.5px] leading-relaxed text-ink-700 [&_p]:mb-3 max-w-[680px] overflow-x-auto [&_img]:max-w-full [&_table]:max-w-full"
        />
      ) : (
        <pre className="text-[13.5px] leading-relaxed text-ink-700 whitespace-pre-wrap break-words font-sans max-w-[680px]">
          {selected.text || '(본문 없음)'}
        </pre>
      )}
    </div>
  );

  const replyBox = selected && (
    <div className="mx-6 mb-5 bg-white border border-divider rounded-[13px] px-4 py-3 shadow-[0_4px_14px_-8px_rgba(28,25,23,0.12)]">
      <textarea
        ref={replyRef}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder={`${senderDisplay(selected)}님에게 답장 쓰기…`}
        rows={reply ? 4 : 1}
        className="w-full resize-none text-[13px] outline-none placeholder:text-ink-400 leading-relaxed"
      />
      <div className="flex items-center gap-2 mt-2">
        <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-500 text-[10.5px] font-bold">
          보내는 주소 · {replyFrom || '대표 주소'}
        </span>
        <span className="flex-1" />
        <button
          onClick={handleReply}
          disabled={sending}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-orange-500 text-white text-[12px] font-bold hover:bg-orange-600 disabled:bg-ink-300 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={13} />
          {sending ? '발송 중…' : '보내기'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col md:h-[calc(100dvh-9rem)] md:min-h-0">
      {/* ══ 모바일 헤더 + 폴더 칩 (md 미만) ══ */}
      <div className="md:hidden">
        <div className="flex items-center gap-3 px-1 pt-1 pb-3">
          <h1 className="text-page">받은 메일함</h1>
          <span className="flex-1" />
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="w-9 h-9 rounded-lg border border-divider bg-white text-ink-700 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="새로고침"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex gap-1.5 pb-3 overflow-x-auto -mx-1 px-1">
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="메일함 선택"
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-divider bg-white text-[12px] font-bold text-ink-700"
          >
            <Inbox size={13} className="text-orange-500" />
            <ChevronDown size={12} />
          </button>
          {folderTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setBox(t.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${
                box === t.key
                  ? 'bg-orange-500 text-white'
                  : t.amber
                    ? 'bg-white border border-divider text-amber-600'
                    : 'bg-white border border-divider text-ink-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ 스플릿 (md↑: 목록+리딩 / 모바일: 목록만) ══ */}
      <div className="flex-1 min-h-0 flex md:border-t-0">
        {/* 목록 컬럼 */}
        <div className="w-full md:w-[340px] xl:w-[380px] md:flex-shrink-0 md:border-r border-divider bg-white flex flex-col min-h-0 rounded-2xl md:rounded-none border md:border-y-0 md:border-l-0 border-ink-100">
          {/* 목록 헤더 (md↑) */}
          <div className="hidden md:flex items-center gap-2 px-4 pt-4 pb-3">
            <div className="flex-1 flex items-center gap-2 bg-white border border-divider rounded-[10px] px-3 py-2 focus-within:border-orange-400">
              <Search size={13} className="text-ink-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`${activeTab?.label ?? '받은 메일함'} 검색`}
                className="flex-1 text-[12.5px] outline-none placeholder:text-ink-400"
              />
            </div>
            <button
              onClick={() => load(true)}
              disabled={loading}
              className="w-9 h-9 rounded-[10px] border border-divider bg-white text-ink-500 hover:bg-ink-50 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="새로고침"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* 미설정 배너 */}
          {data && !data.configured && (
            <div className="mx-4 mb-3 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
              받은 메일 저장소(SES 수신)가 아직 연결되지 않았습니다.
            </div>
          )}

          {/* 목록 */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {error && emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center px-6 py-12">
                <AlertCircle size={28} className="text-ink-400" />
                <p className="mt-3 text-[13px] font-semibold text-ink-700">메일을 불러오지 못했습니다</p>
                <p className="mt-1 text-[12px] text-ink-400">네트워크 상태를 확인한 뒤 다시 시도해주세요.</p>
                <button
                  onClick={() => load(true)}
                  className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-orange-500 text-white text-[12px] font-bold hover:bg-orange-600 transition-colors"
                >
                  <RefreshCw size={13} />
                  다시 시도
                </button>
              </div>
            ) : loading && emails.length === 0 ? (
              <LoadingState size="compact" />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Mail}
                size="compact"
                title={!isAdmin && myBoxes.length === 0 ? '부여된 메일 주소가 없습니다' : '메일이 없습니다'}
                description={
                  !isAdmin && myBoxes.length === 0
                    ? '아직 부여된 메일 주소가 없습니다. 관리자에게 문의하세요.'
                    : '받은 메일이 여기에 표시됩니다.'
                }
              />
            ) : (
              <ul className="pb-24 md:pb-0">
                {filtered.map((email) => {
                  const unread = !seen.has(email.uid);
                  const sel = selected?.uid === email.uid;
                  const chip = boxChip(email);
                  return (
                    <li key={email.uid}>
                      <button
                        onClick={() => select(email)}
                        className={`w-full flex items-start gap-2.5 px-4 py-3 text-left border-b border-ink-100 transition-colors ${
                          sel ? 'bg-orange-50' : 'hover:bg-ink-50'
                        }`}
                      >
                        <div className="w-[34px] h-[34px] rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-[12.5px] font-extrabold flex-shrink-0">
                          {senderDisplay(email).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            {unread && <span className="w-[7px] h-[7px] rounded-full bg-orange-500 flex-shrink-0 self-center" />}
                            <span className={`text-[12.5px] truncate ${unread ? 'font-extrabold text-ink-900' : 'font-bold text-ink-700'}`}>
                              {senderDisplay(email)}
                            </span>
                            <span className="ml-auto text-[10.5px] text-ink-400 flex-shrink-0">{formatDate(email.date)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                            <span className={`text-[12.5px] truncate ${unread ? 'font-bold text-ink-900' : 'font-semibold text-ink-600'}`}>
                              {email.subject}
                            </span>
                            {chip && (
                              <span className={`flex-shrink-0 px-1.5 py-px rounded text-[10px] font-bold ${
                                chip.amber ? 'bg-amber-50 text-amber-600' : 'bg-ink-100 text-ink-500'
                              }`}>
                                {chip.text}
                              </span>
                            )}
                          </div>
                          <p className="text-[11.5px] text-ink-400 mt-0.5 truncate">{email.preview || '(본문 없음)'}</p>
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
                  <div className="w-[34px] h-[34px] rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-[12.5px] font-extrabold flex-shrink-0">
                    {senderDisplay(selected).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-ink-900 truncate">
                      {selected.fromName ? `${selected.fromName} ` : ''}
                      <span className="font-semibold text-ink-400">&lt;{selected.from}&gt;</span>
                    </div>
                    <div className="text-[11.5px] text-ink-400 mt-px truncate">
                      {selected.boxes?.[0] ? `받은 주소 ${selected.boxes[0].address} · ` : selected.unmatched ? '미분류 · ' : ''}
                      {selected.date ? new Date(selected.date).toLocaleString('ko-KR') : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => replyRef.current?.focus()}
                    className="w-9 h-9 rounded-lg bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600"
                    title="답장"
                  >
                    <Reply size={14} />
                  </button>
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
              {replyBox}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <EmptyState
                icon={Mail}
                title="메일을 선택하세요"
                description="메일을 선택하면 여기에 표시됩니다."
              />
            </div>
          )}
        </div>
      </div>

      {/* ══ 모바일: 플로팅 메일 쓰기 ══ */}
      <Link
        href="/mail/compose"
        className="md:hidden fixed right-5 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40 w-[54px] h-[54px] rounded-[18px] bg-orange-500 text-white flex items-center justify-center shadow-[0_10px_24px_-8px_rgba(249,115,22,0.55)]"
        aria-label="메일 쓰기"
      >
        <PenLine size={21} />
      </Link>

      {/* ══ 모바일: 풀스크린 상세 + 하단 답장 바 ══ */}
      {selected && (
        <div className="md:hidden fixed inset-0 z-[60] bg-white flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-ink-100">
            <button onClick={() => setSelected(null)} aria-label="뒤로" className="w-9 h-9 -ml-1.5 flex items-center justify-center text-ink-700">
              <ArrowLeft size={19} />
            </button>
            <span className="text-[13.5px] font-bold text-ink-500">{activeTab?.label ?? '받은 메일함'}</span>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <h2 className="text-[17px] font-extrabold tracking-[-0.01em] text-ink-900 leading-snug break-words">
              {selected.subject}
            </h2>
            <div className="flex items-center gap-2.5 my-4">
              <div className="w-[34px] h-[34px] rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-[12.5px] font-extrabold flex-shrink-0">
                {senderDisplay(selected).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-ink-900 truncate">{senderDisplay(selected)}</div>
                <div className="text-[11px] text-ink-400">{selected.date ? new Date(selected.date).toLocaleString('ko-KR') : ''}</div>
              </div>
              {selected.boxes?.[0] && (
                <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-500 text-[10.5px] font-bold flex-shrink-0">
                  → {localPart(selected.boxes[0].address)}@
                </span>
              )}
            </div>
            {selected.html ? (
              <div
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.html) }}
                className="text-[13.5px] leading-relaxed text-ink-700 [&_p]:mb-3 overflow-x-auto [&_img]:max-w-full [&_table]:max-w-full"
              />
            ) : (
              <pre className="text-[13.5px] leading-relaxed text-ink-700 whitespace-pre-wrap break-words font-sans">
                {selected.text || '(본문 없음)'}
              </pre>
            )}
          </div>
          <div className="m-3 bg-white border border-divider rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5 shadow-[0_8px_20px_-12px_rgba(28,25,23,0.18)]">
            <span className="flex-shrink-0 px-2 py-0.5 rounded-md bg-orange-50 text-orange-500 text-[10.5px] font-bold">
              {replyFrom ? `${localPart(replyFrom)}@` : '대표'}
            </span>
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="답장 쓰기…"
              className="flex-1 min-w-0 text-[12.5px] outline-none placeholder:text-ink-400"
            />
            <button
              onClick={handleReply}
              disabled={sending}
              className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center flex-shrink-0 disabled:bg-ink-300 disabled:cursor-not-allowed"
              aria-label="보내기"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ══ 모바일: 폴더 바텀시트 ══ */}
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-[70] flex flex-col justify-end" onClick={() => setSheetOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white rounded-t-[22px] px-4 pt-2.5 pb-7 shadow-[0_-12px_36px_-16px_rgba(28,25,23,0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-ink-300 mx-auto mb-3" />
            <div className="text-[14px] font-extrabold px-2 pb-2">메일함</div>
            {folderTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setBox(t.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold ${
                  box === t.key ? 'bg-orange-50 text-orange-500' : t.amber ? 'text-amber-600' : 'text-ink-700'
                }`}
              >
                <t.icon size={16} className={box === t.key ? 'text-orange-500' : t.amber ? 'text-amber-500' : 'text-ink-400'} />
                {t.label}
              </button>
            ))}
            <div className="h-px bg-ink-100 my-2 mx-2" />
            <Link href="/mail/sent" className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold text-ink-700">
              <Send size={16} className="text-ink-400" />보낸 메일함
            </Link>
            <Link href="/mail" className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13.5px] font-semibold text-ink-700">
              <Archive size={16} className="text-ink-400" />전체 메일함
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
