/**
 * Frame scoring.
 *
 * - Mic frames: cosine similarity of the chroma against every template in the bank,
 *   plus one `no-chord` state (a flat template, handicapped as energy rises).
 * - Exact (MIDI) frames: pitch-class-set matching, no HMM.
 */
import type { Chord, PitchClass, VocabLevel } from '@/core';
import { CHORD_VOCAB, QUALITY_ORDER, chordTones, qualitiesForLevel } from './templates';
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

export interface ExactMatch {
  chord: Chord;
  /** 1 for an exact set match, lower for partial matches. */
  score: number;
}

/** Minimum score for an exact-path match to be reported (otherwise no chord). */
export const EXACT_MIN_SCORE = 0.45;
const MISSING_PENALTY = 0.6;
const EXTRA_PENALTY = 0.8;

interface Candidate extends ExactMatch {
  bassIsRoot: boolean;
  level: number;
  tones: number;
  order: number;
}

/**
 * Rank chords for a set of sounding pitch classes (local stand-in for
 * `theory/identify.ts`). Ties prefer: bass = root, lower vocab level, fewer tones,
 * earlier quality in `QUALITY_ORDER`, lower root.
 */
export function identifyExact(
  pcs: readonly PitchClass[],
  bass: PitchClass | null,
  level: VocabLevel,
): ExactMatch[] {
  const present = new Array<boolean>(12).fill(false);
  for (const p of pcs) present[p] = true;
  const count = present.filter(Boolean).length;
  if (count === 0) return [];
  const out: Candidate[] = [];
  for (const q of qualitiesForLevel(level)) {
    const shape = CHORD_VOCAB[q];
    const size = shape.intervals.length;
    for (let root = 0; root < 12; root++) {
      let matched = 0;
      for (const iv of shape.intervals) if (present[(root + iv) % 12]) matched++;
      if (matched === 0) continue;
      const missing = size - matched;
      const extra = count - matched;
      const score =
        (matched - MISSING_PENALTY * missing - EXTRA_PENALTY * extra) / Math.max(size, count);
      if (score < EXACT_MIN_SCORE) continue;
      const r = root as PitchClass;
      const chord: Chord = { root: r, quality: q };
      if (bass !== null && bass !== r && chordTones(r, q).includes(bass)) chord.bass = bass;
      out.push({
        chord,
        score,
        bassIsRoot: bass === r,
        level: shape.level,
        tones: size,
        order: QUALITY_ORDER.indexOf(q),
      });
    }
  }
  out.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.bassIsRoot) - Number(a.bassIsRoot) ||
      a.level - b.level ||
      a.tones - b.tones ||
      a.order - b.order ||
      a.chord.root - b.chord.root,
  );
  return out.map(({ chord, score }) => ({ chord, score }));
}

/** Sounding pitch classes of an exact frame (any non-zero bin). */
export function exactPitchClasses(chroma: ArrayLike<number>): PitchClass[] {
  const pcs: PitchClass[] = [];
  for (let b = 0; b < 12; b++) if (chroma[b] > 1e-6) pcs.push(b as PitchClass);
  return pcs;
}
