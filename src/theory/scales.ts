/**
 * Scale helper: which scales / modes fit a chord, ranked for the current key.
 */
import type { Chord, ChordQuality, Key, PitchClass } from '@/core';
import { chordTones } from './chordName';
import { HARMONIC_MINOR_SCALE, MAJOR_SCALE, MELODIC_MINOR_SCALE, mod12, scaleOf } from './keys';
import { keyName, spell, spellAbove } from './notes';
import type { SpellOptions } from './notes';
import { romanNumeral } from './numerals';
import { isDominantQuality } from './vocab';

export type ScaleId =
  | 'ionian'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'aeolian'
  | 'locrian'
  | 'melodicMinor'
  | 'dorianB2'
  | 'lydianAugmented'
  | 'lydianDominant'
  | 'mixolydianB6'
  | 'locrianNat2'
  | 'altered'
  | 'harmonicMinor'
  | 'phrygianDominant'
  | 'majorPentatonic'
  | 'minorPentatonic'
  | 'blues'
  | 'wholeTone'
  | 'diminishedHalfWhole'
  | 'diminishedWholeHalf';

export type ParentScale = 'major' | 'melodic minor' | 'harmonic minor';

export interface ScaleDef {
  id: ScaleId;
  /** Display name, lower case ("dorian", "melodic minor"). */
  name: string;
  /** Semitones above the scale root. */
  intervals: readonly number[];
  /** Where the scale comes from, for reasons ("mode 2 of major"). */
  family: string;
  /** Parent scale and mode number (1-based) for modes of major / melodic / harmonic minor. */
  parent?: { scale: ParentScale; mode: number };
}

const PARENT_INTERVALS: Readonly<Record<ParentScale, readonly number[]>> = {
  major: MAJOR_SCALE,
  'melodic minor': MELODIC_MINOR_SCALE,
  'harmonic minor': HARMONIC_MINOR_SCALE,
};

function def(id: ScaleId, name: string, family: string, intervals: number[]): ScaleDef {
  const m = /^mode (\d) of (major|melodic minor|harmonic minor)$/.exec(family);
  const parent = m ? { scale: m[2] as ParentScale, mode: Number(m[1]) } : undefined;
  return parent ? { id, name, family, intervals, parent } : { id, name, family, intervals };
}

export const SCALES: Readonly<Record<ScaleId, ScaleDef>> = {
  ionian: def('ionian', 'ionian (major)', 'mode 1 of major', [0, 2, 4, 5, 7, 9, 11]),
  dorian: def('dorian', 'dorian', 'mode 2 of major', [0, 2, 3, 5, 7, 9, 10]),
  phrygian: def('phrygian', 'phrygian', 'mode 3 of major', [0, 1, 3, 5, 7, 8, 10]),
  lydian: def('lydian', 'lydian', 'mode 4 of major', [0, 2, 4, 6, 7, 9, 11]),
  mixolydian: def('mixolydian', 'mixolydian', 'mode 5 of major', [0, 2, 4, 5, 7, 9, 10]),
  aeolian: def('aeolian', 'aeolian (natural minor)', 'mode 6 of major', [0, 2, 3, 5, 7, 8, 10]),
  locrian: def('locrian', 'locrian', 'mode 7 of major', [0, 1, 3, 5, 6, 8, 10]),
  melodicMinor: def(
    'melodicMinor',
    'melodic minor',
    'mode 1 of melodic minor',
    [0, 2, 3, 5, 7, 9, 11],
  ),
  dorianB2: def('dorianB2', 'dorian b2', 'mode 2 of melodic minor', [0, 1, 3, 5, 7, 9, 10]),
  lydianAugmented: def(
    'lydianAugmented',
    'lydian augmented',
    'mode 3 of melodic minor',
    [0, 2, 4, 6, 8, 9, 11],
  ),
  lydianDominant: def(
    'lydianDominant',
    'lydian dominant',
    'mode 4 of melodic minor',
    [0, 2, 4, 6, 7, 9, 10],
  ),
  mixolydianB6: def(
    'mixolydianB6',
    'mixolydian b6',
    'mode 5 of melodic minor',
    [0, 2, 4, 5, 7, 8, 10],
  ),
  locrianNat2: def(
    'locrianNat2',
    'locrian natural 2',
    'mode 6 of melodic minor',
    [0, 2, 3, 5, 6, 8, 10],
  ),
  altered: def('altered', 'altered', 'mode 7 of melodic minor', [0, 1, 3, 4, 6, 8, 10]),
  harmonicMinor: def(
    'harmonicMinor',
    'harmonic minor',
    'mode 1 of harmonic minor',
    [0, 2, 3, 5, 7, 8, 11],
  ),
  phrygianDominant: def(
    'phrygianDominant',
    'phrygian dominant',
    'mode 5 of harmonic minor',
    [0, 1, 4, 5, 7, 8, 10],
  ),
  majorPentatonic: def(
    'majorPentatonic',
    'major pentatonic',
    'pentatonic, no half steps',
    [0, 2, 4, 7, 9],
  ),
  minorPentatonic: def(
    'minorPentatonic',
    'minor pentatonic',
    'pentatonic, no half steps',
    [0, 3, 5, 7, 10],
  ),
  blues: def('blues', 'blues', 'minor pentatonic plus the b5', [0, 3, 5, 6, 7, 10]),
  wholeTone: def('wholeTone', 'whole tone', 'symmetric, all whole steps', [0, 2, 4, 6, 8, 10]),
  diminishedHalfWhole: def(
    'diminishedHalfWhole',
    'diminished (half-whole)',
    'symmetric, half step then whole step',
    [0, 1, 3, 4, 6, 7, 9, 10],
  ),
  diminishedWholeHalf: def(
    'diminishedWholeHalf',
    'diminished (whole-half)',
    'symmetric, whole step then half step',
    [0, 2, 3, 5, 6, 8, 9, 11],
  ),
};

/** Pitch classes of a scale on `root`, root first. */
export function scalePitchClasses(root: PitchClass, id: ScaleId): PitchClass[] {
  return SCALES[id].intervals.map((i) => mod12(root + i));
}

/**
 * Idiomatic scale choices per quality, best first. Scales that do not contain every chord
 * tone are dropped by `scalesForChord`, except those listed in `COLOUR` below.
 */
const PREFERENCES: Readonly<Record<ChordQuality, readonly ScaleId[]>> = {
  '5': ['minorPentatonic', 'majorPentatonic', 'blues', 'ionian', 'mixolydian', 'dorian', 'aeolian'],
  maj: ['ionian', 'majorPentatonic', 'lydian', 'mixolydian'],
  min: [
    'aeolian',
    'dorian',
    'minorPentatonic',
    'phrygian',
    'blues',
    'melodicMinor',
    'harmonicMinor',
  ],
  dim: ['locrian', 'diminishedWholeHalf', 'locrianNat2'],
  aug: ['wholeTone', 'lydianAugmented'],
  sus2: ['mixolydian', 'ionian', 'dorian', 'majorPentatonic'],
  sus4: ['mixolydian', 'dorian', 'ionian', 'minorPentatonic'],
  maj7: ['ionian', 'lydian', 'majorPentatonic'],
  min7: ['dorian', 'aeolian', 'phrygian', 'minorPentatonic', 'blues'],
  '7': [
    'mixolydian',
    'lydianDominant',
    'blues',
    'majorPentatonic',
    'mixolydianB6',
    'phrygianDominant',
    'diminishedHalfWhole',
    'altered',
  ],
  dim7: ['diminishedWholeHalf'],
  m7b5: ['locrian', 'locrianNat2'],
  mMaj7: ['melodicMinor', 'harmonicMinor'],
  '6': ['ionian', 'majorPentatonic', 'lydian', 'mixolydian'],
  m6: ['dorian', 'melodicMinor', 'minorPentatonic'],
  add9: ['ionian', 'majorPentatonic', 'lydian', 'mixolydian'],
  madd9: ['aeolian', 'dorian', 'melodicMinor'],
  '9': ['mixolydian', 'lydianDominant', 'blues', 'majorPentatonic'],
  maj9: ['ionian', 'lydian', 'majorPentatonic'],
  min9: ['dorian', 'aeolian', 'minorPentatonic'],
  '11': ['mixolydian', 'minorPentatonic'],
  min11: ['dorian', 'aeolian', 'minorPentatonic'],
  '13': ['mixolydian', 'lydianDominant'],
  maj13: ['ionian', 'lydian'],
  min13: ['dorian'],
  '7b9': ['diminishedHalfWhole', 'phrygianDominant', 'altered'],
  '7#9': ['altered', 'diminishedHalfWhole', 'blues', 'minorPentatonic'],
  '7#11': ['lydianDominant', 'wholeTone'],
  '7b13': ['mixolydianB6', 'altered', 'wholeTone', 'phrygianDominant'],
  '7alt': ['altered', 'diminishedHalfWhole'],
  'maj7#11': ['lydian'],
  '6/9': ['majorPentatonic', 'ionian', 'lydian'],
  '7sus4': ['mixolydian', 'dorian', 'minorPentatonic'],
  '9sus4': ['mixolydian', 'dorian', 'minorPentatonic'],
};

/**
 * Scales allowed to miss chord tones: bluesy colour over dominants and #9 chords, minor
 * pentatonic over power / sus / 11 chords, major pentatonic (no b7) over dominants.
 */
const COLOUR: ReadonlySet<ScaleId> = new Set<ScaleId>(['blues', 'minorPentatonic']);

function isColour(id: ScaleId, quality: ChordQuality): boolean {
  return COLOUR.has(id) || (id === 'majorPentatonic' && isDominantQuality(quality));
}

/** "mode 2 of C major", or the plain family when the scale is not a mode. */
function familyFor(d: ScaleDef, root: PitchClass, key?: Key | null): string {
  if (!d.parent) return d.family;
  const tonic = mod12(root - PARENT_INTERVALS[d.parent.scale][d.parent.mode - 1]);
  return `mode ${d.parent.mode} of ${spell(tonic, key)} ${d.parent.scale}`;
}

export interface ScaleSuggestion {
  id: ScaleId;
  /** "dorian", "altered", ... */
  name: string;
  /** Scale root (the chord root). */
  root: PitchClass;
  /** "D dorian" (root spelled for the key). */
  label: string;
  pitchClasses: PitchClass[];
  /** Why it fits, e.g. "ii7 in C major: mode 2 of C major; every note in the key". */
  reason: string;
  /** 0..1, higher is better. */
  score: number;
  /** 1-based position in the ranking (1 = best fit). */
  rank: number;
}

/**
 * Scales that fit `chord` (rooted on the chord root), best first. Ranking combines the
 * idiomatic choice for the quality with how well the scale's non-chord tones sit in `key`
 * (natural minor, plus the harmonic-minor leading tone, for minor keys). Without a key the
 * idiomatic order is used.
 */
export function scalesForChord(chord: Chord, key?: Key | null): ScaleSuggestion[] {
  const tones = new Set<number>(chordTones(chord));
  const prefs = PREFERENCES[chord.quality];
  const keyTones = key ? new Set<number>(scaleOf(key)) : null;
  if (key && keyTones && key.mode === 'minor')
    keyTones.add(mod12(key.tonic + HARMONIC_MINOR_SCALE[6]));
  const where = key ? `${romanNumeral(chord, key)} in ${keyName(key)}` : '';
  const out: Omit<ScaleSuggestion, 'rank'>[] = [];

  prefs.forEach((id, rank) => {
    const pcs = scalePitchClasses(chord.root, id);
    const set = new Set<number>(pcs);
    const fifth = mod12(chord.root + 7);
    const absent = [...tones].filter((t) => !set.has(t));
    // altered-type scales may replace the perfect fifth; only colour scales skip other tones
    const missing = absent.filter((t) => t !== fifth).length;
    if (missing > 0 && !isColour(id, chord.quality)) return;
    const pref = 1 - rank / Math.max(prefs.length, 4);
    let fit = 1;
    let outside = 0;
    if (keyTones) {
      const colour = pcs.filter((p) => !tones.has(p));
      outside = colour.filter((p) => !keyTones.has(p)).length;
      fit = colour.length ? 1 - outside / colour.length : 1;
    }
    const base = keyTones ? 0.55 * fit + 0.45 * pref : pref;
    const penalty = 0.3 * missing + 0.05 * (absent.length - missing);
    const score = Math.round((base - penalty) * 1000) / 1000;
    const d = SCALES[id];
    const label = `${spell(chord.root, key)} ${d.name}`;
    const family = familyFor(d, chord.root, key);
    let reason: string;
    if (!key)
      reason = `${family}; ${rank === 0 ? 'the usual choice' : 'an option'} over ${chord.quality} chords`;
    else if (outside === 0) reason = `${where}: ${family}; every note in the key`;
    else reason = `${where}: ${family}; ${outside} note${outside > 1 ? 's' : ''} outside the key`;
    if (missing > 0)
      reason += `, ${id === 'majorPentatonic' ? 'open' : 'bluesy'} colour (skips a chord tone)`;
    out.push({ id, name: d.name, root: chord.root, label, pitchClasses: pcs, reason, score });
  });

  return out
    .sort((a, b) => b.score - a.score || prefs.indexOf(a.id) - prefs.indexOf(b.id))
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

const ODD_NAMES = new Set(['Cb', 'Fb', 'E#', 'B#']);

/**
 * Note names of a scale, root first, spelled for `key`. Seven-note scales use one letter per
 * degree from the root's key spelling (D dorian in C: D E F G A B C; E phrygian dominant in
 * A minor: E F G# A B C D), falling back to the key's own spelling where that would give a
 * double accidental or an odd enharmonic the key does not use (G altered in C: ... Bb B ...).
 * Other scales (pentatonic, blues, symmetric) take `spell(pc, key)` per note.
 */
export function scaleNotesSpelled(
  scale: Pick<ScaleSuggestion, 'root' | 'pitchClasses'>,
  key?: Key | null,
  opts: SpellOptions = {},
): string[] {
  const plain = scale.pitchClasses.map((p) => spell(p, key, opts));
  if (scale.pitchClasses.length !== 7 || opts.spellingFollowsKey === false) return plain;
  const rootName = spell(scale.root, key, opts);
  return scale.pitchClasses.map((p, i) => {
    if (i === 0) return rootName;
    const byLetter = spellAbove(rootName, i, p);
    const byKey = plain[i];
    if (ODD_NAMES.has(byLetter) && byLetter !== byKey) return byKey;
    return byLetter;
  });
}
