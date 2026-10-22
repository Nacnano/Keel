/**
 * Pure time helpers shared by the review lanes: the horizontal viewport (zoom +
 * scroll), binary search by time, key segments and ruler ticks.
 */
import type { Key } from '@/core';

/** Horizontal view over session time. `start` in seconds, `pxPerSec` = zoom. */
export interface TimeViewport {
  start: number;
  pxPerSec: number;
}

export const MIN_PX_PER_SEC = 2;
export const MAX_PX_PER_SEC = 600;
export const DEFAULT_PX_PER_SEC = 80;
/** Used when the container has no measurable width yet (first paint, jsdom). */
export const FALLBACK_WIDTH = 800;

export const xToTime = (v: TimeViewport, x: number) => v.start + x / v.pxPerSec;
export const timeToX = (v: TimeViewport, t: number) => (t - v.start) * v.pxPerSec;
export const visibleSeconds = (v: TimeViewport, width: number) =>
  (width > 0 ? width : FALLBACK_WIDTH) / v.pxPerSec;

/**
 * Keep the zoom between "whole session fits" and MAX_PX_PER_SEC, and the scroll inside
 * [0, duration - visible]. Returns `v` itself when nothing changes.
 */
export function clampViewport(v: TimeViewport, width: number, duration: number): TimeViewport {
  const w = width > 0 ? width : FALLBACK_WIDTH;
  const fit = duration > 0 ? w / duration : DEFAULT_PX_PER_SEC;
  const minPx = Math.max(MIN_PX_PER_SEC, Math.min(fit, DEFAULT_PX_PER_SEC));
  const pxPerSec = Math.min(MAX_PX_PER_SEC, Math.max(minPx, v.pxPerSec));
  const maxStart = Math.max(0, duration - w / pxPerSec);
  const start = Math.min(maxStart, Math.max(0, v.start));
  return start === v.start && pxPerSec === v.pxPerSec ? v : { start, pxPerSec };
}

/** Zoom by `factor` keeping the time under `anchorX` (px from the left edge) fixed. */
export function zoomAt(v: TimeViewport, factor: number, anchorX: number): TimeViewport {
  const anchorT = xToTime(v, anchorX);
  const pxPerSec = Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, v.pxPerSec * factor));
  return { pxPerSec, start: anchorT - anchorX / pxPerSec };
}

/** Index of the last item with `t <= time`, or -1. Items must be sorted by `t`. */
export function indexAt<T extends { t: number }>(items: readonly T[], time: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].t <= time) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export interface KeySegment {
  t0: number;
  t1: number;
  key: Key;
}

/** Contiguous key regions from key-change records (sorted), merged when the key repeats. */
export function keySegments(
  keys: ReadonlyArray<{ t: number; key: Key }>,
  duration: number,
): KeySegment[] {
  const out: KeySegment[] = [];
  keys.forEach((k, i) => {
    const t1 = i + 1 < keys.length ? keys[i + 1].t : Math.max(duration, k.t);
    const prev = out[out.length - 1];
    if (prev && prev.key.tonic === k.key.tonic && prev.key.mode === k.key.mode) {
      prev.t1 = t1;
    } else {
      out.push({ t0: k.t, t1, key: { tonic: k.key.tonic, mode: k.key.mode } });
    }
  });
  return out;
}

/** Ruler tick spacing (seconds) so labels sit at least `minPx` apart. */
export function tickStep(pxPerSec: number, minPx = 72): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  for (const s of steps) if (s * pxPerSec >= minPx) return s;
  return steps[steps.length - 1];
}

/** `1:05`, `1:05.5` (with `tenths`), `1:02:03`. */
export function clockLabel(sec: number, tenths = false): string {
  const safe = Math.max(0, sec);
  const whole = Math.floor(safe);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, '0');
  const base = h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  return tenths ? `${base}.${Math.min(9, Math.floor((safe - whole) * 10))}` : base;
}
