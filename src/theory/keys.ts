/**
 * Keys: key profiles, scales, relative / parallel keys, key signatures, diatonic chords.
 */
import type { Chord, ChordQuality, Key, PitchClass, VocabLevel } from '@/core';
import { CHORD_TEMPLATES } from './vocab';

/** Krumhansl-Kessler probe-tone profiles, index 0 = tonic. */
export const KRUMHANSL_MAJOR: readonly number[] = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
export const KRUMHANSL_MINOR: readonly number[] = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

/** Temperley (1999) key profiles, index 0 = tonic. */
export const TEMPERLEY_MAJOR: readonly number[] = [
  5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0,
];
export const TEMPERLEY_MINOR: readonly number[] = [
  5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0,
];

/** Semitones above the tonic. */
export const MAJOR_SCALE: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
export const NATURAL_MINOR_SCALE: readonly number[] = [0, 2, 3, 5, 7, 8, 10];
export const HARMONIC_MINOR_SCALE: readonly number[] = [0, 2, 3, 5, 7, 8, 11];
export const MELODIC_MINOR_SCALE: readonly number[] = [0, 2, 3, 5, 7, 9, 11];

export type MinorVariant = 'natural' | 'harmonic' | 'melodic';

/** All 24 keys: C major, C minor, C# / Db major, ... B minor. */
export const ALL_KEYS: readonly Key[] = Array.from({ length: 24 }, (_, i) => ({
  tonic: (i >> 1) as PitchClass,
  mode: i % 2 === 0 ? ('major' as const) : ('minor' as const),
}));

export function mod12(n: number): PitchClass {
  return (((n % 12) + 12) % 12) as PitchClass;
}

export function sameKey(a: Key | null | undefined, b: Key | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.tonic === b.tonic && a.mode === b.mode;
}

/** Scale intervals (semitones above the tonic) for a key. Minor defaults to natural minor. */
export function scaleIntervals(key: Key, variant: MinorVariant = 'natural'): readonly number[] {
  if (key.mode === 'major') return MAJOR_SCALE;
  if (variant === 'harmonic') return HARMONIC_MINOR_SCALE;
  if (variant === 'melodic') return MELODIC_MINOR_SCALE;
  return NATURAL_MINOR_SCALE;
}

/** The seven pitch classes of the key, tonic first. Minor defaults to natural minor. */
export function scaleOf(key: Key, variant: MinorVariant = 'natural'): PitchClass[] {
  return scaleIntervals(key, variant).map((i) => mod12(key.tonic + i));
}

/** C major <-> A minor. */
export function relativeKey(key: Key): Key {
  return key.mode === 'major'
    ? { tonic: mod12(key.tonic + 9), mode: 'minor' }
    : { tonic: mod12(key.tonic + 3), mode: 'major' };
}

/** C major <-> C minor. */
export function parallelKey(key: Key): Key {
  return { tonic: key.tonic, mode: key.mode === 'major' ? 'minor' : 'major' };
}

/**
 * Number of sharps (> 0) or flats (< 0) in the key signature. Enharmonic choices follow
 * common practice and the UI: Db, Gb (not C#, F#) major; C#, F#, G# (not Db, Gb, Ab) minor;
 * Eb (not D#) minor.
 */
const MAJOR_SIGNATURE: readonly number[] = [0, -5, 2, -3, 4, -1, -6, 1, -4, 3, -2, 5];

export function keySignature(key: Key): number {
  const major = key.mode === 'major' ? key.tonic : mod12(key.tonic + 3);
  return MAJOR_SIGNATURE[major];
}

/** True for flat key signatures (F, Bb, ... Gb major and their relative minors). */
export function keyPrefersFlats(key: Key | null | undefined): boolean {
  return !!key && keySignature(key) < 0;
}

/** True when every chord tone (and the slash bass) is in the key's scale. */
export function isDiatonic(chord: Chord, key: Key, variant: MinorVariant = 'natural'): boolean {
  const scale = new Set<number>(scaleOf(key, variant));
  const tones = CHORD_TEMPLATES[chord.quality].intervals.map((i) => mod12(chord.root + i));
  if (chord.bass !== undefined) tones.push(chord.bass);
  return tones.every((t) => scale.has(t));
}

const TRIADS: Record<string, ChordQuality> = {
  '4,7': 'maj',
  '3,7': 'min',
  '3,6': 'dim',
  '4,8': 'aug',
};
const SEVENTHS: Record<string, ChordQuality> = {
  '4,7,11': 'maj7',
  '3,7,10': 'min7',
  '4,7,10': '7',
  '3,6,10': 'm7b5',
  '3,6,9': 'dim7',
  '3,7,11': 'mMaj7',
};

/**
 * The seven chords built by stacking thirds on each scale degree (tonic first).
 * Level 1 returns triads; levels 2 and 3 return seventh chords. Harmonic minor's
 * III+(maj7) has no vocabulary entry and falls back to the augmented triad.
 */
export function diatonicChords(
  key: Key,
  level: VocabLevel,
  variant: MinorVariant = 'natural',
): Chord[] {
  const iv = scaleIntervals(key, variant);
  return iv.map((_, d) => {
    const at = (k: number) => mod12(iv[(d + k) % 7] - iv[d]);
    const third = at(2);
    const fifth = at(4);
    const seventh = at(6);
    const triad = TRIADS[`${third},${fifth}`];
    const quality = level >= 2 ? (SEVENTHS[`${third},${fifth},${seventh}`] ?? triad) : triad;
    return { root: mod12(key.tonic + iv[d]), quality };
  });
}
