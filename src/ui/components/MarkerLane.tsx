import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Marker, MarkerKind } from '@/core';
import { cx } from '../lib/cx';
import { MARKER_LABEL, SECTION_KINDS } from '../lib/markers';
import { clockLabel, timeToX, visibleSeconds, type TimeViewport } from '../screens/review/timeline';
import { Bookmark, Flag, X } from 'lucide-react';
import { Button, Select } from '../kit';

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
        <p className="absolute inset-0 flex items-center px-3 text-footnote text-label-3">
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
              'absolute top-0.5 bottom-0.5 flex min-w-11 touch-none items-center gap-1 rounded-r-[8px] pr-2 pl-1.5 text-caption font-semibold whitespace-nowrap text-warn',
              'cursor-ew-resize shadow-[inset_2px_0_0_var(--jk-warn)] transition-colors duration-100 focus-visible:z-10',
              isSel ? 'bg-warn/20' : 'bg-warn/[0.07] hover:bg-warn/15',
            )}
            style={{ left: timeToX(viewport, t) }}
          >
            {bookmark ? (
              <Bookmark className="size-3.5" aria-hidden />
            ) : (
              <Flag className="size-3.5" aria-hidden />
            )}
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
      <Button
        variant="gray"
        size="sm"
        leading={<Bookmark className="size-3.5" aria-hidden />}
        onClick={() => onAdd('bookmark', time)}
        title="Bookmark at the playhead (B)"
      >
        Bookmark
        <kbd className="ml-0.5 rounded-[4px] bg-fill-3 px-1 font-sans text-[10px] text-label-2 pointer-coarse:hidden">
          B
        </kbd>
      </Button>
      <Select
        inline
        className="w-auto"
        aria-label="Add section marker at playhead"
        value=""
        onChange={(v) => {
          if (v) onAdd(v as MarkerKind, time);
        }}
        options={[
          { value: '', label: 'Add section…' },
          ...SECTION_KINDS.map((k) => ({ value: k, label: MARKER_LABEL[k] })),
        ]}
      />

      {selected && (
        <div
          data-testid="marker-editor"
          className="anim-fade-in flex items-center gap-1.5 rounded-cell bg-fill-4 py-1 pr-1 pl-3 sm:ml-auto"
        >
          <span className="text-footnote text-label-2 tabular">{clockLabel(selected.t, true)}</span>
          <Select
            inline
            className="w-auto"
            aria-label="Marker type"
            value={selected.kind}
            onChange={(v) => onChangeKind(selected.id, v as MarkerKind)}
            options={ALL_KINDS.map((k) => ({ value: k, label: MARKER_LABEL[k] }))}
          />
          <Button variant="plain" size="sm" destructive onClick={() => onDelete(selected.id)}>
            Delete marker
          </Button>
          <Button
            variant="plain"
            size="sm"
            icon
            round
            aria-label="Close marker editor"
            onClick={onDeselect}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
