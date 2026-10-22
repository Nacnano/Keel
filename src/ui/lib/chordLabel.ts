// TODO(integration): replace with @/theory (notes.spell, chordName.chordSymbol, chordName.chordTones).
// Thin local stand-in so the jam screen can render before WS-A lands.
import { NOTE_NAMES_SHARP } from '@/core';
import type { Chord, ChordQuality, Key, PitchClass } from '@/core';

/** Neutral spelling used when no key is known (common pop/jazz choices). */
const NEUTRAL = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

const FLAT_MAJOR_TONICS = new Set<number>([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb
const FLAT_MINOR_TONICS = new Set<number>([2, 7, 0, 5, 10, 3]); // D G C F Bb Eb
const NEUTRAL_KEYS = new Set(['0:major', '9:minor']); // C major / A minor

export interface SpellOptions {
  key?: Key | null;
  /** When false, always spell with sharps. Default true. */
  spellingFollowsKey?: boolean;
}

export function noteName(pc: PitchClass, opts: SpellOptions = {}): string {
  const { key, spellingFollowsKey = true } = opts;
  if (!spellingFollowsKey) return NOTE_NAMES_SHARP[pc];
  if (!key || NEUTRAL_KEYS.has(`${key.tonic}:${key.mode}`)) return NEUTRAL[pc];
  const flats =
    key.mode === 'major' ? FLAT_MAJOR_TONICS.has(key.tonic) : FLAT_MINOR_TONICS.has(key.tonic);
  return flats ? FLATS[pc] : NOTE_NAMES_SHARP[pc];
}

export const QUALITY_SUFFIX: Record<ChordQuality, string> = {
  '5': '5',
  maj: '',
  min: 'm',
  dim: 'dim',
  aug: 'aug',
  sus2: 'sus2',
  sus4: 'sus4',
  maj7: 'maj7',
  min7: 'm7',
  '7': '7',
  dim7: 'dim7',
  m7b5: 'm7b5',
  mMaj7: 'm(maj7)',
  '6': '6',
  m6: 'm6',
  add9: 'add9',
  madd9: 'm(add9)',
  '9': '9',
  maj9: 'maj9',
  min9: 'm9',
  '11': '11',
  min11: 'm11',
  '13': '13',
  maj13: 'maj13',
  min13: 'm13',
  '7b9': '7b9',
  '7#9': '7#9',
  '7#11': '7#11',
  '7b13': '7b13',
  '7alt': '7alt',
  'maj7#11': 'maj7#11',
  '6/9': '6/9',
  '7sus4': '7sus4',
  '9sus4': '9sus4',
};

/** Semitone intervals above the root. */
const INTERVALS: Record<ChordQuality, number[]> = {
  '5': [0, 7],
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  '7': [0, 4, 7, 10],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  mMaj7: [0, 3, 7, 11],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 2],
  madd9: [0, 3, 7, 2],
  '9': [0, 4, 7, 10, 2],
  maj9: [0, 4, 7, 11, 2],
  min9: [0, 3, 7, 10, 2],
  '11': [0, 7, 10, 2, 5],
  min11: [0, 3, 7, 10, 2, 5],
  '13': [0, 4, 7, 10, 2, 9],
  maj13: [0, 4, 7, 11, 2, 9],
  min13: [0, 3, 7, 10, 2, 9],
  '7b9': [0, 4, 7, 10, 1],
  '7#9': [0, 4, 7, 10, 3],
  '7#11': [0, 4, 7, 10, 6],
  '7b13': [0, 4, 7, 10, 8],
  '7alt': [0, 4, 10, 1, 3, 8],
  'maj7#11': [0, 4, 7, 11, 6],
  '6/9': [0, 4, 7, 9, 2],
  '7sus4': [0, 5, 7, 10],
  '9sus4': [0, 5, 7, 10, 2],
};

export interface ChordLabelOptions extends SpellOptions {
  showSlash?: boolean;
}

/** "Cmaj7", "G/B", "F#m7b5" (ASCII accidentals; use `pretty()` for display). */
export function chordSymbol(chord: Chord, opts: ChordLabelOptions = {}): string {
  const { showSlash = true } = opts;
  const base = noteName(chord.root, opts) + QUALITY_SUFFIX[chord.quality];
  if (showSlash && chord.bass !== undefined && chord.bass !== chord.root) {
    return `${base}/${noteName(chord.bass, opts)}`;
  }
  return base;
}

export function chordTones(chord: Chord): PitchClass[] {
  const iv = INTERVALS[chord.quality] ?? INTERVALS.maj;
  return iv.map((i) => ((chord.root + i) % 12) as PitchClass);
}

export function sameChord(a: Chord | null | undefined, b: Chord | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.root === b.root && a.quality === b.quality && (a.bass ?? a.root) === (b.bass ?? b.root);
}

export function sameKey(a: { tonic: number; mode: string }, b: { tonic: number; mode: string }) {
  return a.tonic === b.tonic && a.mode === b.mode;
}

export function keyLabel(key: Key, opts: SpellOptions = {}): string {
  return `${noteName(key.tonic, { ...opts, key })} ${key.mode}`;
}

/** Display-only: ASCII accidentals to ♭ / ♯ ("Bbm7b5" -> "B♭m7♭5", "bVII" -> "♭VII"). */
export function pretty(s: string): string {
  return s
    .replace(/#/g, '♯')
    .replace(/([A-G])b/g, '$1♭')
    .replace(/b(?=[0-9IViv])/g, '♭');
}
