/**
 * Chord vocabulary: every `ChordQuality` with its intervals, template weights,
 * vocabulary level and display suffix.
 *
 * Weights (used by chroma template matching in `src/analysis`): root 1.0, third 0.8,
 * fifth 0.6 (perfect, diminished or augmented), seventh 0.7 (or the sixth that replaces
 * it in 6 / m6 / dim7), extensions 0.5 (9, 11, 13 and altered tones), sus tones 0.8.
 */
import type { ChordQuality, PitchClass, VocabLevel } from '@/core';

export type ToneRole = 'root' | 'third' | 'fifth' | 'seventh' | 'extension' | 'sus';

export interface ChordTemplate {
  /** Semitones above the root (0..11); index 0 is always the root. */
  intervals: number[];
  /** Template weight per interval (same length as `intervals`). */
  weights: number[];
  /** Functional role per interval (same length as `intervals`). */
  roles: ToneRole[];
  level: VocabLevel;
  /** Suffix after the root name: '' for maj, 'm', 'maj7', 'm7b5', ... (ASCII accidentals). */
  symbol: string;
}

export const TONE_WEIGHTS: Readonly<Record<ToneRole, number>> = {
  root: 1.0,
  third: 0.8,
  fifth: 0.6,
  seventh: 0.7,
  extension: 0.5,
  sus: 0.8,
};

type Tone = readonly [interval: number, role: ToneRole];

const R: Tone = [0, 'root'];
const M3: Tone = [4, 'third'];
const m3: Tone = [3, 'third'];
const P5: Tone = [7, 'fifth'];
const d5: Tone = [6, 'fifth'];
const A5: Tone = [8, 'fifth'];
const m7: Tone = [10, 'seventh'];
const M7: Tone = [11, 'seventh'];
/** Sixth standing in for the seventh (6, m6, 6/9) and dim7's bb7. */
const M6: Tone = [9, 'seventh'];
const s2: Tone = [2, 'sus'];
const s4: Tone = [5, 'sus'];
const e9: Tone = [2, 'extension'];
const e11: Tone = [5, 'extension'];
const e13: Tone = [9, 'extension'];
const b9: Tone = [1, 'extension'];
const s9: Tone = [3, 'extension'];
const s11: Tone = [6, 'extension'];
const b13: Tone = [8, 'extension'];

function tpl(level: VocabLevel, symbol: string, ...tones: Tone[]): ChordTemplate {
  return {
    level,
    symbol,
    intervals: tones.map((t) => t[0]),
    roles: tones.map((t) => t[1]),
    weights: tones.map((t) => TONE_WEIGHTS[t[1]]),
  };
}

/**
 * Intervals and weights match the stand-in `CHORD_VOCAB` in `src/analysis/templates.ts`
 * exactly, so swapping analysis over to this table does not change its templates.
 */
export const CHORD_TEMPLATES: Readonly<Record<ChordQuality, ChordTemplate>> = {
  // level 1: major, minor and diminished triads
  maj: tpl(1, '', R, M3, P5),
  min: tpl(1, 'm', R, m3, P5),
  dim: tpl(1, 'dim', R, m3, d5),
  // level 2: + the five seventh chords and sus4
  maj7: tpl(2, 'maj7', R, M3, P5, M7),
  min7: tpl(2, 'm7', R, m3, P5, m7),
  '7': tpl(2, '7', R, M3, P5, m7),
  dim7: tpl(2, 'dim7', R, m3, d5, M6),
  m7b5: tpl(2, 'm7b5', R, m3, d5, m7),
  sus4: tpl(2, 'sus4', R, s4, P5),
  // level 3: everything else
  '5': tpl(3, '5', R, P5),
  aug: tpl(3, 'aug', R, M3, A5),
  sus2: tpl(3, 'sus2', R, s2, P5),
  mMaj7: tpl(3, 'm(maj7)', R, m3, P5, M7),
  '6': tpl(3, '6', R, M3, P5, M6),
  m6: tpl(3, 'm6', R, m3, P5, M6),
  add9: tpl(3, 'add9', R, M3, P5, e9),
  madd9: tpl(3, 'm(add9)', R, m3, P5, e9),
  '9': tpl(3, '9', R, M3, P5, m7, e9),
  maj9: tpl(3, 'maj9', R, M3, P5, M7, e9),
  min9: tpl(3, 'm9', R, m3, P5, m7, e9),
  '11': tpl(3, '11', R, M3, P5, m7, e9, e11),
  min11: tpl(3, 'm11', R, m3, P5, m7, e9, e11),
  '13': tpl(3, '13', R, M3, P5, m7, e9, e13),
  maj13: tpl(3, 'maj13', R, M3, P5, M7, e9, e13),
  min13: tpl(3, 'm13', R, m3, P5, m7, e9, e13),
  '7b9': tpl(3, '7b9', R, M3, P5, m7, b9),
  '7#9': tpl(3, '7#9', R, M3, P5, m7, s9),
  '7#11': tpl(3, '7#11', R, M3, P5, m7, s11),
  '7b13': tpl(3, '7b13', R, M3, P5, m7, b13),
  // "3 b7 #9 b13" altered sound, fifth omitted
  '7alt': tpl(3, '7alt', R, M3, m7, s9, b13),
  'maj7#11': tpl(3, 'maj7#11', R, M3, P5, M7, s11),
  '6/9': tpl(3, '6/9', R, M3, P5, M6, e9),
  '7sus4': tpl(3, '7sus4', R, s4, P5, m7),
  '9sus4': tpl(3, '9sus4', R, s4, P5, m7, e9),
};

/**
 * Canonical quality order, also the "simpler first" tie-break used by `identifyChord`.
 * Spelled out because `Object.keys` would hoist integer-like keys ('5', '7', '9', ...).
 */
export const QUALITY_ORDER: readonly ChordQuality[] = [
  'maj',
  'min',
  'dim',
  'maj7',
  'min7',
  '7',
  'dim7',
  'm7b5',
  'sus4',
  '5',
  'aug',
  'sus2',
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

/** Qualities available at a vocabulary level (levels are nested: 1 ⊂ 2 ⊂ 3). */
export function qualitiesForLevel(level: VocabLevel): ChordQuality[] {
  return QUALITY_ORDER.filter((q) => CHORD_TEMPLATES[q].level <= level);
}

const MINOR_QUALITIES: ReadonlySet<ChordQuality> = new Set<ChordQuality>([
  'min',
  'min7',
  'mMaj7',
  'm6',
  'madd9',
  'min9',
  'min11',
  'min13',
  'dim',
  'dim7',
  'm7b5',
]);

const DIMINISHED_QUALITIES: ReadonlySet<ChordQuality> = new Set<ChordQuality>([
  'dim',
  'dim7',
  'm7b5',
]);

const DOMINANT_QUALITIES: ReadonlySet<ChordQuality> = new Set<ChordQuality>([
  '7',
  '9',
  '11',
  '13',
  '7b9',
  '7#9',
  '7#11',
  '7b13',
  '7alt',
  '7sus4',
  '9sus4',
]);

/** Minor-third chords (read as lower-case numerals), including dim / m7b5 / dim7. */
export function isMinorQuality(q: ChordQuality): boolean {
  return MINOR_QUALITIES.has(q);
}

export function isDiminishedQuality(q: ChordQuality): boolean {
  return DIMINISHED_QUALITIES.has(q);
}

/** Major third (or sus) with a minor seventh: chords that act as a V7. */
export function isDominantQuality(q: ChordQuality): boolean {
  return DOMINANT_QUALITIES.has(q);
}

/** Pitch classes of `quality` built on `root`, in template order (root first). */
export function templatePitchClasses(root: PitchClass, quality: ChordQuality): PitchClass[] {
  return CHORD_TEMPLATES[quality].intervals.map((i) => ((root + i) % 12) as PitchClass);
}
