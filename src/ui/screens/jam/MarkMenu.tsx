import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Flag, Music } from 'lucide-react';
import type { MarkerKind } from '@/core';
import { Button } from '../../kit';
import { MARK_ITEMS, type MarkItem } from '../../lib/markers';

export type { MarkItem };

/** Two columns of 44 pt rows keep the menu short enough to stay below the key line. */
const WIDTH = 296;

export interface MarkMenuProps {
  onMark(item: MarkItem): void;
}

const ICON: Partial<Record<MarkerKind, typeof Flag>> = { bookmark: Bookmark };

/**
 * "Mark" button with a compact two-column menu. It opens upwards from the button (which sits
 * at the bottom of the listening screen), aligned to the button's left edge so it stays to
 * the side of the centred key line.
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
      const left = Math.max(8, Math.min(a.left, vw - WIDTH - 8));
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
            // Opaque: a see-through menu let timeline chips show through the labels.
            className="anim-rise fixed z-50 grid grid-flow-col grid-cols-2 grid-rows-4 gap-x-1 rounded-card bg-bg-2 p-1.5 text-label shadow-elevated ring-1 ring-separator/40"
          >
            {MARK_ITEMS.map((item) => {
              const Icon = item.newSong ? Music : (ICON[item.kind] ?? Flag);
              return (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onMark(item);
                  }}
                  className="flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-left text-body whitespace-nowrap outline-none hover:bg-fill-4 focus-visible:bg-fill-3 active:bg-fill-3"
                >
                  <Icon className="size-4 shrink-0 text-label-2" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
