/**
 * Scale helper: which scales / modes fit a chord, ranked for the current key.
 */
import type { Chord, ChordQuality, Key, PitchClass } from '@/core';
import { chordTones } from './chordName';
import { HARMONIC_MINOR_SCALE, mod12, scaleOf } from './keys';
import { keyName, spell } from './notes';

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

export interface ScaleDef {
  id: ScaleId;
  /** Display name, lower case ("dorian", "melodic minor"). */
  name: string;
  /** Semitones above the scale root. */
  intervals: readonly number[];
  /** Where the scale comes from, for reasons ("mode 2 of major"). */
  family: string;
}

function def(id: ScaleId, name: string, family: string, intervals: number[]): ScaleDef {
  return { id, name, family, intervals };
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
  majorPentatonic: def('majorPentatonic', 'major pentatonic', 'pentatonic', [0, 2, 4, 7, 9]),
  minorPentatonic: def('minorPentatonic', 'minor pentatonic', 'pentatonic', [0, 3, 5, 7, 10]),
  blues: def('blues', 'blues', 'blues', [0, 3, 5, 6, 7, 10]),
  wholeTone: def('wholeTone', 'whole tone', 'symmetric', [0, 2, 4, 6, 8, 10]),
  diminishedHalfWhole: def(
    'diminishedHalfWhole',
    'diminished (half-whole)',
    'symmetric',
    [0, 1, 3, 4, 6, 7, 9, 10],
  ),
  diminishedWholeHalf: def(
    'diminishedWholeHalf',
    'diminished (whole-half)',
    'symmetric',
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
  '9': ['mixolydian', 'lydianDominant', 'blues'],
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
 * pentatonic over power / sus / 11 chords.
 */
const COLOUR: ReadonlySet<ScaleId> = new Set<ScaleId>(['blues', 'minorPentatonic']);

export interface ScaleSuggestion {
  id: ScaleId;
  /** "dorian", "altered", ... */
  name: string;
  /** Scale root (the chord root). */
  root: PitchClass;
  /** "D dorian" (root spelled for the key). */
  label: string;
  pitchClasses: PitchClass[];
  /** Why it fits, e.g. "mode 2 of C major: every note is in the key". */
  reason: string;
  /** 0..1, higher is better. */
  score: number;
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
  const out: ScaleSuggestion[] = [];

  prefs.forEach((id, rank) => {
    const pcs = scalePitchClasses(chord.root, id);
    const set = new Set<number>(pcs);
    const fifth = mod12(chord.root + 7);
    const absent = [...tones].filter((t) => !set.has(t));
    // altered-type scales may replace the perfect fifth; only colour scales skip other tones
    const missing = absent.filter((t) => t !== fifth).length;
    if (missing > 0 && !COLOUR.has(id)) return;
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
    const def = SCALES[id];
    const label = `${spell(chord.root, key)} ${def.name}`;
    let reason: string;
    if (!key)
      reason = `${def.family}; ${rank === 0 ? 'the usual choice' : 'an option'} over ${chord.quality} chords`;
    else if (outside === 0) reason = `${def.family}: every note is in ${keyName(key)}`;
    else reason = `${def.family}: ${outside} note${outside > 1 ? 's' : ''} outside ${keyName(key)}`;
    if (missing > 0) reason += ', bluesy colour (skips a chord tone)';
    out.push({ id, name: def.name, root: chord.root, label, pitchClasses: pcs, reason, score });
  });

  return out.sort((a, b) => b.score - a.score || prefs.indexOf(a.id) - prefs.indexOf(b.id));
}
