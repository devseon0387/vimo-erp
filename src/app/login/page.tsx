'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { signIn } from 'next-auth/react';
import { APP_VERSION_LABEL } from '@/config/version';

export default function LoginPage() {
  const toast = useToast();
  const [email,      setEmail     ] = useState('');
  const [password,   setPassword  ] = useState('');
  const [showPw,     setShowPw    ] = useState(false);
  const [error,      setError     ] = useState('');
  const [isLoading,  setIsLoading ] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [mounted,    setMounted   ] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [pwFocus,    setPwFocus   ] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('vm_stay_logged_in');
    setRememberMe(saved !== '0');
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      // Auth.js Credentials 로그인 (authorize에서 비번 검증 + 승인/역할 게이트).
      // 미승인/오인증은 보안상 모두 동일 에러로 반환됨.
      const res = await signIn('credentials', { email, password, redirect: false });
      if (!res || res.error) {
        setError('로그인에 실패했습니다. 이메일/비밀번호 또는 승인 상태를 확인해주세요.');
        toast.error('로그인에 실패했습니다.');
        setIsLoading(false);
        return;
      }

      if (rememberMe) localStorage.setItem('vm_stay_logged_in', '1');
      else localStorage.removeItem('vm_stay_logged_in');
      sessionStorage.setItem('vm_active_session', '1');
      sessionStorage.setItem('vm_just_logged_in', '1');

      // needs_password_change 인 경우 미들웨어가 /change-password 로 보냄.
      window.location.href = '/management';
    } catch (err) {
      setError(String(err));
      setIsLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .vm-login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: #fafaf9;
          position: relative;
          overflow: hidden;
        }
        .vm-login-root::before {
          content: '';
          position: absolute;
          top: -40%; right: -20%;
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(249,115,22,0.04) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }
        .vm-login-root::after {
          content: '';
          position: absolute;
          bottom: -30%; left: -15%;
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(249,115,22,0.03) 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
        }
        .vm-login-root * { cursor: default !important; }
        .vm-login-root input { cursor: text !important; }
        .vm-login-root button, .vm-login-root a, .vm-login-root label { cursor: pointer !important; }

        @keyframes logoIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }

        .vm-login-wrapper {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        /* card */
        .vm-card {
          width: 100%;
          background: #ffffff;
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 24px;
          padding: 44px 40px 40px;
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.02),
            0 2px 8px rgba(0,0,0,0.04),
            0 12px 40px rgba(0,0,0,0.06);
        }

        /* floating label input */
        .vm-field {
          position: relative;
          margin-bottom: 14px;
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

        /* submit */
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
        .vm-submit:active:not(:disabled) {
          transform: translateY(0);
        }
        .vm-submit:disabled {
          background: #d6d3d1;
          color: #a8a29e;
        }

        /* spinner */
        @keyframes spin { to { transform: rotate(360deg); } }
        .vm-spinner {
          display: inline-block;
          width: 18px; height: 18px;
          border: 2.5px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        /* checkbox */
        .vm-check {
          width: 18px; height: 18px;
          border-radius: 6px;
          flex-shrink: 0;
          display: flex;
          align-items: center; justify-content: center;
          transition: all 0.2s ease;
        }
        .vm-check.on { background: #f97316; }
        .vm-check.off { background: transparent; border: 1.5px solid #d6cec8; }

        /* error */
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
      `}</style>

      <div className="vm-login-root">
        <div className="vm-login-wrapper">
          {/* 브랜드 타이틀 */}
          <div style={{
            textAlign: 'center',
            marginBottom: '40px',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'none' : 'translateY(-8px)',
            transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1)',
          }}>
            <img
              src="/logo.png?v=2"
              alt="비모 ERP"
              style={{
                width: '120px', height: 'auto',
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
            <form onSubmit={handleSubmit}>
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
              <div className="vm-field" style={{ marginBottom: '20px' }}>
                <div style={{ position: 'relative' }}>
                  <input
                    className="vm-field-input"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setPwFocus(true)}
                    onBlur={() => setPwFocus(false)}
                    required
                    autoComplete="current-password"
                    style={{ paddingRight: '46px' }}
                  />
                  <span className={`vm-field-label ${pwFocus ? 'active' : password ? 'filled' : ''}`}>
                    비밀번호
                  </span>
                  <button type="button" className="vm-pw-toggle" onClick={() => setShowPw(p => !p)} tabIndex={-1}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* 로그인 유지 */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                marginBottom: '24px', userSelect: 'none',
              }}>
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} style={{ display: 'none' }} />
                <div className={`vm-check ${rememberMe ? 'on' : 'off'}`}>
                  {rememberMe && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: '13px', color: '#78716c', fontWeight: 500 }}>로그인 유지</span>
              </label>

              {/* 에러 */}
              {error && (
                <div className="vm-error">
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{error}</span>
                </div>
              )}

              {/* 버튼 */}
              <button type="submit" disabled={isLoading} className="vm-submit">
                {isLoading ? <span className="vm-spinner" /> : <><span>로그인</span><ArrowRight size={16} /></>}
              </button>
            </form>
          </div>

          {/* 하단 안내 + 버전 */}
          <div style={{
            marginTop: '28px',
            textAlign: 'center',
            opacity: mounted ? 1 : 0,
            transition: 'opacity 0.5s ease 0.4s',
          }}>
            <p style={{ fontSize: '13px', color: '#a8a29e', margin: '0 0 6px' }}>
              계정이 필요하시면 관리자에게 문의하세요.
            </p>
            <p style={{ fontSize: '11px', color: '#d6cec8', letterSpacing: '0.03em', margin: 0 }}>
              {APP_VERSION_LABEL}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
