'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Search, Check, X as XIcon, ArrowLeft, Loader2 } from 'lucide-react';
import { getMyProfile } from '@/lib/supabase/db';
import { listUsersWithAccess, grantAppAccess, suspendAppAccess } from '@/lib/supabase/db/app_access';
import type { UserWithAccess, AppCode } from '@/lib/supabase/db/app_access.types';
import { useToast } from '@/contexts/ToastContext';

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-4">
        <Link href="/settings/users" className="mt-2 text-gray-500 hover:text-gray-800">
          <ArrowLeft size={18} />
        </Link>
        <div className="p-3 bg-orange-100 rounded-xl">
          <Shield className="text-orange-600" size={20} />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">앱 권한 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            사용자별로 비모 ERP / 파트너 ERP / Vibox 접근 권한을 토글합니다. ERP는 상호 배제 (한쪽만 활성).
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-divider shadow-sm">
        <div className="px-4 sm:px-5 py-4 border-b border-divider flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 또는 이메일로 검색"
              className="w-full pl-9 pr-3 py-2 border border-divider rounded-lg text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
          <div className="flex items-center gap-2 justify-between sm:justify-end">
            <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1">
              {([['all', '전체'], ['staff', '비모 팀'], ['partner', '파트너']] as const).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    filter === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400">{filtered.length}명</span>
          </div>
        </div>

        {/* 모바일: 시안 1A — 사용자 카드 + 앱 배지 */}
        <div className="sm:hidden divide-y divide-gray-100">
          {filtered.length === 0 && (
            <div className="px-5 py-12 text-center text-gray-400 text-sm">검색 결과가 없습니다.</div>
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
                      isStaff ? 'bg-orange-100 text-orange-500' : isPartner ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-500'
                    }`}>{initial}</div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-gray-900 truncate">{u.name}</div>
                      <div className="text-[10px] text-gray-400 truncate">{u.email || '—'} · {isStaff ? '비모 팀' : isPartner ? '파트너' : '미지정'}</div>
                    </div>
                  </div>
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
                          isActive ? toneActive : isSuspended ? 'bg-red-50 text-red-500 border-red-200' : 'bg-white text-gray-400 border-gray-200'
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
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-medium">사용자</th>
                <th className="text-left px-3 py-3 font-medium">유형</th>
                {APPS.map((a) => (
                  <th key={a.code} className="text-center px-3 py-3 font-medium">
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">
                    검색 결과가 없습니다.
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr key={u.userId} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3">
                    <div className="font-medium text-gray-900">{u.name}</div>
                    <div className="text-xs text-gray-500">{u.email || '—'}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                        u.userType === 'staff'
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : u.userType === 'partner'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
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
                              : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-gray-400 px-1">
        ※ 권한 변경은 `audit_log` 테이블에 자동 기록됩니다. 비모 ERP ↔ 파트너 ERP는 동시에 활성화될 수 없습니다.
      </div>
    </div>
  );
}
