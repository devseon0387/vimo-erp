// 모듈 레벨 fetch 캐시 + 인플라이트 dedupe + prefix invalidation.
// 동일 페이지에 여러 컴포넌트가 동시에 같은 fetch (예: getPartners)를 부르면 한 번만 네트워크 호출,
// realtime 이벤트 시 해당 prefix를 무효화하면 다음 호출이 fresh 데이터를 가져옴.

type Entry<T> = { data?: T; at: number; pending?: Promise<T> };
const store = new Map<string, Entry<unknown>>();

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

  const pending = fetcher()
    .then((data) => {
      store.set(key, { data, at: Date.now() });
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
  store.delete(key);
}

/** prefix로 시작하는 모든 키 무효화 (예: 'episodes:' → 'episodes:all' + 'episodes:project:xxx' 동시) */
export function invalidatePrefix(prefix: string): void {
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

/** 전체 캐시 비우기 (로그아웃 등) */
export function invalidateAll(): void {
  store.clear();
}

/** 테이블명 → 캐시 prefix 매핑. realtime hook이 사용. */
const TABLE_PREFIX: Record<string, string> = {
  projects:  'projects:',
  episodes:  'episodes:',
  partners:  'partners:',
  clients:   'clients:',
  user_profiles: 'profile:',
};

export function invalidateTable(table: string): void {
  const prefix = TABLE_PREFIX[table];
  if (prefix) invalidatePrefix(prefix);
}
