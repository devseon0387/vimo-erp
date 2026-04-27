/**
 * Vibox 공유 링크 생성 (비모 ERP 매니저 전용)
 *
 * 흐름: handoff → SSO exchange → share-links 생성
 */

interface HandoffResponse {
  token: string;
  exchangeUrl: string;
  shareLinksUrl: string;
}

interface CreateShareLinkInput {
  episodeId?: string;
  paths?: string[];
  title?: string;
  allowComments?: boolean;
  allowDownload?: boolean;
  mode?: 'preview' | 'full';
}

interface ShareLinkResult {
  token: string;
  url: string;
  paths: string[];
}

async function getHandoff(): Promise<HandoffResponse> {
  const res = await fetch('/api/vibox/handoff', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `handoff failed: ${res.status}`);
  }
  return res.json();
}

async function exchangeSession(handoff: HandoffResponse): Promise<void> {
  const res = await fetch(handoff.exchangeUrl, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: handoff.token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`vibox SSO 실패: ${err.error ?? res.status}`);
  }
}

export async function createShareLink(input: CreateShareLinkInput): Promise<ShareLinkResult> {
  const handoff = await getHandoff();
  await exchangeSession(handoff);

  const res = await fetch(handoff.shareLinksUrl, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      episodeId: input.episodeId,
      paths: input.paths,
      title: input.title,
      allowComments: input.allowComments ?? true,
      allowDownload: input.allowDownload ?? true,
      mode: input.mode ?? 'full',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `공유 링크 생성 실패: ${res.status}`);
  }

  return res.json();
}
