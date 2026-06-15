'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Check, X as XIcon, ArrowLeft, Loader2, Pencil, Eye, EyeOff, SearchX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMyProfile } from '@/lib/supabase/db';
import { listUsersWithAccess, grantAppAccess, suspendAppAccess } from '@/lib/supabase/db/app_access';
import type { UserWithAccess, AppCode } from '@/lib/supabase/db/app_access.types';
import { useToast } from '@/contexts/ToastContext';
import { SearchInput } from '@/components/SearchInput';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

const APPS: { code: AppCode; label: string; tone: string }[] = [
  { code: 'vimo_erp', label: '비모 ERP', tone: 'orange' },
  { code: 'partner_erp', label: '파트너 ERP', tone: 'blue' },
  { code: 'vibox', label: 'Vibox', tone: 'emerald' },
];

const TONE_ACTIVE: Record<string, string> = {
  orange: 'bg-orange-500 text-white border-orange-500',
  blue: 'bg-blue-500 text-white border-blue-500',
  emerald: 'bg-emerald-500 text-white border-emerald-500',
};

export default function AppAccessPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserWithAccess[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'staff' | 'partner'>('all');

  // 사용자 정보 수정 모달 (이름 / 아이디(이메일) / 비밀번호)
  const [editingUser, setEditingUser] = useState<UserWithAccess | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPw, setShowEditPw] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const profile = await getMyProfile();
      if (!profile || profile.role !== 'admin') {
        router.replace('/management');
        return;
      }
      const data = await listUsersWithAccess();
      setUsers(data);
      setLoading(false);
    })();
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === 'staff' && u.userType !== 'staff') return false;
      if (filter === 'partner' && u.userType !== 'partner') return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, query, filter]);

  const toggle = async (user: UserWithAccess, app: AppCode) => {
    const key = `${user.userId}:${app}`;
    setBusyKey(key);
    const current = user.access[app];
    const isActive = current === 'active';

    // ERP 상호 배제 경고
    if (!isActive && app === 'vimo_erp' && user.access.partner_erp === 'active') {
      if (!confirm('이 사용자는 파트너 ERP 권한이 활성화되어 있습니다.\n비모 ERP를 부여하면 DB가 거부합니다 (상호 배제).\n계속할까요?')) {
        setBusyKey(null);
        return;
      }
    }
    if (!isActive && app === 'partner_erp' && user.access.vimo_erp === 'active') {
      if (!confirm('이 사용자는 비모 ERP 권한이 활성화되어 있습니다.\n파트너 ERP를 부여하면 DB가 거부합니다 (상호 배제).\n계속할까요?')) {
        setBusyKey(null);
        return;
      }
    }

    const res = isActive ? await suspendAppAccess(user.userId, app) : await grantAppAccess(user.userId, app);
    if (!res.ok) {
      toast.error(res.error ?? '변경에 실패했습니다.');
      setBusyKey(null);
      return;
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.userId === user.userId ? { ...u, access: { ...u.access, [app]: isActive ? 'suspended' : 'active' } } : u
      )
    );
    setBusyKey(null);
  };

  const openEdit = (u: UserWithAccess) => {
    setEditingUser(u);
    setEditName(u.name === '(이름 없음)' ? '' : u.name);
    setEditEmail(u.email);
    setEditPassword('');
    setShowEditPw(false);
  };

  const handleEditSave = async () => {
    if (!editingUser) return;
    const trimmedEmail = editEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      toast.error('올바른 이메일 형식이 아닙니다.');
      return;
    }
    if (editPassword && editPassword.length < 8) {
      toast.error('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.userId,
          name: editName.trim() || null,
          email: trimmedEmail || undefined,
          password: editPassword || undefined,
        }),
      });
      if (res.ok) {
        const newName = editName.trim() || '(이름 없음)';
        const newEmail = trimmedEmail || editingUser.email;
        setUsers((prev) =>
          prev.map((u) => (u.userId === editingUser.userId ? { ...u, name: newName, email: newEmail } : u))
        );
        toast.success('사용자 정보가 수정되었습니다.');
        setEditingUser(null);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || '수정에 실패했습니다.');
      }
    } catch {
      toast.error('수정 중 오류가 발생했습니다.');
    }
    setEditSaving(false);
  };

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <Link href="/settings/users" className="mt-2 text-[#78716c] hover:text-[#1c1917]">
          <ArrowLeft size={18} />
        </Link>
        <div className="p-3 bg-orange-100 rounded-xl">
          <Shield className="text-orange-600" size={20} />
        </div>
        <div className="flex-1">
          <h1 className="text-page">앱 권한 관리</h1>
          <p className="text-sm text-[#78716c] mt-1">
            사용자별로 비모 ERP / 파트너 ERP / Vibox 접근 권한을 토글합니다. ERP는 상호 배제 (한쪽만 활성).
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-divider shadow-sm">
        <div className="px-4 sm:px-5 py-4 border-b border-divider flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="이름 또는 이메일로 검색"
            className="flex-1"
          />
          <div className="flex items-center gap-2 justify-between sm:justify-end">
            <div className="flex items-center gap-1 bg-[#fafaf9] rounded-lg p-1">
              {([['all', '전체'], ['staff', '비모 팀'], ['partner', '파트너']] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === k ? 'bg-white text-[#1c1917] shadow-sm' : 'text-[#78716c] hover:text-[#1c1917]'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="text-xs text-[#a8a29e]">{filtered.length}명</span>
          </div>
        </div>

        {/* 모바일: 시안 1A — 사용자 카드 + 앱 배지 */}
        <div className="sm:hidden divide-y divide-[#f0ece9]">
          {filtered.length === 0 && (
            <EmptyState icon={SearchX} title="검색 결과가 없습니다" description="다른 키워드로 검색해보세요." size="compact" />
          )}
          {filtered.map((u) => {
            const initial = u.name.charAt(0);
            const isStaff = u.userType === 'staff';
            const isPartner = u.userType === 'partner';
            return (
              <div key={u.userId} className="px-4 py-3.5">
                <div className="flex items-start justify-between mb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-8 h-8 rounded-full text-[12px] font-bold flex items-center justify-center flex-shrink-0 ${
                      isStaff ? 'bg-orange-100 text-orange-500' : isPartner ? 'bg-blue-100 text-blue-500' : 'bg-[#f5f5f4] text-[#78716c]'
                    }`}>{initial}</div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[#1c1917] truncate">{u.name}</div>
                      <div className="text-[10px] text-[#a8a29e] truncate">{u.email || '—'} · {isStaff ? '비모 팀' : isPartner ? '파트너' : '미지정'}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => openEdit(u)}
                    className="p-1.5 -mr-1 rounded-lg text-[#d6d3d1] hover:text-orange-500 hover:bg-orange-50 transition-all flex-shrink-0"
                    title="정보 수정"
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {APPS.map((a) => {
                    const status = u.access[a.code];
                    const key = `${u.userId}:${a.code}`;
                    const busy = busyKey === key;
                    const isActive = status === 'active';
                    const isSuspended = status === 'suspended';
                    const toneActive = a.tone === 'orange' ? 'bg-orange-50 text-orange-600 border-orange-200' : a.tone === 'blue' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200';
                    return (
                      <button
                        key={a.code}
                        disabled={busy}
                        onClick={() => toggle(u, a.code)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors disabled:opacity-50 ${
                          isActive ? toneActive : isSuspended ? 'bg-red-50 text-red-500 border-red-200' : 'bg-white text-[#a8a29e] border-[#ede9e6]'
                        }`}
                      >
                        {busy ? <Loader2 size={10} className="animate-spin" /> : isActive ? <Check size={10} /> : <XIcon size={10} />}
                        <span>{a.label}</span>
                        <span className="opacity-70">{isActive ? '활성' : isSuspended ? '정지' : '없음'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* 데스크탑: 기존 테이블 */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#fafaf9] text-[#78716c] text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-medium">사용자</th>
                <th className="text-left px-3 py-3 font-medium">유형</th>
                {APPS.map((a) => (
                  <th key={a.code} className="text-center px-3 py-3 font-medium">
                    {a.label}
                  </th>
                ))}
                <th className="text-right px-5 py-3 font-medium">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0ece9]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5">
                    <EmptyState icon={SearchX} title="검색 결과가 없습니다" description="다른 키워드로 검색해보세요." size="compact" />
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr key={u.userId} className="hover:bg-[#fafaf9]/60">
                  <td className="px-5 py-3">
                    <div className="font-medium text-[#1c1917]">{u.name}</div>
                    <div className="text-xs text-[#78716c]">{u.email || '—'}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                        u.userType === 'staff'
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : u.userType === 'partner'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-[#fafaf9] text-[#78716c] border-[#ede9e6]'
                      }`}
                    >
                      {u.userType === 'staff' ? '비모 팀' : u.userType === 'partner' ? '파트너' : '미지정'}
                    </span>
                  </td>
                  {APPS.map((a) => {
                    const status = u.access[a.code];
                    const key = `${u.userId}:${a.code}`;
                    const busy = busyKey === key;
                    const isActive = status === 'active';
                    return (
                      <td key={a.code} className="px-3 py-3 text-center">
                        <button
                          disabled={busy}
                          onClick={() => toggle(u, a.code)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all disabled:opacity-50 ${
                            isActive
                              ? TONE_ACTIVE[a.tone]
                              : status === 'suspended'
                              ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                              : 'bg-white text-[#a8a29e] border-[#ede9e6] hover:border-[#d6d3d1] hover:text-[#57534e]'
                          }`}
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : isActive ? (
                            <Check size={12} />
                          ) : (
                            <XIcon size={12} />
                          )}
                          {isActive ? '활성' : status === 'suspended' ? '정지' : '없음'}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 rounded-lg text-[#d6d3d1] hover:text-orange-500 hover:bg-orange-50 transition-all"
                      title="정보 수정"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-[#a8a29e] px-1">
        ※ 권한 변경은 `audit_log` 테이블에 자동 기록됩니다. 비모 ERP ↔ 파트너 ERP는 동시에 활성화될 수 없습니다.
      </div>

      {/* 사용자 정보 수정 모달 (이름 / 아이디(이메일) / 비밀번호) */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingUser(null)}
            />
            <motion.div
              className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5 border-b border-divider flex items-center justify-between">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-[#1c1917]">사용자 정보 수정</h3>
                  <p className="text-xs text-[#a8a29e] mt-0.5 truncate">{editingUser.email || editingUser.name}</p>
                </div>
                <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-[#f5f5f4] rounded-xl transition-colors flex-shrink-0">
                  <XIcon size={18} className="text-[#a8a29e]" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#44403c] mb-1.5">이름</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2.5 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                    placeholder="이름"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#44403c] mb-1.5">아이디 (이메일)</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-4 py-2.5 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                    placeholder="user@example.com"
                  />
                  <p className="text-xs text-[#a8a29e] mt-1">이메일이 곧 로그인 아이디입니다.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#44403c] mb-1.5">새 비밀번호</label>
                  <div className="relative">
                    <input
                      type={showEditPw ? 'text' : 'password'}
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="w-full px-4 py-2.5 pr-11 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                      placeholder="변경하지 않으려면 비워두세요"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a8a29e] hover:text-[#57534e]"
                    >
                      {showEditPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-xs text-[#a8a29e] mt-1">영문·숫자 포함 8자 이상</p>
                </div>
              </div>

              <div className="px-6 py-4 bg-[#fafaf9] border-t border-divider flex justify-end gap-2">
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2.5 text-sm font-medium text-[#44403c] bg-white border border-divider rounded-xl hover:bg-[#fafaf9] transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={editSaving}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editSaving ? '저장 중...' : '저장'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
