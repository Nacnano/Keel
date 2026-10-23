import { describe, expect, it } from 'vitest';
import type { Chord, Key, PitchClass } from '@/core';
import {
  chordKey,
  chordPitchClasses,
  chordSymbol,
  chordTones,
  parseChord,
  sameChord,
  spellBass,
  spellChord,
} from './chordName';
import { CHORD_TEMPLATES, QUALITY_ORDER } from './vocab';

const key = (tonic: number, mode: Key['mode'] = 'major'): Key => ({
  tonic: tonic as PitchClass,
  mode,
});
const C = key(0);

describe('chordTones', () => {
  it('returns template pitch classes, root first, without the slash bass', () => {
    expect(chordTones({ root: 0, quality: 'maj7' })).toEqual([0, 4, 7, 11]);
    expect(chordTones({ root: 7, quality: '7', bass: 11 })).toEqual([7, 11, 2, 5]);
    expect(chordTones(9, 'min')).toEqual([9, 0, 4]);
    for (const q of QUALITY_ORDER) {
      expect(chordTones({ root: 0, quality: q })).toEqual(CHORD_TEMPLATES[q].intervals);
    }
  });

  it('chordPitchClasses adds a non-chord-tone bass', () => {
    expect(chordPitchClasses({ root: 0, quality: 'maj', bass: 4 })).toEqual([0, 4, 7]);
    expect(chordPitchClasses({ root: 0, quality: 'maj', bass: 2 })).toEqual([0, 4, 7, 2]);
  });
});

describe('chordSymbol', () => {
  it('renders every quality suffix on C', () => {
    for (const q of QUALITY_ORDER) {
      expect(chordSymbol({ root: 0, quality: q })).toBe(`C${CHORD_TEMPLATES[q].symbol}`);
    }
  });

  it('renders the plan examples', () => {
    expect(chordSymbol({ root: 0, quality: 'maj7' }, C)).toBe('Cmaj7');
    expect(chordSymbol({ root: 7, quality: 'maj', bass: 11 }, C)).toBe('G/B');
    expect(chordSymbol({ root: 6, quality: 'm7b5' }, key(7))).toBe('F#m7b5');
    expect(chordSymbol({ root: 9, quality: 'min' })).toBe('Am');
  });

  it('spells the root for the key', () => {
    expect(chordSymbol({ root: 10, quality: 'maj7' }, key(5))).toBe('Bbmaj7');
    expect(chordSymbol({ root: 10, quality: 'maj7' }, key(11))).toBe('A#maj7');
    expect(chordSymbol({ root: 1, quality: '7' }, key(1))).toBe('Db7');
    expect(chordSymbol({ root: 1, quality: '7' }, key(1, 'minor'))).toBe('C#7');
    expect(chordSymbol({ root: 8, quality: 'maj', bass: 0 }, key(3))).toBe('Ab/C');
  });

  it('never spells a root Cb, Fb, E# or B#', () => {
    expect(chordSymbol({ root: 11, quality: 'maj' }, key(6))).toBe('B'); // IV in Gb, not Cb
    expect(chordSymbol({ root: 5, quality: 'min' }, key(6))).toBe('Fm'); // not E#m in F#
    expect(chordSymbol({ root: 4, quality: 'maj7' }, key(1, 'minor'))).toBe('Emaj7');
    expect(chordSymbol({ root: 0, quality: '7' }, key(1))).toBe('C7'); // not B#7 in C#
  });

  it('options: no chord, no slash, sharps', () => {
    expect(chordSymbol(null)).toBe('N.C.');
    expect(chordSymbol(null, C, { noChord: '–' })).toBe('–');
    expect(chordSymbol({ root: 0, quality: 'maj', bass: 4 }, C, { showSlash: false })).toBe('C');
    expect(chordSymbol({ root: 10, quality: 'min' }, key(5), { spellingFollowsKey: false })).toBe(
      'A#m',
    );
    // a bass equal to the root is not a slash
    expect(chordSymbol({ root: 0, quality: 'maj', bass: 0 })).toBe('C');
  });
});

describe('spellChord / spellBass', () => {
  it('spells chord tones by interval from the root', () => {
    expect(spellChord({ root: 1, quality: '7' }, key(6, 'minor'))).toEqual(['C#', 'E#', 'G#', 'B']);
    expect(spellChord({ root: 11, quality: 'dim7' }, C)).toEqual(['B', 'D', 'F', 'Ab']);
    expect(spellChord({ root: 2, quality: '7' }, C)).toEqual(['D', 'F#', 'A', 'C']);
    expect(spellChord({ root: 3, quality: 'min' }, key(1))).toEqual(['Eb', 'Gb', 'Bb']);
    expect(spellChord({ root: 1, quality: '7' }, key(8))).toEqual(['Db', 'F', 'Ab', 'Cb']);
    expect(spellChord({ root: 0, quality: '7alt' }, C)).toEqual(['C', 'E', 'Bb', 'D#', 'Ab']);
    expect(spellChord({ root: 0, quality: '6' }, C)).toEqual(['C', 'E', 'G', 'A']);
    expect(spellChord({ root: 0, quality: 'aug' }, C)).toEqual(['C', 'E', 'G#']);
    expect(spellChord({ root: 0, quality: '13' }, C)).toEqual(['C', 'E', 'G', 'Bb', 'D', 'A']);
  });

  it('falls back to plain names for double accidentals', () => {
    // C dim7: Bbb -> A
    expect(spellChord({ root: 0, quality: 'dim7' }, C)).toEqual(['C', 'Eb', 'Gb', 'A']);
  });

  it('uses sharps when spelling does not follow the key', () => {
    expect(spellChord({ root: 10, quality: 'maj' }, key(5), { spellingFollowsKey: false })).toEqual(
      ['A#', 'D', 'F'],
    );
  });

  it('bass matches the chord-tone spelling', () => {
    expect(spellBass({ root: 0, quality: 'maj', bass: 4 }, C)).toBe('E');
    expect(spellBass({ root: 1, quality: '7', bass: 5 }, key(6, 'minor'))).toBe('E#');
    expect(spellBass({ root: 0, quality: 'maj', bass: 10 }, C)).toBe('Bb');
    expect(spellBass({ root: 0, quality: 'maj' }, C)).toBeNull();
  });
});

describe('chordKey / sameChord', () => {
  it('identity ignores spelling and a bass equal to the root', () => {
    expect(chordKey({ root: 0, quality: 'maj7', bass: 4 })).toBe('0:maj7/4');
    expect(chordKey({ root: 0, quality: 'maj', bass: 0 })).toBe('0:maj');
    expect(chordKey(null)).toBe('N');
    expect(sameChord({ root: 0, quality: 'maj' }, { root: 0, quality: 'maj', bass: 0 })).toBe(true);
    expect(sameChord({ root: 0, quality: 'maj' }, { root: 0, quality: 'maj', bass: 4 })).toBe(
      false,
    );
    expect(sameChord({ root: 0, quality: 'maj' }, { root: 0, quality: 'min' })).toBe(false);
    expect(sameChord(null, null)).toBe(true);
    expect(sameChord(null, { root: 0, quality: 'maj' })).toBe(false);
  });
});

describe('parseChord', () => {
  it('round-trips every symbol on every root, with and without slash', () => {
    for (const q of QUALITY_ORDER) {
      for (let r = 0; r < 12; r++) {
        const c: Chord = { root: r as PitchClass, quality: q };
        expect(parseChord(chordSymbol(c)), chordSymbol(c)).toEqual(c);
        const slash: Chord = { ...c, bass: ((r + 4) % 12) as PitchClass };
        expect(parseChord(chordSymbol(slash)), chordSymbol(slash)).toEqual(slash);
      }
    }
  });

  it('accepts common aliases and unicode accidentals', () => {
    expect(parseChord('CΔ7')).toEqual({ root: 0, quality: 'maj7' });
    expect(parseChord('C-7')).toEqual({ root: 0, quality: 'min7' });
    expect(parseChord('Bø')).toEqual({ root: 11, quality: 'm7b5' });
    expect(parseChord('G7alt')).toEqual({ root: 7, quality: '7alt' });
    expect(parseChord('E♭m7')).toEqual({ root: 3, quality: 'min7' });
    expect(parseChord('C69')).toEqual({ root: 0, quality: '6/9' });
    expect(parseChord('C6/9/E')).toEqual({ root: 0, quality: '6/9', bass: 4 });
    expect(parseChord('C/C')).toEqual({ root: 0, quality: 'maj' });
  });

  it('rejects unknown input', () => {
    expect(parseChord('H7')).toBeNull();
    expect(parseChord('Cfoo')).toBeNull();
    expect(parseChord('')).toBeNull();
  });
});
