'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Box, Briefcase, LogOut, Clock } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { getSessionUser } from '@/lib/auth/session-info';
import { getPartnerWelcomeData } from './actions';

type PartnerStatus = 'pending' | 'active' | 'unknown';

export default function PartnerWelcomePage() {
  const router = useRouter();
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [status, setStatus] = useState<PartnerStatus>('unknown');
  const [viboxEnabled, setViboxEnabled] = useState(false);
  const [viboxOpening, setViboxOpening] = useState(false);
  const [viboxError, setViboxError] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await getSessionUser();
      if (!u) {
        router.replace('/signup');
        return;
      }
      setName(u.name ?? u.email?.split('@')[0] ?? '');
      setEmail(u.email ?? '');

      const welcome = await getPartnerWelcomeData();
      setStatus((welcome?.status as PartnerStatus | undefined) ?? 'unknown');
      setViboxEnabled(welcome?.viboxEnabled ?? false);
      requestAnimationFrame(() => setMounted(true));
    })();
  }, [router]);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.replace('/signup');
  };

  const handleOpenVibox = async () => {
    if (viboxOpening) return;
    setViboxError('');
    setViboxOpening(true);
    // 팝업 차단 우회: 사용자 제스처 안에서 미리 탭을 연 뒤, fetch 후 URL 설정
    const popup = window.open('about:blank', '_blank', 'noopener');
    try {
      const res = await fetch('/api/partner/vibox-handoff', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `handoff 실패 (${res.status})`);
      }
      const { token, exchangeUrl } = (await res.json()) as {
        token: string;
        exchangeUrl: string;
      };
      // SameSite=Lax + 3rd-party cookie 차단 환경 대비: top-level GET 으로 vibox 직행.
      // vibox 가 token 을 검증 후 세션 쿠키 설정하고 / 로 리다이렉트.
      const ssoUrl = `${exchangeUrl}?token=${encodeURIComponent(token)}`;
      if (popup) {
        popup.location.href = ssoUrl;
      } else {
        window.location.href = ssoUrl;
      }
    } catch (err) {
      popup?.close();
      setViboxError(err instanceof Error ? err.message : '비박스 열기에 실패했습니다.');
    } finally {
      setViboxOpening(false);
    }
  };

  const isPending = status === 'pending' || status === 'unknown';

  return (
    <>
      <style>{`
        .pw-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          background: #ffffff;
          color: #18181b;
          font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .pw-root * { cursor: default; }
        .pw-root button, .pw-root a.active { cursor: pointer; }

        .pw-wrap { width: 100%; max-width: 540px; }

        .pw-mark {
          display: inline-block;
          width: 32px;
          height: 4px;
          background: linear-gradient(135deg, #f97316 0%, #dc2626 100%);
          border-radius: 2px;
          margin-bottom: 28px;
        }
        .pw-title {
          font-size: 30px;
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.2;
          margin: 0 0 10px;
        }
        .pw-title em {
          font-style: normal;
          background: linear-gradient(135deg, #f97316 0%, #dc2626 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .pw-sub {
          font-size: 14px;
          color: #71717a;
          line-height: 1.65;
          margin: 0 0 28px;
        }

        .pw-pending-banner {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px 18px;
          background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
          border: 1px solid #fed7aa;
          border-radius: 14px;
          margin-bottom: 24px;
        }
        .pw-pending-icon {
          width: 36px; height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #f97316 0%, #dc2626 100%);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pw-pending-body {
          flex: 1;
          min-width: 0;
        }
        .pw-pending-name {
          font-size: 14px;
          font-weight: 700;
          color: #18181b;
          margin-bottom: 4px;
        }
        .pw-pending-desc {
          font-size: 13px;
          color: #57534e;
          line-height: 1.6;
        }

        .pw-cards {
          display: grid;
          gap: 12px;
          margin-bottom: 28px;
        }
        .pw-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 18px 20px;
          background: #fafaf9;
          border: 1px solid #e4e4e7;
          border-radius: 14px;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s;
        }
        .pw-card.active:hover {
          background: #ffffff;
          border-color: #d4d4d8;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.04);
        }
        .pw-card.disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .pw-card-icon {
          width: 44px; height: 44px;
          border-radius: 11px;
          background: #ffffff;
          border: 1px solid #e4e4e7;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #18181b;
        }
        .pw-card.active .pw-card-icon {
          background: linear-gradient(135deg, #f97316 0%, #dc2626 100%);
          border-color: transparent;
          color: #ffffff;
        }
        .pw-card-body { flex: 1; min-width: 0; }
        .pw-card-name {
          font-size: 15px;
          font-weight: 600;
          color: #18181b;
          letter-spacing: -0.005em;
        }
        .pw-card-desc {
          font-size: 12.5px;
          color: #71717a;
          margin-top: 2px;
        }
        .pw-card-badge {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #a1a1aa;
          text-transform: uppercase;
          padding: 3px 8px;
          background: #f4f4f5;
          border-radius: 999px;
        }
        .pw-card-arrow { color: #a1a1aa; }

        .pw-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 20px;
          border-top: 1px solid #f4f4f5;
          font-size: 12.5px;
          color: #71717a;
        }
        .pw-signout {
          background: none;
          border: none;
          color: #71717a;
          font-size: 12.5px;
          font-family: inherit;
          padding: 4px 8px;
          margin-right: -8px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 6px;
          transition: color 0.15s;
        }
        .pw-signout:hover { color: #18181b; }
      `}</style>

      <div className="pw-root">
        <div className="pw-wrap" style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(8px)',
          transition: 'all 0.45s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <span className="pw-mark"></span>
          <h1 className="pw-title">환영합니다,<br/><em>{name || '파트너'}</em>님.</h1>
          <p className="pw-sub">
            {isPending
              ? '가입 신청이 접수되었습니다. 비모 관리자 검토 후 서비스를 사용할 수 있어요.'
              : '계정이 활성화되었습니다. 사용할 서비스를 선택해주세요.'}
          </p>

          {isPending && (
            <div className="pw-pending-banner">
              <span className="pw-pending-icon"><Clock size={18} strokeWidth={2.2} /></span>
              <div className="pw-pending-body">
                <div className="pw-pending-name">관리자 승인 대기 중</div>
                <div className="pw-pending-desc">
                  비모 팀이 곧 검토 후 승인합니다. 승인되면 비박스·비모 파트너 ERP 등 파트너 서비스를 사용할 수 있어요.
                </div>
              </div>
            </div>
          )}

          <div className="pw-cards">
            {viboxEnabled ? (
              <a
                className="pw-card active"
                href="#"
                onClick={(e) => { e.preventDefault(); handleOpenVibox(); }}
                aria-disabled={viboxOpening}
              >
                <div className="pw-card-icon"><Box size={20} strokeWidth={2} /></div>
                <div className="pw-card-body">
                  <div className="pw-card-name">비박스</div>
                  <div className="pw-card-desc">
                    {viboxOpening ? '비박스 여는 중…' : '영상 파일 공유·렌더링·협업'}
                  </div>
                </div>
                <ArrowRight size={18} className="pw-card-arrow" />
              </a>
            ) : (
              <div className="pw-card disabled">
                <div className="pw-card-icon"><Box size={20} strokeWidth={2} /></div>
                <div className="pw-card-body">
                  <div className="pw-card-name">비박스</div>
                  <div className="pw-card-desc">영상 파일 공유·렌더링·협업</div>
                </div>
                <span className="pw-card-badge">승인 대기</span>
              </div>
            )}

            <div className="pw-card disabled">
              <div className="pw-card-icon"><Briefcase size={20} strokeWidth={2} /></div>
              <div className="pw-card-body">
                <div className="pw-card-name">비모 파트너 ERP</div>
                <div className="pw-card-desc">프로젝트·정산·거래처 관리</div>
              </div>
              <span className="pw-card-badge">{isPending ? '승인 대기' : '준비 중'}</span>
            </div>
          </div>

          {viboxError && (
            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              fontSize: 13,
              color: '#dc2626',
            }}>
              {viboxError}
            </div>
          )}

          <div className="pw-foot">
            <span>{email}</span>
            <button className="pw-signout" onClick={handleSignOut}>
              <LogOut size={13} />
              로그아웃
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
