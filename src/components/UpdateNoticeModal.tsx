'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Wrench } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { APP_VERSION } from '@/config/version';
import { defaultChangelogs } from '@/config/changelog';

const SEEN_KEY = 'vimo-seen-version';

export default function UpdateNoticeModal() {
  const [show, setShow] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    // localStorage·sessionStorage는 클라이언트에서만 접근 가능하므로
    // 마운트 이후 일회성으로 읽어 state를 동기화한다.
    const seen = localStorage.getItem(SEEN_KEY);
    let name = '';
    try {
      const profile = sessionStorage.getItem('vm_profile');
      if (profile) name = JSON.parse(profile).name || '';
    } catch { /* ignore */ }

    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    if (name) setUserName(name);
    if (seen !== APP_VERSION) setShow(true);
  }, []);

  const handleClose = () => {
    localStorage.setItem(SEEN_KEY, APP_VERSION);
    setShow(false);
  };

  const latest = defaultChangelogs[0];
  if (!latest) return null;

  const features = latest.features || [];
  const fixes = latest.fixes || [];

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />
          <motion.div
            className="fixed z-[10000] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl border border-divider w-[440px] max-w-[92vw] max-h-[80vh] flex flex-col"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* 헤더 */}
            <div className="flex items-start justify-between px-6 pt-6 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Sparkles size={20} className="text-orange-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {userName ? `${userName}님!` : '안녕하세요!'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    <span className="font-semibold text-orange-600">{latest.version}</span> 업데이트가 되었어요!
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors mt-0.5"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            {/* 본문 */}
            <div className="px-6 pb-3 flex-1 overflow-y-auto">
              {/* 새로운 기능 */}
              {features.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Sparkles size={14} className="text-orange-500" />
                    <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">새로운 기능</span>
                  </div>
                  <ul className="space-y-2">
                    {features.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-gray-800">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 개선 및 수정 */}
              {fixes.length > 0 && (
                <div className="pt-3 border-t border-divider">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Wrench size={13} className="text-gray-400" />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">개선 및 수정</span>
                  </div>
                  <ul className="space-y-1.5">
                    {fixes.map((item, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs text-gray-500">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="px-6 py-4 border-t border-divider">
              <button
                onClick={handleClose}
                className="w-full py-2.5 bg-orange-500 text-white rounded-xl font-medium text-sm hover:bg-orange-600 transition-colors"
              >
                확인했어요
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
