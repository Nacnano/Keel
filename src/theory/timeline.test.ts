import { describe, expect, it } from 'vitest';
import type { Chord } from '@/core';
import { chordKey, chordSymbol, parseChord, sameChord } from './chordName';
import {
  canonicalRotation,
  collapseRuns,
  compressRepeats,
  compressTimeline,
  expandTimeline,
  findCycles,
} from './timeline';
import type { Segment } from './timeline';

const seq = (s: string): Chord[] =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => {
      const c = parseChord(x);
      if (!c) throw new Error(x);
      return c;
    });

/** "[C F G]x2 [Am]" style rendering for compact assertions. */
const show = (segs: Segment[]) =>
  segs
    .map(
      (s) =>
        `[${s.chords.map((c) => chordSymbol(c)).join(' ')}]${s.repeat > 1 ? `x${s.repeat}` : ''}`,
    )
    .join(' ');

describe('compressTimeline', () => {
  it('C F G C F G -> [C F G] x2', () => {
    expect(compressTimeline(seq('C F G C F G'))).toEqual([{ chords: seq('C F G'), repeat: 2 }]);
  });

  it('merges consecutive duplicates first', () => {
    expect(show(compressTimeline(seq('C C F F F G C F G G')))).toBe('[C F G]x2');
    expect(show(compressTimeline(seq('C C C C')))).toBe('[C]');
  });

  it('keeps a non-repeating tail and head', () => {
    expect(show(compressTimeline(seq('C F G C F G Am')))).toBe('[C F G]x2 [Am]');
    expect(show(compressTimeline(seq('Em C F G C F G')))).toBe('[Em] [C F G]x2');
    expect(show(compressTimeline(seq('C F G Am')))).toBe('[C F G Am]');
  });

  it('counts many repeats', () => {
    expect(show(compressTimeline(seq('G D Em C '.repeat(4))))).toBe('[G D Em C]x4');
  });

  it('prefers the cycle that starts earliest on ties', () => {
    expect(show(compressTimeline(seq('C F G C F G C')))).toBe('[C F G]x2 [C]');
  });

  it('prefers the longer cycle when it covers more', () => {
    expect(show(compressTimeline(seq('C F C F G C F C F G')))).toBe('[C F C F G]x2');
    // the short cycle alone is shown when it is all there is
    expect(show(compressTimeline(seq('C F C F C F')))).toBe('[C F]x3');
  });

  it('finds cycles of length 1–8 but not 9', () => {
    const eight = 'C Dm Em F G Am Bdim Cmaj7';
    expect(show(compressTimeline(seq(`${eight} ${eight}`)))).toBe(`[${eight}]x2`);
    const nine = `${eight} G7`;
    expect(compressTimeline(seq(`${nine} ${nine}`))).toHaveLength(1);
    expect(compressTimeline(seq(`${nine} ${nine}`))[0].repeat).toBe(1);
  });

  it('distinguishes slash chords', () => {
    expect(show(compressTimeline(seq('C C/E C C/E')))).toBe('[C C/E]x2');
  });

  it('handles empty input', () => {
    expect(compressTimeline([])).toEqual([]);
  });

  it('expandTimeline inverts compression (seeded random sequences)', () => {
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff), s / 0x7fffffff);
    const pool = seq('C F G Am Dm Em');
    for (let run = 0; run < 200; run++) {
      const n = Math.floor(rnd() * 30);
      const base = Array.from(
        { length: 1 + Math.floor(rnd() * 4) },
        () => pool[Math.floor(rnd() * 6)],
      );
      const xs: Chord[] = [];
      while (xs.length < n)
        xs.push(rnd() < 0.7 ? base[xs.length % base.length] : pool[Math.floor(rnd() * 6)]);
      const segs = compressTimeline(xs);
      expect(expandTimeline(segs)).toEqual(collapseRuns(xs, sameChord));
      for (const sg of segs) expect(sg.repeat).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('compressRepeats (generic)', () => {
  it('reports start indices and allows length-1 cycles', () => {
    expect(compressRepeats(['a', 'a', 'a', 'b', 'c', 'b', 'c'], (x, y) => x === y)).toEqual([
      { items: ['a'], repeat: 3, start: 0 },
      { items: ['b', 'c'], repeat: 2, start: 3 },
    ]);
    expect(compressRepeats(['x', 'y', 'z'], (a, b) => a === b)).toEqual([
      { items: ['x', 'y', 'z'], repeat: 1, start: 0 },
    ]);
  });

  it('works on records with a custom equality', () => {
    const recs = seq('C G C G Am').map((chord, i) => ({ id: i, chord }));
    const segs = compressRepeats(recs, (a, b) => sameChord(a.chord, b.chord));
    expect(segs.map((s) => [s.items.map((r) => r.id), s.repeat, s.start])).toEqual([
      [[0, 1], 2, 0],
      [[4], 1, 4],
    ]);
  });

  it('respects maxCycle and minCycle', () => {
    const xs = ['a', 'b', 'c', 'a', 'b', 'c'];
    expect(compressRepeats(xs, Object.is, 2)).toEqual([{ items: xs, repeat: 1, start: 0 }]);
    expect(compressRepeats(['a', 'a', 'b'], Object.is, 8, 2)).toEqual([
      { items: ['a', 'a', 'b'], repeat: 1, start: 0 },
    ]);
  });
});

describe('collapseRuns / findCycles / canonicalRotation', () => {
  it('collapseRuns with a key function or an equality', () => {
    expect(collapseRuns(['a', 'a', 'b', 'a'], (x) => x)).toEqual(['a', 'b', 'a']);
    expect(collapseRuns(seq('C C/E C/E G'), chordKey).map((c) => chordSymbol(c))).toEqual([
      'C',
      'C/E',
      'G',
    ]);
    expect(collapseRuns([1, 1, 2], (a: number, b: number) => a === b)).toEqual([1, 2]);
  });

  it('findCycles over string keys', () => {
    const keys = 'C G Am F C G Am F Dm G'.split(' ');
    expect(findCycles(keys)).toEqual([{ start: 0, period: 4, repeats: 2 }]);
    expect(findCycles('a b a b a b c'.split(' '))).toEqual([{ start: 0, period: 2, repeats: 3 }]);
    expect(findCycles('a b c'.split(' '))).toEqual([]);
    // period 1 is excluded by default
    expect(findCycles('a a a'.split(' '))).toEqual([]);
  });

  it('canonicalRotation is rotation invariant', () => {
    expect(canonicalRotation(['C', 'G', 'Am', 'F'])).toBe(canonicalRotation(['Am', 'F', 'C', 'G']));
    expect(canonicalRotation([])).toBe('');
  });
});
