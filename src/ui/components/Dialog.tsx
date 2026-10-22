import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Sheet } from '../kit';

export interface DialogProps {
  open: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Modal dialog: a thin wrapper over the kit `Sheet placement="center"` that keeps the old
 * contract. Escape (handled first, so screen shortcuts do not also see it) and the scrim close
 * it; focus moves into it on open and back to the previous element on close.
 */
export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const body = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    body.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={title} placement="center">
      <div ref={body} tabIndex={-1} className="pt-1 text-subhead text-label-2 outline-none">
        {children}
      </div>
      {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
    </Sheet>
  );
}
