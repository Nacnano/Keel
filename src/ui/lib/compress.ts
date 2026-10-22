// TODO(integration): replace with @/theory timeline.compressTimeline.

export interface Segment<T> {
  /** One cycle of the repeated pattern, or a run of non-repeating items when repeat = 1. */
  items: T[];
  repeat: number;
  /** Index of the first item of this segment in the input array. */
  start: number;
}

function cycleRepeats<T>(
  xs: readonly T[],
  a: number,
  b: number,
  len: number,
  eq: (x: T, y: T) => boolean,
): boolean {
  for (let k = 0; k < len; k++) if (!eq(xs[a + k], xs[b + k])) return false;
  return true;
}

/**
 * Greedy repeat compression: at each position pick the cycle (length 1..maxCycle) that
 * covers the most items with at least two repeats. `G D Em C G D Em C` -> `[G D Em C] x2`.
 */
export function compressRepeats<T>(
  xs: readonly T[],
  eq: (x: T, y: T) => boolean,
  maxCycle = 8,
): Segment<T>[] {
  const out: Segment<T>[] = [];
  let looseStart = -1;
  const flush = (end: number) => {
    if (looseStart >= 0) {
      out.push({ items: xs.slice(looseStart, end), repeat: 1, start: looseStart });
    }
    looseStart = -1;
  };
  let i = 0;
  while (i < xs.length) {
    let bestLen = 0;
    let bestRep = 1;
    for (let len = 1; len <= maxCycle && i + 2 * len <= xs.length; len++) {
      let rep = 1;
      while (i + (rep + 1) * len <= xs.length && cycleRepeats(xs, i, i + rep * len, len, eq)) {
        rep++;
      }
      if (rep >= 2 && len * rep > bestLen * bestRep) {
        bestLen = len;
        bestRep = rep;
      }
    }
    if (bestLen > 0) {
      flush(i);
      out.push({ items: xs.slice(i, i + bestLen), repeat: bestRep, start: i });
      i += bestLen * bestRep;
    } else {
      if (looseStart < 0) looseStart = i;
      i++;
    }
  }
  flush(xs.length);
  return out;
}
