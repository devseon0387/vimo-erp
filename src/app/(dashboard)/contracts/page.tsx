'use client';

import { FileText } from 'lucide-react';

export default function ContractsPage() {
  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-page">계약 관리</h1>
        <p className="text-[#78716c] mt-1 text-sm">계약서 등록·관리·갱신 알림 (준비중)</p>
      </div>

      {/* 빈 상태 */}
      <div className="bg-white rounded-2xl border border-ink-100 py-20 flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center">
          <FileText size={28} className="text-orange-500" />
        </div>
        <p className="text-[14px] font-semibold text-[#1c1917]">아직 준비중인 영역입니다</p>
        <p className="text-[12px] text-[#a8a29e]">계약서 업로드·만료일 추적·자동 갱신 알림 기능이 들어올 예정입니다</p>
      </div>
    </div>
  );
}
