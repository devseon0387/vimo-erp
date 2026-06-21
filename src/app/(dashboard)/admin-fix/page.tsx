'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getMyProfile } from '@/lib/supabase/db';
import { useConfirm } from '@/contexts/ConfirmContext';

export default function AdminFixPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [authed, setAuthed] = useState(false);
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // 관리자 전용 — 비관리자 접근 차단
  useEffect(() => {
    getMyProfile().then((p) => {
      if (!p || p.role !== 'admin') { router.replace('/management'); return; }
      setAuthed(true);
    });
  }, [router]);

  const handleFix = async () => {
    if (!(await confirm({ title: '비용을 재계산할까요?', description: '모든 에피소드의 파트너/매니저 비용을 재계산합니다.', tone: 'brand', confirmLabel: '재계산' }))) return;
    setLoading(true);
    setResult('');
    try {
      const res = await fetch('/api/admin/fix-budgets', { method: 'POST' });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setResult('에러: ' + String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!authed) return null;

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-page mb-2">비용 데이터 보정</h1>
      <p className="text-sm text-[#78716c] mb-6">
        버그로 인해 뻥튀기된 에피소드 비용(budget_partner, budget_management)을 work_budgets 단가 기준으로 재계산합니다.
      </p>
      <button
        onClick={handleFix}
        disabled={loading}
        className="px-6 py-3 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700 disabled:bg-gray-300 transition-colors"
      >
        {loading ? '처리 중...' : '비용 재계산 실행'}
      </button>
      {result && (
        <pre className="mt-6 p-4 bg-[#fafaf9] rounded-xl border border-divider text-sm overflow-auto max-h-[600px] whitespace-pre-wrap">
          {result}
        </pre>
      )}
    </div>
  );
}
