import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';

export interface PopoverProps {
  /** The trigger; receives aria attributes and the toggle handler. */
  trigger: (props: {
    'aria-haspopup': 'dialog';
    'aria-expanded': boolean;
    'aria-controls': string;
    onClick: () => void;
  }) => ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  width?: number;
  className?: string;
  'aria-label'?: string;
}

/** Anchored popover (menu / options). Position fixed so it escapes scroll containers. */
export function Popover({
  trigger,
  children,
  align = 'end',
  width = 300,
  className,
  ...aria
}: PopoverProps) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      if (!a) return;
      const vw = window.innerWidth;
      const left =
        align === 'end'
          ? Math.max(8, Math.min(a.right - width, vw - width - 8))
          : Math.max(8, a.left);
      setPos({ top: a.bottom + 8, left });
    };
    place();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, align, width]);

  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        {trigger({
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          'aria-controls': id,
          onClick: () => setOpen((v) => !v),
        })}
      </span>
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-label={aria['aria-label']}
            style={{ top: pos.top, left: pos.left, width }}
            className={cx(
              'anim-rise material fixed z-50 max-h-[70vh] overflow-y-auto rounded-card p-2 text-label shadow-elevated',
              className,
            )}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
