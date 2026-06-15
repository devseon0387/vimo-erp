'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UserPlus, Link2, X, Mail, Phone, AlertTriangle, Check, Eye } from 'lucide-react';
import {
  getPendingPartnerSignups, mapToExistingPartner, createAndMapNewPartner, rejectPartnerSignup,
} from '@/lib/supabase/db/partner_signups';
import type { PendingPartnerSignup } from '@/lib/supabase/db/partner_signups.types';
import { getPartners, getMyProfile } from '@/lib/supabase/db';
import type { Partner } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import EmptyState from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { SearchInput } from '@/components/SearchInput';

type ConfirmAction =
  | { kind: 'createNew'; signup: PendingPartnerSignup }
  | { kind: 'map'; signup: PendingPartnerSignup; partnerId: string; partnerName: string }
  | { kind: 'reject'; signup: PendingPartnerSignup };

export default function PartnerSignupsPage() {
  const router = useRouter();
  const toast = useToast();
  const [signups, setSignups] = useState<PendingPartnerSignup[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkTarget, setLinkTarget] = useState<PendingPartnerSignup | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    // 관리자 전용 — 비관리자는 가입 신청 PII를 보지 못하도록 데이터 로드 전에 차단
    const profile = await getMyProfile();
    if (!profile || profile.role !== 'admin') { router.replace('/management'); return; }
    setLoading(true);
    const [s, p] = await Promise.all([getPendingPartnerSignups(), getPartners()]);
    setSignups(s);
    setPartners(p);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreateNew = (signup: PendingPartnerSignup) => {
    setConfirmAction({ kind: 'createNew', signup });
  };

  const handleMap = (signup: PendingPartnerSignup, partnerId: string, partnerName: string) => {
    setConfirmAction({ kind: 'map', signup, partnerId, partnerName });
  };

  const handleReject = (signup: PendingPartnerSignup) => {
    setConfirmAction({ kind: 'reject', signup });
  };

  const [impersonating, setImpersonating] = useState<string | null>(null);
  const handleImpersonate = async (signup: PendingPartnerSignup) => {
    setImpersonating(signup.profileId);
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerProfileId: signup.profileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? '임퍼소네이션 실패');
        return;
      }
      toast.success(`${signup.name}으로 새 탭에서 열어요`);
      // exchange 라우트가 http-only cookie에 담긴 magic link로 redirect (60초 TTL, 1회용)
      window.open(data.exchangeUrl, '_blank', 'noopener');
    } catch (e) {
      toast.error('네트워크 오류');
      console.error(e);
    } finally {
      setImpersonating(null);
    }
  };

  const executeConfirm = async () => {
    if (!confirmAction) return;
    setSubmitting(true);

    if (confirmAction.kind === 'createNew') {
      const ok = await createAndMapNewPartner(confirmAction.signup.profileId);
      if (ok) {
        toast.success(`${confirmAction.signup.name}을(를) 신규 파트너로 등록·매핑했어요.`);
        load();
      } else {
        toast.error('신규 등록 실패. 다시 시도해 주세요.');
      }
    } else if (confirmAction.kind === 'map') {
      const ok = await mapToExistingPartner(confirmAction.signup.profileId, confirmAction.partnerId);
      if (ok) {
        toast.success(`${confirmAction.signup.name} ↔ ${confirmAction.partnerName} 매핑 완료.`);
        setLinkTarget(null);
        load();
      } else {
        toast.error('매핑 실패. 다시 시도해 주세요.');
      }
    } else if (confirmAction.kind === 'reject') {
      const ok = await rejectPartnerSignup(confirmAction.signup.profileId);
      if (ok) {
        toast.success(`${confirmAction.signup.name} 가입을 거부했어요.`);
        load();
      } else {
        toast.error('거부 처리 실패.');
      }
    }

    setSubmitting(false);
    setConfirmAction(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/partners')}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#f5f5f4] text-[#78716c] hover:text-[#1c1917] transition-colors"
            title="파트너 목록으로"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-page">파트너 가입 신청</h1>
            <p className="text-caption mt-0.5">
              파트너 ERP에 가입한 신규 사용자를 검토하고 매핑하세요
            </p>
          </div>
        </div>
        <a
          href="http://localhost:3010"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-divider hover:border-[#d6d3d1] text-[#44403c] rounded-xl text-[12px] font-semibold transition-colors"
          title="파트너 ERP에 admin으로 로그인하면 파트너 시점 미리보기 가능"
        >
          <Eye size={14} />
          파트너 ERP 열기
        </a>
      </div>

      {loading ? (
        <LoadingState />
      ) : signups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-divider">
          <EmptyState
            icon={Check}
            title="대기 중인 가입 신청이 없어요"
            description="새 파트너가 가입하면 여기에 표시됩니다"
            iconColor="text-green-500"
            iconBgColor="bg-green-50"
          />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-divider overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f0ece9] flex items-center justify-between">
            <span className="text-[14px] font-bold">
              검토 대기 중
              <span className="ml-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">
                {signups.length}명
              </span>
            </span>
          </div>
          <div className="divide-y divide-[#f0ece9]">
            {signups.map((s) => (
              <SignupRow
                key={s.profileId}
                signup={s}
                onLinkClick={() => setLinkTarget(s)}
                onCreateNew={() => handleCreateNew(s)}
                onReject={() => handleReject(s)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 매핑 모달 */}
      {linkTarget && (
        <LinkPartnerModal
          target={linkTarget}
          partners={partners}
          onClose={() => setLinkTarget(null)}
          onConfirm={(partnerId, partnerName) => handleMap(linkTarget, partnerId, partnerName)}
        />
      )}

      {/* 확인 모달 */}
      {confirmAction && (
        <ConfirmModal
          action={confirmAction}
          submitting={submitting}
          onCancel={() => setConfirmAction(null)}
          onConfirm={executeConfirm}
        />
      )}
    </div>
  );
}

function ConfirmModal({
  action, submitting, onCancel, onConfirm,
}: {
  action: ConfirmAction;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const config =
    action.kind === 'createNew'
      ? {
          title: '신규 파트너로 등록',
          icon: <UserPlus size={20} className="text-orange-500" />,
          iconBg: 'bg-orange-50',
          body: (
            <>
              <span className="font-bold text-[#1c1917]">{action.signup.name}</span>
              <span className="text-[#78716c]"> ({action.signup.email})</span>
              을(를) 비모 ERP의 <b className="text-[#1c1917]">partners 테이블에 신규 등록</b>하고 매핑할까요?
              <br />
              <span className="text-[12.5px] text-orange-600 mt-1.5 inline-block">
                매핑 후 회차 배정·정산 데이터가 표시됩니다.
              </span>
            </>
          ),
          confirmText: '신규 등록',
          confirmClass: 'bg-orange-500 hover:bg-orange-600 text-white',
        }
      : action.kind === 'map'
      ? {
          title: '기존 파트너와 연결',
          icon: <Link2 size={20} className="text-orange-500" />,
          iconBg: 'bg-orange-50',
          body: (
            <>
              <span className="font-bold text-[#1c1917]">{action.signup.name}</span>
              의 가입을 기존 파트너{' '}
              <span className="font-bold text-[#1c1917]">"{action.partnerName}"</span>
              과 연결할까요?
              <br />
              <span className="text-[12.5px] text-orange-600 mt-1.5 inline-block">
                매핑 후 즉시 회차/정산 데이터가 표시됩니다.
              </span>
            </>
          ),
          confirmText: '연결',
          confirmClass: 'bg-orange-500 hover:bg-orange-600 text-white',
        }
      : {
          title: '가입 거부',
          icon: <AlertTriangle size={20} className="text-red-500" />,
          iconBg: 'bg-red-50',
          body: (
            <>
              <span className="font-bold text-[#1c1917]">{action.signup.name}</span>
              <span className="text-[#78716c]"> ({action.signup.email})</span>
              의 가입을 거부할까요?
              <br />
              <span className="text-[12.5px] text-red-600 mt-1.5 inline-block">
                계정은 남지만 ERP 접근은 차단됩니다. 나중에 다시 활성화 가능.
              </span>
            </>
          ),
          confirmText: '거부',
          confirmClass: 'bg-red-600 hover:bg-red-700 text-white',
        };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onCancel}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-[#fafaf9] rounded-lg shadow-xl max-w-md w-full p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center flex-shrink-0`}>
              {config.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-[16px] font-bold text-[#1c1917]">{config.title}</h3>
            </div>
          </div>

          <p className="text-[13.5px] text-[#44403c] leading-relaxed mb-6">{config.body}</p>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 text-[13px] font-semibold text-[#44403c] hover:bg-[#f5f5f4] rounded-lg transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting}
              className={`px-4 py-2 text-[13px] font-semibold rounded-lg transition-colors disabled:opacity-50 ${config.confirmClass}`}
            >
              {submitting ? '처리 중...' : config.confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignupRow({
  signup, onLinkClick, onCreateNew, onReject,
}: {
  signup: PendingPartnerSignup;
  onLinkClick: () => void;
  onCreateNew: () => void;
  onReject: () => void;
}) {
  const days = Math.floor((Date.now() - new Date(signup.signupAt).getTime()) / (1000 * 60 * 60 * 24));
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-3 hover:bg-[#fafaf9] transition-colors flex-wrap">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-[14px] flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #fb923c, #ea580c)' }}
        >
          {signup.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-bold truncate">{signup.name}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-50 text-orange-700">
              {signup.type === 'freelancer' ? '프리랜서' : '업체'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11.5px] text-[#78716c] mt-1 flex-wrap">
            <span className="flex items-center gap-1"><Mail size={11} /> {signup.email}</span>
            {signup.phone && <span className="flex items-center gap-1"><Phone size={11} /> {signup.phone}</span>}
            <span className="text-[#a8a29e]">· {days === 0 ? '오늘' : `${days}일 전`} 가입</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onLinkClick}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-[12px] font-semibold transition-colors"
          title="기존 비모 partners 테이블의 파트너와 연결"
        >
          <Link2 size={13} />
          기존 파트너로 연결
        </button>
        <button
          onClick={onCreateNew}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-divider hover:border-[#d6d3d1] text-[#44403c] rounded-xl text-[12px] font-semibold transition-colors"
          title="비모 partners 테이블에 신규 row 생성 후 매핑"
        >
          <UserPlus size={13} />
          신규 등록
        </button>
        <button
          onClick={onReject}
          className="inline-flex items-center justify-center w-9 h-9 bg-white border border-divider hover:border-red-300 hover:bg-red-50 hover:text-red-600 text-[#a8a29e] rounded-xl transition-colors"
          title="가입 거부"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function LinkPartnerModal({
  target, partners, onClose, onConfirm,
}: {
  target: PendingPartnerSignup;
  partners: Partner[];
  onClose: () => void;
  onConfirm: (partnerId: string, partnerName: string) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = partners.filter(p => p.status === 'active');
    if (q) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.email?.toLowerCase().includes(q) ?? false) ||
        (p.phone?.includes(q) ?? false)
      );
    }
    // 이름 자동 매칭 우선 노출
    list.sort((a, b) => {
      const aMatch = a.name.includes(target.name) || target.name.includes(a.name) ? -1 : 0;
      const bMatch = b.name.includes(target.name) || target.name.includes(b.name) ? -1 : 0;
      return aMatch - bMatch;
    });
    return list;
  }, [partners, query, target.name]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#f0ece9]">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold">기존 파트너와 연결</h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#f5f5f4] text-[#78716c]"
            >
              <X size={16} />
            </button>
          </div>
          <p className="text-[12px] text-[#78716c] mt-2">
            <b className="text-[#1c1917]">{target.name}</b> ({target.email}) 의 가입을 어떤 기존 파트너와 연결할지 선택하세요.
          </p>
        </div>

        <div className="px-4 pt-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="이름·이메일·전화로 검색..."
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {filtered.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="매칭되는 파트너가 없어요"
              description='"신규 등록" 버튼으로 새 파트너로 등록하세요'
              iconColor="text-amber-400"
              iconBgColor="bg-amber-50"
              size="compact"
            />
          ) : (
            filtered.map(p => (
              <button
                key={p.id}
                onClick={() => onConfirm(p.id, p.name)}
                className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-transparent hover:border-orange-300 hover:bg-orange-50 transition-colors"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0"
                  style={{
                    background: p.partnerType === 'business'
                      ? 'linear-gradient(135deg, #60a5fa, #2563eb)'
                      : 'linear-gradient(135deg, #fb923c, #ea580c)',
                  }}
                >
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold truncate">{p.name}</div>
                  <div className="text-[11px] text-[#78716c] truncate">
                    {p.email ?? '이메일 없음'}
                    {p.phone && ` · ${p.phone}`}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
