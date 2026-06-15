'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { TabBar } from '@/components/TabBar';
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
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="space-y-3">
        <div>
          <h1 className="text-page">매니지먼트</h1>
          <p className="text-ink-500 mt-1 text-sm">
            {now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
        </div>

        {/* 탭 + 버튼 */}
        <div className="flex items-center justify-between">
        <TabBar<Tab>
          items={tabs.map(tab => ({
            key: tab.key,
            label: tab.label,
            ...(tab.key === 'missing' && missingCount > 0 ? { count: missingCount } : {}),
          }))}
          active={activeTab}
          onChange={setActiveTab}
          fullWidthMobile={false}
        />
          <AnimatePresence>
            {activeTab === 'main' && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                onClick={() => window.dispatchEvent(new CustomEvent('mgmt:new-project'))}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 text-white rounded-xl text-sm font-semibold hover:bg-brand-600 transition-colors"
              >
                <Plus size={16} /> 새 프로젝트
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
