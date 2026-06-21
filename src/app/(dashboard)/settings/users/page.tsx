'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { getMyProfile, getAllUserProfiles, updateUserRole, getCustomRoles, addCustomRole, deleteCustomRole } from '@/lib/supabase/db';
import { Shield, Users, Crown, Plus, X, Tag, Trash2, UserCheck, Pencil, Eye, EyeOff, Copy, Check, UserPlus, RefreshCw, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

type UserProfile = {
  id: string;
  role: string;
  name: string | null;
  email?: string;
  approved?: boolean;
};

const DEFAULT_ROLES = [
  { value: 'admin', label: '대표' },
  { value: 'manager', label: '총괄 매니저' },
];

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: 'bg-orange-100 text-orange-700 border border-orange-200',
  manager: 'bg-orange-100 text-orange-700 border border-orange-200',
};

function getRoleBadgeClass(role: string) {
  return ROLE_BADGE_CLASSES[role] ?? 'bg-ink-100 text-ink-600 border border-divider';
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '방금 전';
  if (minutes < 60) return minutes + '분 전';
  if (hours < 24) return hours + '시간 전';
  if (days < 30) return days + '일 전';
  const months = Math.floor(days / 30);
  if (months < 12) return months + '개월 전';
  return Math.floor(months / 12) + '년 전';
}

function getRoleLabel(role: string, _customRoles: string[]) {
  if (role === 'admin') return '대표';
  if (role === 'manager') return '총괄 매니저';
  return role;
}

export default function UsersSettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string>('');
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState('');
  const [addingRole, setAddingRole] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 마지막 접속 시간
  const [activityMap, setActivityMap] = useState<Record<string, { lastSignInAt: string | null; isOnline: boolean }>>({});
  const [activityError, setActivityError] = useState(false);

  // 새 계정 생성
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState('manager');
  const [createPassword, setCreatePassword] = useState('');
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState('');
  const [copiedPw, setCopiedPw] = useState(false);

  // 수정 모달
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showEditPw, setShowEditPw] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      const profile = await getMyProfile();
      if (!profile || profile.role !== 'admin') {
        router.replace('/management');
        return;
      }
      setMyId(profile.id);

      const [all, roles, activityRes] = await Promise.all([
        getAllUserProfiles().catch(() => [] as Awaited<ReturnType<typeof getAllUserProfiles>>),
        getCustomRoles().catch(() => [] as Awaited<ReturnType<typeof getCustomRoles>>),
        fetch('/api/admin/users-activity').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setProfiles(all);
      setCustomRoles(roles);

      if (activityRes?.users) {
        const fetchedAt = Date.now();
        const map: Record<string, { lastSignInAt: string | null; isOnline: boolean }> = {};
        for (const u of activityRes.users) {
          const lastAt = u.lastSignInAt as string | null;
          const isOnline = lastAt ? (fetchedAt - new Date(lastAt).getTime()) < 5 * 60 * 1000 : false;
          map[u.id] = { lastSignInAt: lastAt, isOnline };
        }
        setActivityMap(map);
      } else {
        setActivityError(true);
      }

      setLoading(false);
    };
    init();
  }, [router]);

  const approvedProfiles = profiles.filter(p => p.approved === true || p.role === 'admin');

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingId(userId);
    const ok = await updateUserRole(userId, newRole);
    if (ok) {
      setProfiles(prev =>
        prev.map(p => (p.id === userId ? { ...p, role: newRole } : p))
      );
    } else {
      toast.error('역할 변경에 실패했습니다. 다시 시도해주세요.');
    }
    setUpdatingId(null);
  };

  const handleAddRole = async () => {
    const trimmed = newRoleName.trim();
    if (!trimmed) return;
    if (trimmed === '대표' || trimmed === '총괄 매니저') return;
    if (customRoles.includes(trimmed)) return;

    setAddingRole(true);
    const ok = await addCustomRole(trimmed);
    if (ok) {
      setCustomRoles(prev => [...prev, trimmed]);
      setNewRoleName('');
    } else {
      toast.error('역할 추가에 실패했습니다. 다시 시도해주세요.');
    }
    setAddingRole(false);
  };

  const handleDeleteRole = async (name: string) => {
    const ok = await deleteCustomRole(name);
    if (ok) {
      setCustomRoles(prev => prev.filter(r => r !== name));
    } else {
      toast.error('역할 삭제에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const generatePassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pw = '';
    for (let i = 0; i < 10; i++) pw += chars.charAt(Math.floor(Math.random() * chars.length));
    setCreatePassword(pw);
    setShowCreatePw(true);
  };

  const handleCreateUser = async () => {
    if (!createName.trim() || !createEmail.trim() || !createPassword) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim(),
          email: createEmail.trim(),
          role: createRole,
          password: createPassword,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfiles(prev => [...prev, {
          id: data.userId,
          name: createName.trim(),
          email: createEmail.trim(),
          role: createRole,
          approved: true,
        }]);
        setCreatedEmail(createEmail.trim());
        setCreatedPassword(createPassword);
        setCreateName('');
        setCreateEmail('');
        setCreateRole('manager');
        setCreatePassword('');
      } else {
        let errMsg = '계정 생성에 실패했습니다.';
        try {
          const data = await res.json();
          errMsg = data.error || errMsg;
        } catch {
          errMsg = '서버 응답 오류 (HTTP ' + res.status + ')';
        }
        toast.error(errMsg);
      }
    } catch (err) {
      toast.error('계정 생성 중 오류: ' + String(err));
    }
    setCreating(false);
  };

  const handleCopyPassword = async () => {
    if (!createdPassword) return;
    try {
      await navigator.clipboard.writeText(createdPassword);
      setCopiedPw(true);
      setTimeout(() => setCopiedPw(false), 2000);
    } catch {
      /* fallback */
    }
  };

  const handleDeleteUser = async (userId: string, name: string | null) => {
    const label = name || '이 계정';
    if (!(await confirm({ title: `"${label}"을(를) 삭제할까요?`, description: '삭제하면 로그인도 불가능해집니다.', tone: 'danger', confirmLabel: '삭제' }))) return;

    setDeletingId(userId);
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setProfiles(prev => prev.filter(p => p.id !== userId));
      } else {
        const data = await res.json();
        toast.error(data.error || '삭제에 실패했습니다.');
      }
    } catch {
      toast.error('삭제 중 오류가 발생했습니다.');
    }
    setDeletingId(null);
  };

  const openEditModal = (profile: UserProfile) => {
    setEditingUser(profile);
    setEditName(profile.name ?? '');
    setEditEmail(profile.email ?? '');
    setEditPassword('');
    setShowEditPw(false);
  };

  const handleEditSave = async () => {
    if (!editingUser) return;
    setEditSaving(true);
    try {
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          name: editName.trim() || null,
          email: editEmail.trim() || undefined,
          password: editPassword || undefined,
        }),
      });
      if (res.ok) {
        setProfiles(prev =>
          prev.map(p =>
            p.id === editingUser.id
              ? { ...p, name: editName.trim() || null, email: editEmail.trim() || p.email }
              : p
          )
        );
        setEditingUser(null);
      } else {
        const data = await res.json();
        toast.error(data.error || '수정에 실패했습니다.');
      }
    } catch {
      toast.error('수정 중 오류가 발생했습니다.');
    }
    setEditSaving(false);
  };

  const allRoleOptions = [
    ...DEFAULT_ROLES,
    ...customRoles.map(r => ({ value: r, label: r })),
  ];

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-3 bg-orange-100 rounded-xl flex-shrink-0">
            <Shield size={24} className="text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-page">계정 관리</h1>
            <p className="text-sm text-ink-500 mt-1">대표만 접근 가능한 페이지입니다</p>
          </div>
        </div>
        <a
          href="/settings/app-access"
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-divider bg-white text-ink-700 hover:border-orange-500 hover:text-orange-600 transition-colors flex-shrink-0 w-full sm:w-auto"
        >
          앱 권한 관리 →
        </a>
      </div>

      {/* 새 계정 생성 */}
      <div className="bg-white rounded-2xl border border-divider shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-divider flex items-center gap-2">
          <UserPlus size={18} className="text-orange-500" />
          <h2 className="text-base font-semibold text-ink-900">새 계정 생성</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">이름</label>
              <input
                type="text"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                className="w-full px-4 py-2.5 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                placeholder="홍길동"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">이메일</label>
              <input
                type="email"
                value={createEmail}
                onChange={e => setCreateEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                placeholder="user@example.com"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">역할</label>
              <select
                value={createRole}
                onChange={e => setCreateRole(e.target.value)}
                className="w-full px-4 py-2.5 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
              >
                {allRoleOptions.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">임시 비밀번호</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showCreatePw ? 'text' : 'password'}
                    value={createPassword}
                    onChange={e => setCreatePassword(e.target.value)}
                    className="w-full px-4 py-2.5 pr-10 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                    placeholder="6자 이상"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                  >
                    {showCreatePw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={generatePassword}
                  className="flex items-center gap-1 px-3 py-2 bg-ink-100 text-ink-600 text-xs font-medium rounded-xl hover:bg-gray-200 transition-colors flex-shrink-0"
                  title="자동 생성"
                >
                  <RefreshCw size={13} />
                  자동
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button
              onClick={handleCreateUser}
              disabled={creating || !createName.trim() || !createEmail.trim() || !createPassword}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus size={15} />
              {creating ? '생성 중...' : '계정 생성'}
            </button>
          </div>
        </div>
      </div>

      {/* 역할 관리 */}
      <div className="bg-white rounded-2xl border border-divider shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-divider flex items-center gap-2">
          <Tag size={18} className="text-ink-500" />
          <h2 className="text-base font-semibold text-ink-900">역할 관리</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* 역할은 표시용 — 실제 권한은 대표/비모 팀/파트너 단위. 오해(역할=권한 제한) 차단 안내 */}
          <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[12.5px] text-amber-800">
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5 text-amber-500" />
            <span>역할은 <b>표시·분류용 라벨</b>입니다. 실제 접근 권한은 역할이 아니라 <b>대표 / 비모 팀(직원) / 파트너</b> 구분으로만 적용돼요. (예: &lsquo;에디터&rsquo; 역할이라도 직원이면 동일한 권한을 가집니다.)</span>
          </div>
          {/* 기본 역할 */}
          <div>
            <p className="text-xs text-ink-400 font-medium mb-2">기본 역할 (변경 불가)</p>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_ROLES.map(r => (
                <span key={r.value} className={`text-xs font-medium px-3 py-1.5 rounded-full ${getRoleBadgeClass(r.value)}`}>
                  {r.label}
                </span>
              ))}
            </div>
          </div>

          {/* 커스텀 역할 */}
          <div>
            <p className="text-xs text-ink-400 font-medium mb-2">커스텀 역할</p>
            {customRoles.length === 0 ? (
              <p className="text-sm text-ink-400">아직 추가된 역할이 없습니다.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {customRoles.map(role => (
                  <div key={role} className="flex items-center gap-1 bg-ink-100 text-ink-700 border border-divider text-xs font-medium px-3 py-1.5 rounded-full">
                    <span>{role}</span>
                    <button
                      onClick={() => handleDeleteRole(role)}
                      className="ml-1 hover:text-red-500 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 역할 추가 */}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={newRoleName}
              onChange={e => setNewRoleName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddRole(); }}
              placeholder="새 역할 이름 (예: PD, 에디터)"
              className="flex-1 text-sm px-4 py-2 border border-divider rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <button
              onClick={handleAddRole}
              disabled={addingRole || !newRoleName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={15} />
              추가
            </button>
          </div>
        </div>
      </div>

      {/* 등록된 계정 */}
      <div className="bg-white rounded-2xl border border-divider shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-divider flex items-center gap-2">
          <Users size={18} className="text-ink-500" />
          <h2 className="text-base font-semibold text-ink-900">등록된 계정</h2>
          <span className="ml-auto text-xs text-ink-400 bg-ink-100 px-2 py-1 rounded-full">
            {approvedProfiles.length}명
          </span>
        </div>

        <div className="divide-y divide-ink-200">
          {approvedProfiles.length === 0 ? (
            <EmptyState
              icon={Users}
              title="등록된 계정이 없습니다"
              description="새 계정을 생성하면 여기에 표시됩니다."
              size="compact"
            />
          ) : (
            approvedProfiles.map(profile => {
              const isMe = profile.id === myId;
              const roleBadge = getRoleBadgeClass(profile.role);
              const roleLabel = getRoleLabel(profile.role, customRoles);

              return (
                <div key={profile.id} className="px-6 py-4 flex items-center gap-3">
                  {/* 아바타 */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                    {profile.role === 'admin' ? (
                      <Crown size={16} />
                    ) : (
                      (profile.name ?? profile.email ?? '?').charAt(0).toUpperCase()
                    )}
                  </div>

                  {/* 이름/이메일/접속시간 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink-900 text-sm truncate">
                        {profile.name ?? '(이름 없음)'}
                      </span>
                      {isMe && (
                        <span className="text-xs text-ink-400 bg-ink-100 px-2 py-0.5 rounded-full">나</span>
                      )}
                    </div>
                    {profile.email && (
                      <p className="text-xs text-ink-400 truncate mt-0.5">{profile.email}</p>
                    )}
                    {activityError && (
                      <div className="flex items-center gap-1 mt-1">
                        <Clock size={11} className="text-ink-300 flex-shrink-0" />
                        <span className="text-xs text-ink-300">접속 정보 불러오기 실패</span>
                      </div>
                    )}
                    {!activityError && activityMap[profile.id] !== undefined && (
                      <div className="flex items-center gap-1 mt-1">
                        {activityMap[profile.id].isOnline ? (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                            <span className="text-xs text-green-600">현재 온라인</span>
                          </>
                        ) : (
                          <>
                            <Clock size={11} className="text-ink-300 flex-shrink-0" />
                            <span className="text-xs text-ink-400">
                              {activityMap[profile.id].lastSignInAt
                                ? '마지막 접속: ' + formatRelativeTime(activityMap[profile.id].lastSignInAt!)
                                : '접속 기록 없음'}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 역할 배지 + 액션 */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isMe ? (
                      <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${roleBadge}`}>
                        {roleLabel}
                      </span>
                    ) : (
                      <>
                        <div className="relative">
                          <select
                            value={profile.role}
                            disabled={updatingId === profile.id}
                            onChange={e => handleRoleChange(profile.id, e.target.value)}
                            className={`
                              text-xs font-medium px-3 py-1.5 rounded-full border appearance-none cursor-pointer
                              focus:outline-none focus:ring-2 focus:ring-orange-300
                              ${roleBadge}
                              ${updatingId === profile.id ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                          >
                            {allRoleOptions.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={() => openEditModal(profile)}
                          className="p-2.5 sm:p-1.5 rounded-lg text-ink-300 hover:text-orange-500 hover:bg-orange-50 transition-all"
                          title="계정 수정"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(profile.id, profile.name)}
                          disabled={deletingId === profile.id}
                          className="p-2.5 sm:p-1.5 rounded-lg text-ink-300 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                          title="계정 삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 임시 비밀번호 확인 모달 */}
      <AnimatePresence>
        {createdPassword && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setCreatedPassword(null); setCopiedPw(false); }}
            />
            <motion.div
              className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-6 text-center space-y-4">
                <div className="inline-flex p-3 bg-green-100 rounded-xl">
                  <UserCheck size={28} className="text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-ink-900">계정 생성 완료</h3>
                  <p className="text-sm text-ink-500 mt-1">{createdEmail}</p>
                </div>
                <div className="bg-ink-50 rounded-xl border border-divider p-4">
                  <p className="text-xs text-ink-400 font-medium mb-2">임시 비밀번호</p>
                  <div className="flex items-center justify-center gap-3">
                    <code className="text-lg font-mono font-bold text-ink-900 tracking-wider">
                      {createdPassword}
                    </code>
                    <button
                      onClick={handleCopyPassword}
                      className={`p-2 rounded-lg transition-colors ${copiedPw ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-ink-500 hover:bg-gray-300'}`}
                    >
                      {copiedPw ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  이 비밀번호를 사용자에게 전달해주세요. 첫 로그인 시 비밀번호 변경이 강제됩니다.
                </p>
                <button
                  onClick={() => { setCreatedPassword(null); setCopiedPw(false); }}
                  className="w-full py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors"
                >
                  확인
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 계정 수정 모달 */}
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
              onClick={e => e.stopPropagation()}
            >
              {/* 모달 헤더 */}
              <div className="px-6 py-5 border-b border-divider flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-ink-900">계정 수정</h3>
                  <p className="text-xs text-ink-400 mt-0.5">{editingUser.name ?? editingUser.email}</p>
                </div>
                <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-ink-100 rounded-xl transition-colors">
                  <X size={18} className="text-ink-400" />
                </button>
              </div>

              {/* 모달 바디 */}
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">이름</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full px-4 py-2.5 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                    placeholder="이름"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">이메일</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    className="w-full px-4 py-2.5 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                    placeholder="이메일"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-1.5">새 비밀번호</label>
                  <div className="relative">
                    <input
                      type={showEditPw ? 'text' : 'password'}
                      value={editPassword}
                      onChange={e => setEditPassword(e.target.value)}
                      className="w-full px-4 py-2.5 pr-11 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                      placeholder="변경하지 않으려면 비워두세요"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                    >
                      {showEditPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="text-xs text-ink-400 mt-1">최소 6자 이상</p>
                </div>
              </div>

              {/* 모달 푸터 */}
              <div className="px-6 py-4 bg-ink-50 border-t border-divider flex justify-end gap-2">
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2.5 text-sm font-medium text-ink-700 bg-white border border-divider rounded-xl hover:bg-ink-50 transition-colors"
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
