'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Send, CheckCircle, AlertCircle } from 'lucide-react';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type Msg = { type: 'success' | 'error'; text: string };

export default function PushNotificationSetup() {
  const [supported, setSupported] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const iOS = /iPad|iPhone|iPod/.test(ua)
      || (ua.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document);
    setIsIOS(iOS);
    const ok = !iOS
      && typeof window !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setSubscribed(true);
        setEndpoint(sub.endpoint);
      }
    });
  }, []);

  const showMsg = (m: Msg) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  };

  const subscribe = async () => {
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        showMsg({ type: 'error', text: '알림 권한이 거부되었습니다' });
        return;
      }
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        showMsg({ type: 'error', text: 'VAPID 키가 설정되지 않았습니다' });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '저장 실패');
      setSubscribed(true);
      setEndpoint(sub.endpoint);
      showMsg({ type: 'success', text: '알림 구독 완료!' });
    } catch (e) {
      showMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setEndpoint(null);
      showMsg({ type: 'success', text: '구독이 해제되었습니다' });
    } catch (e) {
      showMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const sendTest = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '전송 실패');
      showMsg({ type: 'success', text: `${data.sent}/${data.total}개 기기에 전송됨` });
    } catch (e) {
      showMsg({ type: 'error', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  if (isIOS) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">푸시 알림</h2>
        <p className="text-sm text-gray-500">
          현재 푸시 알림은 Android(갤럭시) 및 데스크탑에서만 지원됩니다. iOS는 추후 지원 예정입니다.
        </p>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">푸시 알림</h2>
        <p className="text-sm text-gray-500">이 브라우저는 웹 푸시를 지원하지 않습니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">푸시 알림</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">이 기기에서 알림 받기</p>
            <p className="text-sm text-gray-500">
              {subscribed
                ? '이 기기는 알림을 받도록 등록되어 있습니다'
                : permission === 'denied'
                ? '브라우저 설정에서 알림 권한을 허용해주세요'
                : '구독하면 이 기기로 알림이 전송됩니다'}
            </p>
            {endpoint && (
              <p className="text-xs text-gray-400 mt-1 font-mono truncate max-w-md">{endpoint}</p>
            )}
          </div>
          {subscribed ? (
            <button
              onClick={unsubscribe}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <BellOff size={16} /> 구독 해제
            </button>
          ) : (
            <button
              onClick={subscribe}
              disabled={loading || permission === 'denied'}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              <Bell size={16} /> 알림 구독
            </button>
          )}
        </div>
        {subscribed && (
          <div className="pt-4 border-t">
            <button
              onClick={sendTest}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              <Send size={16} /> 테스트 알림 보내기
            </button>
          </div>
        )}
        {msg && (
          <div className={`flex items-center gap-2 text-sm ${msg.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
            {msg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}
