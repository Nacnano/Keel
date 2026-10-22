/**
 * Small repeating-cycle detector over a sequence of string keys (chord labels).
 * TODO(integration): use @/theory/timeline repeat compression once WS-A lands.
 */

export interface Cycle {
  /** Index of the first element of the first repetition. */
  start: number;
  /** Cycle length (number of chords in one pass). */
  period: number;
  /** Consecutive repetitions (>= 2). */
  repeats: number;
}

export const MIN_PERIOD = 2;
export const MAX_PERIOD = 8;

function equalSlices(seq: readonly string[], a: number, b: number, len: number): boolean {
  for (let k = 0; k < len; k++) if (seq[a + k] !== seq[b + k]) return false;
  return true;
}

/** True when `seq[start..start+period)` is not itself a repetition of a shorter pattern. */
function isPrimitive(seq: readonly string[], start: number, period: number): boolean {
  for (let d = 1; d < period; d++) {
    if (period % d !== 0) continue;
    let periodic = true;
    for (let k = d; k < period && periodic; k++) {
      if (seq[start + k] !== seq[start + k - d]) periodic = false;
    }
    if (periodic) return false;
  }
  return true;
}

/**
 * Greedy left-to-right scan. At each position picks the cycle (period 2–8,
 * at least two consecutive passes) that covers the most elements, preferring
 * the shorter period on ties, then continues after it. Non-overlapping.
 */
export function findCycles(
  seq: readonly string[],
  minPeriod = MIN_PERIOD,
  maxPeriod = MAX_PERIOD,
): Cycle[] {
  const out: Cycle[] = [];
  const n = seq.length;
  let i = 0;
  while (i < n) {
    let best: Cycle | null = null;
    for (let p = minPeriod; p <= maxPeriod && i + 2 * p <= n; p++) {
      let r = 1;
      while (i + (r + 1) * p <= n && equalSlices(seq, i, i + r * p, p)) r++;
      if (r < 2 || !isPrimitive(seq, i, p)) continue;
      if (!best || r * p > best.repeats * best.period) best = { start: i, period: p, repeats: r };
    }
    if (best) {
      out.push(best);
      i += best.period * best.repeats;
    } else {
      i++;
    }
  }
  return out;
}

/** Rotation-invariant identity of a cycle (C G Am F == Am F C G). */
export function canonicalRotation(pattern: readonly string[]): string {
  let best: string | null = null;
  for (let r = 0; r < pattern.length; r++) {
    const s = [...pattern.slice(r), ...pattern.slice(0, r)].join(' ');
    if (best === null || s < best) best = s;
  }
  return best ?? '';
}

/** Drop consecutive duplicates. */
export function collapseRuns<T>(items: readonly T[], key: (x: T) => string): T[] {
  const out: T[] = [];
  let prev: string | undefined;
  for (const x of items) {
    const k = key(x);
    if (k !== prev) out.push(x);
    prev = k;
  }
  return out;
}
