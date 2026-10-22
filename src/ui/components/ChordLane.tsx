import { memo, useMemo, useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { ChordRecord, KeyRecord } from '@/core';
import { keyLabel, pretty } from '../lib/chordLabel';
import { cx } from '../lib/cx';
import { chordText, keyAtTime } from '../screens/review/chordText';
import {
  clockLabel,
  indexAt,
  keySegments,
  timeToX,
  visibleSeconds,
  type TimeViewport,
} from '../screens/review/timeline';

export interface ChordLaneProps {
  /** Sorted by `t`. */
  chords: readonly ChordRecord[];
  /** Key changes, sorted by `t`. */
  keys: readonly KeyRecord[];
  duration: number;
  viewport: TimeViewport;
  width: number;
  /** Playhead, seconds (highlights the chord under it). */
  time: number;
  onSeek(t: number): void;
  onEdit(record: ChordRecord): void;
  spellingFollowsKey?: boolean;
  showSlash?: boolean;
  className?: string;
}

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 8;
const KEY_TINTS = ['bg-violet-400/[0.07]', 'bg-sky-400/[0.07]'];

/**
 * Full-session chord timeline on the shared time axis, with key regions shaded and labelled.
 * Click a chord to seek; right-click, long-press or press E to fix it. Only chords inside the
 * viewport are rendered.
 */
export const ChordLane = memo(function ChordLane({
  chords,
  keys,
  duration,
  viewport,
  width,
  time,
  onSeek,
  onEdit,
  spellingFollowsKey = true,
  showSlash = true,
  className,
}: ChordLaneProps) {
  const segments = useMemo(() => keySegments(keys, duration), [keys, duration]);
  const t0 = viewport.start;
  const t1 = viewport.start + visibleSeconds(viewport, width);
  const current = indexAt(chords, time);

  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };

  const visible: Array<{ rec: ChordRecord; i: number; end: number }> = [];
  for (let i = Math.max(0, indexAt(chords, t0)); i < chords.length; i++) {
    const rec = chords[i];
    if (rec.t > t1) break;
    const end = i + 1 < chords.length ? chords[i + 1].t : Math.max(duration, rec.t + 1);
    if (end >= t0) visible.push({ rec, i, end });
  }

  return (
    <div
      className={cx('relative overflow-hidden', className)}
      role="group"
      aria-label="Chord lane. Enter seeks, E edits the focused chord."
    >
      {/* Key regions: tinted band behind everything + a label row on top. */}
      <div className="relative h-7">
        {segments.map((s, i) => {
          const x0 = timeToX(viewport, s.t0);
          const x1 = timeToX(viewport, s.t1);
          if (x1 < 0 || x0 > width) return null;
          const label = pretty(keyLabel(s.key, { spellingFollowsKey }));
          return (
            <div
              key={`${s.t0}-${i}`}
              data-testid="key-segment"
              className={cx(
                'absolute top-0 flex h-full items-center border-l border-violet-400/40',
                KEY_TINTS[i % 2],
              )}
              style={{ left: x0, width: Math.max(1, x1 - x0) }}
              title={`${label} from ${clockLabel(s.t0)}`}
            >
              <span
                className="truncate px-2 text-xs font-medium text-violet-200"
                style={{ marginLeft: Math.max(0, -x0) }}
              >
                {i > 0 ? '→ ' : ''}
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="relative h-16">
        {segments.map((s, i) => {
          const x0 = timeToX(viewport, s.t0);
          const x1 = timeToX(viewport, s.t1);
          if (x1 < 0 || x0 > width) return null;
          return (
            <div
              key={`bg-${s.t0}-${i}`}
              aria-hidden
              className={cx('absolute inset-y-0', KEY_TINTS[i % 2])}
              style={{ left: x0, width: Math.max(1, x1 - x0) }}
            />
          );
        })}

        {chords.length === 0 && (
          <p className="absolute inset-0 flex items-center px-3 text-sm text-zinc-500">
            No chords were detected in this session.
          </p>
        )}

        {visible.map(({ rec, i, end }) => {
          const x0 = timeToX(viewport, rec.t);
          const w = Math.max(1, (end - rec.t) * viewport.pxPerSec);
          const key = keyAtTime(keys, rec.t);
          const { symbol, numeral } = chordText(rec, key, { spellingFollowsKey, showSlash });
          const active = i === current;
          const roomy = w >= 30;
          const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
            if (e.button !== 0) return;
            cancelPress();
            suppressClick.current = false;
            press.current = {
              x: e.clientX,
              y: e.clientY,
              timer: setTimeout(() => {
                press.current = null;
                suppressClick.current = true;
                onEdit(rec);
              }, LONG_PRESS_MS),
            };
          };
          const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
            const p = press.current;
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP_PX) {
              cancelPress();
            }
          };
          const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
            if (
              e.key === 'e' ||
              e.key === 'E' ||
              e.key === 'ContextMenu' ||
              (e.key === 'F10' && e.shiftKey)
            ) {
              e.preventDefault();
              e.stopPropagation();
              onEdit(rec);
            }
          };
          return (
            <button
              key={rec.id}
              type="button"
              data-testid="lane-chord"
              data-chord-id={rec.id}
              aria-current={active ? 'true' : undefined}
              aria-label={`${symbol === '—' ? 'No chord' : symbol}${numeral ? `, ${numeral}` : ''} at ${clockLabel(rec.t)}${rec.manual ? ', edited' : ''}`}
              title={`${symbol}${numeral ? ` · ${numeral}` : ''} · ${clockLabel(rec.t, true)}${rec.manual ? ' · edited' : ''}\nClick to seek · right-click or long-press to edit`}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                onSeek(rec.t);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                const fired = suppressClick.current;
                cancelPress();
                if (!fired) {
                  suppressClick.current = true;
                  onEdit(rec);
                }
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onKeyDown={onKeyDown}
              className={cx(
                'absolute inset-y-1 flex flex-col items-start justify-center overflow-hidden rounded-lg border-l px-1.5 text-left',
                'transition-colors duration-100 [-webkit-touch-callout:none] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-violet-300',
                active
                  ? 'border-violet-300 bg-violet-400/25 text-white'
                  : 'border-zinc-700 bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800',
                !rec.chord && 'text-zinc-500',
              )}
              style={{ left: x0, width: w }}
            >
              {roomy && (
                <>
                  <span className="max-w-full truncate text-base leading-tight font-semibold">
                    {symbol}
                    {rec.manual && (
                      <span aria-hidden className="ml-1 align-super text-[10px] text-violet-300">
                        ●
                      </span>
                    )}
                  </span>
                  <span className="h-4 max-w-full truncate text-xs leading-4 text-zinc-400">
                    {numeral}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});
