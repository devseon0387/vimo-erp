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
  readUids?: string[];
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
      const readUids = Array.isArray(data.readUids) ? data.readUids : [];
      cache = {
        configured: Boolean(data.configured),
        isAdmin: Boolean(data.isAdmin),
        myBoxes: Array.isArray(data.myBoxes) ? data.myBoxes : [],
        sharedBoxes: Array.isArray(data.sharedBoxes) ? data.sharedBoxes : undefined,
        emails: Array.isArray(data.emails) ? data.emails : [],
        readUids,
      };
      // 서버 읽음상태(SoT)를 로컬 집합에 병합 — 기기 간 동기화. 낙관적 표시는 보존(합집합).
      hydrateSeen(readUids);
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

// ─── 읽음 상태 (서버 DB가 SoT, localStorage는 즉시표시 캐시) ───
// 이전: localStorage 전용(브라우저 한정). 변경: /api/mail/read 로 영속화 → 기기 간 동기화.
// 흐름: 모듈 로드 시 localStorage 시드(즉시 페인트) → fetchInbox 가 서버 readUids 를 병합
//       → markSeen 은 낙관적으로 집합 갱신 + 서버 POST(fire-and-forget).
const SEEN_KEY = 'vimo-mail-seen';
const SEEN_MAX = 1000;

const seenSet: Set<string> = (() => {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set<string>();
})();

function persistSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seenSet].slice(-SEEN_MAX)));
  } catch { /* ignore */ }
}

/** 서버 readUids 를 로컬 집합에 합집합으로 병합(낙관적 표시 보존). 새로 추가된 게 있으면 캐시 저장. */
function hydrateSeen(uids: string[]): void {
  let changed = false;
  for (const u of uids) {
    if (!seenSet.has(u)) { seenSet.add(u); changed = true; }
  }
  if (changed) persistSeen();
}

/** 읽음 집합(라이브). 소비자는 .has(uid) 로 사용. emit 후 재렌더 시 최신 상태를 읽는다. */
export function getSeenSet(): Set<string> {
  return seenSet;
}

/** 메일 열람 시 호출. 낙관적으로 읽음 표시 + 서버에 영속화(실패해도 화면은 즉시 반영). */
export function markSeen(uid: string): void {
  if (!uid || seenSet.has(uid)) return;
  seenSet.add(uid);
  persistSeen();
  emit();
  // 서버 영속화 — 실패는 무시(다음 fetch 때 재동기화되거나 로컬 캐시로 유지).
  if (typeof window !== 'undefined') {
    void fetch('/api/mail/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uids: [uid] }),
    }).catch(() => { /* ignore */ });
  }
}
