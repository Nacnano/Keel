import { describe, expect, it } from 'vitest';
import type { Chord, Key, VocabLevel } from '@/core';
import { chordKey, chordSymbol, chordTones, parseChord } from './chordName';
import { MAX_SUGGESTIONS, suggestNext } from './suggest';
import { CHORD_TEMPLATES } from './vocab';

const C: Key = { tonic: 0, mode: 'major' };
const Am: Key = { tonic: 9, mode: 'minor' };

const ch = (s: string): Chord => {
  const c = parseChord(s);
  if (!c) throw new Error(s);
  return c;
};
const names = (k: Key, recent: string[], level: VocabLevel, max?: number) =>
  suggestNext(k, recent.map(ch), level, max).map((s) => chordSymbol(s.chord, k));

describe('suggestNext: deterministic rankings in C major', () => {
  it('after I', () => {
    expect(names(C, ['C'], 1).slice(0, 4)).toEqual(['F', 'G', 'Am', 'Dm']);
    expect(names(C, ['C'], 2).slice(0, 4)).toEqual(['F', 'G7', 'Am', 'Dm']);
    expect(names(C, ['Cmaj7'], 3).slice(0, 4)).toEqual(['Fmaj7', 'G7', 'Am7', 'Dm7']);
  });

  it('after vi', () => {
    expect(names(C, ['Am'], 1).slice(0, 3)).toEqual(['F', 'Dm', 'G']);
    expect(names(C, ['Am'], 2).slice(0, 3)).toEqual(['F', 'Dm', 'G7']);
  });

  it('after ii: the V comes first', () => {
    expect(names(C, ['Dm'], 1)[0]).toBe('G');
    expect(names(C, ['Dm7'], 2)[0]).toBe('G7');
    expect(names(C, ['Dm7'], 3).slice(0, 2)).toEqual(['G7', 'Db7']);
  });

  it('after V: back home first, deceptive vi second', () => {
    expect(names(C, ['G'], 1).slice(0, 2)).toEqual(['C', 'Am']);
    expect(names(C, ['G7'], 2).slice(0, 2)).toEqual(['C', 'Am']);
    expect(names(C, ['G7'], 3).slice(0, 2)).toEqual(['Cmaj7', 'Am7']);
  });

  it('a secondary dominant resolves to its target', () => {
    expect(names(C, ['E7'], 2)[0]).toBe('Am');
    expect(names(C, ['A7'], 2)[0]).toBe('Dm');
  });

  it('a borrowed chord heads home', () => {
    expect(names(C, ['Fm'], 2)).toContain('C');
    expect(names(C, ['Bb'], 1).slice(0, 3)).toContain('C');
  });

  it('is deterministic and independent of earlier history copies', () => {
    for (const level of [1, 2, 3] as VocabLevel[]) {
      for (const last of ['C', 'Am', 'Dm', 'G', 'F', 'Em', 'E7', 'Bb']) {
        const a = suggestNext(C, [ch('C'), ch(last)], level);
        const b = suggestNext(C, [ch('C'), ch(last)], level);
        expect(a).toEqual(b);
      }
    }
  });
});

describe('suggestNext: invariants', () => {
  const contexts = ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim', 'G7', 'Dm7', 'Cmaj7', 'E7', 'Fm'];
  for (const level of [1, 2, 3] as VocabLevel[]) {
    it(`level ${level}: never the current chord, unique, at most 8, within the level`, () => {
      for (const last of contexts) {
        const cur = ch(last);
        const out = suggestNext(C, [cur], level);
        expect(out.length).toBeGreaterThan(0);
        expect(out.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
        const ids = out.map((s) => chordKey(s.chord));
        expect(new Set(ids).size).toBe(ids.length);
        for (const s of out) {
          expect(s.chord.root === cur.root && s.chord.quality === cur.quality, last).toBe(false);
          expect(CHORD_TEMPLATES[s.chord.quality].level).toBeLessThanOrEqual(level);
          expect(s.reason.length).toBeGreaterThan(5);
        }
      }
    });
  }

  it('drops same-root subsets of the current chord but keeps colour changes', () => {
    const afterDm7 = names(C, ['Dm7'], 2, 30);
    expect(afterDm7).not.toContain('Dm');
    const afterC = names(C, ['C'], 2, 30);
    expect(afterC).toContain('C7'); // V7/IV
    const afterF = names(C, ['F'], 2, 30);
    expect(afterF).toContain('Fm'); // borrowed iv
  });

  it('respects max and returns [] without a key', () => {
    expect(suggestNext(C, [ch('C')], 2, 3)).toHaveLength(3);
    expect(suggestNext(null, [ch('C')], 2)).toEqual([]);
  });

  it('works without history (tonic context)', () => {
    expect(names(C, [], 1).slice(0, 3)).toEqual(['F', 'G', 'Am']);
  });
});

describe('suggestNext: sources', () => {
  it('borrowed iv / bVII / bVI in major', () => {
    const all = names(C, ['F'], 2, 40);
    expect(all).toEqual(expect.arrayContaining(['Fm', 'Bb', 'Ab']));
    expect(names(C, ['F'], 2).slice(0, 3)).toContain('Fm'); // IV -> iv
  });

  it('secondary dominants of the likely next chord', () => {
    expect(names(C, ['C'], 2)).toEqual(expect.arrayContaining(['C7', 'E7']));
    expect(names(C, ['C'], 1)).toContain('E');
    // at level 1 V/IV would be the tonic triad itself, so it is not offered as a dominant
    expect(suggestNext(C, [ch('Am')], 1).find((s) => s.reason.startsWith('V/IV'))).toBeUndefined();
  });

  it('ii–V setups', () => {
    const afterEm7 = suggestNext(C, [ch('Em7')], 2, 40);
    expect(afterEm7.map((s) => chordSymbol(s.chord, C))).toContain('A7');
    expect(afterEm7.some((s) => s.reason.includes('ii–V'))).toBe(true);
  });

  it('tritone substitutes only at level 3', () => {
    const isSub = (c: Chord) => c.root === 1 && c.quality === '7';
    for (const level of [1, 2] as VocabLevel[]) {
      for (const last of ['Dm7', 'G7', 'C']) {
        expect(suggestNext(C, [ch(last)], level, 40).some((s) => isSub(s.chord))).toBe(false);
      }
    }
    expect(suggestNext(C, [ch('G7')], 3).some((s) => isSub(s.chord))).toBe(true);
    // the sub of a secondary dominant too
    expect(names(C, ['E7'], 3, 40)).toContain('Bb7');
  });

  it('level shapes the qualities', () => {
    for (const s of suggestNext(C, [ch('C')], 1, 40)) {
      expect(chordTones(s.chord).length).toBe(3);
    }
    expect(names(C, ['Dm'], 2)).toContain('G7');
    expect(names(C, ['Dm7'], 3)).toContain('Bm7b5');
  });
});

describe('suggestNext: minor keys', () => {
  it('A minor', () => {
    expect(names(Am, ['Am'], 1).slice(0, 4)).toEqual(['Dm', 'F', 'G', 'E']);
    expect(names(Am, ['Dm'], 2)[0]).toBe('E7');
    expect(names(Am, ['E7'], 2)[0]).toBe('Am');
    const all = names(Am, ['Am'], 2, 40);
    expect(all).toContain('E7');
    expect(all).not.toContain('Am');
    expect(names(Am, ['E7'], 3, 40)).toContain('Bb7'); // bII7 tritone sub
  });
});
