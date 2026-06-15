// 모듈 레벨 fetch 캐시 + 인플라이트 dedupe + prefix invalidation.
// 동일 페이지에 여러 컴포넌트가 동시에 같은 fetch (예: getPartners)를 부르면 한 번만 네트워크 호출,
// realtime 이벤트 시 해당 prefix를 무효화하면 다음 호출이 fresh 데이터를 가져옴.

type Entry<T> = { data?: T; at: number; pending?: Promise<T> };
const store = new Map<string, Entry<unknown>>();

// 무효화 세대 카운터 — fetch 진행 중 invalidate* 가 호출되면 그 fetch 결과는 stale 로 간주.
let epoch = 0;

const DEFAULT_TTL_MS = 30_000;

export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const cur = store.get(key) as Entry<T> | undefined;

  // 이미 진행 중인 fetch가 있으면 그걸 공유 (동시 호출 dedupe)
  if (cur?.pending) return cur.pending;

  // TTL 안에 fresh 데이터가 있으면 반환
  if (cur?.data !== undefined && now - cur.at < ttlMs) {
    return cur.data;
  }

  const startEpoch = epoch;
  const pending = fetcher()
    .then((data) => {
      // fetch 도중 무효화(invalidate*)가 있었으면 stale 이므로 캐시에 쓰지 않고 호출자에게만 반환.
      // (이게 없으면 realtime invalidate 직후 끝나는 in-flight fetch가 옛 데이터를 재캐시해 갱신이 묻힘)
      if (epoch === startEpoch) {
        store.set(key, { data, at: Date.now() });
      }
      return data;
    })
    .catch((err) => {
      // 실패한 fetch는 캐시에서 제거 (다음 호출 시 재시도)
      store.delete(key);
      throw err;
    });

  store.set(key, { ...cur, at: cur?.at ?? 0, pending });
  return pending;
}

/** 단일 키 무효화 */
export function invalidate(key: string): void {
  epoch++;
  store.delete(key);
}

/** prefix로 시작하는 모든 키 무효화 (예: 'episodes:' → 'episodes:all' + 'episodes:project:xxx' 동시) */
export function invalidatePrefix(prefix: string): void {
  epoch++;
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

/** 전체 캐시 비우기 (로그아웃 등) */
export function invalidateAll(): void {
  epoch++;
  store.clear();
}

/** 테이블명 → 캐시 prefix 매핑. realtime hook이 사용. */
const TABLE_PREFIX: Record<string, string> = {
  projects:        'projects:',
  episodes:        'episodes:',
  partners:        'partners:',
  partner_history: 'partner_history:',
  partner_issues:  'partner_issues:',
  clients:         'clients:',
  user_profiles:   'profile:',
};

export function invalidateTable(table: string): void {
  const prefix = TABLE_PREFIX[table];
  if (prefix) invalidatePrefix(prefix);
}
