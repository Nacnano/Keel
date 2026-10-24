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

/**
 * Frames with `energy` below this, or with an all-zero chroma, are silence. 0: silence is
 * decided by the audio gate (zero chroma), so quiet but audible input is still analysed
 * (`energy` is a −60…0 dBFS meter value and reads 0 below −60 dBFS).
 */
export const SILENCE_ENERGY = 0;
/** The no-chord similarity is the cosine with a flat chroma times this (level-independent). */
export const NO_CHORD_SCALE = 0.8;

const INV_SQRT12 = 1 / Math.sqrt(12);
const work = new Float64Array(12);

/**
 * Evidence rules applied on top of the cosine (similarity units, subtracted). Tuned with the
 * piano evaluation harness (eval/, docs/ACCURACY.md):
 * - a seventh / sixth / extension must reach `extRatio` of the mean core-tone level, else up to
 *   `extPenalty` (so a triad with a little partial leakage is not called a 7th or add9);
 * - power and sus chords lose up to `noThirdPenalty` when a third sounds at `thirdRatio` of the
 *   root, and power chords pay `powerPrior` (rare on a piano: a decaying triad with a doubled
 *   root otherwise reads as C5);
 * - dim / aug lose up to `alteredPenalty` when the perfect fifth sounds at `fifthRatio` of root;
 * - dominant templates (major third + minor seventh) gain `domBonus` when the ♭7 sounds at
 *   `domRatio` of the mean core-tone level and the major third is at least as loud as the minor
 *   third, so a clear C7 is not read as C (or C6 / Am7). In a major key the third condition is
 *   dropped for I7, IV7 and V7 (a minor third over their ♭7 is a blue note), and on the tonic the
 *   blue third counts towards the dominant's third (`blueThird` × how much louder it is than
 *   the major third), so C–E♭–G–B♭ in a C blues is C7, not Cm7;
 * - with a (stable) bass: +`bassRoot` for templates rooted on it, +`bassTone` for templates
 *   containing it (inversions), −`bassForeign` for templates that do not contain it, and the
 *   bass bin is raised to `bassFloor` × the loudest bin before the cosine (a left-hand root
 *   under a rootless right-hand voicing is quiet in the chroma but decides Cm7 vs E♭maj7).
 */
export const EVIDENCE = {
  extRatio: 0.35,
  extPenalty: 0.15,
  thirdRatio: 0.25,
  noThirdPenalty: 0.2,
  powerPrior: 0.02,
  fifthRatio: 0.3,
  alteredPenalty: 0.06,
  bassRoot: 0.04,
  bassTone: 0.01,
  bassForeign: 0.04,
  bassFloor: 0.8,
  domRatio: 0.6,
  domBonus: 0.03,
  blueThird: 0.12,
} as const;

export interface ScoreOptions {
  /**
   * Tonic of the current key when it is major: over a sounding ♭7, a minor third on I, IV or V
   * is a blue note, so those dominants keep their bonus without the major-third-louder condition.
   */
  majorTonic?: PitchClass | null;
}

/**
 * Fill `out` (length `bank.size + 1`) with similarities; index `bank.size` is no-chord.
 * Returns true when the frame was considered silent.
 */
export function scoreChroma(
  chroma: ArrayLike<number>,
  energy: number,
  bank: TemplateBank,
  out: Float32Array,
  bass: PitchClass | null = null,
  opts: ScoreOptions = {},
): boolean {
  const n = bank.size;
  let sum = 0;
  let sq = 0;
  let max = 0;
  for (let b = 0; b < 12; b++) {
    sum += chroma[b];
    sq += chroma[b] * chroma[b];
    if (chroma[b] > max) max = chroma[b];
  }
  if (sum <= 0 || sq <= 0 || energy < SILENCE_ENERGY) {
    out.fill(0, 0, n);
    out[n] = 1;
    return true;
  }
  if (bass !== null && chroma[bass] < EVIDENCE.bassFloor * max) {
    for (let b = 0; b < 12; b++) work[b] = chroma[b];
    const lift = EVIDENCE.bassFloor * max - chroma[bass];
    work[bass] += lift;
    sum += lift;
    sq = 0;
    for (let b = 0; b < 12; b++) sq += work[b] * work[b];
    chroma = work;
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
  applyEvidence(chroma, bank, out, bass, opts.majorTonic ?? null, inv);
  const flat = sum * inv * INV_SQRT12;
  out[n] = flat * NO_CHORD_SCALE;
  return false;
}

function applyEvidence(
  c: ArrayLike<number>,
  bank: TemplateBank,
  out: Float32Array,
  bass: PitchClass | null,
  majorTonic: PitchClass | null,
  inv: number,
) {
  const E = EVIDENCE;
  const { ext, core, kind, alteredFifth, dominant, roots, size } = bank;
  const tiny = 1e-9;
  for (let k = 0; k < size; k++) {
    const r = roots[k];
    const root = c[r] + tiny;
    let pen = 0;
    const e0 = ext[k * 3];
    if (e0 >= 0) {
      let coreSum = 0;
      let coreN = 0;
      for (let i = 0; i < 3; i++) {
        const pc = core[k * 3 + i];
        if (pc >= 0) {
          coreSum += c[pc];
          coreN++;
        }
      }
      const ref = coreSum / Math.max(1, coreN) + tiny;
      for (let i = 0; i < 3; i++) {
        const pc = ext[k * 3 + i];
        if (pc < 0) break;
        const ratio = c[pc] / ref;
        if (ratio < E.extRatio) pen += E.extPenalty * (1 - ratio / E.extRatio);
      }
      if (dominant[k] && c[(r + 10) % 12] / ref >= E.domRatio) {
        const major3 = c[(r + 4) % 12];
        const minor3 = c[(r + 3) % 12];
        const degree = majorTonic === null ? -1 : (r - majorTonic + 12) % 12;
        if (degree === 0 || degree === 5 || degree === 7) {
          // I7, IV7, V7 of a major key: a minor third over the ♭7 is a blue note, and on the
          // tonic it stands in for the major third the template expects
          pen -= E.domBonus;
          if (degree === 0 && minor3 > major3) pen -= E.blueThird * (minor3 - major3) * inv;
        } else if (major3 >= minor3) pen -= E.domBonus;
      }
    }
    if (kind[k] !== 0) {
      const third = Math.max(c[(r + 3) % 12], c[(r + 4) % 12]) / root;
      pen += E.noThirdPenalty * Math.min(1, third / E.thirdRatio);
      if (kind[k] === 1) pen += E.powerPrior;
    }
    if (alteredFifth[k]) {
      pen += E.alteredPenalty * Math.min(1, c[(r + 7) % 12] / root / E.fifthRatio);
    }
    if (bass !== null) {
      if (bass === r) pen -= E.bassRoot;
      else if (bank.data[k * 12 + bass] > 0.3) pen -= E.bassTone;
      else pen += E.bassForeign;
    }
    out[k] -= pen;
  }
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
