'use client';

import { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 파트너 서브도메인에서는 ERP PWA 프롬프트 표시 안 함
    if (window.location.host.startsWith('partner.')) return;

    // 서비스워커 등록
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }

    // 이미 설치됨 or 이전에 닫음
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (sessionStorage.getItem('pwa-dismissed')) return;

    // Android/Chrome: beforeinstallprompt 이벤트
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari 감지
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    if (isIOS && isSafari) {
      setShowIOSGuide(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIOSGuide(false);
    sessionStorage.setItem('pwa-dismissed', 'true');
  };

  // 이미 PWA로 실행 중이면 표시 안 함
  if (dismissed) return null;
  if (!deferredPrompt && !showIOSGuide) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-2xl bg-stone-900 p-4 text-white shadow-xl">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-stone-400 hover:text-white"
      >
        <X size={18} />
      </button>

      {deferredPrompt ? (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-600">
            <Download size={20} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">비모 ERP 앱 설치</p>
            <p className="text-xs text-stone-400">홈 화면에 추가하여 앱처럼 사용</p>
          </div>
          <button
            onClick={handleInstall}
            className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium hover:bg-orange-700"
          >
            설치
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-600">
            <Share size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold">비모 ERP 앱 설치</p>
            <p className="mt-1 text-xs leading-relaxed text-stone-400">
              하단의 <Share size={12} className="inline" /> 공유 버튼을 누른 후<br />
              <strong className="text-white">&quot;홈 화면에 추가&quot;</strong>를 선택하세요
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
