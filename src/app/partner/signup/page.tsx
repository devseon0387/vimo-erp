'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, ArrowRight, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function PartnerSignupPage() {
  const router = useRouter();
  const [email,        setEmail       ] = useState('');
  const [password,     setPassword    ] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name,         setName        ] = useState('');
  const [showPw,       setShowPw      ] = useState(false);
  const [error,        setError       ] = useState('');
  const [isLoading,    setIsLoading   ] = useState(false);
  const [agreed,       setAgreed      ] = useState(false);
  const [mounted,      setMounted     ] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const passwordOk = password.length >= 8;
  const passwordMatch = passwordConfirm.length > 0 && password === passwordConfirm;
  const canSubmit = email && passwordOk && passwordMatch && name.trim() && agreed && !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!canSubmit) return;
    setIsLoading(true);

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          app_source: 'partner_erp',
          name: name.trim(),
        },
      },
    });

    if (signUpError) {
      // 메시지 한글화
      const msg = signUpError.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('user already')) {
        setError('이미 가입된 이메일입니다. 로그인해주세요.');
      } else if (msg.includes('password')) {
        setError('비밀번호가 조건을 충족하지 않습니다. 8자 이상으로 다시 입력해주세요.');
      } else if (msg.includes('email')) {
        setError('이메일 형식이 올바르지 않습니다.');
      } else {
        setError(`가입에 실패했습니다. ${signUpError.message}`);
      }
      setIsLoading(false);
      return;
    }

    // 이메일 확인 OFF 설정이면 즉시 세션이 생성됨 → 환영 페이지로
    router.push('/welcome');
  };

  return (
    <>
      <style>{`
        .vm-signup-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          background: #ffffff;
          color: #18181b;
          font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .vm-signup-root * { cursor: default; }
        .vm-signup-root input { cursor: text; }
        .vm-signup-root button, .vm-signup-root a, .vm-signup-root label { cursor: pointer; }

        .vm-wrap {
          width: 100%;
          max-width: 420px;
        }

        .vm-head {
          margin-bottom: 44px;
        }
        .vm-mark {
          display: inline-block;
          width: 32px;
          height: 4px;
          background: linear-gradient(135deg, #f97316 0%, #dc2626 100%);
          border-radius: 2px;
          margin-bottom: 28px;
        }
        .vm-title {
          font-size: 30px;
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.15;
          margin: 0 0 12px;
          color: #18181b;
        }
        .vm-sub {
          font-size: 14px;
          color: #71717a;
          line-height: 1.6;
          margin: 0;
        }

        .vm-field {
          margin-bottom: 24px;
        }
        .vm-field-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #71717a;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .vm-field-input-wrap {
          position: relative;
        }
        .vm-field-input {
          width: 100%;
          padding: 12px 0;
          background: transparent;
          border: none;
          border-bottom: 1.5px solid #e4e4e7;
          font-size: 16px;
          color: #18181b;
          font-family: inherit;
          font-weight: 500;
          outline: none;
          transition: border-color 0.25s;
          box-sizing: border-box;
        }
        .vm-field-input::placeholder {
          color: #a1a1aa;
          font-weight: 400;
        }
        .vm-field-input:focus {
          border-bottom-color: #f97316;
        }
        .vm-pw-toggle {
          position: absolute;
          right: 0; top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          padding: 4px;
          color: #a1a1aa;
          display: flex;
          align-items: center;
          transition: color 0.15s;
        }
        .vm-pw-toggle:hover { color: #52525b; }

        .vm-hint {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          font-size: 12px;
          color: #a1a1aa;
        }
        .vm-hint-dot {
          width: 14px; height: 14px;
          border-radius: 50%;
          background: #e4e4e7;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        .vm-hint.ok { color: #16a34a; }
        .vm-hint.ok .vm-hint-dot { background: #16a34a; }
        .vm-hint.err { color: #dc2626; }
        .vm-hint.err .vm-hint-dot { background: #fecaca; }

        .vm-agree {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin: 32px 0 24px;
          user-select: none;
        }
        .vm-check {
          width: 18px; height: 18px;
          border-radius: 5px;
          flex-shrink: 0;
          margin-top: 1px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .vm-check.on  { background: linear-gradient(135deg, #f97316 0%, #dc2626 100%); }
        .vm-check.off { background: #ffffff; border: 1.5px solid #d4d4d8; }
        .vm-agree-text {
          font-size: 13px;
          color: #52525b;
          line-height: 1.55;
        }
        .vm-agree-text a {
          color: #18181b;
          font-weight: 600;
          text-decoration: none;
          border-bottom: 1px solid #e4e4e7;
          transition: border-color 0.2s;
        }
        .vm-agree-text a:hover { border-bottom-color: #f97316; }

        .vm-submit {
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          font-family: inherit;
          color: #ffffff;
          background: linear-gradient(135deg, #f97316 0%, #dc2626 100%);
          transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .vm-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(249,115,22,0.22);
        }
        .vm-submit:active:not(:disabled) { transform: translateY(0); }
        .vm-submit:disabled {
          background: #e4e4e7;
          color: #a1a1aa;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        .vm-spinner {
          display: inline-block;
          width: 18px; height: 18px;
          border: 2.5px solid rgba(255,255,255,0.35);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-5px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(2px); }
        }
        .vm-error {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 10px;
          margin-bottom: 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          font-size: 13px;
          color: #dc2626;
          animation: shake 0.4s ease;
        }

        .vm-foot {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #f4f4f5;
          font-size: 13px;
          color: #71717a;
          text-align: center;
        }
        .vm-foot a {
          color: #18181b;
          font-weight: 600;
          text-decoration: none;
          margin-left: 4px;
        }
        .vm-foot a:hover { color: #f97316; }
      `}</style>

      <div className="vm-signup-root">
        <div className="vm-wrap" style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(12px)',
          transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <div className="vm-head">
            <span className="vm-mark"></span>
            <h1 className="vm-title">파트너 계정<br/>만들기</h1>
            <p className="vm-sub">하나의 계정으로 비박스, 비모 파트너 ERP 등 모든 파트너 서비스를 사용합니다.</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="vm-field">
              <label className="vm-field-label">이름</label>
              <div className="vm-field-input-wrap">
                <input
                  className="vm-field-input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="홍길동"
                  required
                  autoComplete="name"
                />
              </div>
            </div>

            <div className="vm-field">
              <label className="vm-field-label">이메일</label>
              <div className="vm-field-input-wrap">
                <input
                  className="vm-field-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="vm-field">
              <label className="vm-field-label">비밀번호</label>
              <div className="vm-field-input-wrap">
                <input
                  className="vm-field-input"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="8자 이상"
                  required
                  autoComplete="new-password"
                  style={{ paddingRight: '36px' }}
                />
                <button type="button" className="vm-pw-toggle" onClick={() => setShowPw(p => !p)} tabIndex={-1}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className={`vm-hint ${passwordOk ? 'ok' : ''}`}>
                <span className="vm-hint-dot">
                  {passwordOk && <Check size={10} color="#fff" strokeWidth={3} />}
                </span>
                <span>8자 이상</span>
              </div>
            </div>

            <div className="vm-field">
              <label className="vm-field-label">비밀번호 확인</label>
              <div className="vm-field-input-wrap">
                <input
                  className="vm-field-input"
                  type={showPw ? 'text' : 'password'}
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                  placeholder="비밀번호 다시 입력"
                  required
                  autoComplete="new-password"
                />
              </div>
              {passwordConfirm.length > 0 && (
                <div className={`vm-hint ${passwordMatch ? 'ok' : 'err'}`}>
                  <span className="vm-hint-dot">
                    {passwordMatch && <Check size={10} color="#fff" strokeWidth={3} />}
                  </span>
                  <span>{passwordMatch ? '일치' : '비밀번호가 일치하지 않습니다'}</span>
                </div>
              )}
            </div>

            <label className="vm-agree">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                style={{ display: 'none' }}
              />
              <div className={`vm-check ${agreed ? 'on' : 'off'}`}>
                {agreed && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="vm-agree-text">
                <a href="/terms" target="_blank" rel="noopener">이용약관</a> 및{' '}
                <a href="/privacy" target="_blank" rel="noopener">개인정보처리방침</a>에 동의합니다.
              </span>
            </label>

            {error && (
              <div className="vm-error">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="vm-submit" disabled={!canSubmit}>
              {isLoading ? (
                <span className="vm-spinner" />
              ) : (
                <>
                  계정 만들기
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="vm-foot">
            이미 계정이 있으신가요?
            <a href="/login">로그인</a>
          </div>
        </div>
      </div>
    </>
  );
}
