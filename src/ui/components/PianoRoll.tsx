import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import { cx } from '../lib/cx';
import { tickStep, visibleSeconds, xToTime, type TimeViewport } from '../screens/review/timeline';
import { useElementSize } from '../screens/review/useElementSize';
import { useTimeGestures } from '../screens/review/useTimeGestures';
import {
  isBlackKey,
  noteLabel,
  pitchWindow,
  visibleNotes,
  type NoteIndex,
} from './PianoRoll.logic';

export interface PianoRollProps {
  index: NoteIndex;
  viewport: TimeViewport;
  onViewportChange(v: TimeViewport): void;
  /** Playhead, seconds. */
  time: number;
  /** Tap (no drag) on the roll seeks here. */
  onSeek?(t: number): void;
  /** Chord symbol shown in a badge on the playhead. */
  playheadLabel?: string;
  /** Faint vertical lines at chord changes. */
  chordTimes?: readonly number[];
  className?: string;
}

/** Canvas colours from the design tokens in `index.css`, with Apple dark fallbacks. */
interface Palette {
  bg: string;
  blackRow: string;
  octave: string;
  grid: string;
  accent: string;
  accentFg: string;
  label: string;
  sounding: string;
}

const FALLBACK: Palette = {
  bg: '#1c1c1e',
  blackRow: 'rgba(120, 120, 128, 0.18)',
  octave: 'rgba(84, 84, 88, 0.6)',
  grid: 'rgba(120, 120, 128, 0.18)',
  accent: '#0a84ff',
  accentFg: '#ffffff',
  label: 'rgba(235, 235, 245, 0.3)',
  sounding: '#ffffff',
};

let paletteCache: Palette | null = null;

/** Read once per theme (getComputedStyle every frame would be wasted work during playback). */
function readPalette(): Palette {
  if (paletteCache) return paletteCache;
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return FALLBACK;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  paletteCache = {
    bg: v('--jk-surface', FALLBACK.bg),
    blackRow: v('--jk-fill-4', FALLBACK.blackRow),
    octave: v('--jk-separator', FALLBACK.octave),
    grid: v('--jk-fill-4', FALLBACK.grid),
    accent: v('--jk-accent', FALLBACK.accent),
    accentFg: v('--jk-accent-fg', FALLBACK.accentFg),
    label: v('--jk-label-3', FALLBACK.label),
    sounding: v('--jk-label', FALLBACK.sounding),
  };
  return paletteCache;
}

/** Note opacity by velocity bucket (soft -> loud), applied over the accent colour. */
const VELOCITY_ALPHAS = [0.45, 0.62, 0.8, 0.95];

/**
 * Canvas 2D piano roll: pitch vertical, time horizontal, shared time viewport with the other
 * review lanes. Only notes inside the viewport are drawn (binary-search culling, one path per
 * colour), so 50k-event tracks redraw at 60 fps. Drag to scroll, wheel or pinch to zoom, tap to
 * seek. Sharp on high-DPI screens and redraws when the container resizes.
 */
export function PianoRoll({
  index,
  viewport,
  onViewportChange,
  time,
  onSeek,
  playheadLabel,
  chordTimes,
  className,
}: PianoRollProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { width, height } = useElementSize(wrap);
  // Bumped when devicePixelRatio changes (window dragged to another screen, browser zoom).
  const [dprTick, bumpDpr] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mql.addEventListener('change', bumpDpr);
    return () => mql.removeEventListener('change', bumpDpr);
  }, [dprTick]);

  // Redraw when the theme flips (the `dark` class on <html> changes the token values).
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const mo = new MutationObserver(() => {
      paletteCache = null;
      bumpDpr();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => mo.disconnect();
  }, []);

  useTimeGestures(wrap, {
    viewport,
    onViewportChange,
    onTap: (x) => onSeek?.(xToTime(viewport, x)),
  });

  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el || width <= 0 || height <= 0) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(width * dpr);
    const bh = Math.round(height * dpr);
    if (el.width !== bw || el.height !== bh) {
      el.width = bw;
      el.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, {
      width,
      height,
      index,
      viewport,
      time,
      playheadLabel,
      chordTimes,
    });
  }, [width, height, index, viewport, time, playheadLabel, chordTimes, dprTick]);

  return (
    <div
      ref={wrap}
      className={cx('relative touch-none overflow-hidden select-none', className)}
      style={{ cursor: 'grab' }}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Piano roll, ${index.notes.length} notes. Drag to scroll, wheel or pinch to zoom, tap to seek.`}
        className="absolute inset-0 block"
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    </div>
  );
}

interface DrawArgs {
  width: number;
  height: number;
  index: NoteIndex;
  viewport: TimeViewport;
  time: number;
  playheadLabel?: string;
  chordTimes?: readonly number[];
}

function draw(ctx: CanvasRenderingContext2D, a: DrawArgs) {
  const { width: w, height: h, index, viewport: v, time } = a;
  const t0 = v.start;
  const t1 = v.start + visibleSeconds(v, w);
  const px = v.pxPerSec;
  const { lo, hi } = pitchWindow(index);
  const rowH = h / (hi - lo + 1);
  const yOf = (note: number) => (hi - note) * rowH;

  const c = readPalette();
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, w, h);

  // Black-key rows, octave lines and labels.
  ctx.fillStyle = c.blackRow;
  for (let n = lo; n <= hi; n++) if (isBlackKey(n)) ctx.fillRect(0, yOf(n), w, rowH);
  ctx.fillStyle = c.octave;
  for (let n = lo; n <= hi; n++) {
    if (n % 12 === 0) ctx.fillRect(0, Math.round(yOf(n) + rowH) - 1, w, 1);
  }

  // Time grid.
  const step = tickStep(px, 96);
  ctx.fillStyle = c.grid;
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
    ctx.fillRect(Math.round((t - t0) * px), 0, 1, h);
  }

  // Chord changes.
  if (a.chordTimes?.length) {
    ctx.fillStyle = c.accent;
    ctx.globalAlpha = 0.22;
    for (const t of a.chordTimes) {
      if (t < t0 || t > t1) continue;
      ctx.fillRect(Math.round((t - t0) * px), 0, 1, h);
    }
    ctx.globalAlpha = 1;
  }

  // Notes, batched into one path per fill colour.
  const notes = visibleNotes(index, { t0, t1, pitchLo: lo, pitchHi: hi });
  const barH = Math.max(1, rowH - (rowH > 4 ? 1 : 0));
  const buckets: Path2D[] | null =
    typeof Path2D === 'function' ? VELOCITY_ALPHAS.map(() => new Path2D()) : null;
  const sounding = typeof Path2D === 'function' ? new Path2D() : null;
  for (const n of notes) {
    const x = (n.t - t0) * px;
    const bw = Math.max(2, (n.end - n.t) * px - 1);
    const y = yOf(n.note);
    if (n.t <= time && n.end > time) {
      sounding?.rect(x, y, bw, barH);
    } else {
      const b = Math.min(
        VELOCITY_ALPHAS.length - 1,
        Math.floor((n.velocity / 128) * VELOCITY_ALPHAS.length),
      );
      buckets?.[b].rect(x, y, bw, barH);
    }
  }
  if (buckets && sounding) {
    ctx.fillStyle = c.accent;
    buckets.forEach((path, i) => {
      ctx.globalAlpha = VELOCITY_ALPHAS[i];
      ctx.fill(path);
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.sounding;
    ctx.fill(sounding);
  }

  // Octave labels on top of the notes so they stay legible.
  if (rowH * 12 >= 28) {
    ctx.font = '11px -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = c.label;
    for (let n = lo; n <= hi; n++) {
      if (n % 12 === 0) ctx.fillText(noteLabel(n), 4, yOf(n) + rowH - 2);
    }
  }

  // Playhead and chord badge.
  const x = Math.round((time - t0) * px);
  if (x >= -2 && x <= w + 2) {
    ctx.fillStyle = c.accent;
    ctx.fillRect(x - 1, 0, 2, h);
    if (a.playheadLabel) {
      ctx.font = '600 13px -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(a.playheadLabel).width;
      const bw = tw + 14;
      const bx = Math.min(Math.max(0, x + 6), Math.max(0, w - bw));
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, 6, bw, 22, 6);
      else ctx.rect(bx, 6, bw, 22);
      ctx.fill();
      ctx.fillStyle = c.accentFg;
      ctx.fillText(a.playheadLabel, bx + 7, 17);
    }
  }
}
