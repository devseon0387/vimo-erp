'use client';

import { useState, useEffect } from 'react';
import { Bell, CheckCircle, AlertCircle, Clock, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getAllEpisodes } from '@/lib/supabase/db/cached';

const CHECKLIST_STORAGE_KEY = 'video-moment-checklist';

interface ChecklistItem {
  id: string;
  type: 'review' | 'deadline' | 'overdue';
  count: number;
  label: string;
  checked: boolean;
  route?: string;
}

export default function NotificationDropdown() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  // 체크리스트 초기화
  useEffect(() => {
    const loadData = async () => {
      const allEpisodes = await getAllEpisodes();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const reviewingEpisodes = allEpisodes.filter(ep => ep.status === 'review');
      const todayDeadlines = allEpisodes.filter(ep => {
        if (!ep.dueDate || ep.status === 'completed') return false;
        const dueDate = new Date(ep.dueDate);
        return dueDate >= todayStart && dueDate <= todayEnd;
      });
      const overdueEpisodes = allEpisodes.filter(ep => {
        if (!ep.dueDate || ep.status === 'completed') return false;
        const dueDate = new Date(ep.dueDate);
        return dueDate < todayStart;
      });

      const savedChecklist = localStorage.getItem(CHECKLIST_STORAGE_KEY);
      let checkedItems: Record<string, boolean> = {};
      try {
        checkedItems = savedChecklist ? JSON.parse(savedChecklist) : {};
      } catch {
        checkedItems = {};
      }

      setChecklist([
        { id: 'review', type: 'review', count: reviewingEpisodes.length, label: '검수 완료 필요', checked: checkedItems.review || false, route: '/management' },
        { id: 'deadline', type: 'deadline', count: todayDeadlines.length, label: '오늘 마감 확인', checked: checkedItems.deadline || false, route: '/management' },
        { id: 'overdue', type: 'overdue', count: overdueEpisodes.length, label: '긴급 이슈 처리', checked: checkedItems.overdue || false, route: '/management' },
      ]);
    };
    loadData();
  }, []);

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // 체크 토글
  const handleToggle = (id: string) => {
    const updatedChecklist = checklist.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    setChecklist(updatedChecklist);

    const checkedItems = updatedChecklist.reduce((acc, item) => {
      acc[item.id] = item.checked;
      return acc;
    }, {} as Record<string, boolean>);
    localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(checkedItems));
  };

  // 항목 클릭
  const handleItemClick = (item: ChecklistItem) => {
    if (item.route) {
      router.push(item.route);
      setIsOpen(false);
    }
  };

  // 미완료 개수
  const uncheckedCount = checklist.filter(item => !item.checked && item.count > 0).length;

  // 아이콘 선택
  const getIcon = (type: string) => {
    switch (type) {
      case 'review':
        return <CheckCircle size={18} className="text-orange-500" />;
      case 'deadline':
        return <AlertCircle size={18} className="text-red-500" />;
      case 'overdue':
        return <Clock size={18} className="text-orange-500" />;
      default:
        return <CheckCircle size={18} className="text-gray-500" />;
    }
  };

  return (
    <>
      {/* 알림 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="알림"
      >
        <Bell size={20} className="text-gray-600" />
        {uncheckedCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {uncheckedCount}
          </span>
        )}
      </button>

      {/* 모달 */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4">
          {/* 배경 오버레이 */}
          <div
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* 모달 컨텐츠 */}
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-divider bg-gradient-to-r from-orange-50 to-orange-50">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Bell size={20} className="text-orange-500" />
                  오늘 할 일
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {uncheckedCount > 0 ? `${uncheckedCount}개의 할 일이 남았습니다` : '모든 할 일을 완료했습니다!'}
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-orange-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* 체크리스트 */}
            <div className="divide-y divide-gray-100 max-h-[50vh] overflow-y-auto">
              {checklist.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 sm:p-5 hover:bg-gray-50 transition-colors ${
                    item.count === 0 ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* 체크박스 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggle(item.id);
                      }}
                      disabled={item.count === 0}
                      className="mt-0.5"
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                          item.checked
                            ? 'bg-orange-500 border-orange-500'
                            : 'border-gray-300 hover:border-orange-500'
                        } ${item.count === 0 ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {item.checked && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path d="M5 13l4 4L19 7"></path>
                          </svg>
                        )}
                      </div>
                    </button>

                    {/* 내용 */}
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => handleItemClick(item)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {getIcon(item.type)}
                        <span className={`text-sm font-medium ${item.checked ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {item.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${item.count > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {item.count}개
                        </span>
                        {item.count > 0 && !item.checked && (
                          <span className="text-xs text-gray-400">• 클릭하여 확인</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 푸터 */}
            {uncheckedCount === 0 && (
              <div className="p-4 sm:p-5 bg-green-50 text-center border-t border-divider">
                <p className="text-sm text-green-700 font-medium">모든 할 일을 완료했습니다!</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
