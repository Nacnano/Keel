import { collapseRuns, compressRepeats as compressCycles } from '@/theory';
import type { RepeatSegment } from '@/theory';

export type { RepeatSegment as Segment } from '@/theory';

/**
 * Repeat compression for the timeline: neighbours that are equal under `eq` merge first (the
 * first one is kept), so with a chord-family `eq` "Cadd9 C Cadd9 C" is one C, not "[Cadd9 C] ×2".
 */
export function compressRepeats<T>(
  xs: readonly T[],
  eq: (a: T, b: T) => boolean,
  maxCycle?: number,
): RepeatSegment<T>[] {
  return compressCycles(collapseRuns(xs, eq), eq, maxCycle);
}
