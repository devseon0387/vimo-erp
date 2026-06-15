'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import DOMPurify from 'dompurify';
import { Mail, Send, AlertCircle, Plus, X, Eye } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

// ProseMirror/tiptap(수백KB)는 작성 화면 진입 즉시가 아니라 에디터가 보일 때 로드.
const RichTextEditor = dynamic(() => import('./_components/RichTextEditor'), {
  ssr: false,
  loading: () => <div className="min-h-[240px] rounded-xl border border-divider bg-gray-50 animate-pulse" />,
});

export default function ComposeMailPage() {
  const toast = useToast();

  // 발송 설정(SES SMTP) — 마운트 시 /api/mail/send GET 으로 확인. 확인 전엔 버튼 disabled.
  const [configured, setConfigured] = useState<boolean>(false);
  const [configChecked, setConfigChecked] = useState<boolean>(false);
  const [senderEmail, setSenderEmail] = useState<string | null>(null);
  const [senderName, setSenderName] = useState<string | null>(null);
  const [senderOptions, setSenderOptions] = useState<{ email: string; label: string; type: 'personal' | 'shared' }[]>([]);
  const [fromEmail, setFromEmail] = useState<string>('');
  const [to, setTo] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [cc, setCc] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState('');
  const [subject, setSubject] = useState('');
  const contentRef = useRef('');
  const [sending, setSending] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // 발송 설정/발신자 로드
  useEffect(() => {
    let cancelled = false;
    fetch('/api/mail/send')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d) return;
        setConfigured(Boolean(d.configured));
        setSenderEmail(d.senderEmail ?? null);
        setSenderName(d.senderName ?? null);
        const opts = Array.isArray(d.senderOptions) ? d.senderOptions : [];
        setSenderOptions(opts);
        if (opts.length > 0) setFromEmail(opts[0].email);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setConfigChecked(true); });
    return () => { cancelled = true; };
  }, []);

  const onContentChange = useCallback((html: string) => {
    contentRef.current = html;
  }, []);
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  const addEmail = useCallback((list: string[], setList: (v: string[]) => void, input: string, setInput: (v: string) => void) => {
    const email = input.trim();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('올바른 이메일 형식이 아닙니다.');
      return;
    }
    if (list.includes(email)) {
      toast.error('이미 추가된 이메일입니다.');
      return;
    }
    setList([...list, email]);
    setInput('');
  }, [toast]);

  const removeEmail = useCallback((list: string[], setList: (v: string[]) => void, email: string) => {
    setList(list.filter(e => e !== email));
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, list: string[], setList: (v: string[]) => void, input: string, setInput: (v: string) => void) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEmail(list, setList, input, setInput);
    }
  }, [addEmail]);

  const handleSend = useCallback(async () => {
    if (to.length === 0) { toast.error('받는 사람을 입력해주세요.'); return; }
    if (!subject.trim()) { toast.error('제목을 입력해주세요.'); return; }
    const content = contentRef.current;
    if (!content.replace(/<[^>]*>/g, '').trim()) { toast.error('본문을 입력해주세요.'); return; }

    setSending(true);
    try {
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          cc: cc.length > 0 ? cc : undefined,
          subject,
          content,
          from: fromEmail || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '이메일 발송에 실패했습니다.');
        return;
      }

      toast.success('이메일이 발송되었습니다.');
      setTo([]);
      setCc([]);
      setSubject('');
      contentRef.current = '';
    } catch {
      toast.error('이메일 발송 중 오류가 발생했습니다.');
    } finally {
      setSending(false);
    }
  }, [to, cc, subject, fromEmail, toast]);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-page">메일 쓰기</h1>
        <p className="text-gray-500 mt-1 text-sm">비모 메일 서버(SES)를 통해 이메일을 발송합니다</p>
      </div>

      {/* 메일 서버 미설정 배너 */}
      {configChecked && configured === false && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-amber-900">메일 서버 설정이 필요합니다</p>
            <p className="text-[12px] text-amber-800 mt-0.5">
              발신 메일 서버(SES)가 아직 설정되지 않아 발송을 일시 비활성화했습니다. 관리자 설정 완료 후 활성화됩니다.
            </p>
          </div>
        </div>
      )}

      {/* 작성 폼 카드 */}
      <div className="bg-white rounded-2xl border border-ink-100">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-[#f8f7f6]">
          <Mail size={16} className="text-orange-500" />
          <h2 className="text-section">이메일 작성</h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* 보내는 주소 — 부여된 개인 주소 + 담당 공용함 */}
          {senderOptions.length > 0 && (
            <div>
              <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">
                보내는 주소
              </label>
              <select
                value={fromEmail}
                onChange={e => setFromEmail(e.target.value)}
                className="w-full px-3 py-2 border border-divider rounded-lg text-[13px] outline-none focus:border-orange-400 bg-white"
              >
                {senderOptions.map(o => (
                  <option key={o.email} value={o.email}>
                    {o.label !== o.email ? `${o.label} <${o.email}>` : o.email}
                    {o.type === 'shared' ? ' — 공용' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 받는 사람 */}
          <div>
            <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">
              받는 사람 <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5 px-3 py-2 border border-divider rounded-lg min-h-[40px] items-center focus-within:border-orange-400">
              {to.map(email => (
                <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 text-orange-500 text-[12px]">
                  {email}
                  <button
                    onClick={() => removeEmail(to, setTo, email)}
                    className="text-orange-500 hover:text-orange-700"
                    aria-label="제거"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                type="email"
                value={toInput}
                onChange={e => setToInput(e.target.value)}
                onKeyDown={e => handleKeyDown(e, to, setTo, toInput, setToInput)}
                onBlur={() => { if (toInput.trim()) addEmail(to, setTo, toInput, setToInput); }}
                placeholder={to.length === 0 ? '이메일 주소 입력 후 Enter' : ''}
                className="flex-1 min-w-[150px] text-[13px] outline-none bg-transparent"
              />
            </div>
            {!showCc && (
              <button
                onClick={() => setShowCc(true)}
                className="mt-1.5 flex items-center gap-1 text-[11px] text-[#78716c] hover:text-[#44403c]"
              >
                <Plus size={11} /> 참조 추가
              </button>
            )}
          </div>

          {/* 참조 */}
          {showCc && (
            <div>
              <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">
                참조 (CC)
              </label>
              <div className="flex flex-wrap gap-1.5 px-3 py-2 border border-divider rounded-lg min-h-[40px] items-center focus-within:border-orange-400">
                {cc.map(email => (
                  <span key={email} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--color-ink-100)] text-[#44403c] text-[12px]">
                    {email}
                    <button
                      onClick={() => removeEmail(cc, setCc, email)}
                      className="text-[#78716c] hover:text-[#44403c]"
                      aria-label="제거"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  type="email"
                  value={ccInput}
                  onChange={e => setCcInput(e.target.value)}
                  onKeyDown={e => handleKeyDown(e, cc, setCc, ccInput, setCcInput)}
                  onBlur={() => { if (ccInput.trim()) addEmail(cc, setCc, ccInput, setCcInput); }}
                  placeholder={cc.length === 0 ? '참조 이메일 입력 후 Enter' : ''}
                  className="flex-1 min-w-[150px] text-[13px] outline-none bg-transparent"
                />
              </div>
            </div>
          )}

          {/* 제목 */}
          <div>
            <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">
              제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="이메일 제목을 입력하세요"
              className="w-full px-3 py-2 border border-divider rounded-lg text-[13px] outline-none focus:border-orange-400"
            />
          </div>

          {/* 본문 */}
          <div>
            <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">
              본문 <span className="text-red-500">*</span>
            </label>
            <RichTextEditor onChangeRef={onContentChangeRef} />
          </div>
        </div>

        {/* 미리보기 / 발송 버튼 */}
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-[#f8f7f6]">
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-divider bg-white text-[13px] font-semibold text-[#44403c] hover:bg-[#fafaf9]"
          >
            <Eye size={14} />
            미리보기
          </button>
          <button
            onClick={handleSend}
            disabled={sending || configured === false}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 text-white text-[13px] font-semibold hover:bg-orange-600 disabled:bg-[var(--color-ink-300)] disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
            {sending ? '발송 중...' : '이메일 발송'}
          </button>
        </div>
      </div>

      {/* 미리보기 모달 */}
      {showPreview && (
        <div
          onClick={() => setShowPreview(false)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#f8f7f6]">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-orange-500" />
                <span className="text-[14px] font-semibold text-[#1c1917]">메일 미리보기</span>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="text-[#a8a29e] hover:text-[#44403c] p-1"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-1 text-[12px] text-[#57534e] mb-4">
                <div><strong className="font-semibold text-[#44403c]">보낸 사람:</strong> {senderName ? `${senderName} <${senderEmail}>` : senderEmail || <span className="text-[#a8a29e]">알 수 없음</span>}</div>
                <div><strong className="font-semibold text-[#44403c]">받는 사람:</strong> {to.length > 0 ? to.join(', ') : <span className="text-[#a8a29e]">없음</span>}</div>
                <div><strong className="font-semibold text-[#44403c]">참조:</strong> {cc.length > 0 ? cc.join(', ') : <span className="text-[#a8a29e]">없음</span>}</div>
                <div><strong className="font-semibold text-[#44403c]">제목:</strong> {subject || <span className="text-[#a8a29e]">없음</span>}</div>
              </div>

              <div className="h-px bg-[#f8f7f6] mb-4" />

              <div
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contentRef.current || '<p style="color:#a8a29e">본문이 비어있습니다.</p>') }}
                className="text-[13px] leading-relaxed text-[#1c1917]"
              />
            </div>

            <div className="flex justify-end px-6 py-3 border-t border-[#f8f7f6]">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-1.5 rounded-lg border border-divider bg-white text-[12px] font-semibold text-[#44403c] hover:bg-[#fafaf9]"
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
