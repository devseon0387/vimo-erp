'use client';

import { useState } from 'react';
import { Share2, Copy, Check, X, Loader2, AlertCircle, ExternalLink, FileX } from 'lucide-react';
import { createShareLink } from '@/lib/vibox-share';

interface Props {
  episodeId: string;
  episodeTitle?: string;
}

type State =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'created'; url: string; pathCount: number }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

function isNoFilesError(msg: string): boolean {
  return /no files|업로드.*없|file.*not.*found/i.test(msg);
}

export default function ShareLinkButton({ episodeId, episodeTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    setState({ kind: 'creating' });
    try {
      const res = await createShareLink({
        episodeId,
        title: episodeTitle,
        allowComments: true,
        allowDownload: true,
        mode: 'full',
      });
      setState({ kind: 'created', url: res.url, pathCount: res.paths.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '실패';
      if (isNoFilesError(msg)) {
        setState({ kind: 'empty' });
      } else {
        setState({ kind: 'error', message: msg });
      }
    }
  };

  const handleCopy = async () => {
    if (state.kind !== 'created') return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {/* ignore */}
  };

  const reset = () => {
    setState({ kind: 'idle' });
    setOpen(false);
    setCopied(false);
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); handleCreate(); }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-divider bg-white text-gray-700 hover:border-orange-500 hover:text-orange-600 transition-colors"
      >
        <Share2 size={13} />
        클라이언트 공유
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) reset(); }}
        >
          <div className="bg-white rounded-2xl shadow-xl border border-divider w-full max-w-md">
            <div className="px-5 py-4 border-b border-divider flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 size={16} className="text-orange-500" />
                <h3 className="text-sm font-bold text-gray-900">클라이언트 공유 링크</h3>
              </div>
              <button onClick={reset} className="text-gray-400 hover:text-gray-600 p-1 -m-1">
                <X size={16} />
              </button>
            </div>

            <div className="p-5">
              {state.kind === 'creating' && (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                  <Loader2 size={22} className="animate-spin text-orange-500 mb-3" />
                  <span className="text-xs">공유 링크 생성 중...</span>
                </div>
              )}

              {state.kind === 'created' && (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-start gap-2.5">
                    <Check size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-emerald-900">
                      <div className="font-semibold">링크가 만들어졌어요</div>
                      <div className="text-emerald-700/80 mt-0.5">{state.pathCount}개 파일 묶음 · 만료 없음 · 비번 없음</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={state.url}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="flex-1 px-3 py-2 text-xs font-mono bg-gray-50 border border-divider rounded-lg focus:outline-none focus:border-orange-500"
                    />
                    <button
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors"
                    >
                      {copied ? <><Check size={13} /> 복사됨</> : <><Copy size={13} /> 복사</>}
                    </button>
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <a
                      href={state.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-orange-600"
                    >
                      <ExternalLink size={12} /> 새 탭에서 열기
                    </a>
                    <button onClick={reset} className="text-xs font-semibold text-gray-600 hover:text-gray-900">
                      닫기
                    </button>
                  </div>
                </div>
              )}

              {state.kind === 'empty' && (
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-4 flex items-start gap-3">
                    <FileX size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900">
                      <div className="font-semibold text-[13px]">업로드된 파일이 없습니다</div>
                      <div className="text-amber-800/80 mt-1 leading-relaxed">
                        파트너가 이 회차에 vibox로 업로드한 작업물이 아직 없어요.<br/>
                        파일이 올라온 다음 다시 시도해 주세요.
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={reset} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-divider hover:bg-gray-50">
                      닫기
                    </button>
                  </div>
                </div>
              )}

              {state.kind === 'error' && (
                <div className="space-y-3">
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2.5">
                    <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-red-900">
                      <div className="font-semibold">생성 실패</div>
                      <div className="text-red-700/80 mt-0.5 break-words">{state.message}</div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={reset} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-divider hover:bg-gray-50">
                      취소
                    </button>
                    <button onClick={handleCreate} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white">
                      다시 시도
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
