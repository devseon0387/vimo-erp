'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, Eye, EyeOff, ArrowRight, Check } from 'lucide-react';

export default function PartnerSignupPage() {
  const [email,     setEmail    ] = useState('');
  const [password,  setPassword ] = useState('');
  const [name,      setName     ] = useState('');
  const [showPw,    setShowPw   ] = useState(false);
  const [error,     setError    ] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agreed,    setAgreed   ] = useState(false);
  const [mounted,   setMounted  ] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [pwFocus,    setPwFocus   ] = useState(false);
  const [nameFocus,  setNameFocus ] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const passwordOk = password.length >= 8;
  const canSubmit = email && passwordOk && name.trim() && agreed && !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!canSubmit) return;
    setIsLoading(true);

    // TODO: 백엔드 연결
    // supabase.auth.signUp({
    //   email, password,
    //   options: { data: { app_source: 'partner_erp', name } }
    // })
    await new Promise(r => setTimeout(r, 800));
    setError('가입 처리는 아직 연결되지 않았습니다. (백엔드 대기)');
    setIsLoading(false);
  };

  return (
    <>
      <style>{`
        .vm-signup-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: #fafaf9;
          position: relative;
          overflow: hidden;
        }
        .vm-signup-root::before {
          content: '';
          position: absolute;
          top: -40%; right: -20%;
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(249,115,22,0.04) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }
        .vm-signup-root::after {
          content: '';
          position: absolute;
          bottom: -30%; left: -15%;
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(249,115,22,0.03) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }
        .vm-signup-root * { cursor: default !important; }
        .vm-signup-root input { cursor: text !important; }
        .vm-signup-root button, .vm-signup-root a, .vm-signup-root label { cursor: pointer !important; }

        @keyframes logoIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }

        .vm-signup-wrapper {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 440px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .vm-card {
          width: 100%;
          background: #ffffff;
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 24px;
          padding: 40px 40px 36px;
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.02),
            0 2px 8px rgba(0,0,0,0.04),
            0 12px 40px rgba(0,0,0,0.06);
        }

        .vm-card-head {
          margin-bottom: 28px;
        }
        .vm-card-eyebrow {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          color: #f97316;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .vm-card-title {
          font-size: 22px;
          font-weight: 700;
          color: #1c1917;
          letter-spacing: -0.01em;
          margin: 0 0 6px;
        }
        .vm-card-sub {
          font-size: 13px;
          color: #78716c;
          line-height: 1.55;
          margin: 0;
        }

        .vm-field {
          position: relative;
          margin-bottom: 12px;
        }
        .vm-field-input {
          width: 100%;
          padding: 22px 16px 10px;
          background: #f8f7f6;
          border: 1.5px solid transparent;
          border-radius: 14px;
          font-size: 15px;
          color: #1c1917;
          font-family: inherit;
          outline: none;
          transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
          box-sizing: border-box;
        }
        .vm-field-input:focus {
          background: #ffffff;
          border-color: #f97316;
          box-shadow: 0 0 0 4px rgba(249,115,22,0.06);
        }
        .vm-field-label {
          position: absolute;
          left: 17px; top: 50%;
          transform: translateY(-50%);
          font-size: 14px;
          color: #a8a29e;
          pointer-events: none;
          transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
        }
        .vm-field-label.active {
          top: 14px; transform: translateY(0);
          font-size: 10px; font-weight: 600;
          color: #f97316; letter-spacing: 0.06em;
        }
        .vm-field-label.filled {
          top: 14px; transform: translateY(0);
          font-size: 10px; font-weight: 600;
          color: #a8a29e; letter-spacing: 0.06em;
        }

        .vm-pw-toggle {
          position: absolute;
          right: 14px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none;
          padding: 4px;
          color: #c4b5a5;
          display: flex; align-items: center;
          transition: color 0.15s;
        }
        .vm-pw-toggle:hover { color: #78716c; }

        .vm-hint {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 4px;
          margin: 6px 0 18px;
          font-size: 12px;
          color: #a8a29e;
          transition: color 0.2s ease;
        }
        .vm-hint.ok { color: #16a34a; }
        .vm-hint-dot {
          width: 14px; height: 14px;
          border-radius: 50%;
          background: #e7e5e4;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s ease;
        }
        .vm-hint.ok .vm-hint-dot { background: #16a34a; }

        .vm-agree {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 22px;
          padding: 12px 14px;
          background: #f8f7f6;
          border-radius: 12px;
          user-select: none;
        }
        .vm-check {
          width: 18px; height: 18px;
          border-radius: 6px;
          flex-shrink: 0;
          margin-top: 1px;
          display: flex;
          align-items: center; justify-content: center;
          transition: all 0.2s ease;
        }
        .vm-check.on  { background: #f97316; }
        .vm-check.off { background: #ffffff; border: 1.5px solid #d6cec8; }

        .vm-agree-text {
          font-size: 12.5px;
          color: #57534e;
          line-height: 1.55;
        }
        .vm-agree-text a {
          color: #f97316;
          font-weight: 600;
          text-decoration: none;
        }

        .vm-submit {
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 600;
          font-family: inherit;
          color: #fff;
          background: linear-gradient(135deg, #f97316 0%, #dc2626 100%);
          transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .vm-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(249,115,22,0.25);
        }
        .vm-submit:active:not(:disabled) { transform: translateY(0); }
        .vm-submit:disabled {
          background: #e7e5e4;
          color: #a8a29e;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        .vm-spinner {
          display: inline-block;
          width: 18px; height: 18px;
          border: 2.5px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(2px); }
        }
        .vm-error {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 14px 16px;
          border-radius: 14px;
          margin-bottom: 16px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          font-size: 13px;
          color: #dc2626;
          animation: shake 0.4s ease;
        }

        .vm-footer {
          margin-top: 22px;
          text-align: center;
          font-size: 13px;
          color: #78716c;
        }
        .vm-footer a {
          color: #1c1917;
          font-weight: 600;
          text-decoration: none;
          margin-left: 4px;
        }
        .vm-footer a:hover { color: #f97316; }
      `}</style>

      <div className="vm-signup-root">
        <div className="vm-signup-wrapper">
          {/* 브랜드 */}
          <div style={{
            textAlign: 'center',
            marginBottom: '32px',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'none' : 'translateY(-8px)',
            transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <img
              src="/logo.png?v=2"
              alt="비모 파트너"
              style={{
                width: '108px', height: 'auto',
                display: 'block',
                margin: '0 auto',
                animation: mounted ? 'logoIn 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both' : 'none',
              }}
            />
          </div>

          {/* 카드 */}
          <div className="vm-card" style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(20px)',
            transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1) 0.12s',
          }}>
            <div className="vm-card-head">
              <div className="vm-card-eyebrow">Partner Sign Up</div>
              <h1 className="vm-card-title">파트너 계정 만들기</h1>
              <p className="vm-card-sub">
                비모와 함께하는 협력 스튜디오·프리랜서를 위한 전용 워크스페이스입니다.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              {/* 이름 */}
              <div className="vm-field">
                <input
                  className="vm-field-input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onFocus={() => setNameFocus(true)}
                  onBlur={() => setNameFocus(false)}
                  required
                  autoComplete="name"
                />
                <span className={`vm-field-label ${nameFocus ? 'active' : name ? 'filled' : ''}`}>
                  이름
                </span>
              </div>

              {/* 이메일 */}
              <div className="vm-field">
                <input
                  className="vm-field-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={() => setEmailFocus(true)}
                  onBlur={() => setEmailFocus(false)}
                  required
                  autoComplete="email"
                />
                <span className={`vm-field-label ${emailFocus ? 'active' : email ? 'filled' : ''}`}>
                  이메일 주소
                </span>
              </div>

              {/* 비밀번호 */}
              <div className="vm-field">
                <input
                  className="vm-field-input"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setPwFocus(true)}
                  onBlur={() => setPwFocus(false)}
                  required
                  autoComplete="new-password"
                  style={{ paddingRight: '46px' }}
                />
                <span className={`vm-field-label ${pwFocus ? 'active' : password ? 'filled' : ''}`}>
                  비밀번호
                </span>
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

              {/* 약관 */}
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
                    가입하기
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="vm-footer">
            이미 계정이 있으신가요?
            <a href="/login">로그인</a>
          </div>
        </div>
      </div>
    </>
  );
}
