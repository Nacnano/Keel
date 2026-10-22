import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '../lib/cx';
import { useMediaQuery } from '../lib/useMediaQuery';
import { Button } from './Button';

export interface SheetProps {
  open: boolean;
  onClose(): void;
  title?: ReactNode;
  /** Header actions next to the close button. */
  actions?: ReactNode;
  children: ReactNode;
  /** `side` on wide screens (inspector), bottom sheet on narrow; `center` for dialogs. */
  placement?: 'auto' | 'side' | 'bottom' | 'center';
  /** Keep page interactive (no scrim) — used by the jam inspector. */
  modeless?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Sheet / inspector. Side panel on ≥1024 px, bottom sheet below. Escape closes.
 * Renders in a portal so it escapes overflow containers.
 */
export function Sheet({
  open,
  onClose,
  title,
  actions,
  children,
  placement = 'auto',
  modeless,
  className,
  ...aria
}: SheetProps) {
  const wide = useMediaQuery('(min-width: 1024px)', true);
  const panelRef = useRef<HTMLDivElement>(null);
  const resolved = placement === 'auto' ? (wide ? 'side' : 'bottom') : placement;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const panel = (
    <div
      ref={panelRef}
      role={modeless ? 'complementary' : 'dialog'}
      aria-modal={modeless ? undefined : true}
      aria-label={aria['aria-label'] ?? (typeof title === 'string' ? title : undefined)}
      className={cx(
        'flex flex-col overflow-hidden bg-surface text-label shadow-elevated',
        'dark:bg-[#1c1c1e]',
        resolved === 'side' &&
          'anim-slide-in-right fixed top-16 right-3 bottom-3 z-40 w-[380px] max-w-[calc(100vw-1.5rem)] rounded-sheet',
        resolved === 'bottom' &&
          'anim-slide-up fixed inset-x-0 bottom-0 z-40 max-h-[82vh] rounded-t-sheet',
        resolved === 'center' &&
          'anim-rise fixed top-1/2 left-1/2 z-40 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-sheet',
        className,
      )}
    >
      {resolved === 'bottom' && (
        <div className="flex justify-center pt-2" aria-hidden>
          <span className="h-1.5 w-9 rounded-full bg-fill" />
        </div>
      )}
      {(title || actions) && (
        <div className="flex min-h-13 items-center gap-2 px-4 pt-1">
          <h2 className="min-w-0 flex-1 truncate text-headline font-semibold">{title}</h2>
          {actions}
          <Button icon size="sm" variant="gray" round aria-label="Close" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        {children}
      </div>
    </div>
  );

  return createPortal(
    <>
      {!modeless && (
        <div
          aria-hidden
          onClick={onClose}
          className="anim-fade-in fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px]"
        />
      )}
      {panel}
    </>,
    document.body,
  );
}
