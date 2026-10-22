/**
 * Roman numerals relative to a key: diatonic, borrowed / chromatic, secondary dominants
 * and secondary leading-tone sevenths. ASCII accidentals ('bVII', '#iv°').
 */
import type { Chord, ChordQuality, Key, PitchClass } from '@/core';
import { isDiatonic, mod12, scaleIntervals } from './keys';
import { CHORD_TEMPLATES, isDiminishedQuality, isDominantQuality, isMinorQuality } from './vocab';

export type MinorNumeralStyle =
  /** Degrees relative to the parallel major: i ii° bIII iv v bVI bVII (pop convention). */
  | 'flat'
  /** Degrees relative to natural minor: i ii° III iv v VI VII (classical / jazz). */
  | 'natural';

export interface NumeralOptions {
  /** How minor keys name their degrees. Default 'flat'. */
  minorStyle?: MinorNumeralStyle;
  /** Recognise secondary dominants (V7/vi) and leading-tone sevenths (vii°7/V). Default true. */
  secondary?: boolean;
}

/** Suffix after the numeral, by quality. Minor-ness is carried by the numeral's case. */
export const NUMERAL_SUFFIX: Readonly<Record<ChordQuality, string>> = {
  '5': '5',
  maj: '',
  min: '',
  dim: '°',
  aug: '+',
  sus2: 'sus2',
  sus4: 'sus4',
  maj7: 'maj7',
  min7: '7',
  '7': '7',
  dim7: '°7',
  m7b5: 'ø7',
  mMaj7: '(maj7)',
  '6': '6',
  m6: '6',
  add9: 'add9',
  madd9: 'add9',
  '9': '9',
  maj9: 'maj9',
  min9: '9',
  '11': '11',
  min11: '11',
  '13': '13',
  maj13: 'maj13',
  min13: '13',
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

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

/** Semitone offset -> [accidental, degree index], major-scale reference. */
const MAJOR_DEGREES: ReadonlyArray<readonly [string, number]> = [
  ['', 0],
  ['b', 1],
  ['', 1],
  ['b', 2],
  ['', 2],
  ['', 3],
  ['#', 3], // or bV, see degreeOf
  ['', 4],
  ['b', 5],
  ['', 5],
  ['b', 6],
  ['', 6],
];

/** Natural-minor reference (for minorStyle 'natural'). */
const MINOR_DEGREES: ReadonlyArray<readonly [string, number]> = [
  ['', 0],
  ['b', 1],
  ['', 1],
  ['', 2],
  ['#', 2],
  ['', 3],
  ['#', 3],
  ['', 4],
  ['', 5],
  ['#', 5],
  ['', 6],
  ['#', 6],
];

function degreeOf(
  offset: number,
  quality: ChordQuality,
  key: Key,
  style: MinorNumeralStyle,
): [string, number] {
  const table = key.mode === 'minor' && style === 'natural' ? MINOR_DEGREES : MAJOR_DEGREES;
  const [acc, d] = table[offset];
  // the tritone: #iv° (leading tone to V) for diminished chords, bV otherwise
  if (offset === 6 && !isDiminishedQuality(quality)) return ['b', 4];
  // natural-minor leading-tone chord reads vii°, not #vii°
  if (offset === 11 && table === MINOR_DEGREES && isDiminishedQuality(quality)) return ['', 6];
  return [acc, d];
}

function plainNumeral(
  root: PitchClass,
  quality: ChordQuality,
  key: Key,
  style: MinorNumeralStyle,
): string {
  const [acc, d] = degreeOf(mod12(root - key.tonic), quality, key, style);
  const n = isMinorQuality(quality) ? NUMERALS[d].toLowerCase() : NUMERALS[d];
  return acc + n + NUMERAL_SUFFIX[quality];
}

/** Diatonic triad quality on a scale degree root, or null if the root is not in the scale. */
function diatonicTriadAt(root: PitchClass, key: Key): ChordQuality | null {
  const iv = scaleIntervals(key);
  const d = iv.indexOf(mod12(root - key.tonic));
  if (d < 0) return null;
  const third = mod12(iv[(d + 2) % 7] - iv[d]);
  const fifth = mod12(iv[(d + 4) % 7] - iv[d]);
  if (third === 4) return fifth === 8 ? 'aug' : 'maj';
  return fifth === 6 ? 'dim' : 'min';
}

/** Chord is diatonic: in the key's scale, or (minor) in harmonic minor (V, V7, vii°, vii°7). */
function inKey(chord: Chord, key: Key): boolean {
  const plain = { root: chord.root, quality: chord.quality };
  return isDiatonic(plain, key) || (key.mode === 'minor' && isDiatonic(plain, key, 'harmonic'));
}

/** Numeral for the target of a secondary chord, or null if it is not a valid target. */
function targetNumeral(target: PitchClass, key: Key, style: MinorNumeralStyle): string | null {
  if (target === key.tonic) return null;
  const q = diatonicTriadAt(target, key);
  if (q === null || q === 'dim') return null;
  return plainNumeral(target, q, key, style);
}

/**
 * Roman numeral of `chord` in `key`: "IV", "V7", "ii7", "IVmaj7", "vii°", "bVII", "iv",
 * "#iv°", "V7/vi", "V/V", "vii°7/V". Minor keys default to the pop convention
 * (i, bIII, bVI, bVII; V and vii° from harmonic minor count as diatonic). The slash bass is
 * not part of the numeral; see `bassDegree` / `inversionFigure`.
 */
export function romanNumeral(chord: Chord, key: Key, opts: NumeralOptions = {}): string {
  const style = opts.minorStyle ?? 'flat';
  const { root, quality } = chord;
  if (opts.secondary !== false && !inKey(chord, key)) {
    // secondary dominant: a dominant-type chord a fifth above a diatonic major / minor chord
    const isTriad = quality === 'maj';
    if (isDominantQuality(quality) || isTriad) {
      const target = mod12(root + 5);
      const subtonic = key.mode === 'minor' && mod12(target - key.tonic) === 10;
      const t = targetNumeral(target, key, style);
      // a major triad on the tonic is a Picardy / parallel I, and IV in minor is dorian
      if (t && !(isTriad && (root === key.tonic || subtonic))) {
        return `V${NUMERAL_SUFFIX[quality]}/${t}`;
      }
    }
    // secondary leading-tone seventh: dim7 a semitone below a diatonic chord
    if (quality === 'dim7') {
      const t = targetNumeral(mod12(root + 1), key, style);
      if (t) return `vii°7/${t}`;
    }
  }
  return plainNumeral(root, quality, key, style);
}

/**
 * Scale degree of a pitch class relative to the tonic, major-scale reference with accidentals:
 * '1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'.
 */
export function scaleDegree(p: PitchClass, key: Key): string {
  const [acc, d] = MAJOR_DEGREES[mod12(p - key.tonic)];
  return `${acc}${d + 1}`;
}

/** Scale degree of a slash chord's bass ("C/E" in C -> '3'), or null without a slash bass. */
export function bassDegree(chord: Chord, key: Key): string | null {
  if (chord.bass === undefined || chord.bass === chord.root) return null;
  return scaleDegree(chord.bass, key);
}

/**
 * Figured-bass inversion figure from the bass's role in the chord: '' for root position or a
 * bass that is not a chord tone; triads '6' / '64'; seventh (and sixth) chords '65' / '43' / '42'.
 */
export function inversionFigure(chord: Chord): string {
  if (chord.bass === undefined || chord.bass === chord.root) return '';
  const t = CHORD_TEMPLATES[chord.quality];
  const k = t.intervals.indexOf(mod12(chord.bass - chord.root));
  if (k < 0) return '';
  const seventh = t.roles.includes('seventh');
  switch (t.roles[k]) {
    case 'third':
    case 'sus':
      return seventh ? '65' : '6';
    case 'fifth':
      return seventh ? '43' : '64';
    case 'seventh':
      return '42';
    default:
      return '';
  }
}
