import { describe, expect, it } from 'vitest';
import type { Key } from '@/core';
import type { Chord } from '@/core';
import {
  chordSymbol,
  chordTones,
  keyLabel,
  pretty,
  sameChord,
  sameChordFamily,
} from './chordLabel';
import { compressRepeats } from './compress';
import { romanNumeral } from './numeral';
import { suggestNext } from './suggest';

const C_MAJ: Key = { tonic: 0, mode: 'major' };
const F_MAJ: Key = { tonic: 5, mode: 'major' };
const E_MAJ: Key = { tonic: 4, mode: 'major' };

describe('chordLabel', () => {
  it('renders symbols, slash chords and key-aware spelling', () => {
    expect(chordSymbol({ root: 0, quality: 'maj7' })).toBe('Cmaj7');
    expect(chordSymbol({ root: 7, quality: 'maj', bass: 11 })).toBe('G/B');
    expect(chordSymbol({ root: 7, quality: 'maj', bass: 11 }, null, { showSlash: false })).toBe(
      'G',
    );
    expect(chordSymbol({ root: 10, quality: 'maj' }, F_MAJ)).toBe('Bb');
    expect(chordSymbol({ root: 6, quality: 'm7b5' }, E_MAJ)).toBe('F#m7b5');
    expect(chordSymbol({ root: 10, quality: 'maj' }, null, { spellingFollowsKey: false })).toBe(
      'A#',
    );
    expect(keyLabel({ tonic: 3, mode: 'major' })).toBe('Eb major');
    expect(chordTones({ root: 2, quality: 'min7' })).toEqual([2, 5, 9, 0]);
    expect(pretty('Bbm7b5')).toBe('B♭m7♭5');
    expect(pretty('bVII')).toBe('♭VII');
    expect(pretty('F#dim')).toBe('F♯dim');
  });
});

describe('romanNumeral', () => {
  it('handles diatonic, borrowed and minor-key chords', () => {
    expect(romanNumeral({ root: 5, quality: 'maj' }, C_MAJ)).toBe('IV');
    expect(romanNumeral({ root: 9, quality: 'min' }, C_MAJ)).toBe('vi');
    expect(romanNumeral({ root: 7, quality: '7' }, C_MAJ)).toBe('V7');
    expect(romanNumeral({ root: 11, quality: 'dim' }, C_MAJ)).toBe('vii°');
    expect(romanNumeral({ root: 10, quality: 'maj' }, C_MAJ)).toBe('bVII');
    expect(romanNumeral({ root: 0, quality: 'maj' }, { tonic: 9, mode: 'minor' })).toBe('bIII');
  });
});

describe('compressRepeats', () => {
  const eq = (a: string, b: string) => a === b;
  it('compresses repeating cycles and keeps loose items', () => {
    const xs = 'X G D Em C G D Em C G D Em C G'.split(' ');
    const segs = compressRepeats(xs, eq);
    expect(segs.map((s) => [s.items.join(' '), s.repeat, s.start])).toEqual([
      ['X', 1, 0],
      ['G D Em C', 3, 1],
      ['G', 1, 13],
    ]);
  });
  it('folds bass and added-tone changes into one chord with the family equality', () => {
    const C: Chord = { root: 0, quality: 'maj' };
    const Cadd9: Chord = { root: 0, quality: 'add9' };
    const CG: Chord = { root: 0, quality: 'add9', bass: 7 };
    const G: Chord = { root: 7, quality: '7' };
    const G13: Chord = { root: 7, quality: '13' };
    expect(compressRepeats([Cadd9, C, Cadd9, C], sameChordFamily)).toEqual([
      { items: [Cadd9], repeat: 1, start: 0 },
    ]);
    expect(compressRepeats([C, CG, G, G13, Cadd9, G], sameChordFamily)).toEqual([
      { items: [C, G], repeat: 2, start: 0 },
    ]);
    expect(sameChord(C, Cadd9)).toBe(false);
    expect(sameChordFamily(C, { root: 0, quality: '7' })).toBe(false);
    expect(sameChordFamily(C, { root: 0, quality: 'maj7' })).toBe(false);
    expect(sameChordFamily({ root: 2, quality: 'min9' }, { root: 2, quality: 'min7' })).toBe(true);
    expect(sameChordFamily(null, null)).toBe(true);
    expect(sameChordFamily(C, null)).toBe(false);
  });
  it('C F G C F G -> [C F G] x2', () => {
    expect(compressRepeats('C F G C F G'.split(' '), eq)).toEqual([
      { items: ['C', 'F', 'G'], repeat: 2, start: 0 },
    ]);
  });
});

describe('suggestNext', () => {
  it('suggests diatonic moves from I and never repeats the current chord', () => {
    const s = suggestNext(C_MAJ, [{ root: 0, quality: 'maj' }], 1);
    expect(s[0].chord).toEqual({ root: 5, quality: 'maj' });
    expect(s.some((x) => x.chord.root === 0 && x.chord.quality === 'maj')).toBe(false);
    expect(s.every((x) => x.reason.length > 0)).toBe(true);
  });
  it('returns nothing without a key', () => {
    expect(suggestNext(null, [], 2)).toEqual([]);
  });
});
