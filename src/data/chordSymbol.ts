/**
 * Minimal local chord / key naming for text export and progression keys.
 * TODO(integration): use @/theory/chordName (and theory spelling) once WS-A lands.
 */
import { NOTE_NAMES_FLAT, NOTE_NAMES_SHARP } from '@/core/constants';
import type { Chord, ChordQuality, Key, PitchClass } from '@/core/types';

const QUALITY_SUFFIX: Record<ChordQuality, string> = {
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

/** Major tonics spelled with flats (F, Bb, Eb, Ab, Db, Gb). */
const FLAT_MAJOR_TONICS = new Set<number>([5, 10, 3, 8, 1, 6]);

/** True when the key signature uses flats (relative-major based). */
export function keyPrefersFlats(key: Key | null | undefined): boolean {
  if (!key) return false;
  const major = key.mode === 'major' ? key.tonic : (key.tonic + 3) % 12;
  return FLAT_MAJOR_TONICS.has(major);
}

export function noteName(pc: PitchClass | number, flats = false): string {
  const i = ((pc % 12) + 12) % 12;
  return (flats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[i];
}

/** `C`, `Am`, `G7`, `Cmaj7/E`. `null` (no chord) renders as `N.C.`. */
export function chordSymbol(chord: Chord | null, flats = false): string {
  if (!chord) return 'N.C.';
  const base = noteName(chord.root, flats) + QUALITY_SUFFIX[chord.quality];
  return chord.bass !== undefined && chord.bass !== chord.root
    ? `${base}/${noteName(chord.bass, flats)}`
    : base;
}

/** Spelling-independent identity of a chord (used for dedupe and cycle keys). */
export function chordKey(chord: Chord | null): string {
  if (!chord) return 'N';
  const bass = chord.bass !== undefined && chord.bass !== chord.root ? `/${chord.bass}` : '';
  return `${chord.root}:${chord.quality}${bass}`;
}

/** `C major`, `A minor`, `Eb major`. */
export function keyName(key: Key): string {
  return `${noteName(key.tonic, keyPrefersFlats(key))} ${key.mode}`;
}
