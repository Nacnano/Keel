/**
 * Chord vocabulary and 12 x N chroma templates for template matching.
 *
 * Template = weighted chord tones (root 1.0, third 0.8, fifth 0.6, seventh/sixth 0.7,
 * extensions 0.5, sus tones 0.8) plus a small harmonic smear (each chord tone leaks
 * 0.1 x its weight into the pitch class a fifth above, i.e. the 3rd partial), then
 * normalised to unit L2 so a dot product with a unit-L2 chroma is a cosine similarity.
 */
import type { Chord, ChordQuality, PitchClass, VocabLevel } from '@/core';

export interface ChordShape {
  /** Semitones above the root; index 0 is always the root (0). */
  intervals: number[];
  /** Template weight per interval (same length as `intervals`). */
  weights: number[];
  level: VocabLevel;
}

const R = 1.0; // root
const T = 0.8; // third
const F = 0.6; // fifth (perfect, diminished or augmented)
const S = 0.7; // seventh, or the sixth that replaces it in 6 / m6 chords
const X = 0.5; // extension (9, 11, 13, altered tones)
const U = 0.8; // sus tone (2 or 4 replacing the third)

function shape(level: VocabLevel, ...tones: Array<[number, number]>): ChordShape {
  return { level, intervals: tones.map((t) => t[0]), weights: tones.map((t) => t[1]) };
}

// TODO(integration): replace with import from '@/theory/vocab' once feat/theory merges
export const CHORD_VOCAB: Record<ChordQuality, ChordShape> = {
  // level 1
  '5': shape(1, [0, R], [7, F]),
  maj: shape(1, [0, R], [4, T], [7, F]),
  min: shape(1, [0, R], [3, T], [7, F]),
  dim: shape(1, [0, R], [3, T], [6, F]),
  aug: shape(1, [0, R], [4, T], [8, F]),
  sus2: shape(1, [0, R], [2, U], [7, F]),
  sus4: shape(1, [0, R], [5, U], [7, F]),
  // level 2
  maj7: shape(2, [0, R], [4, T], [7, F], [11, S]),
  min7: shape(2, [0, R], [3, T], [7, F], [10, S]),
  '7': shape(2, [0, R], [4, T], [7, F], [10, S]),
  dim7: shape(2, [0, R], [3, T], [6, F], [9, S]),
  m7b5: shape(2, [0, R], [3, T], [6, F], [10, S]),
  mMaj7: shape(2, [0, R], [3, T], [7, F], [11, S]),
  '6': shape(2, [0, R], [4, T], [7, F], [9, S]),
  m6: shape(2, [0, R], [3, T], [7, F], [9, S]),
  add9: shape(2, [0, R], [4, T], [7, F], [2, X]),
  madd9: shape(2, [0, R], [3, T], [7, F], [2, X]),
  // level 3
  '9': shape(3, [0, R], [4, T], [7, F], [10, S], [2, X]),
  maj9: shape(3, [0, R], [4, T], [7, F], [11, S], [2, X]),
  min9: shape(3, [0, R], [3, T], [7, F], [10, S], [2, X]),
  '11': shape(3, [0, R], [4, T], [7, F], [10, S], [2, X], [5, X]),
  min11: shape(3, [0, R], [3, T], [7, F], [10, S], [2, X], [5, X]),
  '13': shape(3, [0, R], [4, T], [7, F], [10, S], [2, X], [9, X]),
  maj13: shape(3, [0, R], [4, T], [7, F], [11, S], [2, X], [9, X]),
  min13: shape(3, [0, R], [3, T], [7, F], [10, S], [2, X], [9, X]),
  '7b9': shape(3, [0, R], [4, T], [7, F], [10, S], [1, X]),
  '7#9': shape(3, [0, R], [4, T], [7, F], [10, S], [3, X]),
  '7#11': shape(3, [0, R], [4, T], [7, F], [10, S], [6, X]),
  '7b13': shape(3, [0, R], [4, T], [7, F], [10, S], [8, X]),
  // "3 b7 #9 b13" altered voicing, fifth omitted
  '7alt': shape(3, [0, R], [4, T], [10, S], [3, X], [8, X]),
  'maj7#11': shape(3, [0, R], [4, T], [7, F], [11, S], [6, X]),
  '6/9': shape(3, [0, R], [4, T], [7, F], [9, S], [2, X]),
  '7sus4': shape(3, [0, R], [5, U], [7, F], [10, S]),
  '9sus4': shape(3, [0, R], [5, U], [7, F], [10, S], [2, X]),
};

/**
 * Canonical quality order: also the tie-break preference (earlier = simpler).
 * Spelled out because `Object.keys` would hoist integer-like keys ('5', '7', '9', ...).
 */
export const QUALITY_ORDER: readonly ChordQuality[] = [
  '5',
  'maj',
  'min',
  'dim',
  'aug',
  'sus2',
  'sus4',
  'maj7',
  'min7',
  '7',
  'dim7',
  'm7b5',
  'mMaj7',
  '6',
  'm6',
  'add9',
  'madd9',
  '9',
  'maj9',
  'min9',
  '11',
  'min11',
  '13',
  'maj13',
  'min13',
  '7b9',
  '7#9',
  '7#11',
  '7b13',
  '7alt',
  'maj7#11',
  '6/9',
  '7sus4',
  '9sus4',
];

export function qualitiesForLevel(level: VocabLevel): ChordQuality[] {
  return QUALITY_ORDER.filter((q) => CHORD_VOCAB[q].level <= level);
}

/** Pitch classes of a chord (root first), ignoring any slash bass. */
export function chordTones(root: PitchClass, quality: ChordQuality): PitchClass[] {
  return CHORD_VOCAB[quality].intervals.map((i) => ((root + i) % 12) as PitchClass);
}

export function sameChord(a: Chord | null, b: Chord | null): boolean {
  if (a === null || b === null) return a === b;
  return a.root === b.root && a.quality === b.quality && a.bass === b.bass;
}

/** Fraction of each chord tone's weight smeared onto the pitch class a fifth above. */
export const HARMONIC_SMEAR = 0.1;

export interface TemplateBank {
  level: VocabLevel;
  /** Number of chord templates (12 roots x qualities). The no-chord state is not included. */
  size: number;
  roots: Uint8Array;
  qualities: ChordQuality[];
  /** Row-major `size x 12`, each row unit L2. */
  data: Float32Array;
}

export function buildTemplates(level: VocabLevel): TemplateBank {
  const qs = qualitiesForLevel(level);
  const size = qs.length * 12;
  const roots = new Uint8Array(size);
  const qualities = new Array<ChordQuality>(size);
  const data = new Float32Array(size * 12);
  let k = 0;
  for (const q of qs) {
    const { intervals, weights } = CHORD_VOCAB[q];
    for (let root = 0; root < 12; root++) {
      const row = k * 12;
      for (let i = 0; i < intervals.length; i++) {
        const pc = (root + intervals[i]) % 12;
        data[row + pc] += weights[i];
        data[row + ((pc + 7) % 12)] += HARMONIC_SMEAR * weights[i];
      }
      let norm = 0;
      for (let b = 0; b < 12; b++) norm += data[row + b] * data[row + b];
      norm = Math.sqrt(norm);
      for (let b = 0; b < 12; b++) data[row + b] /= norm;
      roots[k] = root;
      qualities[k] = q;
      k++;
    }
  }
  return { level, size, roots, qualities, data };
}
