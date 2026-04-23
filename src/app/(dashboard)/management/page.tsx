'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import ManagementMain from './ManagementMain';
import ManagementMissing from './ManagementMissing';
import ManagementReport from './ManagementReport';

type Tab = 'main' | 'missing' | 'report';

export default function ManagementPage() {
  const [activeTab, setActiveTab] = useState<Tab>('main');
  const [missingCount, setMissingCount] = useState(0);

  const handleMissingCount = useCallback((count: number) => {
    setMissingCount(count);
  }, []);

  const now = new Date();

  const tabs: { key: Tab; label: string }[] = [
    { key: 'main', label: '메인' },
    { key: 'missing', label: '미기입' },
    { key: 'report', label: '리포트' },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* 헤더 */}
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">매니지먼트</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
        </div>

        {/* 탭 + 버튼 */}
        <div className="flex items-center justify-between">
        <div className="inline-flex gap-1 p-1 bg-white border border-[#ede9e6] rounded-xl">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="relative px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg text-[13px] sm:text-[14px] font-semibold"
            >
              {activeTab === tab.key && (
                <motion.div
                  layoutId="mgmt-tab"
                  className="absolute inset-0 bg-orange-500 rounded-lg shadow-sm shadow-orange-500/20"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className={`relative z-10 flex items-center gap-1.5 ${
                activeTab === tab.key ? 'text-white' : 'text-[#78716c]'
              }`}>
                {tab.label}
                {tab.key === 'missing' && missingCount > 0 && activeTab !== 'missing' && (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                    <AlertTriangle size={9} />
                    {missingCount}
                  </span>
                )}
                {tab.key === 'missing' && missingCount > 0 && activeTab === 'missing' && (
                  <span className="text-[10px] font-bold bg-white/20 text-white px-1.5 py-0.5 rounded-full">
                    {missingCount}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
          <AnimatePresence>
            {activeTab === 'main' && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                onClick={() => window.dispatchEvent(new CustomEvent('mgmt:new-project'))}
                className="px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-colors"
              >
                + 새 프로젝트
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, position: 'absolute', top: 0, left: 0, right: 0 } as never}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'main' ? (
              <ManagementMain />
            ) : activeTab === 'missing' ? (
              <ManagementMissing onMissingCount={handleMissingCount} />
            ) : (
              <ManagementReport />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
