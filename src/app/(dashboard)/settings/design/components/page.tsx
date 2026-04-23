'use client';

import { useState } from 'react';
import { ArrowLeft, X, Check, Calendar, Plus, ChevronDown, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { FloatingLabelInput, FloatingLabelTextarea } from '@/components/FloatingLabelInput';

export default function DesignComponentsPage() {
  const [showToast, setShowToast] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [floatingInputValue, setFloatingInputValue] = useState('');
  const [floatingTextareaValue, setFloatingTextareaValue] = useState('');

  const displayToast = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="space-y-8 pb-20">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={24} className="text-gray-600" />
          </button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">디자인 시스템</h1>
          <p className="text-gray-500 mt-2">Video Moment의 통합 디자인 가이드</p>
        </div>
      </div>

      {/* 디자인 원칙 */}
      <div className="bg-gradient-to-br from-orange-50 to-orange-50 border-2 border-orange-200/50 rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          ✨ 디자인 원칙
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/60 backdrop-blur-md rounded-xl p-4 border border-white/60">
            <h3 className="font-bold text-gray-900 mb-2">🔮 글래스모피즘</h3>
            <p className="text-sm text-gray-600">backdrop-blur와 투명도를 활용한 반투명 유리 효과</p>
          </div>
          <div className="bg-white/60 backdrop-blur-md rounded-xl p-4 border border-white/60">
            <h3 className="font-bold text-gray-900 mb-2">🎨 부드러운 색상</h3>
            <p className="text-sm text-gray-600">그라디언트와 파스텔 톤의 조화로운 색상 사용</p>
          </div>
          <div className="bg-white/60 backdrop-blur-md rounded-xl p-4 border border-white/60">
            <h3 className="font-bold text-gray-900 mb-2">⚡ 부드러운 애니메이션</h3>
            <p className="text-sm text-gray-600">0.2~0.8초의 자연스러운 전환 효과 (ease-in-out)</p>
          </div>
          <div className="bg-white/60 backdrop-blur-md rounded-xl p-4 border border-white/60">
            <h3 className="font-bold text-gray-900 mb-2">🎯 일관성</h3>
            <p className="text-sm text-gray-600">모든 페이지에서 동일한 디자인 패턴 유지</p>
          </div>
        </div>
      </div>

      {/* 토스트 알림 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">토스트 알림</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 회차 상세, 작업 완료 시</p>
          </div>
          <button
            onClick={() => toggleSection('toast')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`transform transition-transform ${expandedSections['toast'] ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => displayToast('작업이 성공적으로 완료되었습니다!')}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all shadow-md font-medium"
          >
            성공 토스트
          </button>
          <button
            onClick={() => displayToast('새로운 작업이 추가되었습니다.')}
            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-md font-medium"
          >
            정보 토스트
          </button>
          <button
            onClick={() => displayToast('필수 항목을 확인해주세요.')}
            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-md font-medium"
          >
            경고 토스트
          </button>
        </div>

        {/* 미리보기 */}
        <div className="p-6 bg-gray-50 rounded-xl border border-divider flex flex-wrap gap-4">
          {/* 성공 */}
          <div className="bg-gradient-to-r from-green-500/95 to-green-600/95 backdrop-blur-xl text-white px-6 py-4 rounded-2xl shadow-2xl border border-white/20 flex items-center gap-3 w-fit">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Check className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
            </div>
            <p className="text-white font-medium">작업이 성공적으로 완료되었습니다!</p>
          </div>
          {/* 경고 */}
          <div className="bg-gradient-to-r from-amber-500/95 to-orange-500/95 backdrop-blur-xl text-white px-6 py-4 rounded-2xl shadow-2xl border border-white/20 flex items-center gap-3 w-fit">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
            </div>
            <p className="text-white font-medium">필수 항목을 확인해주세요.</p>
          </div>
        </div>

        {expandedSections['toast'] && (
          <div className="mt-6 p-4 bg-gray-900 rounded-xl">
            <pre className="text-xs text-green-400 overflow-x-auto">
{`{/* 성공 */}
<div className="bg-gradient-to-r from-green-500/95
  to-green-600/95 backdrop-blur-xl text-white px-6 py-4
  rounded-2xl shadow-2xl border border-white/20
  flex items-center gap-3">
  <div className="w-10 h-10 bg-white/20 rounded-full
    flex items-center justify-center">
    <Check />
  </div>
  <p>메시지</p>
</div>

{/* 경고 */}
<div className="bg-gradient-to-r from-amber-500/95
  to-orange-500/95 backdrop-blur-xl text-white px-6 py-4
  rounded-2xl shadow-2xl border border-white/20
  flex items-center gap-3">
  <div className="w-10 h-10 bg-white/20 rounded-full
    flex items-center justify-center">
    <AlertCircle />
  </div>
  <p>메시지</p>
</div>`}
            </pre>
          </div>
        )}
      </div>

      {/* 모달 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">모달 창</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 회차 작업 목록, 삭제 확인</p>
          </div>
          <button
            onClick={() => toggleSection('modal')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`transform transition-transform ${expandedSections['modal'] ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-md font-medium"
        >
          모달 열기
        </button>

        <div className="mt-6 p-4 bg-gradient-to-br from-orange-50/60 to-orange-50/60 rounded-xl border border-orange-200/40">
          <h3 className="font-semibold text-gray-900 mb-3">핵심 특징</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• 배경 블러 처리 (backdrop-blur-sm)</li>
            <li>• 모달 크기 부드러운 애니메이션 (0.6초, ease-in-out)</li>
            <li>• 탭 전환 시 높이 자동 조절</li>
            <li>• 스티키 헤더로 스크롤 시에도 제목 고정</li>
          </ul>
        </div>

        {expandedSections['modal'] && (
          <div className="mt-6 p-4 bg-gray-900 rounded-xl">
            <pre className="text-xs text-green-400 overflow-x-auto">
{`<div className="fixed inset-0 z-50">
  <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" />
  <div className="bg-white/95 backdrop-blur-2xl rounded-2xl
    shadow-2xl border border-white/60"
    style={{ transition: 'height 600ms cubic-bezier(0.4, 0, 0.2, 1)' }}>
    {/* 내용 */}
  </div>
</div>`}
            </pre>
          </div>
        )}
      </div>

      {/* 카드 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">카드</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 프로젝트 목록, 회차 카드, 기본 정보</p>
          </div>
          <button
            onClick={() => toggleSection('card')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`transform transition-transform ${expandedSections['card'] ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/40 backdrop-blur-xl rounded-2xl border border-white/60 p-6 shadow-xl">
            <h3 className="font-bold text-gray-900 mb-2">기본 글래스 카드</h3>
            <p className="text-sm text-gray-600">bg-white/40 + backdrop-blur-xl</p>
          </div>

          <div className="bg-gradient-to-br from-orange-50/20 to-orange-50/20 rounded-xl border border-divider/40 backdrop-blur-md p-6 shadow-md">
            <h3 className="font-bold text-gray-900 mb-2">그라디언트 카드</h3>
            <p className="text-sm text-gray-600">그라디언트 배경 + 투명도</p>
          </div>

          <div className="border border-divider/50 rounded-xl p-6 hover:bg-gray-50/50 transition-all cursor-pointer">
            <h3 className="font-bold text-gray-900 mb-2">보더 카드</h3>
            <p className="text-sm text-gray-600">호버 시 배경 변화</p>
          </div>
        </div>

        {expandedSections['card'] && (
          <div className="mt-6 p-4 bg-gray-900 rounded-xl">
            <pre className="text-xs text-green-400 overflow-x-auto">
{`{/* 글래스 카드 */}
<div className="bg-white/40 backdrop-blur-xl rounded-2xl
  border border-white/60 p-6 shadow-xl">
  내용
</div>

{/* 그라디언트 카드 */}
<div className="bg-gradient-to-br from-orange-50/20
  to-orange-50/20 rounded-xl border border-divider/40
  backdrop-blur-md p-6">
  내용
</div>`}
            </pre>
          </div>
        )}
      </div>

      {/* 버튼 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">버튼</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 모든 페이지</p>
          </div>
          <button
            onClick={() => toggleSection('button')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`transform transition-transform ${expandedSections['button'] ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Primary (그라디언트)</h3>
            <div className="flex flex-wrap gap-3">
              <button className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-md font-medium">
                파란색
              </button>
              <button className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all shadow-md font-medium">
                초록색
              </button>
              <button className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-md font-medium">
                보라색
              </button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Secondary (블러)</h3>
            <div className="flex flex-wrap gap-3">
              <button className="px-6 py-3 bg-white/60 backdrop-blur-sm text-gray-700 rounded-xl hover:bg-white/80 transition-colors font-medium border border-divider/60 shadow-sm">
                보조 버튼
              </button>
              <button className="px-6 py-3 bg-orange-500/90 backdrop-blur-sm text-white rounded-xl hover:bg-orange-600 transition-colors shadow-md font-medium">
                블러 버튼
              </button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Status</h3>
            <div className="flex flex-wrap gap-3">
              <button className="px-3 py-1.5 bg-green-500/90 backdrop-blur-sm text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium shadow-sm">
                완료로 표시
              </button>
              <button className="px-3 py-1.5 bg-yellow-500/90 backdrop-blur-sm text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm font-medium shadow-sm">
                진행중으로 변경
              </button>
              <button className="px-3 py-1.5 bg-red-500/90 backdrop-blur-sm text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium shadow-sm">
                삭제
              </button>
            </div>
          </div>
        </div>

        {expandedSections['button'] && (
          <div className="mt-6 p-4 bg-gray-900 rounded-xl">
            <pre className="text-xs text-green-400 overflow-x-auto">
{`{/* Primary 그라디언트 */}
<button className="px-6 py-3 bg-gradient-to-r
  from-orange-500 to-orange-600 text-white rounded-xl
  hover:from-orange-600 hover:to-orange-700 transition-all
  shadow-md font-medium">
  버튼
</button>

{/* Secondary 블러 */}
<button className="px-6 py-3 bg-white/60 backdrop-blur-sm
  text-gray-700 rounded-xl hover:bg-white/80
  transition-colors font-medium border border-divider/60">
  버튼
</button>`}
            </pre>
          </div>
        )}
      </div>

      {/* 입력 필드 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">입력 필드</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 회차 편집, 작업 단계 입력</p>
          </div>
          <button
            onClick={() => toggleSection('input')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`transform transition-transform ${expandedSections['input'] ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">기본 입력</label>
            <input
              type="text"
              placeholder="내용을 입력하세요"
              className="w-full px-4 py-2 bg-white/60 backdrop-blur-sm border border-divider/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">날짜 입력</label>
            <input
              type="date"
              className="w-full px-4 py-2 bg-white/60 backdrop-blur-sm border border-divider/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">선택 (Select)</label>
            <select className="w-full px-4 py-2 bg-white/60 backdrop-blur-sm border border-divider/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all">
              <option>대기</option>
              <option>진행중</option>
              <option>완료</option>
            </select>
          </div>

          {/* Floating Label Inputs */}
          <div className="pt-6 border-t border-divider">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">✨ Floating Label (추천)</h3>
            <div className="space-y-4">
              <FloatingLabelInput
                label="프로젝트 제목"
                required
                value={floatingInputValue}
                onChange={(e) => setFloatingInputValue(e.target.value)}
              />

              <FloatingLabelInput
                label="클라이언트명"
                value=""
                onChange={() => {}}
              />

              <FloatingLabelTextarea
                label="프로젝트 설명"
                required
                value={floatingTextareaValue}
                onChange={(e) => setFloatingTextareaValue(e.target.value)}
              />
            </div>
          </div>
        </div>

        {expandedSections['input'] && (
          <div className="mt-6 space-y-4">
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">기본 입력 필드:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`<input
  type="text"
  className="w-full px-4 py-2 bg-white/60 backdrop-blur-sm
    border border-divider/60 rounded-lg
    focus:outline-none focus:ring-2 focus:ring-orange-500/50
    transition-all"
/>`}
              </pre>
            </div>
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">Floating Label 입력 필드:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`import { FloatingLabelInput, FloatingLabelTextarea } from '@/components/FloatingLabelInput';

// Input
<FloatingLabelInput
  label="프로젝트 제목"
  required
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>

// Textarea
<FloatingLabelTextarea
  label="프로젝트 설명"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  rows={3}
/>`}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* 뱃지 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">뱃지</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 작업 상태, 프로젝트 상태</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">완료</span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">진행중</span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">대기</span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">새로운</span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">중요</span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">긴급</span>
        </div>
      </div>

      {/* 드롭다운 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">드롭다운 / 셀렉트</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 작업 상태 선택, 파트너 선택, 필터링</p>
          </div>
          <button
            onClick={() => toggleSection('dropdown')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`transform transition-transform ${expandedSections['dropdown'] ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="space-y-8">
          {/* 기본 셀렉트 */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">기본 셀렉트 (Select)</h3>
            <div className="max-w-md space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">기본 셀렉트</label>
                <select className="w-full px-4 py-2 bg-white/60 backdrop-blur-sm border border-divider/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all cursor-pointer">
                  <option>선택하세요</option>
                  <option>옵션 1</option>
                  <option>옵션 2</option>
                  <option>옵션 3</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">상태 선택</label>
                <select className="w-full px-4 py-2 bg-white/60 backdrop-blur-sm border border-divider/60 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all cursor-pointer">
                  <option>대기</option>
                  <option>진행중</option>
                  <option>완료</option>
                </select>
              </div>
            </div>
          </div>

          {/* 커스텀 드롭다운 */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-4">커스텀 드롭다운 (아바타 포함)</h3>
            <p className="text-sm text-gray-600 mb-4">📍 사용처: 프로젝트 추가 모달 (클라이언트/파트너 선택)</p>

            <div className="max-w-md space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">파트너 선택</label>
                <button
                  type="button"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white text-left flex items-center justify-between hover:border-gray-400 transition-colors"
                >
                  <div className="flex items-center">
                    <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-semibold mr-2">
                      J
                    </div>
                    <span className="text-gray-900">John Doe</span>
                  </div>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>

                {/* 드롭다운 메뉴 예시 (미리보기) */}
                <div className="mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-1">
                  <div className="px-3 py-2 hover:bg-gray-50 flex items-center rounded transition-colors cursor-pointer">
                    <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-semibold mr-2">
                      J
                    </div>
                    <span className="text-gray-900">John Doe</span>
                  </div>
                  <div className="px-3 py-2 hover:bg-gray-50 flex items-center rounded transition-colors cursor-pointer">
                    <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-semibold mr-2">
                      S
                    </div>
                    <span className="text-gray-900">Sarah Kim</span>
                  </div>
                  <div className="px-3 py-2 hover:bg-gray-50 flex items-center rounded transition-colors cursor-pointer">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-semibold mr-2">
                      M
                    </div>
                    <span className="text-gray-900">Mike Lee</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gradient-to-br from-orange-50/60 to-orange-50/60 rounded-xl border border-orange-200/40">
            <h3 className="font-semibold text-gray-900 mb-3">스타일 가이드</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• <strong>기본 셀렉트:</strong> bg-white/60 + backdrop-blur-sm</li>
              <li>• <strong>커스텀 드롭다운:</strong> button + absolute positioned menu</li>
              <li>• focus:ring-2 focus:ring-orange-500 효과</li>
              <li>• rounded-lg 라운드 처리</li>
              <li>• hover:bg-gray-50 호버 효과</li>
              <li>• 아바타 서클로 시각적 구분</li>
            </ul>
          </div>
        </div>

        {expandedSections['dropdown'] && (
          <div className="mt-6 space-y-4">
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-xs text-gray-400 mb-2">기본 셀렉트:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`<select className="w-full px-4 py-2 bg-white/60
  backdrop-blur-sm border border-divider/60 rounded-lg
  focus:outline-none focus:ring-2 focus:ring-orange-500/50
  transition-all cursor-pointer">
  <option>선택하세요</option>
  <option>옵션 1</option>
</select>`}
              </pre>
            </div>

            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-xs text-gray-400 mb-2">커스텀 드롭다운:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`// 버튼 트리거
<button onClick={() => setIsOpen(!isOpen)}
  className="w-full px-3 py-2 border border-gray-300
    rounded-lg focus:ring-2 focus:ring-orange-500 bg-white
    flex items-center justify-between">
  <div className="flex items-center">
    <div className="w-6 h-6 bg-orange-500 rounded-full
      flex items-center justify-center text-white text-xs
      font-semibold mr-2">
      J
    </div>
    <span>John Doe</span>
  </div>
  <ChevronDown size={16} />
</button>

// 드롭다운 메뉴
{isOpen && (
  <div className="absolute z-10 w-full mt-1 bg-white
    border border-gray-300 rounded-lg shadow-lg max-h-60
    overflow-auto">
    {items.map(item => (
      <button onClick={() => selectItem(item)}
        className="w-full px-3 py-2 hover:bg-gray-50
          flex items-center transition-colors">
        <div className="w-6 h-6 bg-orange-500 rounded-full..." />
        <span>{item.name}</span>
      </button>
    ))}
  </div>
)}`}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* 타임라인 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">타임라인</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 회차 작업 진행도</p>
          </div>
          <button
            onClick={() => toggleSection('timeline')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`transform transition-transform ${expandedSections['timeline'] ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="p-6 bg-gradient-to-br from-orange-50/20 to-orange-50/20 rounded-xl border border-divider/40">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-sm font-medium">롱폼</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span className="text-sm font-medium">기획 숏폼</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-300"></div>
              <span className="text-sm font-medium">썸네일</span>
            </div>
          </div>
        </div>

        {expandedSections['timeline'] && (
          <div className="mt-6 p-4 bg-gray-900 rounded-xl">
            <pre className="text-xs text-green-400 overflow-x-auto">
{`<div className="p-6 bg-gradient-to-br from-orange-50/20
  to-orange-50/20 rounded-xl border border-divider/40">
  {/* 타임라인 내용 */}
</div>`}
            </pre>
          </div>
        )}
      </div>

      {/* 호버 애니메이션 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">호버 애니메이션</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 작업 단계 그리드, 리스트 항목</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="relative pb-3 border-b border-divider -mx-2 px-2 rounded-lg hover:bg-gray-50/80 hover:border-transparent transition-all duration-200 group cursor-pointer">
            <div className="flex items-center gap-4">
              <span className="text-gray-700">작업 항목 1</span>
              <button className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">
                삭제
              </button>
            </div>
          </div>
          <div className="relative pb-3 border-b border-divider -mx-2 px-2 rounded-lg hover:bg-gray-50/80 hover:border-transparent transition-all duration-200 group cursor-pointer">
            <div className="flex items-center gap-4">
              <span className="text-gray-700">작업 항목 2</span>
              <button className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded">
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 탭 전환 애니메이션 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">탭 전환 애니메이션 (스무스 높이 조절)</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 회차 작업 체크리스트 모달, 파트너 상세 모달</p>
          </div>
          <button
            onClick={() => toggleSection('tabAnimation')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`transform transition-transform ${expandedSections['tabAnimation'] ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="space-y-6">
          {/* 핵심 특징 */}
          <div className="p-4 bg-gradient-to-br from-orange-50/60 to-orange-50/60 rounded-xl border border-orange-200/40">
            <h3 className="font-semibold text-gray-900 mb-3">핵심 특징</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• <strong>부드러운 높이 전환:</strong> 탭 전환 시 모달 높이가 자연스럽게 애니메이션됨</li>
              <li>• <strong>블록 애니메이션:</strong> 각 콘텐츠 블록이 순차적으로 나타남 (fadeSlideIn)</li>
              <li>• <strong>이중 requestAnimationFrame:</strong> 브라우저 렌더링 완료 후 정확한 높이 측정</li>
              <li>• <strong>Forced Reflow:</strong> void offsetHeight로 레이아웃 계산 강제 실행</li>
              <li>• <strong>타이밍:</strong> 600ms cubic-bezier(0.4, 0, 0.2, 1) 전환 효과</li>
            </ul>
          </div>

          {/* 애니메이션 단계 */}
          <div className="p-4 bg-gradient-to-br from-green-50/60 to-teal-50/60 rounded-xl border border-green-200/40">
            <h3 className="font-semibold text-gray-900 mb-3">애니메이션 실행 순서</h3>
            <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
              <li><strong>현재 높이 측정:</strong> 탭 전환 전 모달 높이 고정</li>
              <li><strong>Fade Out:</strong> 200ms 동안 현재 콘텐츠 페이드 아웃</li>
              <li><strong>콘텐츠 교체:</strong> 새로운 탭 콘텐츠로 변경</li>
              <li><strong>새 높이 측정:</strong> auto → fixed → 강제 reflow로 정확한 높이 계산</li>
              <li><strong>높이 애니메이션:</strong> 600ms 동안 새 높이로 부드럽게 전환</li>
              <li><strong>Fade In + Block 애니메이션:</strong> 콘텐츠 페이드 인과 블록별 슬라이드 업</li>
              <li><strong>정리:</strong> 600ms 후 inline style 제거하고 auto 높이로 복원</li>
            </ol>
          </div>

          {/* 블록 애니메이션 */}
          <div className="p-4 bg-gradient-to-br from-orange-50/60 to-pink-50/60 rounded-xl border border-orange-200/40">
            <h3 className="font-semibold text-gray-900 mb-3">블록 애니메이션 (fadeSlideIn)</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• <strong>효과:</strong> 아래에서 위로 슬라이드 업 + 페이드 인 + 스케일 업</li>
              <li>• <strong>Duration:</strong> 400ms cubic-bezier(0.34, 1.56, 0.64, 1)</li>
              <li>• <strong>Stagger:</strong> 각 블록마다 60ms 지연 (0ms, 60ms, 120ms, ...)</li>
              <li>• <strong>Transform:</strong> translateY(15px) scale(0.95) → translateY(0) scale(1)</li>
            </ul>
          </div>
        </div>

        {expandedSections['tabAnimation'] && (
          <div className="mt-6 space-y-4">
            {/* CSS 키프레임 */}
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">CSS 키프레임 애니메이션:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`<style jsx>{\`
  @keyframes fadeSlideIn {
    from {
      opacity: 0;
      transform: translateY(15px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .block-item {
    animation: fadeSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
\`}</style>`}
              </pre>
            </div>

            {/* React State */}
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">필요한 State와 Ref:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`const [activeTab, setActiveTab] = useState<'tab1' | 'tab2' | 'tab3'>('tab1');
const [isTabSwitching, setIsTabSwitching] = useState(false);
const [modalHeight, setModalHeight] = useState<number | null>(null);
const modalContentRef = useRef<HTMLDivElement>(null);
const tabSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);`}
              </pre>
            </div>

            {/* switchTab 함수 */}
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">switchTab 함수 (핵심 로직):</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`const switchTab = (newTab: 'tab1' | 'tab2' | 'tab3') => {
  if (newTab === activeTab) return;
  if (!modalContentRef.current) return;

  // 1. 현재 높이 고정
  const currentHeight = modalContentRef.current.offsetHeight;
  setModalHeight(currentHeight);
  setIsTabSwitching(true);

  // 2. 200ms 후 콘텐츠 교체
  setTimeout(() => {
    setActiveTab(newTab);

    // 3. 이중 requestAnimationFrame으로 정확한 측정
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (modalContentRef.current) {
          // 4. 새 높이 측정 (auto → fixed)
          modalContentRef.current.style.transition = 'none';
          modalContentRef.current.style.height = 'auto';
          void modalContentRef.current.offsetHeight; // Forced reflow

          const newHeight = modalContentRef.current.offsetHeight;
          modalContentRef.current.style.height = \`\${currentHeight}px\`;
          void modalContentRef.current.offsetHeight; // Forced reflow

          // 5. 높이 애니메이션 시작
          requestAnimationFrame(() => {
            if (modalContentRef.current) {
              modalContentRef.current.style.transition =
                'height 600ms cubic-bezier(0.4, 0, 0.2, 1)';
              setModalHeight(newHeight);

              // 6. 페이드 인 시작
              setTimeout(() => {
                setIsTabSwitching(false);

                // 7. 600ms 후 정리
                setTimeout(() => {
                  setModalHeight(null);
                  if (modalContentRef.current) {
                    modalContentRef.current.style.transition = '';
                    modalContentRef.current.style.height = '';
                  }
                }, 600);
              }, 50);
            }
          });
        }
      });
    });
  }, 200);
};`}
              </pre>
            </div>

            {/* 모달 구조 */}
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">모달 컨테이너 구조:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`<div className="bg-white/95 backdrop-blur-2xl rounded-2xl
  shadow-2xl border border-white/60 overflow-hidden">

  {/* 스티키 헤더 (탭) */}
  <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-2xl
    border-b border-divider">
    <div className="flex gap-2 p-4">
      <button onClick={() => switchTab('tab1')}
        className={\`px-4 py-2 rounded-lg transition-colors \${
          activeTab === 'tab1'
            ? 'bg-orange-500 text-white'
            : 'bg-gray-100 text-gray-700'
        }\`}>
        탭 1
      </button>
      {/* 다른 탭들... */}
    </div>
  </div>

  {/* 콘텐츠 영역 */}
  <div ref={modalContentRef}
    style={modalHeight !== null ? { height: \`\${modalHeight}px\` } : {}}
    className="overflow-hidden">

    {/* 페이드 전환 */}
    <div className={\`transition-opacity duration-200 \${
      isTabSwitching ? 'opacity-0' : 'opacity-100'
    }\`}>
      {activeTab === 'tab1' && (
        <div className="p-6 space-y-4">
          {/* 블록 1 */}
          <div className="block-item"
            style={{ animationDelay: '0ms' }}>
            콘텐츠 1
          </div>

          {/* 블록 2 */}
          <div className="block-item"
            style={{ animationDelay: '60ms' }}>
            콘텐츠 2
          </div>

          {/* 블록 3 */}
          <div className="block-item"
            style={{ animationDelay: '120ms' }}>
            콘텐츠 3
          </div>
        </div>
      )}
      {/* 다른 탭 콘텐츠... */}
    </div>
  </div>
</div>`}
              </pre>
            </div>

            {/* 주의사항 */}
            <div className="p-4 bg-gradient-to-br from-orange-50/60 to-red-50/60 rounded-xl border border-orange-200/40">
              <h3 className="font-semibold text-gray-900 mb-3">⚠️ 주의사항 및 베스트 프랙티스</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li>• <strong>이중 requestAnimationFrame 필수:</strong> 단일 RAF는 높이 측정이 부정확할 수 있음</li>
                <li>• <strong>Forced Reflow 필수:</strong> <code className="bg-gray-900 text-green-400 px-1 rounded">void offsetHeight</code>로 레이아웃 계산 강제</li>
                <li>• <strong>Cleanup 필수:</strong> inline style 제거하여 auto 높이로 복원</li>
                <li>• <strong>타이밍 일치:</strong> CSS transition과 setTimeout 타이밍 동기화 (600ms)</li>
                <li>• <strong>Stagger 일관성:</strong> 블록 애니메이션 delay는 60ms 단위로 증가</li>
                <li>• <strong>overflow-hidden 필수:</strong> 모달 컨테이너에 적용하여 애니메이션 중 스크롤 방지</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Toss-style 모달 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Toss-style 모달</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 대시보드 퀵메뉴 (클라이언트/파트너/프로젝트 추가)</p>
          </div>
          <button
            onClick={() => toggleSection('tossModal')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`transform transition-transform ${expandedSections['tossModal'] ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* 핵심 특징 */}
        <div className="p-4 bg-gradient-to-br from-orange-50/60 to-orange-50/60 rounded-xl border border-orange-200/40 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">핵심 특징</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• <strong>28px 라운드 코너:</strong> rounded-[28px]로 더 큰 둥근 모서리</li>
            <li>• <strong>대형 타이포그래피:</strong> text-2xl sm:text-3xl (24px~30px)</li>
            <li>• <strong>깔끔한 섹션 구분:</strong> 간결한 섹션 제목으로 구분</li>
            <li>• <strong>Floating Label 입력:</strong> FloatingLabelInput 컴포넌트 사용</li>
            <li>• <strong>h-14 버튼:</strong> 56px 높이의 큰 버튼 (py-3.5)</li>
            <li>• <strong>성공 애니메이션:</strong> 파란 원 + 체크마크 애니메이션 (1.5초 후 자동 닫힘)</li>
          </ul>
        </div>

        {/* 미리보기 */}
        <div className="p-6 bg-gray-50 rounded-xl border border-divider">
          <div className="bg-white rounded-[28px] p-8 shadow-2xl max-w-md mx-auto">
            <h2 className="text-page mb-8">클라이언트 추가</h2>

            {/* 기본 정보 섹션 */}
            <div className="space-y-6 mb-8">
              <h3 className="text-base font-semibold text-gray-700 mb-4">기본 정보</h3>
              <div className="space-y-4">
                <FloatingLabelInput label="회사명" required value="" onChange={() => {}} />
                <FloatingLabelInput label="담당자명" value="" onChange={() => {}} />
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button className="flex-1 h-14 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-2xl font-semibold text-base">
                추가하기
              </button>
              <button className="flex-1 h-14 bg-gray-100 text-gray-700 rounded-2xl font-semibold text-base">
                취소
              </button>
            </div>
          </div>
        </div>

        {expandedSections['tossModal'] && (
          <div className="mt-6 space-y-4">
            {/* 기본 구조 */}
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">기본 모달 구조:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  {/* 배경 */}
  <div className="fixed inset-0 bg-black/40" onClick={onClose} />

  {/* 모달 */}
  <div className="relative bg-white rounded-[28px] w-full max-w-md
    shadow-2xl overflow-hidden">

    {/* 헤더 */}
    <div className="px-8 pt-8 pb-4">
      <h2 className="text-page">
        제목
      </h2>
    </div>

    {/* 컨텐츠 */}
    <div className="px-8 pb-8 space-y-8">
      {/* 섹션 */}
      <div className="space-y-6">
        <h3 className="text-base font-semibold text-gray-700">
          섹션 제목
        </h3>
        <div className="space-y-4">
          <FloatingLabelInput
            label="필드명"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex gap-3">
        <button className="flex-1 h-14 bg-gradient-to-r
          from-orange-500 to-orange-600 text-white rounded-2xl
          font-semibold text-base">
          확인
        </button>
        <button className="flex-1 h-14 bg-gray-100 text-gray-700
          rounded-2xl font-semibold text-base">
          취소
        </button>
      </div>
    </div>
  </div>
</div>`}
              </pre>
            </div>

            {/* 섹션 제목 */}
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">섹션 제목 스타일:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`{/* 섹션 제목 */}
<h3 className="text-base font-semibold text-gray-700">
  기본 정보
</h3>

{/* 또는 여러 섹션이 있는 경우 */}
<div className="space-y-8">
  <div className="space-y-6">
    <h3 className="text-base font-semibold text-gray-700">기본 정보</h3>
    {/* 입력 필드들... */}
  </div>

  <div className="space-y-6">
    <h3 className="text-base font-semibold text-gray-700">연락처</h3>
    {/* 입력 필드들... */}
  </div>
</div>`}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Success 애니메이션 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Success 애니메이션</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: Toss-style 모달 성공 화면</p>
          </div>
          <button
            onClick={() => toggleSection('successAnimation')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`transform transition-transform ${expandedSections['successAnimation'] ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* 핵심 특징 */}
        <div className="p-4 bg-gradient-to-br from-green-50/60 to-teal-50/60 rounded-xl border border-green-200/40 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">핵심 특징</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• <strong>파란 원 애니메이션:</strong> scale(0) → scale(1.1) → scale(1) (0.5초)</li>
            <li>• <strong>체크마크 그리기:</strong> SVG stroke-dasharray로 선 그리기 효과 (0.6초)</li>
            <li>• <strong>자동 닫힘:</strong> 1.5초 후 모달 자동 close</li>
            <li>• <strong>순차 애니메이션:</strong> 원 먼저 → 체크마크 0.1초 delay</li>
          </ul>
        </div>

        {/* 미리보기 */}
        <div className="p-6 bg-gray-50 rounded-xl border border-divider">
          <div className="flex flex-col items-center justify-center py-12">
            <div className="relative">
              {/* 파란 원 */}
              <div className="w-20 h-20 bg-orange-500 rounded-full flex items-center justify-center">
                {/* 체크마크 SVG */}
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <path
                    d="M14 24l8 8 12-16"
                    stroke="white"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="100"
                    strokeDashoffset="0"
                  />
                </svg>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-6">성공!</p>
            <p className="text-gray-500 mt-2">추가되었습니다</p>
          </div>
        </div>

        {expandedSections['successAnimation'] && (
          <div className="mt-6 space-y-4">
            {/* CSS 키프레임 */}
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">CSS 키프레임 애니메이션:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`<style jsx>{\`
  @keyframes checkmark {
    0% {
      stroke-dashoffset: 100;
    }
    100% {
      stroke-dashoffset: 0;
    }
  }

  @keyframes circle-scale {
    0% {
      transform: scale(0);
      opacity: 0;
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .success-circle {
    animation: circle-scale 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .success-checkmark {
    animation: checkmark 0.6s ease-out 0.1s forwards;
  }
\`}</style>`}
              </pre>
            </div>

            {/* React 구현 */}
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">React 구현:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`const [showSuccess, setShowSuccess] = useState(false);

// 성공 처리
const handleSuccess = () => {
  setShowSuccess(true);

  // 1.5초 후 모달 닫기
  setTimeout(() => {
    onClose();
  }, 1500);
};

// JSX
{showSuccess ? (
  <div className="flex flex-col items-center justify-center py-12">
    <div className="relative">
      <div className="success-circle w-20 h-20 bg-orange-500
        rounded-full flex items-center justify-center">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <path
            className="success-checkmark"
            d="M14 24l8 8 12-16"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="100"
            strokeDashoffset="100"
          />
        </svg>
      </div>
    </div>
    <p className="text-2xl font-bold text-gray-900 mt-6">성공!</p>
    <p className="text-gray-500 mt-2">추가되었습니다</p>
  </div>
) : (
  // 일반 폼 컨텐츠
)}`}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* 체크리스트 모달 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">체크리스트 모달</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 작업 체크리스트, 할 일 관리, 진행 상황 추적</p>
          </div>
          <button
            onClick={() => toggleSection('checklistModal')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`transform transition-transform ${expandedSections['checklistModal'] ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* 핵심 특징 */}
        <div className="p-4 bg-gradient-to-br from-orange-50/60 to-orange-50/60 rounded-xl border border-orange-200/40 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">핵심 특징</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• <strong>진행률 바:</strong> 전체 작업 대비 완료된 작업 비율 시각화</li>
            <li>• <strong>체크박스 인터랙션:</strong> 클릭 시 완료/미완료 토글</li>
            <li>• <strong>상태별 스타일:</strong> 완료된 항목은 line-through + 회색 처리</li>
            <li>• <strong>우선순위 표시:</strong> 아이콘으로 긴급/중요 구분</li>
            <li>• <strong>그룹핑:</strong> 카테고리별로 체크리스트 그룹화</li>
            <li>• <strong>자동 계산:</strong> 완료 개수와 진행률 자동 업데이트</li>
          </ul>
        </div>

        {/* 미리보기 */}
        <div className="p-6 bg-gray-50 rounded-xl border border-divider">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl mx-auto overflow-hidden">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">프로젝트 체크리스트</h3>
                  <p className="text-sm text-orange-100 mt-1">5개 중 3개 완료</p>
                </div>
                <button className="p-2 hover:bg-white/20 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* 진행률 바 */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-orange-100">진행률</span>
                  <span className="text-sm font-bold">60%</span>
                </div>
                <div className="w-full bg-orange-400/30 rounded-full h-2">
                  <div
                    className="bg-white h-2 rounded-full transition-all duration-300"
                    style={{ width: '60%' }}
                  />
                </div>
              </div>
            </div>

            {/* 체크리스트 그룹 1 */}
            <div className="p-6 border-b border-divider">
              <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                기획 단계
              </h4>
              <div className="space-y-3">
                {/* 완료된 항목 */}
                <div className="flex items-start gap-3 group">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-5 h-5 rounded border-2 bg-orange-500 border-orange-500 flex items-center justify-center">
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-400 line-through">클라이언트 미팅 일정 잡기</p>
                    <p className="text-xs text-gray-400 mt-0.5">2024.01.15 완료</p>
                  </div>
                </div>

                {/* 진행 중 항목 */}
                <div className="flex items-start gap-3 group">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-5 h-5 rounded border-2 border-gray-300 hover:border-orange-500 cursor-pointer transition-colors"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900 font-medium">프로젝트 기획안 작성</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full font-medium">진행중</span>
                      <span className="text-xs text-gray-500">마감: 2024.01.20</span>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <AlertCircle size={16} className="text-orange-500" />
                  </div>
                </div>

                {/* 긴급 항목 */}
                <div className="flex items-start gap-3 group bg-red-50/50 -mx-3 px-3 py-2 rounded-lg">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-5 h-5 rounded border-2 border-gray-300 hover:border-orange-500 cursor-pointer transition-colors"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900 font-medium">예산 승인 받기</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-800 rounded-full font-medium">긴급</span>
                      <span className="text-xs text-red-600 font-medium">오늘 마감</span>
                    </div>
                  </div>
                  <div>
                    <AlertCircle size={16} className="text-red-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* 체크리스트 그룹 2 */}
            <div className="p-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                제작 단계
              </h4>
              <div className="space-y-3">
                <div className="flex items-start gap-3 group">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-5 h-5 rounded border-2 bg-orange-500 border-orange-500 flex items-center justify-center">
                      <Check size={14} className="text-white" strokeWidth={3} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-400 line-through">파트너 섭외 완료</p>
                    <p className="text-xs text-gray-400 mt-0.5">2024.01.18 완료</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 group">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-5 h-5 rounded border-2 border-gray-300 hover:border-orange-500 cursor-pointer transition-colors"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">촬영 일정 확정</p>
                    <p className="text-xs text-gray-500 mt-0.5">마감: 2024.01.25</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 푸터 */}
            <div className="px-6 py-4 bg-gray-50 border-t border-divider flex justify-between items-center">
              <button className="text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium">
                + 새 항목 추가
              </button>
              <button className="px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-md font-medium text-sm">
                저장하고 닫기
              </button>
            </div>
          </div>
        </div>

        {/* 스타일 가이드 */}
        <div className="mt-6 p-4 bg-gradient-to-br from-green-50/60 to-teal-50/60 rounded-xl border border-green-200/40">
          <h3 className="font-semibold text-gray-900 mb-3">스타일 가이드</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• <strong>체크박스 완료:</strong> bg-orange-500 border-orange-500 + Check 아이콘</li>
            <li>• <strong>체크박스 미완료:</strong> border-gray-300 hover:border-orange-500</li>
            <li>• <strong>완료된 텍스트:</strong> text-gray-400 line-through</li>
            <li>• <strong>진행률 바:</strong> 헤더에 배치, 흰색 바 + 투명 배경</li>
            <li>• <strong>그룹 구분:</strong> 작은 원형 불릿 + 세미볼드 제목</li>
            <li>• <strong>긴급 항목:</strong> bg-red-50/50 배경 + 빨간 배지</li>
            <li>• <strong>hover 효과:</strong> 체크박스와 삭제 버튼에 적용</li>
          </ul>
        </div>

        {expandedSections['checklistModal'] && (
          <div className="mt-6 space-y-4">
            {/* 기본 구조 */}
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">기본 모달 구조:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  {/* 배경 */}
  <div className="fixed inset-0 bg-black/40" onClick={onClose} />

  {/* 모달 */}
  <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
    {/* 헤더 (그라디언트 배경) */}
    <div className="bg-gradient-to-r from-orange-500 to-orange-600
      px-6 py-4 text-white">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold">체크리스트 제목</h3>
          <p className="text-sm text-orange-100 mt-1">
            {completedCount}개 중 {totalCount}개 완료
          </p>
        </div>
        <button onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      {/* 진행률 바 */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-orange-100">진행률</span>
          <span className="text-sm font-bold">{progress}%</span>
        </div>
        <div className="w-full bg-orange-400/30 rounded-full h-2">
          <div
            className="bg-white h-2 rounded-full transition-all duration-300"
            style={{ width: \`\${progress}%\` }}
          />
        </div>
      </div>
    </div>

    {/* 체크리스트 그룹 */}
    <div className="p-6 border-b border-divider">
      <h4 className="text-sm font-semibold text-gray-700 mb-4
        flex items-center gap-2">
        <span className="w-2 h-2 bg-orange-500 rounded-full" />
        그룹 제목
      </h4>

      <div className="space-y-3">
        {/* 체크리스트 항목 */}
        <div className="flex items-start gap-3 group">
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-5 h-5 rounded border-2 border-gray-300
              hover:border-orange-500 cursor-pointer transition-colors"
              onClick={() => toggleItem(id)}>
              {isCompleted && (
                <Check size={14} className="text-white" strokeWidth={3} />
              )}
            </div>
          </div>
          <div className="flex-1">
            <p className={\`text-sm \${isCompleted
              ? 'text-gray-400 line-through'
              : 'text-gray-900 font-medium'}\`}>
              항목 제목
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs px-2 py-0.5 bg-yellow-100
                text-yellow-800 rounded-full font-medium">
                진행중
              </span>
              <span className="text-xs text-gray-500">
                마감: 2024.01.20
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`}
              </pre>
            </div>

            {/* React State */}
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">필요한 State:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`const [checklist, setChecklist] = useState([
  {
    id: '1',
    title: '클라이언트 미팅 일정 잡기',
    completed: true,
    priority: 'normal',
    dueDate: '2024-01-15',
    category: '기획 단계',
  },
  {
    id: '2',
    title: '프로젝트 기획안 작성',
    completed: false,
    priority: 'high',
    dueDate: '2024-01-20',
    category: '기획 단계',
  },
  // ...
]);

// 진행률 계산
const totalCount = checklist.length;
const completedCount = checklist.filter(item => item.completed).length;
const progress = Math.round((completedCount / totalCount) * 100);

// 항목 토글
const toggleItem = (id: string) => {
  setChecklist(prev => prev.map(item =>
    item.id === id
      ? { ...item, completed: !item.completed }
      : item
  ));
};

// 카테고리별 그룹핑
const groupedChecklist = checklist.reduce((acc, item) => {
  if (!acc[item.category]) {
    acc[item.category] = [];
  }
  acc[item.category].push(item);
  return acc;
}, {} as Record<string, ChecklistItem[]>);`}
              </pre>
            </div>

            {/* 체크박스 스타일 */}
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">체크박스 컴포넌트:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`{/* 미완료 체크박스 */}
<div
  className="w-5 h-5 rounded border-2 border-gray-300
    hover:border-orange-500 cursor-pointer transition-colors"
  onClick={() => toggleItem(id)}
/>

{/* 완료 체크박스 */}
<div
  className="w-5 h-5 rounded border-2 bg-orange-500 border-orange-500
    flex items-center justify-center cursor-pointer"
  onClick={() => toggleItem(id)}
>
  <Check size={14} className="text-white" strokeWidth={3} />
</div>`}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Quick Menu 버튼 */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-white/60 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Quick Menu 버튼</h2>
            <p className="text-sm text-gray-500 mt-1">📍 사용처: 대시보드 헤더 빠른 추가 버튼</p>
          </div>
          <button
            onClick={() => toggleSection('quickMenu')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronDown className={`transform transition-transform ${expandedSections['quickMenu'] ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* 핵심 특징 */}
        <div className="p-4 bg-gradient-to-br from-orange-50/60 to-pink-50/60 rounded-xl border border-orange-200/40 mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">핵심 특징</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• <strong>아이콘 + 텍스트:</strong> 아이콘과 라벨이 함께 표시</li>
            <li>• <strong>각각 다른 스타일:</strong> 블러, 그라디언트, 아웃라인 등</li>
            <li>• <strong>hover 효과:</strong> scale(1.05) 또는 배경색 변화</li>
            <li>• <strong>gap-2 간격:</strong> 버튼들 사이 적절한 간격</li>
          </ul>
        </div>

        {/* 미리보기 */}
        <div className="p-6 bg-gray-50 rounded-xl border border-divider">
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-white/60 backdrop-blur-sm border border-divider/60 rounded-xl hover:bg-white/80 transition-all font-medium shadow-sm">
              <Plus size={18} />
              <span>클라이언트</span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all shadow-md font-medium">
              <Plus size={18} />
              <span>파트너</span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-orange-500 text-orange-500 rounded-xl hover:bg-orange-50 transition-colors font-medium">
              <Plus size={18} />
              <span>프로젝트</span>
            </button>
          </div>
        </div>

        {expandedSections['quickMenu'] && (
          <div className="mt-6 space-y-4">
            {/* 스타일 변형 */}
            <div className="p-4 bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">스타일 변형 예시:</p>
              <pre className="text-xs text-green-400 overflow-x-auto">
{`{/* 블러 스타일 */}
<button className="flex items-center gap-2 px-4 py-2
  bg-white/60 backdrop-blur-sm border border-divider/60
  rounded-xl hover:bg-white/80 transition-all font-medium
  shadow-sm">
  <Plus size={18} />
  <span>클라이언트</span>
</button>

{/* 그라디언트 스타일 */}
<button className="flex items-center gap-2 px-4 py-2
  bg-gradient-to-r from-orange-500 to-orange-600 text-white
  rounded-xl hover:from-orange-600 hover:to-orange-700
  transition-all shadow-md font-medium">
  <Plus size={18} />
  <span>파트너</span>
</button>

{/* 아웃라인 스타일 */}
<button className="flex items-center gap-2 px-4 py-2
  border border-orange-500 text-orange-500 rounded-xl
  hover:bg-orange-50 transition-colors font-medium">
  <Plus size={18} />
  <span>프로젝트</span>
</button>

{/* Scale 호버 효과 */}
<button className="flex items-center gap-2 px-4 py-2
  bg-orange-500 text-white rounded-xl
  hover:scale-105 transition-transform font-medium shadow-md">
  <Plus size={18} />
  <span>버튼</span>
</button>`}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* 금지 사항 */}
      <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200/50 rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          ⛔ 사용하지 말아야 할 디자인
        </h2>
        <div className="space-y-4">
          <div className="bg-white/60 backdrop-blur-md rounded-xl p-4 border border-red-200/60">
            <h3 className="font-bold text-red-900 mb-2">❌ 딱딱한 직각 박스</h3>
            <p className="text-sm text-gray-700">→ rounded-xl 이상의 라운드 사용 필수</p>
          </div>
          <div className="bg-white/60 backdrop-blur-md rounded-xl p-4 border border-red-200/60">
            <h3 className="font-bold text-red-900 mb-2">❌ 단색 배경 (순수 흰색/회색)</h3>
            <p className="text-sm text-gray-700">→ 투명도 또는 그라디언트 사용</p>
          </div>
          <div className="bg-white/60 backdrop-blur-md rounded-xl p-4 border border-red-200/60">
            <h3 className="font-bold text-red-900 mb-2">❌ 애니메이션 없는 전환</h3>
            <p className="text-sm text-gray-700">→ transition-all, ease-in-out 필수</p>
          </div>
          <div className="bg-white/60 backdrop-blur-md rounded-xl p-4 border border-red-200/60">
            <h3 className="font-bold text-red-900 mb-2">❌ 강한 그림자 (shadow-2xl 제외 모달)</h3>
            <p className="text-sm text-gray-700">→ shadow-sm, shadow-md 사용</p>
          </div>
        </div>
      </div>

      {/* 토스트 실제 표시 */}
      {showToast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
          <div className="bg-gradient-to-r from-green-500/95 to-green-600/95 backdrop-blur-xl text-white px-6 py-4 rounded-2xl shadow-2xl border border-white/20 flex items-center gap-3 min-w-[320px]">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <Check className="w-5 h-5 text-white" strokeWidth={2.5} />
              </div>
            </div>
            <p className="text-white font-medium">{toastMessage}</p>
          </div>
        </div>
      )}

      {/* 모달 실제 표시 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />

          <div className="relative bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/60 max-w-md w-full p-6 animate-modal-content">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">샘플 모달</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-white/80 rounded-full transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-gray-600">
                이것은 글래스모피즘 스타일의 모달 창입니다. 배경이 블러 처리되고 투명도가 적용되어 현대적인 느낌을 줍니다.
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-br from-orange-50/60 to-orange-50/60 rounded-xl border border-orange-200/40">
                <p className="text-sm text-gray-700">✨ 글래스모피즘 디자인</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-green-50/60 to-teal-50/60 rounded-xl border border-green-200/40">
                <p className="text-sm text-gray-700">🎨 부드러운 색상 조합</p>
              </div>
              <div className="p-4 bg-gradient-to-br from-orange-50/60 to-pink-50/60 rounded-xl border border-orange-200/40">
                <p className="text-sm text-gray-700">⚡ 빠른 애니메이션 (0.6초)</p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl hover:from-orange-600 hover:to-orange-700 transition-all font-medium shadow-md"
              >
                확인
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 bg-white/60 backdrop-blur-sm text-gray-700 rounded-xl hover:bg-white/80 transition-colors font-medium border border-divider/60"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
