'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Partner } from '@/types';
import { FloatingLabelInput } from '@/components/FloatingLabelInput';
import { formatPhoneNumber } from '@/lib/utils';
import { updatePartner } from '@/lib/supabase/db';
import { useToast } from '@/contexts/ToastContext';

const KR_BANKS = [
  { name: 'KB국민',    abbr: 'KB', bg: '#FFBC00', fg: '#2D2D2D' },
  { name: '신한',      abbr: '신',  bg: '#0046FF', fg: '#fff' },
  { name: '하나',      abbr: '하',  bg: '#009E60', fg: '#fff' },
  { name: '우리',      abbr: '우',  bg: '#0070C0', fg: '#fff' },
  { name: 'NH농협',    abbr: 'NH', bg: '#008751', fg: '#fff' },
  { name: 'IBK기업',   abbr: 'IB', bg: '#004B9B', fg: '#fff' },
  { name: 'KDB산업',   abbr: 'KD', bg: '#003087', fg: '#fff' },
  { name: 'SC제일',    abbr: 'SC', bg: '#00AA5E', fg: '#fff' },
  { name: '씨티',      abbr: 'C',  bg: '#003B8B', fg: '#fff' },
  { name: '대구',      abbr: '대',  bg: '#1B4F9A', fg: '#fff' },
  { name: '부산',      abbr: '부',  bg: '#005BAC', fg: '#fff' },
  { name: '광주',      abbr: '광',  bg: '#00833E', fg: '#fff' },
  { name: '제주',      abbr: '제',  bg: '#0068B7', fg: '#fff' },
  { name: '전북',      abbr: '전',  bg: '#003E8E', fg: '#fff' },
  { name: '경남',      abbr: '경',  bg: '#1D4B8E', fg: '#fff' },
  { name: '수협',      abbr: '수',  bg: '#005192', fg: '#fff' },
  { name: '카카오뱅크', abbr: 'K',  bg: '#FAE300', fg: '#2D2D2D' },
  { name: '토스뱅크',   abbr: 'T',  bg: '#0064FF', fg: '#fff' },
  { name: '케이뱅크',   abbr: 'K',  bg: '#7C4DFF', fg: '#fff' },
] as const;

interface PartnerEditModalProps {
  partner: Partner;
  onClose: () => void;
  onSaved: (updated: Partial<Partner>) => void;
}

export default function PartnerEditModal({ partner, onClose, onSaved }: PartnerEditModalProps) {
  const toast = useToast();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);
  const [isGenerationDropdownOpen, setIsGenerationDropdownOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: partner.name,
    email: partner.email || '',
    phone: partner.phone || '',
    bank: partner.bank || '',
    bankAccount: partner.bankAccount || '',
    partnerType: (partner.partnerType || 'freelancer') as 'freelancer' | 'business',
    generation: partner.generation || 1,
    status: partner.status as 'active' | 'inactive',
  });

  const handleSave = async () => {
    const updates = {
      name: editForm.name,
      email: editForm.email,
      phone: editForm.phone || undefined,
      bank: editForm.bank || undefined,
      bankAccount: editForm.bankAccount || undefined,
      partnerType: editForm.partnerType,
      generation: editForm.generation,
      status: editForm.status,
    };
    const ok = await updatePartner(partner.id, updates);
    if (ok) {
      onSaved(updates);
      toast.success(`${editForm.name} 파트너 정보가 수정되었습니다.`);
    } else {
      toast.error('수정에 실패했습니다. 다시 시도해주세요.');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-white rounded-lg shadow-xl max-w-lg w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 sm:px-6 py-4 border-b border-divider">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">파트너 정보 수정</h2>
          </div>
          <div className="p-4 sm:p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">기본 정보</h3>
              <FloatingLabelInput
                label="이름"
                required
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">연락처 정보</h3>
              <FloatingLabelInput
                label="전화번호"
                type="tel"
                value={formatPhoneNumber(editForm.phone)}
                onChange={(e) => setEditForm({ ...editForm, phone: formatPhoneNumber(e.target.value) })}
              />
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">계좌번호</label>
                <div className="flex gap-2">
                  <div className="relative flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsBankDropdownOpen(!isBankDropdownOpen)}
                      className="h-12 px-3 border-2 border-divider rounded-xl bg-white flex items-center gap-2 hover:border-gray-300 transition-colors whitespace-nowrap min-w-[110px]"
                    >
                      {editForm.bank ? (() => {
                        const b = KR_BANKS.find(b => b.name === editForm.bank);
                        return b ? (
                          <>
                            <span
                              className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                              style={{ background: b.bg, color: b.fg }}
                            >
                              {b.abbr}
                            </span>
                            <span className="text-sm font-medium text-gray-900 truncate max-w-[68px]">{b.name}</span>
                          </>
                        ) : null;
                      })() : (
                        <span className="text-sm text-gray-400">은행 선택</span>
                      )}
                      <ChevronDown size={13} className="text-gray-400 flex-shrink-0 ml-auto" />
                    </button>
                    {isBankDropdownOpen && (
                      <>
                      <div
                        className="fixed inset-0 z-20 sm:hidden"
                        onClick={() => setIsBankDropdownOpen(false)}
                      />
                      <div className="fixed sm:absolute inset-x-4 sm:inset-x-auto bottom-4 sm:bottom-auto z-30 sm:left-0 sm:top-full sm:mt-2 bg-white border-2 border-divider rounded-2xl shadow-2xl p-3 sm:w-[320px]">
                        <p className="text-xs text-gray-400 font-medium mb-2 px-1">은행 선택</p>
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                          {KR_BANKS.map((bank) => {
                            const isSelected = editForm.bank === bank.name;
                            return (
                              <button
                                key={bank.name}
                                type="button"
                                onClick={() => {
                                  setEditForm({ ...editForm, bank: bank.name });
                                  setIsBankDropdownOpen(false);
                                }}
                                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-colors ${
                                  isSelected ? 'bg-orange-50 ring-2 ring-orange-400' : 'hover:bg-gray-50'
                                }`}
                              >
                                <span
                                  className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shadow-sm"
                                  style={{ background: bank.bg, color: bank.fg }}
                                >
                                  {bank.abbr}
                                </span>
                                <span className="text-[10px] text-gray-700 font-medium leading-tight text-center w-full truncate">
                                  {bank.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      </>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="계좌번호 입력"
                    value={editForm.bankAccount}
                    onChange={(e) => setEditForm({ ...editForm, bankAccount: e.target.value })}
                    className="flex-1 h-12 px-4 border-2 border-divider rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 text-sm text-gray-900 placeholder-gray-400 transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">파트너 유형</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, partnerType: 'freelancer' })}
                    className={`h-12 rounded-xl font-semibold transition-colors ${
                      editForm.partnerType === 'freelancer'
                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    프리랜서
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, partnerType: 'business' })}
                    className={`h-12 rounded-xl font-semibold transition-colors ${
                      editForm.partnerType === 'business'
                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    사업자
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">파트너 기수</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsGenerationDropdownOpen(!isGenerationDropdownOpen)}
                    className="w-full h-12 px-4 border-2 border-divider rounded-xl bg-white text-left flex items-center justify-between hover:border-gray-300 transition-colors"
                  >
                    <span className="text-gray-900 font-medium">{editForm.generation}기</span>
                    <ChevronDown size={18} className="text-gray-400" />
                  </button>
                  {isGenerationDropdownOpen && (
                    <div className="absolute z-20 w-full mt-2 bg-white border-2 border-divider rounded-xl shadow-2xl overflow-hidden">
                      {[1, 2, 3].map((gen) => (
                        <button
                          key={gen}
                          type="button"
                          onClick={() => {
                            setEditForm({ ...editForm, generation: gen });
                            setIsGenerationDropdownOpen(false);
                          }}
                          className={`w-full px-4 py-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl ${
                            editForm.generation === gen ? 'bg-orange-50 text-orange-700 font-semibold' : 'hover:bg-orange-50 text-gray-900'
                          }`}
                        >
                          {gen}기
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">상태</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white text-left flex items-center justify-between hover:border-gray-400 transition-colors"
                >
                  <span className="text-gray-900">
                    {editForm.status === 'active' ? '활성' : '비활성'}
                  </span>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>
                {isStatusDropdownOpen && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setEditForm({ ...editForm, status: 'active' });
                        setIsStatusDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left transition-colors ${
                        editForm.status === 'active' ? 'bg-orange-50 text-orange-700 font-medium' : 'hover:bg-gray-50 text-gray-900'
                      }`}
                    >
                      활성
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditForm({ ...editForm, status: 'inactive' });
                        setIsStatusDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left transition-colors ${
                        editForm.status === 'inactive' ? 'bg-orange-50 text-orange-700 font-medium' : 'hover:bg-gray-50 text-gray-900'
                      }`}
                    >
                      비활성
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="px-4 sm:px-6 py-4 border-t border-divider flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors active:scale-[0.97]"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={!editForm.name}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors active:scale-[0.97] disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
