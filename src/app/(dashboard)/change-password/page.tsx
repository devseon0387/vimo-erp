'use client';

import { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { changeMyPassword } from '@/lib/auth/password';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentPassword) {
      setError('현재 비밀번호를 입력해주세요.');
      return;
    }
    if (newPassword.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      // Auth.js + bcrypt: 현재비번 검증 후 user_profiles.password_hash 갱신 + needs_password_change=false
      const res = await changeMyPassword(currentPassword, newPassword);
      if (!res.ok) {
        setError(res.error ?? '비밀번호 변경에 실패했습니다.');
        setLoading(false);
        return;
      }
      window.location.href = '/management';
    } catch {
      setError('비밀번호 변경 중 오류가 발생했습니다.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-divider shadow-sm overflow-hidden">
          {/* 헤더 */}
          <div className="px-8 pt-8 pb-4 text-center">
            <div className="inline-flex p-3 bg-orange-100 rounded-xl mb-4">
              <Lock size={28} className="text-orange-600" />
            </div>
            <h1 className="text-2xl font-bold text-[#1c1917]">비밀번호 변경</h1>
            <p className="text-sm text-[#78716c] mt-2">
              보안을 위해 새 비밀번호를 설정해주세요.
            </p>
          </div>

          {/* 폼 */}
          <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#44403c] mb-1.5">현재 비밀번호</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                placeholder="로그인에 사용한 비밀번호"
                autoComplete="current-password"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#44403c] mb-1.5">새 비밀번호</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-11 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                  placeholder="6자 이상 입력"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a8a29e] hover:text-[#57534e]"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#44403c] mb-1.5">비밀번호 확인</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-11 border border-divider rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
                  placeholder="비밀번호를 다시 입력"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a8a29e] hover:text-[#57534e]"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '변경 중...' : '비밀번호 변경'}
            </button>

            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs">
              <CheckCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>임시 비밀번호를 변경해야 시스템을 사용할 수 있습니다.</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
