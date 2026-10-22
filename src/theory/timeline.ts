/**
 * Chord timeline compression: `C F G C F G Am` -> `[C F G] x2, [Am]`.
 */
import type { Chord } from '@/core';
import { sameChord } from './chordName';

export interface Segment {
  /** One pass of the repeated pattern, or a run of non-repeating chords when `repeat` is 1. */
  chords: Chord[];
  repeat: number;
}

export interface RepeatSegment<T> {
  /** One pass of the repeated pattern, or a run of non-repeating items when `repeat` is 1. */
  items: T[];
  repeat: number;
  /** Index of the first item of this segment in the input. */
  start: number;
}

export const MAX_CYCLE = 8;

/** Drop consecutive duplicates (`C C F F F G` -> `C F G`). */
export function collapseRuns<T>(items: readonly T[], key: (x: T) => string): T[];
export function collapseRuns<T>(items: readonly T[], eq: (a: T, b: T) => boolean): T[];
export function collapseRuns<T>(
  items: readonly T[],
  fn: ((x: T) => string) | ((a: T, b: T) => boolean),
): T[] {
  const eq: (a: T, b: T) => boolean =
    fn.length >= 2
      ? (fn as (a: T, b: T) => boolean)
      : (a, b) => (fn as (x: T) => string)(a) === (fn as (x: T) => string)(b);
  const out: T[] = [];
  for (const x of items) if (out.length === 0 || !eq(out[out.length - 1], x)) out.push(x);
  return out;
}

/** True when `xs[i..i+len)` is itself a repetition of a shorter pattern. */
function isPeriodic<T>(xs: readonly T[], i: number, len: number, eq: (a: T, b: T) => boolean) {
  for (let d = 1; d < len; d++) {
    if (len % d !== 0) continue;
    let periodic = true;
    for (let k = d; k < len && periodic; k++) if (!eq(xs[i + k], xs[i + k - d])) periodic = false;
    if (periodic) return true;
  }
  return false;
}

/**
 * Optimal repeat compression of a sequence: chooses non-overlapping cycles (length
 * `minCycle..maxCycle`, at least two consecutive passes) that minimise the number of items
 * shown, then the number of segments; on ties the cycle that starts earliest wins
 * (`C F G C F G C` -> `[C F G] x2, [C]`). Adjacent non-repeating items form one segment.
 * Duplicates are NOT merged here; see `compressTimeline`.
 */
export function compressRepeats<T>(
  xs: readonly T[],
  eq: (a: T, b: T) => boolean,
  maxCycle = MAX_CYCLE,
  minCycle = 1,
): RepeatSegment<T>[] {
  const n = xs.length;
  const maxLen = Math.min(maxCycle, Math.floor(n / 2));
  const w = maxLen + 1;
  // cost = 16 * shown items + cycle segments (integers, so ties are exact)
  const cost = new Array<number>(n + 1).fill(0);
  const choice = new Array<[len: number, rep: number]>(n + 1);
  // bestRep[i*w+len]: among the passes 2..R of xs[i..i+len) repeating from i, the one that
  // minimises cost[i + rep*len] (largest on ties); 0 when the cycle does not repeat. It
  // follows from position i+len, so periodic input stays O(n * maxCycle^2), not O(n^2).
  const bestRep = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    let best = 16 + cost[i + 1];
    let pick: [number, number] = [1, 1];
    for (let len = Math.max(1, minCycle); len <= maxLen && i + 2 * len <= n; len++) {
      let same = true;
      for (let k = 0; k < len && same; k++) if (!eq(xs[i + k], xs[i + len + k])) same = false;
      if (!same) continue;
      const next = (i + len) * w + len;
      const sub = bestRep[next];
      const rep = sub >= 2 && cost[i + (sub + 1) * len] <= cost[i + 2 * len] ? sub + 1 : 2;
      bestRep[i * w + len] = rep;
      if (len > 1 && isPeriodic(xs, i, len, eq)) continue;
      const c = 16 * len + 1 + cost[i + rep * len];
      // prefer cycles over loose items on ties, then more coverage, then shorter cycles
      const better =
        c < best ||
        (c === best &&
          (pick[1] === 1 ||
            len * rep > pick[0] * pick[1] ||
            (len * rep === pick[0] * pick[1] && len < pick[0])));
      if (better) {
        best = c;
        pick = [len, rep];
      }
    }
    cost[i] = best;
    choice[i] = pick;
  }

  const out: RepeatSegment<T>[] = [];
  let i = 0;
  while (i < n) {
    const [len, rep] = choice[i];
    if (rep >= 2) {
      out.push({ items: xs.slice(i, i + len), repeat: rep, start: i });
    } else {
      const last = out[out.length - 1];
      if (last && last.repeat === 1) last.items.push(xs[i]);
      else out.push({ items: [xs[i]], repeat: 1, start: i });
    }
    i += len * rep;
  }
  return out;
}

/**
 * Compress a chord sequence for display: consecutive duplicates are merged first, then
 * repeating cycles of 1–8 chords are detected (`C F G C F G` -> `[C F G] x2`).
 */
export function compressTimeline(chords: readonly Chord[], maxCycle = MAX_CYCLE): Segment[] {
  const merged = collapseRuns(chords, (a: Chord, b: Chord) => sameChord(a, b));
  return compressRepeats(merged, sameChord, maxCycle).map((s) => ({
    chords: s.items,
    repeat: s.repeat,
  }));
}

/** Expand segments back into the (duplicate-merged) chord sequence. */
export function expandTimeline(segments: readonly Segment[]): Chord[] {
  return segments.flatMap((s) => Array.from({ length: s.repeat }, () => s.chords).flat());
}

export interface Cycle {
  /** Index of the first element of the first pass. */
  start: number;
  /** Cycle length (items in one pass). */
  period: number;
  /** Consecutive passes (>= 2). */
  repeats: number;
}

/**
 * Repeating cycles in a sequence (same segmentation as `compressRepeats`), e.g. for
 * "top progressions" summaries. Default periods 2–8; items compared with `===` unless `eq`.
 */
export function findCycles<T>(
  seq: readonly T[],
  minPeriod = 2,
  maxPeriod = MAX_CYCLE,
  eq: (a: T, b: T) => boolean = Object.is,
): Cycle[] {
  return compressRepeats(seq, eq, maxPeriod, minPeriod)
    .filter((s) => s.repeat >= 2)
    .map((s) => ({ start: s.start, period: s.items.length, repeats: s.repeat }));
}

/** Rotation-invariant identity of a cycle of string keys (`C G Am F` == `Am F C G`). */
export function canonicalRotation(pattern: readonly string[]): string {
  let best: string | null = null;
  for (let r = 0; r < pattern.length; r++) {
    const s = [...pattern.slice(r), ...pattern.slice(0, r)].join(' ');
    if (best === null || s < best) best = s;
  }
  return best ?? '';
}
