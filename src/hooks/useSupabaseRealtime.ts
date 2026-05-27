'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { invalidateTable } from '@/lib/supabase/cache';

interface RealtimeOptions {
  filter?: { column: string; value: string };
  debounceMs?: number;
  enabled?: boolean;
}

export function useSupabaseRealtime(
  tables: string | string[],
  onRefresh: () => void,
  options?: RealtimeOptions,
) {
  const { debounceMs = 500, enabled = true, filter } = options ?? {};
  const callbackRef = useRef(onRefresh);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Always keep the latest callback without re-subscribing
  useEffect(() => {
    callbackRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const tableList = Array.isArray(tables) ? tables : [tables];
    const channelName = `realtime:${tableList.join(',')}`;

    const channel = supabase.channel(channelName);

    tableList.forEach((table) => {
      const opts: Record<string, string> = {
        event: '*',
        schema: 'public',
        table,
      };
      if (filter) {
        opts.filter = `${filter.column}=eq.${filter.value}`;
      }
      channel.on('postgres_changes', opts, () => {
        // 캐시 무효화 즉시 (debounce 전) — 동시 마운트 다수 컴포넌트가 곧 호출할 fetch는 fresh 가져옴
        invalidateTable(table);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          callbackRef.current();
        }, debounceMs);
      });
    });

    channel.subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Stable serialized keys — only re-subscribe when these change
    Array.isArray(tables) ? tables.join(',') : tables,
    enabled,
    debounceMs,
    filter?.column,
    filter?.value,
  ]);
}
