'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'brand';
};

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(
  () => Promise.resolve(false)
);

/**
 * 위험·되돌릴 수 없는 액션 확인 — 네이티브 confirm() 대체.
 *   const confirm = useConfirm();
 *   if (await confirm({ title: '삭제할까요?', description: '...', tone: 'danger', confirmLabel: '삭제' })) {
 *     await doDelete();
 *   }
 */
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setOpts(o);
      }),
    []
  );

  const settle = useCallback((v: boolean) => {
    resolverRef.current?.(v);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        isOpen={opts !== null}
        onClose={() => settle(false)}
        onConfirm={() => settle(true)}
        title={opts?.title ?? ''}
        description={opts?.description}
        confirmLabel={opts?.confirmLabel}
        cancelLabel={opts?.cancelLabel}
        tone={opts?.tone}
      />
    </ConfirmContext.Provider>
  );
}
