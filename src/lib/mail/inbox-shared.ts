'use client';
/**
 * 받은 메일 데이터 공유 캐시 — 폴더 패널(카운트)과 받은편지함 페이지가 같은
 * /api/mail/inbox 응답을 나눠 쓴다 (S3 파싱이 무거워 중복 호출 방지).
 *  - 동시 호출 dedupe + 15초 캐시
 *  - refresh() 시 구독자 전원 갱신
 */

export interface MailBox {
  address: string;
  type: 'personal' | 'shared';
  label: string | null;
}
export interface InboxEmail {
  id: string;
  uid: string;
  from: string;
  fromName: string;
  to: string;
  cc: string;
  toAddresses?: string[];
  boxes?: MailBox[];
  unmatched?: boolean;
  subject: string;
  date: string;
  preview: string;
  text: string;
  html: string;
}
export interface MyBox extends MailBox {
  id: string;
}
export interface InboxData {
  configured: boolean;
  isAdmin: boolean;
  myBoxes: MyBox[];
  sharedBoxes?: MailBox[];
  emails: InboxEmail[];
}

const TTL = 15_000;
let cache: InboxData | null = null;
let cachedAt = 0;
let inflight: Promise<InboxData | null> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeInbox(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getInboxCache(): InboxData | null {
  return cache;
}

/**
 * 강제 재조회 — 주소 디렉토리(담당/유형/활성) 변경 후 폴더 패널·분류를 즉시 갱신.
 * 기존 캐시를 비우지 않고 새 데이터로 교체(emit)해 깜빡임 없이 최신화.
 */
export function refreshInbox(): void {
  void fetchInbox(true);
}

export async function fetchInbox(force = false): Promise<InboxData | null> {
  if (!force && cache && Date.now() - cachedAt < TTL) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/mail/inbox');
      if (!res.ok) return cache;
      const data = (await res.json()) as InboxData;
      cache = {
        configured: Boolean(data.configured),
        isAdmin: Boolean(data.isAdmin),
        myBoxes: Array.isArray(data.myBoxes) ? data.myBoxes : [],
        sharedBoxes: Array.isArray(data.sharedBoxes) ? data.sharedBoxes : undefined,
        emails: Array.isArray(data.emails) ? data.emails : [],
      };
      cachedAt = Date.now();
      emit();
      return cache;
    } catch {
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// ─── 읽음 상태 (이 브라우저 기준, localStorage) ───
const SEEN_KEY = 'vimo-mail-seen';
const SEEN_MAX = 500;

export function getSeenSet(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

export function markSeen(uid: string): void {
  try {
    const set = getSeenSet();
    if (set.has(uid)) return;
    set.add(uid);
    const arr = [...set];
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr.slice(-SEEN_MAX)));
    emit();
  } catch { /* ignore */ }
}
