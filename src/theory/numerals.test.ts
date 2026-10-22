import { describe, expect, it } from 'vitest';
import type { Chord, Key, PitchClass } from '@/core';
import { parseChord } from './chordName';
import { ALL_KEYS, diatonicChords } from './keys';
import { NUMERAL_SUFFIX, bassDegree, inversionFigure, romanNumeral, scaleDegree } from './numerals';
import type { NumeralOptions } from './numerals';
import { QUALITY_ORDER } from './vocab';

const key = (tonic: number, mode: Key['mode'] = 'major'): Key => ({
  tonic: tonic as PitchClass,
  mode,
});
const C = key(0);
const Am = key(9, 'minor');

function ch(symbol: string): Chord {
  const c = parseChord(symbol);
  if (!c) throw new Error(symbol);
  return c;
}

function expectNumerals(k: Key, cases: Record<string, string>, opts?: NumeralOptions) {
  for (const [symbol, numeral] of Object.entries(cases)) {
    expect(romanNumeral(ch(symbol), k, opts), symbol).toBe(numeral);
  }
}

describe('romanNumeral: pop (C major)', () => {
  it('diatonic triads and sevenths', () => {
    expectNumerals(C, {
      C: 'I',
      Dm: 'ii',
      Em: 'iii',
      F: 'IV',
      G: 'V',
      Am: 'vi',
      Bdim: 'vii°',
      G7: 'V7',
      Dm7: 'ii7',
      Fmaj7: 'IVmaj7',
      Cmaj7: 'Imaj7',
      Bm7b5: 'viiø7',
      Csus4: 'Isus4',
      Gsus4: 'Vsus4',
      Cadd9: 'Iadd9',
      C5: 'I5',
      Am7: 'vi7',
    });
  });

  it('borrowed and chromatic chords', () => {
    expectNumerals(C, {
      Bb: 'bVII',
      Ab: 'bVI',
      Fm: 'iv',
      Eb: 'bIII',
      Db: 'bII',
      'F#dim': '#iv°',
      Caug: 'I+',
      Fm6: 'iv6',
      Bbmaj7: 'bVIImaj7',
      Gb: 'bV',
    });
  });

  it('secondary dominants and leading-tone sevenths', () => {
    expectNumerals(C, {
      D: 'V/V',
      D7: 'V7/V',
      E: 'V/vi',
      E7: 'V7/vi',
      A7: 'V7/ii',
      B7: 'V7/iii',
      C7: 'V7/IV',
      'F#dim7': 'vii°7/V',
      'C#dim7': 'vii°7/ii',
      // tritone sub and backdoor dominant are not secondary dominants
      Db7: 'bII7',
      Bb7: 'bVII7',
    });
  });

  it('can turn secondary analysis off', () => {
    expect(romanNumeral(ch('D7'), C, { secondary: false })).toBe('II7');
    expect(romanNumeral(ch('E'), C, { secondary: false })).toBe('III');
  });
});

describe('romanNumeral: jazz', () => {
  it('ii–V–I in Bb with a turnaround', () => {
    const Bb = key(10);
    expectNumerals(Bb, {
      Cm7: 'ii7',
      F7: 'V7',
      Bbmaj7: 'Imaj7',
      Gm7: 'vi7',
      G7alt: 'V7alt/ii',
      C7: 'V7/V',
      Ebmaj7: 'IVmaj7',
      Bbmaj9: 'Imaj9',
      F13: 'V13',
      B7: 'bII7',
      Am7b5: 'viiø7',
    });
  });

  it('extensions keep their suffix', () => {
    expectNumerals(C, {
      Dm9: 'ii9',
      G13: 'V13',
      Cmaj9: 'Imaj9',
      G7b9: 'V7b9',
      'C6/9': 'I6/9',
      'Fmaj7#11': 'IVmaj7#11',
      G9sus4: 'V9sus4',
    });
  });
});

describe('romanNumeral: minor keys', () => {
  it('pop convention (default): degrees relative to the parallel major', () => {
    expectNumerals(Am, {
      Am: 'i',
      Bdim: 'ii°',
      C: 'bIII',
      Dm: 'iv',
      Em: 'v',
      E: 'V',
      E7: 'V7',
      F: 'bVI',
      G: 'bVII',
      'G#dim': 'vii°',
      'G#dim7': 'vii°7',
      D: 'IV',
      A: 'I',
      A7: 'V7/iv',
      B7: 'V7/v',
      D7: 'V7/bVII',
      Caug: 'bIII+',
      Bb: 'bII',
      Am7: 'i7',
      Bm7b5: 'iiø7',
    });
  });

  it('natural convention: degrees relative to natural minor', () => {
    expectNumerals(
      Am,
      { Am: 'i', C: 'III', F: 'VI', G: 'VII', 'G#dim': 'vii°', D7: 'V7/VII', 'F#m': '#vi' },
      { minorStyle: 'natural' },
    );
  });

  it('every suffix is defined', () => {
    for (const q of QUALITY_ORDER) expect(typeof NUMERAL_SUFFIX[q]).toBe('string');
  });
});

describe('romanNumeral: diatonic sets in all 24 keys', () => {
  const MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  const MINOR = ['i', 'ii°', 'bIII', 'iv', 'v', 'bVI', 'bVII'];
  const MAJOR_7 = ['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7'];
  const MINOR_7 = ['i7', 'iiø7', 'bIIImaj7', 'iv7', 'v7', 'bVImaj7', 'bVII7'];
  for (const k of ALL_KEYS) {
    it(`${k.tonic} ${k.mode}`, () => {
      const major = k.mode === 'major';
      expect(diatonicChords(k, 1).map((c) => romanNumeral(c, k))).toEqual(major ? MAJOR : MINOR);
      expect(diatonicChords(k, 2).map((c) => romanNumeral(c, k))).toEqual(
        major ? MAJOR_7 : MINOR_7,
      );
    });
  }
});

describe('slash bass helpers', () => {
  it('the numeral ignores the slash bass', () => {
    expect(romanNumeral(ch('C/E'), C)).toBe('I');
    expect(romanNumeral(ch('G7/B'), C)).toBe('V7');
  });

  it('scaleDegree and bassDegree', () => {
    expect([...Array(12).keys()].map((p) => scaleDegree(p as PitchClass, C))).toEqual([
      '1',
      'b2',
      '2',
      'b3',
      '3',
      '4',
      '#4',
      '5',
      'b6',
      '6',
      'b7',
      '7',
    ]);
    expect(scaleDegree(7, key(7))).toBe('1');
    expect(bassDegree(ch('C/E'), C)).toBe('3');
    expect(bassDegree(ch('G7/F'), C)).toBe('4');
    expect(bassDegree(ch('C/Bb'), C)).toBe('b7');
    expect(bassDegree(ch('C'), C)).toBeNull();
  });

  it('inversionFigure', () => {
    expect(inversionFigure(ch('C'))).toBe('');
    expect(inversionFigure(ch('C/E'))).toBe('6');
    expect(inversionFigure(ch('C/G'))).toBe('64');
    expect(inversionFigure(ch('G7/B'))).toBe('65');
    expect(inversionFigure(ch('G7/D'))).toBe('43');
    expect(inversionFigure(ch('G7/F'))).toBe('42');
    expect(inversionFigure(ch('C6/A'))).toBe('42');
    expect(inversionFigure(ch('Cadd9/D'))).toBe('');
    expect(inversionFigure(ch('C/D'))).toBe('');
  });
});
