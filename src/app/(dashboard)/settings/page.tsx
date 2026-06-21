'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ClipboardList, CheckCircle, AlertCircle } from 'lucide-react';
import { FloatingLabelInput } from '@/components/FloatingLabelInput';
import PushNotificationSetup from '@/components/PushNotificationSetup';
import { getSessionUser } from '@/lib/auth/session-info';
import { updateMyProfile } from '@/lib/auth/account';
import { changeMyPassword } from '@/lib/auth/password';

export default function SettingsPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // 알림 설정 상태
  const NOTIF_KEY = 'video-moment-notif-settings';
  const [notifNewProject, setNotifNewProject] = useState(true);
  const [notifNewPartner, setNotifNewPartner] = useState(true);
  const [notifProjectDone, setNotifProjectDone] = useState(false);
  const [notifMsg, setNotifMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getSessionUser().then((u) => {
      if (u) {
        setEmail(u.email ?? '');
        setName(u.name ?? '');
      }
    });
    // 알림 설정 불러오기
    try {
      const saved = localStorage.getItem(NOTIF_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.newProject === 'boolean') setNotifNewProject(parsed.newProject);
        if (typeof parsed.newPartner === 'boolean') setNotifNewPartner(parsed.newPartner);
        if (typeof parsed.projectDone === 'boolean') setNotifProjectDone(parsed.projectDone);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    setProfileMsg(null);
    const res = await updateMyProfile({ email, name });
    setProfileLoading(false);
    if (!res.ok) {
      setProfileMsg({ type: 'error', text: res.error ?? '저장에 실패했습니다.' });
    } else {
      setProfileMsg({ type: 'success', text: '저장되었습니다.' });
    }
  };

  const handleSaveNotifications = () => {
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify({
        newProject: notifNewProject,
        newPartner: notifNewPartner,
        projectDone: notifProjectDone,
      }));
      setNotifMsg({ type: 'success', text: '알림 설정이 저장되었습니다.' });
      setTimeout(() => setNotifMsg(null), 3000);
    } catch {
      setNotifMsg({ type: 'error', text: '저장에 실패했습니다.' });
    }
  };

  const handleChangePassword = async () => {
    setPasswordMsg(null);
    if (!newPassword) {
      setPasswordMsg({ type: 'error', text: '새 비밀번호를 입력해주세요.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: '새 비밀번호가 일치하지 않습니다.' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: '비밀번호는 6자 이상이어야 합니다.' });
      return;
    }
    setPasswordLoading(true);
    const res = await changeMyPassword(currentPassword, newPassword);
    setPasswordLoading(false);
    if (!res.ok) {
      setPasswordMsg({ type: 'error', text: res.error ?? '비밀번호 변경에 실패했습니다.' });
    } else {
      setPasswordMsg({ type: 'success', text: '비밀번호가 변경되었습니다.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div>
        <h1 className="text-page">설정</h1>
        <p className="text-ink-500 mt-2">내 계정 · 시스템 설정 (전사 계정은 대표 메뉴의 &lsquo;계정 관리&rsquo;에서)</p>
      </div>

      {/* 바로가기 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link href="/settings/changelog">
          <div className="bg-white border border-divider rounded-xl shadow-sm p-4 hover:shadow-md transition-all cursor-pointer h-full">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-50 rounded-lg">
                <ClipboardList className="text-green-600" size={18} />
              </div>
              <h2 className="text-[15px] font-semibold text-ink-900">업데이트 기록</h2>
            </div>
            <p className="text-sm text-ink-600">기능 추가, 수정 사항 등 변경 이력 확인</p>
          </div>
        </Link>
      </div>

      {/* 계정 설정 */}
      <div className="space-y-5">
        {/* 계정 정보 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-[15px] font-semibold text-ink-900 mb-4">계정 정보</h2>
          <div className="space-y-4">
            <FloatingLabelInput
              label="이름"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <FloatingLabelInput
              label="이메일"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {profileMsg && (
              <div className={`flex items-center gap-2 text-sm ${profileMsg.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                {profileMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {profileMsg.text}
              </div>
            )}
            <div>
              <button
                onClick={handleSaveProfile}
                disabled={profileLoading}
                className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {profileLoading ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>

        {/* 비밀번호 변경 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-[15px] font-semibold text-ink-900 mb-4">비밀번호 변경</h2>
          <div className="space-y-4">
            <FloatingLabelInput
              label="현재 비밀번호"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <FloatingLabelInput
              label="새 비밀번호"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <FloatingLabelInput
              label="새 비밀번호 확인"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {passwordMsg && (
              <div className={`flex items-center gap-2 text-sm ${passwordMsg.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                {passwordMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {passwordMsg.text}
              </div>
            )}
            <div>
              <button
                onClick={handleChangePassword}
                disabled={passwordLoading}
                className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {passwordLoading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </div>
          </div>
        </div>

        {/* 푸시 알림 */}
        <PushNotificationSetup />

        {/* 알림 설정 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-[15px] font-semibold text-ink-900 mb-4">알림 설정</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink-900">새 프로젝트 알림</p>
                <p className="text-sm text-ink-500">새로운 프로젝트가 생성되면 알림을 받습니다</p>
              </div>
              <input
                type="checkbox"
                checked={notifNewProject}
                onChange={(e) => setNotifNewProject(e.target.checked)}
                className="w-5 h-5 text-orange-500 accent-[#f97316]"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink-900">파트너 가입 알림</p>
                <p className="text-sm text-ink-500">새로운 파트너가 가입하면 알림을 받습니다</p>
              </div>
              <input
                type="checkbox"
                checked={notifNewPartner}
                onChange={(e) => setNotifNewPartner(e.target.checked)}
                className="w-5 h-5 text-orange-500 accent-[#f97316]"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-ink-900">프로젝트 완료 알림</p>
                <p className="text-sm text-ink-500">프로젝트가 완료되면 알림을 받습니다</p>
              </div>
              <input
                type="checkbox"
                checked={notifProjectDone}
                onChange={(e) => setNotifProjectDone(e.target.checked)}
                className="w-5 h-5 text-orange-500 accent-[#f97316]"
              />
            </div>
            {notifMsg && (
              <div className={`flex items-center gap-2 text-sm ${notifMsg.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                {notifMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {notifMsg.text}
              </div>
            )}
            <div>
              <button
                onClick={handleSaveNotifications}
                className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
