import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Marker, MarkerKind } from '@/core';
import { cx } from '../lib/cx';
import { MARKER_LABEL, SECTION_KINDS } from '../lib/markers';
import { clockLabel, timeToX, visibleSeconds, type TimeViewport } from '../screens/review/timeline';
import { Button } from './Button';
import { BookmarkIcon, FlagIcon } from './icons';

export interface MarkerLaneProps {
  /** Sorted by `t`. */
  markers: readonly Marker[];
  viewport: TimeViewport;
  width: number;
  duration: number;
  selectedId: string | null;
  onSelect(id: string | null): void;
  onSeek(t: number): void;
  onMove(id: string, t: number): void;
  onDelete(id: string): void;
  className?: string;
}

const DRAG_THRESHOLD_PX = 4;
const ALL_KINDS: MarkerKind[] = ['bookmark', ...SECTION_KINDS, 'custom'];

const markerText = (m: Marker) => m.label ?? MARKER_LABEL[m.kind];

/**
 * Structure markers and bookmarks on the shared time axis. Drag a pin to move it, click to
 * select and seek, Delete/Backspace removes the focused pin, arrow keys nudge it (Shift = 0.1 s).
 * Pair with `MarkerToolbar` for adding and editing.
 */
export function MarkerLane({
  markers,
  viewport,
  width,
  duration,
  selectedId,
  onSelect,
  onSeek,
  onMove,
  onDelete,
  className,
}: MarkerLaneProps) {
  const [drag, setDrag] = useState<{ id: string; t: number } | null>(null);
  const start = useRef<{ id: string; x: number; t: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const t0 = viewport.start;
  const t1 = viewport.start + visibleSeconds(viewport, width);
  const clampT = (t: number) => Math.min(Math.max(0, duration), Math.max(0, t));

  const onPointerDown = (m: Marker) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    start.current = { id: m.id, x: e.clientX, t: m.t, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (!s.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    s.moved = true;
    setDrag({ id: s.id, t: clampT(s.t + dx / viewport.pxPerSec) });
  };
  const onPointerUp = (m: Marker) => () => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    justDragged.current = s.moved;
    if (s.moved && drag) {
      onMove(m.id, drag.t);
      onSelect(m.id);
    }
    setDrag(null);
  };
  const onClick = (m: Marker) => {
    // A completed drag also produces a click; ignore it.
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    onSelect(m.id);
    onSeek(m.t);
  };
  const onKeyDown = (m: Marker) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      onDelete(m.id);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const step = (e.shiftKey ? 0.1 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
      onMove(m.id, clampT(m.t + step));
      onSelect(m.id);
    }
  };

  const visible = markers.filter((m) => {
    const t = drag?.id === m.id ? drag.t : m.t;
    return t >= t0 - 1 && t <= t1;
  });

  return (
    <div
      className={cx('relative h-12 overflow-hidden', className)}
      role="group"
      aria-label="Markers. Drag to move, Delete removes, arrow keys nudge."
    >
      {markers.length === 0 && (
        <p className="absolute inset-0 flex items-center px-3 text-xs text-zinc-600">
          No markers yet. Press B for a bookmark at the playhead.
        </p>
      )}
      {visible.map((m) => {
        const t = drag?.id === m.id ? drag.t : m.t;
        const bookmark = m.kind === 'bookmark';
        const isSel = m.id === selectedId;
        return (
          <button
            key={m.id}
            type="button"
            data-testid="lane-marker"
            aria-pressed={isSel}
            aria-label={`${markerText(m)} at ${clockLabel(t)}`}
            title={`${markerText(m)} · ${clockLabel(t, true)} · drag to move`}
            onPointerDown={onPointerDown(m)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp(m)}
            onPointerCancel={() => {
              start.current = null;
              setDrag(null);
            }}
            onClick={() => onClick(m)}
            onKeyDown={onKeyDown(m)}
            className={cx(
              'absolute top-0 flex h-full min-w-11 touch-none items-center gap-1 rounded-r-lg border-l-2 pr-2 pl-1.5 text-xs font-medium whitespace-nowrap',
              'cursor-ew-resize focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-violet-300',
              bookmark ? 'border-amber-300 text-amber-200' : 'border-sky-300 text-sky-200',
              isSel ? 'bg-zinc-800' : 'bg-zinc-950/60 hover:bg-zinc-900',
            )}
            style={{ left: timeToX(viewport, t) }}
          >
            {bookmark ? <BookmarkIcon size={14} /> : <FlagIcon size={14} />}
            <span>{markerText(m)}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface MarkerToolbarProps {
  /** Playhead; new markers land here. */
  time: number;
  selected: Marker | null;
  onAdd(kind: MarkerKind, t: number): void;
  onDelete(id: string): void;
  onChangeKind(id: string, kind: MarkerKind): void;
  onDeselect(): void;
  className?: string;
}

/** Add a bookmark / section at the playhead; edit or delete the selected marker. */
export function MarkerToolbar({
  time,
  selected,
  onAdd,
  onDelete,
  onChangeKind,
  onDeselect,
  className,
}: MarkerToolbarProps) {
  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      <Button onClick={() => onAdd('bookmark', time)}>
        <BookmarkIcon size={16} />
        Bookmark
        <kbd className="ml-1 rounded bg-zinc-900 px-1 text-[10px] text-zinc-400">B</kbd>
      </Button>
      <select
        aria-label="Add section marker at playhead"
        value=""
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value as MarkerKind, time);
        }}
        className="min-h-11 rounded-xl bg-zinc-800/80 px-3 text-sm text-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-300"
      >
        <option value="">+ Section at playhead…</option>
        {SECTION_KINDS.map((k) => (
          <option key={k} value={k}>
            {MARKER_LABEL[k]}
          </option>
        ))}
      </select>

      {selected && (
        <div
          data-testid="marker-editor"
          className="flex items-center gap-2 rounded-xl bg-zinc-900 py-1 pr-1 pl-3 ring-1 ring-zinc-800 sm:ml-auto"
        >
          <span className="text-sm text-zinc-300 tabular-nums">{clockLabel(selected.t, true)}</span>
          <select
            aria-label="Marker type"
            value={selected.kind}
            onChange={(e) => onChangeKind(selected.id, e.target.value as MarkerKind)}
            className="min-h-11 rounded-lg bg-zinc-800 px-2 text-sm text-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-300"
          >
            {ALL_KINDS.map((k) => (
              <option key={k} value={k}>
                {MARKER_LABEL[k]}
              </option>
            ))}
          </select>
          <Button variant="danger" onClick={() => onDelete(selected.id)}>
            Delete marker
          </Button>
          <Button variant="ghost" size="icon" aria-label="Close marker editor" onClick={onDeselect}>
            ✕
          </Button>
        </div>
      )}
    </div>
  );
}
