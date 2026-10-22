/**
 * Frame scoring.
 *
 * - Mic frames: cosine similarity of the chroma against every template in the bank,
 *   plus one `no-chord` state (a flat template, handicapped as energy rises).
 * - Exact (MIDI) frames: pitch-class-set matching, no HMM.
 */
import type { PitchClass, VocabLevel } from '@/core';
import { MIN_IDENTIFY_SCORE, identifyChord } from '@/theory';
import type { ChordCandidate } from '@/theory';
import type { TemplateBank } from './templates';

/** Below this energy (or with an all-zero chroma) the frame is treated as silence. */
export const SILENCE_ENERGY = 0.01;
/** Max handicap applied to the no-chord similarity at full energy. */
export const NO_CHORD_ENERGY_PENALTY = 0.25;

const INV_SQRT12 = 1 / Math.sqrt(12);

/**
 * Fill `out` (length `bank.size + 1`) with similarities; index `bank.size` is no-chord.
 * Returns true when the frame was considered silent.
 */
export function scoreChroma(
  chroma: ArrayLike<number>,
  energy: number,
  bank: TemplateBank,
  out: Float32Array,
): boolean {
  const n = bank.size;
  let sum = 0;
  let sq = 0;
  for (let b = 0; b < 12; b++) {
    sum += chroma[b];
    sq += chroma[b] * chroma[b];
  }
  if (sum <= 0 || sq <= 0 || energy < SILENCE_ENERGY) {
    out.fill(0, 0, n);
    out[n] = 1;
    return true;
  }
  const inv = 1 / Math.sqrt(sq);
  const c0 = chroma[0] * inv;
  const c1 = chroma[1] * inv;
  const c2 = chroma[2] * inv;
  const c3 = chroma[3] * inv;
  const c4 = chroma[4] * inv;
  const c5 = chroma[5] * inv;
  const c6 = chroma[6] * inv;
  const c7 = chroma[7] * inv;
  const c8 = chroma[8] * inv;
  const c9 = chroma[9] * inv;
  const c10 = chroma[10] * inv;
  const c11 = chroma[11] * inv;
  const d = bank.data;
  for (let k = 0, r = 0; k < n; k++, r += 12) {
    out[k] =
      c0 * d[r] +
      c1 * d[r + 1] +
      c2 * d[r + 2] +
      c3 * d[r + 3] +
      c4 * d[r + 4] +
      c5 * d[r + 5] +
      c6 * d[r + 6] +
      c7 * d[r + 7] +
      c8 * d[r + 8] +
      c9 * d[r + 9] +
      c10 * d[r + 10] +
      c11 * d[r + 11];
  }
  const flat = sum * inv * INV_SQRT12;
  out[n] = flat * (1 - NO_CHORD_ENERGY_PENALTY * Math.min(1, Math.max(0, energy)));
  return false;
}

export type ExactMatch = ChordCandidate;

/** Minimum score for an exact-path match to be reported (otherwise no chord). */
export const EXACT_MIN_SCORE = MIN_IDENTIFY_SCORE;

/**
 * Rank chords for a set of sounding pitch classes: `identifyChord` from `@/theory`
 * (exact set matching, role-weighted missing-tone penalty, dyad rule, slash bass).
 */
export function identifyExact(
  pcs: readonly PitchClass[],
  bass: PitchClass | null,
  level: VocabLevel,
): ExactMatch[] {
  return identifyChord(pcs, bass, level);
}

/** Sounding pitch classes of an exact frame (any non-zero bin). */
export function exactPitchClasses(chroma: ArrayLike<number>): PitchClass[] {
  const pcs: PitchClass[] = [];
  for (let b = 0; b < 12; b++) if (chroma[b] > 1e-6) pcs.push(b as PitchClass);
  return pcs;
}
