import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Flag } from 'lucide-react';
import type { MarkerKind } from '@/core';
import { Button } from '../../kit';
import { MARKER_LABEL } from '../../lib/markers';

/** Bookmark first, then the song sections in order. One tap each. */
const MARK_KINDS: readonly MarkerKind[] = [
  'bookmark',
  'intro',
  'verse',
  'chorus',
  'bridge',
  'outro',
];

const WIDTH = 200;

export interface MarkMenuProps {
  onMark(kind: MarkerKind): void;
}

/**
 * "Mark" button with a small menu anchored to it. It opens upwards because the button sits
 * at the bottom of the listening screen.
 */
export function MarkMenu({ onMark }: MarkMenuProps) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const vw = window.innerWidth;
      const left = Math.max(8, Math.min(a.left + a.width / 2 - WIDTH / 2, vw - WIDTH - 8));
      setPos({ bottom: window.innerHeight - a.top + 8, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // Space and Enter choose the focused item; they must not reach the jam's Space shortcut.
      if ((e.key === ' ' || e.key === 'Enter') && panel.current?.contains(e.target as Node)) {
        e.stopPropagation();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        anchor.current?.querySelector('button')?.focus();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [
          ...(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
        ];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <>
      <span ref={anchor} className="inline-flex">
        <Button
          variant="gray"
          round
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          leading={<Flag className="size-4" aria-hidden />}
          onClick={() => setOpen((v) => !v)}
        >
          Mark
        </Button>
      </span>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="menu"
            aria-label="Mark"
            style={pos ? { bottom: pos.bottom, left: pos.left, width: WIDTH } : { width: WIDTH }}
            className="anim-rise material fixed z-50 flex flex-col rounded-card p-1.5 text-label shadow-elevated"
          >
            {MARK_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onMark(kind);
                }}
                className="flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-left text-body outline-none hover:bg-fill-4 focus-visible:bg-fill-3 active:bg-fill-3"
              >
                {kind === 'bookmark' ? (
                  <Bookmark className="size-4 text-label-2" aria-hidden />
                ) : (
                  <Flag className="size-4 text-label-2" aria-hidden />
                )}
                {MARKER_LABEL[kind]}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
