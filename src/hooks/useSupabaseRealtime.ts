'use client';

import { useEffect, useRef } from 'react';
import { invalidateTable } from '@/lib/supabase/cache';

/**
 * 라이브 데이터 새로고침 훅 (Phase 4 — Supabase Realtime 대체).
 *
 * 자체호스팅 PG엔 Supabase Realtime이 없으므로 postgres_changes 구독 대신
 * **폴링 + 포커스/가시성 새로고침**으로 동작한다. 호출 시그니처는 기존과 동일하여
 * 호출 컴포넌트는 변경 불필요.
 *
 * 동작:
 *  - 탭이 보일 때 pollMs(기본 20초) 주기로 onRefresh.
 *  - 탭 복귀(visibilitychange) / 창 포커스 시 즉시 onRefresh (near-realtime 체감).
 *  - 매 새로고침 전 해당 테이블 캐시를 invalidate → fresh 데이터.
 *  - 마운트 시에는 호출하지 않음(컴포넌트가 자체 초기 로드) — 기존 동작과 동일.
 *
 * filter / debounceMs 는 하위호환을 위해 시그니처에 유지하되 폴링에선 사용하지 않는다.
 * 더 강한 실시간성이 필요하면 PG LISTEN/NOTIFY + SSE로 후속 업그레이드 가능.
 */
interface RealtimeOptions {
  filter?: { column: string; value: string };
  debounceMs?: number;
  enabled?: boolean;
  /** 폴링 주기(ms). 기본 20000. */
  pollMs?: number;
}

export function useSupabaseRealtime(
  tables: string | string[],
  onRefresh: () => void,
  options?: RealtimeOptions,
) {
  const { enabled = true, pollMs = 20_000 } = options ?? {};
  const callbackRef = useRef(onRefresh);

  // 최신 콜백 유지 (재구독 없이)
  useEffect(() => {
    callbackRef.current = onRefresh;
  }, [onRefresh]);

  const tableKey = Array.isArray(tables) ? tables.join(',') : tables;

  useEffect(() => {
    if (!enabled) return;
    const tableList = tableKey.split(',');

    const refresh = () => {
      tableList.forEach((t) => invalidateTable(t));
      callbackRef.current();
    };

    // 주기 폴링 — 보이는 탭에서만 (백그라운드 탭 부하 방지)
    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        refresh();
      }
    }, pollMs);

    // 탭 복귀 / 포커스 시 즉시 새로고침
    const onActive = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onActive);
    window.addEventListener('focus', onActive);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onActive);
      window.removeEventListener('focus', onActive);
    };
  }, [tableKey, enabled, pollMs]);
}
