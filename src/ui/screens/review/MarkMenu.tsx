import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Flag, Music } from 'lucide-react';
import type { MarkerKind } from '@/core';
import { Button } from '../../kit';
import { MARKER_LABEL } from '../../lib/markers';

/** What Mark can add: a marker kind, or "New song" (a custom section of that name). */
export type MarkChoice = { kind: MarkerKind; label?: string };

/** The Listen screen's Mark list, in song order, plus New song. */
const CHOICES: ReadonlyArray<{ id: string; text: string; choice: MarkChoice }> = [
  ...(['bookmark', 'intro', 'verse', 'pre', 'chorus', 'bridge', 'outro'] as const).map((kind) => ({
    id: kind,
    text: MARKER_LABEL[kind],
    choice: { kind },
  })),
  { id: 'song', text: 'New song', choice: { kind: 'custom', label: 'New song' } },
];

const WIDTH = 200;
/** Eight 44 px rows plus padding. */
const PANEL_HEIGHT = 8 * 44 + 12;

export interface MarkMenuProps {
  onMark(choice: MarkChoice): void;
}

/** "Mark" button with the one marker list; it opens below the button, or above near the bottom. */
export function MarkMenu({ onMark }: MarkMenuProps) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.max(8, Math.min(a.left, vw - WIDTH - 8));
      setPos(
        a.bottom + 8 + PANEL_HEIGHT <= vh || a.top < PANEL_HEIGHT + 8
          ? { top: a.bottom + 8, left }
          : { bottom: vh - a.top + 8, left },
      );
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
      // Space and Enter choose the focused item; they must not reach Review's shortcuts.
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
        e.stopPropagation();
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
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          title="Mark the playhead"
          leading={<Flag className="size-3.5" aria-hidden />}
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
            style={{ ...pos, width: WIDTH }}
            className="anim-rise material fixed z-50 flex flex-col rounded-card p-1.5 text-label shadow-elevated"
          >
            {CHOICES.map(({ id: key, text, choice }) => (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onMark(choice);
                }}
                className="flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-left text-body outline-none hover:bg-fill-4 focus-visible:bg-fill-3 active:bg-fill-3"
              >
                {key === 'bookmark' ? (
                  <Bookmark className="size-4 text-label-2" aria-hidden />
                ) : key === 'song' ? (
                  <Music className="size-4 text-label-2" aria-hidden />
                ) : (
                  <Flag className="size-4 text-label-2" aria-hidden />
                )}
                {text}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
