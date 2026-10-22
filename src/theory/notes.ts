/**
 * Pitch classes, MIDI numbers and key-aware note spelling.
 *
 * Spelling rules (`spellingFollowsKey` true, the default):
 * - Notes in the key's scale take the key signature's letter names (Bb in F major,
 *   F# in D major, Cb in Gb major).
 * - Chromatic notes are spelled as the usual chromatic degrees of the key: b2, b3, #4, b6, b7
 *   in major (so Bb in G major for a borrowed bIII), b2, 3, #4, 6, 7 in minor (G# in A minor).
 *   If that would need a double accidental or an odd enharmonic (Cb, Fb, E#, B#), the plain
 *   name from the key's side of the circle is used instead (flats in flat keys, sharps in
 *   sharp keys).
 * - No key: neutral pop/jazz spelling (C# Eb F# Ab Bb).
 * `spellingFollowsKey: false` always uses sharps.
 */
import { NOTE_NAMES_FLAT, NOTE_NAMES_SHARP } from '@/core';
import type { Key, MidiNote, PitchClass } from '@/core';
import { MAJOR_SCALE, NATURAL_MINOR_SCALE, keySignature, mod12 } from './keys';

export { mod12 };

export interface SpellOptions {
  /** When false, always spell with sharps. Default true. */
  spellingFollowsKey?: boolean;
}

/** Spelling used when no key is known (common pop / jazz choices). */
export const NOTE_NAMES_NEUTRAL: readonly string[] = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
];

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11] as const;

/** Parse a note name ('C', 'f#', 'Bb', 'E♭', 'Cb', 'B#', 'Fx', 'Ebb') to a pitch class. */
export function pc(name: string): PitchClass {
  const m = /^\s*([A-Ga-g])((?:#|b|♯|♭|x|𝄪|𝄫)*)\s*$/u.exec(name);
  if (!m) throw new Error(`Not a note name: "${name}"`);
  const letter = LETTERS.indexOf(m[1].toUpperCase() as (typeof LETTERS)[number]);
  let acc = 0;
  for (const ch of m[2]) {
    if (ch === '#' || ch === '♯') acc += 1;
    else if (ch === 'x' || ch === '𝄪') acc += 2;
    else if (ch === '𝄫') acc -= 2;
    else acc -= 1;
  }
  return mod12(LETTER_PC[letter] + acc);
}

export function midiToPc(note: MidiNote): PitchClass {
  return mod12(note);
}

/** Scientific pitch: `pcToMidi(0, 4) === 60` (C4, middle C). */
export function pcToMidi(p: PitchClass, octave: number): MidiNote {
  return (octave + 1) * 12 + p;
}

export function transpose(p: PitchClass, semitones: number): PitchClass {
  return mod12(p + semitones);
}

/** Name for `letter` (0 = C .. 6 = B, wraps) sounding as `p`; null if it needs > 2 accidentals. */
function nameFromLetter(letter: number, p: number): string | null {
  const l = ((letter % 7) + 7) % 7;
  let acc = mod12(p - LETTER_PC[l]);
  if (acc > 6) acc -= 12;
  if (Math.abs(acc) > 2) return null;
  return LETTERS[l] + (acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc));
}

function letterIndex(name: string): number {
  return LETTERS.indexOf(name[0] as (typeof LETTERS)[number]);
}

/** Accidental count of a spelled name (+ sharps, - flats). */
function accidentals(name: string): number {
  let n = 0;
  for (const ch of name.slice(1)) n += ch === '#' ? 1 : -1;
  return n;
}

const ODD = new Set(['Cb', 'Fb', 'E#', 'B#']);

/** Plain name on the key's side of the circle of fifths. */
function plainName(p: PitchClass, key: Key): string {
  const sig = keySignature(key);
  if (sig < 0) return NOTE_NAMES_FLAT[p];
  if (sig > 0) return NOTE_NAMES_SHARP[p];
  return NOTE_NAMES_NEUTRAL[p];
}

const MAJOR_TONIC_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_TONIC_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/** Tonic name of the key ('Db' major, 'C#' minor), consistent with `keySignature`. */
export function tonicName(key: Key): string {
  return (key.mode === 'major' ? MAJOR_TONIC_NAMES : MINOR_TONIC_NAMES)[key.tonic];
}

/** Chromatic degree (semitones above tonic) -> letter steps above the tonic letter. */
const CHROMATIC_STEPS: Record<Key['mode'], Partial<Record<number, number>>> = {
  // b2 b3 #4 b6 b7
  major: { 1: 1, 3: 2, 6: 3, 8: 5, 10: 6 },
  // b2 3 #4 6 7
  minor: { 1: 1, 4: 2, 6: 3, 9: 5, 11: 6 },
};

/** Spell a pitch class in the context of a key (see module doc for the rules). */
export function spell(p: PitchClass, key?: Key | null, opts: SpellOptions = {}): string {
  if (opts.spellingFollowsKey === false) return NOTE_NAMES_SHARP[p];
  if (!key) return NOTE_NAMES_NEUTRAL[p];
  const tonicLetter = letterIndex(tonicName(key));
  const deg = mod12(p - key.tonic);
  const scale = key.mode === 'major' ? MAJOR_SCALE : NATURAL_MINOR_SCALE;
  const d = scale.indexOf(deg);
  if (d >= 0) return nameFromLetter(tonicLetter + d, p) ?? plainName(p, key);
  const steps = CHROMATIC_STEPS[key.mode][deg];
  const name = steps === undefined ? null : nameFromLetter(tonicLetter + steps, p);
  if (!name || Math.abs(accidentals(name)) > 1 || ODD.has(name)) return plainName(p, key);
  return name;
}

/** `C major`, `Eb major`, `C# minor`. */
export function keyName(key: Key, opts: SpellOptions = {}): string {
  return `${spell(key.tonic, key, opts)} ${key.mode}`;
}

/**
 * Spell `p` as the note `steps` letters above a spelled note (`'Db'`, 2 -> `'F'`), falling
 * back to a plain enharmonic on the reference's side when a double accidental would result.
 */
export function spellAbove(reference: string, steps: number, p: PitchClass): string {
  const name = nameFromLetter(letterIndex(reference) + steps, p);
  if (name && Math.abs(accidentals(name)) <= 1) return name;
  return reference.includes('b') ? NOTE_NAMES_FLAT[p] : NOTE_NAMES_SHARP[p];
}

/** `midiName(60) === 'C4'`, `midiName(61, Db major) === 'Db4'`; octave follows the letter. */
export function midiName(note: MidiNote, key?: Key | null, opts: SpellOptions = {}): string {
  const name = spell(midiToPc(note), key, opts);
  const natural = note - accidentals(name);
  return `${name}${Math.floor(natural / 12) - 1}`;
}

/** Display-only: ASCII accidentals to ♭ / ♯ ("Bbm7b5" -> "B♭m7♭5", "bVII" -> "♭VII"). */
export function prettyAccidentals(s: string): string {
  return s
    .replace(/#/g, '♯')
    .replace(/([A-G])b/g, '$1♭')
    .replace(/b(?=[0-9IViv♭])/g, '♭');
}
