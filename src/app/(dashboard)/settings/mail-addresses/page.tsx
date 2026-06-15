'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AtSign, Pencil, Plus, RefreshCw, ShieldAlert, UserPlus, Users, X } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { refreshInbox } from '@/lib/mail/inbox-shared';
import { LoadingState } from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

interface AddressRow {
  id: string;
  address: string;
  type: 'personal' | 'shared';
  ownerUserId: string | null;
  ownerName: string | null;
  label: string | null;
  active: boolean;
  members: { id: string; name: string | null }[];
}
interface StaffRow {
  id: string;
  name: string | null;
  email: string | null;
  approved: boolean;
  hasPersonal: boolean;
}

export default function MailAddressesPage() {
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [domain, setDomain] = useState('vi-mo.kr');
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [users, setUsers] = useState<StaffRow[]>([]);

  // 추가 폼
  const [local, setLocal] = useState('');
  const [type, setType] = useState<'personal' | 'shared'>('personal');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 담당 수정 모달
  const [editing, setEditing] = useState<AddressRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mail/addresses');
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setDomain(data.domain ?? 'vi-mo.kr');
        setAddresses(Array.isArray(data.addresses) ? data.addresses : []);
        setUsers(Array.isArray(data.users) ? data.users : []);
        // 디렉토리 변경(생성·담당변경·활성토글)이 좌측 폴더 패널·분류에 즉시 반영되도록
        // 공유 인박스 캐시도 강제 갱신 (load는 모든 변이 성공 후 호출됨).
        refreshInbox();
      }
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const active = addresses.filter((a) => a.active);
    return {
      total: active.length,
      personal: active.filter((a) => a.type === 'personal').length,
      shared: active.filter((a) => a.type === 'shared').length,
      unassigned: users.filter((u) => u.approved && !u.hasPersonal).length,
    };
  }, [addresses, users]);

  const toggleMember = (id: string) => {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const handleCreate = useCallback(async () => {
    if (!local.trim()) { toast.error('주소를 입력해주세요. (예: tax)'); return; }
    if (type === 'personal' && !ownerUserId) { toast.error('개인 주소는 직원을 선택해주세요.'); return; }
    if (type === 'shared' && memberIds.length === 0) { toast.error('공용 주소는 담당 직원을 선택해주세요.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/mail/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          local: local.trim().toLowerCase(),
          type,
          ownerUserId: type === 'personal' ? ownerUserId : undefined,
          memberIds: type === 'shared' ? memberIds : undefined,
          label: label.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '주소 생성에 실패했습니다.');
        return;
      }
      toast.success(`${data.address} 주소가 생성되었습니다. 즉시 수신이 시작됩니다.`);
      setLocal(''); setLabel(''); setOwnerUserId(''); setMemberIds([]);
      load();
    } catch {
      toast.error('주소 생성 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  }, [local, type, ownerUserId, memberIds, label, toast, load]);

  const handleToggleActive = useCallback(async (row: AddressRow) => {
    try {
      const res = await fetch('/api/mail/addresses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, active: !row.active }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || '변경에 실패했습니다.');
        return;
      }
      toast.success(`${row.address} ${row.active ? '비활성화' : '활성화'}되었습니다.`);
      load();
    } catch {
      toast.error('변경 중 오류가 발생했습니다.');
    }
  }, [toast, load]);

  // 직원 현황에서 "부여" 클릭 → 폼 프리필
  const prefillAssign = (u: StaffRow) => {
    setType('personal');
    setOwnerUserId(u.id);
    const suggest = (u.email || '')
      .split('@')[0]
      .replace(/[^a-z0-9._-]/gi, '')
      .toLowerCase()
      .replace(/^[._-]+|[._-]+$/g, ''); // 선/후행 점·하이픈 제거 (LOCAL_RE 통과 보장)
    setLocal(suggest);
    setLabel(u.name || '');
  };

  if (forbidden) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-page">메일 주소 관리</h1>
        </div>
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <ShieldAlert size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-amber-900">관리자 전용 기능입니다</p>
            <p className="text-[12px] text-amber-800 mt-0.5">메일 주소 생성·부여는 관리자만 할 수 있습니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-page">메일 주소 관리</h1>
        <p className="text-[#78716c] mt-1 text-sm">
          주소를 만들고 직원에게 부여합니다 — 등록 즉시 수신이 시작됩니다 (별도 설정 불필요)
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '전체 주소', value: stats.total },
          { label: '개인', value: stats.personal },
          { label: '공용', value: stats.shared },
          { label: '메일 미부여 직원', value: stats.unassigned, accent: stats.unassigned > 0 },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-2xl border border-ink-100 px-4 py-3.5">
            <p className="text-[11px] font-semibold text-[#a8a29e]">{k.label}</p>
            <p className={`text-[20px] font-bold mt-0.5 ${k.accent ? 'text-orange-500' : 'text-[#1c1917]'}`}>
              {loading ? '—' : k.value}
            </p>
          </div>
        ))}
      </div>

      {/* 주소 목록 */}
      <div className="bg-white rounded-2xl border border-ink-100">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-[#f8f7f6]">
          <AtSign size={16} className="text-orange-500" />
          <h2 className="text-section">주소 목록</h2>
          <button
            onClick={load}
            disabled={loading}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-divider bg-white text-[12px] font-medium text-[#44403c] hover:bg-[#fafaf9] disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            새로고침
          </button>
        </div>

        {loading ? (
          <LoadingState size="compact" />
        ) : addresses.length === 0 ? (
          <EmptyState
            icon={AtSign}
            title="아직 등록된 주소가 없습니다"
            description="아래에서 첫 주소를 만들어보세요."
            size="compact"
          />
        ) : (
          <>
            {/* 모바일: 카드 리스트 */}
            <div className="sm:hidden divide-y divide-[#f8f7f6]">
              {addresses.map((a) => {
                const assignees = a.type === 'personal'
                  ? (a.ownerName ? [a.ownerName] : [])
                  : a.members.map((m) => m.name || '이름없음');
                const empty = assignees.length === 0;
                return (
                  <div key={a.id} className="px-4 py-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className={`text-[14px] font-semibold truncate ${a.active ? 'text-[#1c1917]' : 'text-[#a8a29e] line-through'}`}>
                          {a.address}
                        </p>
                        <p className="text-[11px] text-[#78716c] truncate mt-0.5">
                          {empty ? (a.type === 'personal' ? '소유자 미지정' : '담당자 미지정') : assignees.join(' · ')}
                          {a.label ? ` · ${a.label}` : ''}
                        </p>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold flex-shrink-0 ${
                        a.type === 'personal' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {a.type === 'personal' ? '개인' : '공용'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditing(a)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-lg border border-divider bg-white text-[12px] font-semibold text-[#44403c] hover:bg-[#fafaf9] hover:text-orange-600 transition-colors"
                      >
                        <Pencil size={13} />
                        담당 변경
                      </button>
                      <button
                        onClick={() => handleToggleActive(a)}
                        className={`flex-1 inline-flex items-center justify-center min-h-[40px] rounded-lg text-[12px] font-semibold border transition-colors ${
                          a.active
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            : 'bg-[#fafaf9] text-[#a8a29e] border-divider hover:bg-[#f5f4f2]'
                        }`}
                      >
                        {a.active ? '활성' : '비활성'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 데스크탑: 테이블 */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-[#a8a29e] border-b border-[#f8f7f6]">
                    <th className="px-6 py-2.5">주소</th>
                    <th className="px-4 py-2.5">유형</th>
                    <th className="px-4 py-2.5">소유 · 담당</th>
                    <th className="px-4 py-2.5">라벨</th>
                    <th className="px-6 py-2.5 text-right">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {addresses.map((a) => (
                    <tr key={a.id} className="border-b border-[#f8f7f6] last:border-0">
                      <td className={`px-6 py-3 font-semibold ${a.active ? 'text-[#1c1917]' : 'text-[#a8a29e] line-through'}`}>
                        {a.address}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                          a.type === 'personal' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {a.type === 'personal' ? '개인' : '공용'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const assignees = a.type === 'personal'
                            ? (a.ownerName ? [a.ownerName] : [])
                            : a.members.map((m) => m.name || '이름없음');
                          const empty = assignees.length === 0;
                          return (
                            <button
                              onClick={() => setEditing(a)}
                              className={`group inline-flex items-center gap-1.5 text-left max-w-[260px] ${empty ? 'text-[#a8a29e]' : 'text-[#44403c]'} hover:text-orange-600 transition-colors`}
                              title="담당 변경"
                            >
                              <span className="truncate">{empty ? (a.type === 'personal' ? '소유자 지정' : '담당자 지정') : assignees.join(' · ')}</span>
                              <Pencil size={11} className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-orange-500 transition-opacity" />
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-[#78716c]">{a.label || '—'}</td>
                      <td className="px-6 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => setEditing(a)}
                            className="w-7 h-7 rounded-lg border border-divider bg-white text-[#78716c] hover:bg-[#fafaf9] hover:text-orange-600 flex items-center justify-center transition-colors"
                            title="담당 변경"
                            aria-label="담당 변경"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleToggleActive(a)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                              a.active
                                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                : 'bg-[#fafaf9] text-[#a8a29e] border-divider hover:bg-[#f5f4f2]'
                            }`}
                          >
                            {a.active ? '활성' : '비활성'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 주소 추가 */}
        <div className="bg-white rounded-2xl border border-ink-100">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-[#f8f7f6]">
            <Plus size={16} className="text-orange-500" />
            <h2 className="text-section">주소 추가</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">
                주소 <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                  placeholder="예: tax, contact, kim"
                  className="flex-1 px-3 py-2 border border-divider rounded-lg text-[13px] outline-none focus:border-orange-400"
                />
                <span className="text-[13px] font-semibold text-[#78716c]">@{domain}</span>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">
                유형 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                {([
                  { v: 'personal', t: '개인', d: '직원 1명에게 귀속' },
                  { v: 'shared', t: '공용', d: '여러 직원이 함께 받음' },
                ] as const).map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setType(o.v)}
                    className={`flex-1 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      type === o.v ? 'border-orange-400 bg-orange-50' : 'border-divider bg-white hover:bg-[#fafaf9]'
                    }`}
                  >
                    <p className={`text-[13px] font-semibold ${type === o.v ? 'text-orange-600' : 'text-[#44403c]'}`}>{o.t}</p>
                    <p className="text-[11px] text-[#a8a29e] mt-0.5">{o.d}</p>
                  </button>
                ))}
              </div>
            </div>

            {type === 'personal' ? (
              <div>
                <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">
                  직원 <span className="text-red-500">*</span>
                </label>
                <select
                  value={ownerUserId}
                  onChange={(e) => setOwnerUserId(e.target.value)}
                  className="w-full px-3 py-2 border border-divider rounded-lg text-[13px] outline-none focus:border-orange-400 bg-white"
                >
                  <option value="">직원 선택</option>
                  {users.filter((u) => u.approved).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email || u.id}{u.hasPersonal ? ' (개인 주소 있음)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">
                  담당 직원 <span className="text-red-500">*</span> <span className="text-[#a8a29e] font-normal">(복수 선택)</span>
                </label>
                <div className="border border-divider rounded-lg divide-y divide-[#f8f7f6] max-h-44 overflow-y-auto">
                  {users.filter((u) => u.approved).map((u) => (
                    <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[#fafaf9]">
                      <input
                        type="checkbox"
                        checked={memberIds.includes(u.id)}
                        onChange={() => toggleMember(u.id)}
                        className="accent-orange-500"
                      />
                      <span className="text-[13px] text-[#44403c]">{u.name || u.email || u.id}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">라벨</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="예: 세무, 외부 문의"
                className="w-full px-3 py-2 border border-divider rounded-lg text-[13px] outline-none focus:border-orange-400"
              />
            </div>

            <div className="pt-1">
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-orange-500 text-white text-[13px] font-semibold hover:bg-orange-600 disabled:bg-[var(--color-ink-300)] transition-colors"
              >
                <Plus size={14} />
                {submitting ? '생성 중...' : `주소 생성 — 즉시 수신 시작`}
              </button>
              <p className="text-[11px] text-[#a8a29e] mt-2">
                도메인 전체를 수신(catch-all)하므로 DNS·AWS 추가 설정 없이 등록만으로 동작합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 직원 부여 현황 */}
        <div className="bg-white rounded-2xl border border-ink-100">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-[#f8f7f6]">
            <Users size={16} className="text-orange-500" />
            <h2 className="text-section">직원 메일 현황</h2>
          </div>
          {loading ? (
            <LoadingState size="compact" />
          ) : (
            <ul>
              {users.filter((u) => u.approved).map((u, idx, arr) => {
                const personal = addresses.find((a) => a.type === 'personal' && a.active && a.ownerUserId === u.id);
                return (
                  <li
                    key={u.id}
                    className={`flex items-center gap-3 px-6 py-3 ${idx < arr.length - 1 ? 'border-b border-[#f8f7f6]' : ''}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center text-[12px] font-semibold flex-shrink-0">
                      {(u.name || u.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#1c1917] truncate">{u.name || u.email}</p>
                      <p className="text-[11px] text-[#a8a29e] truncate">
                        {personal ? personal.address : '회사 메일 주소 없음'}
                      </p>
                    </div>
                    {personal ? (
                      <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-[11px] font-semibold flex-shrink-0">
                        부여됨
                      </span>
                    ) : (
                      <button
                        onClick={() => prefillAssign(u)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-orange-600 text-[11px] font-semibold hover:bg-orange-100 flex-shrink-0"
                      >
                        <UserPlus size={12} />
                        부여
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {editing && (
        <EditAddressModal
          row={editing}
          users={users.filter((u) => u.approved)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── 담당 수정 모달 ─────────────────────────────────────────
function EditAddressModal({
  row,
  users,
  onClose,
  onSaved,
}: {
  row: AddressRow;
  users: StaffRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [type, setType] = useState<'personal' | 'shared'>(row.type);
  const [ownerUserId, setOwnerUserId] = useState(row.ownerUserId ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(row.members.map((m) => m.id));
  const [label, setLabel] = useState(row.label ?? '');
  const [saving, setSaving] = useState(false);

  const toggleMember = (id: string) =>
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));

  const save = useCallback(async () => {
    if (type === 'personal' && !ownerUserId) { toast.error('개인 주소는 직원을 선택해주세요.'); return; }
    if (type === 'shared' && memberIds.length === 0) { toast.error('공용 주소는 담당 직원을 선택해주세요.'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/mail/addresses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          type,
          ownerUserId: type === 'personal' ? ownerUserId : undefined,
          memberIds: type === 'shared' ? memberIds : undefined,
          label: label.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || '담당 변경에 실패했습니다.'); return; }
      toast.success(`${row.address} 담당이 변경되었습니다.`);
      onSaved();
    } catch {
      toast.error('담당 변경 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }, [row.id, row.address, type, ownerUserId, memberIds, label, toast, onSaved]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[440px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-6 py-4 border-b border-[#f8f7f6]">
          <Pencil size={15} className="text-orange-500" />
          <div>
            <h2 className="text-section">담당 변경</h2>
            <p className="text-[11.5px] text-[#a8a29e]">{row.address}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-[#a8a29e] hover:text-[#44403c] p-1" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* 유형 */}
          <div>
            <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">유형</label>
            <div className="flex gap-2">
              {([
                { v: 'personal', t: '개인', d: '직원 1명에게 귀속' },
                { v: 'shared', t: '공용', d: '여러 직원이 함께 받음' },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setType(o.v)}
                  className={`flex-1 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    type === o.v ? 'border-orange-400 bg-orange-50' : 'border-divider bg-white hover:bg-[#fafaf9]'
                  }`}
                >
                  <p className={`text-[13px] font-semibold ${type === o.v ? 'text-orange-600' : 'text-[#44403c]'}`}>{o.t}</p>
                  <p className="text-[11px] text-[#a8a29e] mt-0.5">{o.d}</p>
                </button>
              ))}
            </div>
          </div>

          {type === 'personal' ? (
            <div>
              <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">
                소유 직원 <span className="text-red-500">*</span>
              </label>
              <select
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
                className="w-full px-3 py-2 border border-divider rounded-lg text-[13px] outline-none focus:border-orange-400 bg-white"
              >
                <option value="">직원 선택</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">
                담당 직원 <span className="text-red-500">*</span> <span className="text-[#a8a29e] font-normal">(복수 선택)</span>
              </label>
              <div className="border border-divider rounded-lg divide-y divide-[#f8f7f6] max-h-44 overflow-y-auto">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[#fafaf9]">
                    <input
                      type="checkbox"
                      checked={memberIds.includes(u.id)}
                      onChange={() => toggleMember(u.id)}
                      className="accent-orange-500"
                    />
                    <span className="text-[13px] text-[#44403c]">{u.name || u.email || u.id}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-semibold text-[#44403c] mb-1.5">라벨</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: 세무, 외부 문의"
              className="w-full px-3 py-2 border border-divider rounded-lg text-[13px] outline-none focus:border-orange-400"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-3.5 border-t border-[#f8f7f6]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-divider bg-white text-[13px] font-semibold text-[#44403c] hover:bg-[#fafaf9]"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-orange-500 text-white text-[13px] font-semibold hover:bg-orange-600 disabled:bg-[var(--color-ink-300)] transition-colors"
          >
            {saving ? '저장 중...' : '변경 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
