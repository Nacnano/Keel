/**
 * Chord tones, chord symbols ("Cmaj7", "G/B", "F#m7b5"), spelling of chord tones,
 * chord identity helpers and a symbol parser.
 */
import type { Chord, ChordQuality, Key, PitchClass } from '@/core';
import { NOTE_NAMES_SHARP } from '@/core';
import { mod12 } from './keys';
import { pc, spell, spellAbove } from './notes';
import type { SpellOptions } from './notes';
import { CHORD_TEMPLATES, QUALITY_ORDER } from './vocab';
import type { ToneRole } from './vocab';

export interface ChordSymbolOptions extends SpellOptions {
  /** Render the slash bass ("C/E"). Default true. */
  showSlash?: boolean;
  /** Text for `null` (no chord). Default 'N.C.'. */
  noChord?: string;
}

/**
 * Pitch classes of a chord, root first, in template order. The slash bass is not included
 * (it is a chord tone for inversions). Also callable as `chordTones(root, quality)`.
 */
export function chordTones(chord: Chord): PitchClass[];
export function chordTones(root: PitchClass, quality: ChordQuality): PitchClass[];
export function chordTones(chordOrRoot: Chord | PitchClass, quality?: ChordQuality): PitchClass[] {
  const c: Chord =
    typeof chordOrRoot === 'number'
      ? { root: chordOrRoot, quality: quality ?? 'maj' }
      : chordOrRoot;
  return CHORD_TEMPLATES[c.quality].intervals.map((i) => mod12(c.root + i));
}

/** Pitch classes sounding in a chord: chord tones plus the slash bass if it is not one. */
export function chordPitchClasses(chord: Chord): PitchClass[] {
  const tones = chordTones(chord);
  if (chord.bass !== undefined && !tones.includes(chord.bass)) tones.push(chord.bass);
  return tones;
}

/** Letter steps above the root for a template tone (third = 2, fifth = 4, ...). */
function letterSteps(interval: number, role: ToneRole, quality: ChordQuality): number {
  switch (role) {
    case 'root':
      return 0;
    case 'third':
      return 2;
    case 'fifth':
      return 4;
    case 'sus':
      return interval === 2 ? 1 : 3;
    case 'seventh':
      // the 6th of 6 / m6 / 6/9 is a sixth; dim7's bb7 is a seventh
      return interval === 9 && quality !== 'dim7' ? 5 : 6;
    case 'extension':
      if (interval <= 3) return 1; // b9 9 #9
      if (interval <= 6) return 3; // 11 #11
      return 5; // b13 13
  }
}

/**
 * Note names of the chord tones (template order, root first), spelled by interval from the
 * root ("C#7" -> C# E# G# B, "Bdim7" -> B D F Ab). Double accidentals fall back to the
 * plain enharmonic. With `spellingFollowsKey: false` every tone uses sharps.
 */
export function spellChord(chord: Chord, key?: Key | null, opts: SpellOptions = {}): string[] {
  const t = CHORD_TEMPLATES[chord.quality];
  if (opts.spellingFollowsKey === false) {
    return t.intervals.map((i) => NOTE_NAMES_SHARP[mod12(chord.root + i)]);
  }
  const root = spell(chord.root, key, opts);
  return t.intervals.map((i, k) =>
    k === 0
      ? root
      : spellAbove(root, letterSteps(i, t.roles[k], chord.quality), mod12(chord.root + i)),
  );
}

/** Name of the slash bass, matching the chord-tone spelling when the bass is a chord tone. */
export function spellBass(chord: Chord, key?: Key | null, opts: SpellOptions = {}): string | null {
  if (chord.bass === undefined || chord.bass === chord.root) return null;
  const tones = chordTones(chord);
  const k = tones.indexOf(chord.bass);
  return k >= 0 ? spellChord(chord, key, opts)[k] : spell(chord.bass, key, opts);
}

/**
 * Chord symbol with ASCII accidentals: "C", "Am", "G7/B", "F#m7b5", "Bbmaj7". The root is
 * spelled for `key` (see `notes.spell`). `null` renders as `opts.noChord` ('N.C.').
 */
export function chordSymbol(
  chord: Chord | null,
  key?: Key | null,
  opts: ChordSymbolOptions = {},
): string {
  if (!chord) return opts.noChord ?? 'N.C.';
  const base = spell(chord.root, key, opts) + CHORD_TEMPLATES[chord.quality].symbol;
  if (opts.showSlash === false) return base;
  const bass = spellBass(chord, key, opts);
  return bass ? `${base}/${bass}` : base;
}

/** Spelling-independent identity ("0:maj7/4"); `null` -> 'N'. Use for dedupe and map keys. */
export function chordKey(chord: Chord | null): string {
  if (!chord) return 'N';
  const bass = chord.bass !== undefined && chord.bass !== chord.root ? `/${chord.bass}` : '';
  return `${chord.root}:${chord.quality}${bass}`;
}

/** Same root, quality and bass (a bass equal to the root counts as no bass). */
export function sameChord(a: Chord | null | undefined, b: Chord | null | undefined): boolean {
  if (!a || !b) return a === b;
  return a.root === b.root && a.quality === b.quality && (a.bass ?? a.root) === (b.bass ?? b.root);
}

/** Extra spellings accepted by `parseChord` on top of each template's own symbol. */
const SUFFIX_ALIASES: Record<string, ChordQuality> = {
  M: 'maj',
  maj: 'maj',
  min: 'min',
  '-': 'min',
  '°': 'dim',
  o: 'dim',
  '+': 'aug',
  sus: 'sus4',
  M7: 'maj7',
  Δ: 'maj7',
  Δ7: 'maj7',
  min7: 'min7',
  '-7': 'min7',
  '°7': 'dim7',
  o7: 'dim7',
  ø: 'm7b5',
  ø7: 'm7b5',
  'm7(b5)': 'm7b5',
  mMaj7: 'mMaj7',
  mmaj7: 'mMaj7',
  mM7: 'mMaj7',
  madd9: 'madd9',
  m9: 'min9',
  min9: 'min9',
  m11: 'min11',
  m13: 'min13',
  M9: 'maj9',
  M13: 'maj13',
  '69': '6/9',
  alt: '7alt',
  '7sus': '7sus4',
  '9sus': '9sus4',
};

const SUFFIXES: ReadonlyMap<string, ChordQuality> = new Map<string, ChordQuality>([
  ...QUALITY_ORDER.map((q) => [CHORD_TEMPLATES[q].symbol, q] as const),
  ...Object.entries(SUFFIX_ALIASES),
]);

/**
 * Parse a chord symbol ("C", "Am7", "F#m7b5", "Bbmaj7/D", "G7alt", "C6/9"). Returns null
 * when the root or suffix is not recognised. Unicode ♯ / ♭ are accepted.
 */
export function parseChord(symbol: string): Chord | null {
  const s = symbol.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(s);
  if (!m) return null;
  let rest = m[2];
  let bass: PitchClass | undefined;
  // slash bass: last "/X" where X is a note name (so "6/9" stays a suffix)
  const slash = /\/([A-G](?:#|b)?)$/.exec(rest);
  if (slash) {
    bass = pc(slash[1]);
    rest = rest.slice(0, slash.index);
  }
  const quality = SUFFIXES.get(rest);
  if (quality === undefined) return null;
  const root = pc(m[1]);
  const chord: Chord = { root, quality };
  if (bass !== undefined && bass !== root) chord.bass = bass;
  return chord;
}
