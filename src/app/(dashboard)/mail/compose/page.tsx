'use client';

import { useState, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { Mail, Send, AlertCircle, Plus, X, Eye } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import RichTextEditor from './_components/RichTextEditor';

export default function ComposeMailPage() {
  const toast = useToast();

  // 메일 발송 라우트(/api/hiworks/send-mail) 미구현 — 미연결로 고정해 발송 버튼 disabled
  const [configured] = useState<boolean>(false);
  const [senderEmail] = useState<string | null>(null);
  const [senderName] = useState<string | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [toInput, setToInput] = useState('');
  const [cc, setCc] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState('');
  const [subject, setSubject] = useState('');
  const contentRef = useRef('');
  const [sending, setSending] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

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
      const res = await fetch('/api/hiworks/send-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          cc: cc.length > 0 ? cc : undefined,
          subject,
          content,
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
  }, [to, cc, subject, toast]);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }} className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">메일 쓰기</h1>
        <p className="text-gray-500 mt-2">하이웍스를 통해 이메일을 발송합니다.</p>
      </div>

      {/* 메일 백엔드 미연결 배너 */}
      {configured === false && (
        <div className="flex items-start gap-3 p-4 rounded-lg" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
          <AlertCircle size={20} style={{ color: '#d97706', flexShrink: 0, marginTop: '1px' }} />
          <div>
            <p style={{ fontWeight: 600, color: '#92400e', fontSize: '14px' }}>메일 백엔드 연결 준비 중</p>
            <p style={{ color: '#a16207', fontSize: '13px', marginTop: '4px' }}>
              메일 발송 API가 아직 구현되지 않아 발송 버튼을 일시 비활성화했습니다. 후속 릴리스에서 복원됩니다.
            </p>
          </div>
        </div>
      )}

      {/* 이메일 작성 폼 */}
      <div className="bg-white rounded-lg shadow" style={{ border: '1px solid #ede9e6' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0ece9' }}>
          <div className="flex items-center gap-2">
            <Mail size={20} style={{ color: '#f97316' }} />
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1c1917' }}>이메일 작성</h2>
          </div>
        </div>

        <div style={{ padding: '24px' }} className="space-y-5">
          {/* 받는 사람 */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#44403c', marginBottom: '6px' }}>
              받는 사람 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 12px', border: '1px solid #d6d3d1', borderRadius: '8px', minHeight: '42px', alignItems: 'center' }}>
              {to.map(email => (
                <span key={email} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: '#fef4ed', color: '#f97316', borderRadius: '6px', fontSize: '13px' }}>
                  {email}
                  <button onClick={() => removeEmail(to, setTo, email)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: '#f97316', display: 'flex' }}>
                    <X size={14} />
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
                style={{ border: 'none', outline: 'none', flex: 1, minWidth: '150px', fontSize: '14px', padding: '2px 0' }}
              />
            </div>
            {!showCc && (
              <button onClick={() => setShowCc(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#78716c', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Plus size={12} /> 참조 추가
              </button>
            )}
          </div>

          {/* 참조 */}
          {showCc && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#44403c', marginBottom: '6px' }}>
                참조 (CC)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px 12px', border: '1px solid #d6d3d1', borderRadius: '8px', minHeight: '42px', alignItems: 'center' }}>
                {cc.map(email => (
                  <span key={email} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: '#f5f3f1', color: '#44403c', borderRadius: '6px', fontSize: '13px' }}>
                    {email}
                    <button onClick={() => removeEmail(cc, setCc, email)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: '#78716c', display: 'flex' }}>
                      <X size={14} />
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
                  style={{ border: 'none', outline: 'none', flex: 1, minWidth: '150px', fontSize: '14px', padding: '2px 0' }}
                />
              </div>
            </div>
          )}

          {/* 제목 */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#44403c', marginBottom: '6px' }}>
              제목 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="이메일 제목을 입력하세요"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d6d3d1', borderRadius: '8px', fontSize: '14px', outline: 'none' }}
            />
          </div>

          {/* 본문 */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#44403c', marginBottom: '6px' }}>
              본문 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <RichTextEditor onChangeRef={onContentChangeRef} />
          </div>
        </div>

        {/* 미리보기 / 발송 버튼 */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f0ece9', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            onClick={() => setShowPreview(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              borderRadius: '8px',
              border: '1px solid #d6d3d1',
              cursor: 'pointer',
              background: '#ffffff',
              color: '#44403c',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'background 0.15s',
            }}
          >
            <Eye size={16} />
            미리보기
          </button>
          <button
            onClick={handleSend}
            disabled={sending || configured === false}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: sending || configured === false ? 'not-allowed' : 'pointer',
              background: sending || configured === false ? '#d6d3d1' : '#f97316',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'background 0.15s',
            }}
          >
            <Send size={16} />
            {sending ? '발송 중...' : '이메일 발송'}
          </button>
        </div>
      </div>

      {/* 미리보기 모달 */}
      {showPreview && (
        <div
          onClick={() => setShowPreview(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
          >
            {/* 모달 헤더 */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0ece9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={18} style={{ color: '#f97316' }} />
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#1c1917' }}>메일 미리보기</span>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#78716c', display: 'flex', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* 모달 본문 */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {/* 메타 정보 */}
              <div style={{ marginBottom: '16px', fontSize: '13px', color: '#57534e', lineHeight: '1.8' }}>
                <div><strong style={{ color: '#44403c' }}>보낸 사람:</strong> {senderName ? `${senderName} <${senderEmail}>` : senderEmail || <span style={{ color: '#a8a29e' }}>알 수 없음</span>}</div>
                <div><strong style={{ color: '#44403c' }}>받는 사람:</strong> {to.length > 0 ? to.join(', ') : <span style={{ color: '#a8a29e' }}>없음</span>}</div>
                <div><strong style={{ color: '#44403c' }}>참조:</strong> {cc.length > 0 ? cc.join(', ') : <span style={{ color: '#a8a29e' }}>없음</span>}</div>
                <div><strong style={{ color: '#44403c' }}>제목:</strong> {subject || <span style={{ color: '#a8a29e' }}>없음</span>}</div>
              </div>

              <div style={{ height: '1px', background: '#f0ece9', margin: '0 0 16px' }} />

              {/* 본문 미리보기 */}
              <div
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(contentRef.current || '<p style="color:#a8a29e">본문이 비어있습니다.</p>') }}
                style={{ fontSize: '14px', lineHeight: '1.6', color: '#1c1917' }}
              />
            </div>

            {/* 모달 푸터 */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f0ece9', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowPreview(false)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: '1px solid #d6d3d1',
                  background: '#ffffff',
                  color: '#44403c',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
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
