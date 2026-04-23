'use client';

import { useState } from 'react';

export default function AdminFixPage() {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleFix = async () => {
    if (!confirm('모든 에피소드의 파트너/매니저 비용을 재계산합니다. 진행할까요?')) return;
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

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold mb-2">비용 데이터 보정</h1>
      <p className="text-sm text-gray-500 mb-6">
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
        <pre className="mt-6 p-4 bg-gray-50 rounded-xl border border-divider text-sm overflow-auto max-h-[600px] whitespace-pre-wrap">
          {result}
        </pre>
      )}
    </div>
  );
}
