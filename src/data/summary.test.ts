import { describe, expect, it } from 'vitest';
import type { ChordRecord, KeyRecord, Marker } from '@/core/session';
import type { Chord, KeyEstimate } from '@/core/types';
import {
  C_MAJOR_KEY,
  JAZZ_PROGRESSION,
  POP_PROGRESSION,
  mockChordRecords,
  mockMarkers,
} from '@/core/mocks';
import { computeSummary, topProgressions } from './summary';
import { canonicalRotation, findCycles } from './cycles';
import { chordSymbol } from './chordSymbol';
import { perfBudget } from '@/core/testing/perf';

const A_MINOR_KEY: KeyEstimate = {
  tonic: 9,
  mode: 'minor',
  confidence: 0.7,
  relative: { tonic: 0, mode: 'major' },
  alternatives: [],
};

function records(chords: Array<Chord | null>, stepSec = 1, t0 = 0): ChordRecord[] {
  return chords.map((chord, i) => ({
    id: `c${i}`,
    sessionId: 's',
    t: t0 + i * stepSec,
    chord,
    confidence: 0.9,
    source: 'mic',
    manual: false,
  }));
}

const repeat = <T>(xs: T[], n: number): T[] => Array.from({ length: n }, () => xs).flat();
const names = (cs: Chord[]) => cs.map((c) => chordSymbol(c)).join(' ');

describe('findCycles', () => {
  it('finds the longest-coverage cycle with the shortest period', () => {
    const seq = [...repeat(['C', 'G', 'Am', 'F'], 3), 'Dm', 'E'];
    expect(findCycles(seq)).toEqual([{ start: 0, period: 4, repeats: 3 }]);
  });

  it('prefers the primitive period (C G C G C G is period 2)', () => {
    expect(findCycles(repeat(['C', 'G'], 4))).toEqual([{ start: 0, period: 2, repeats: 4 }]);
  });

  it('ignores single passes', () => {
    expect(findCycles(['C', 'G', 'Am', 'F', 'Dm', 'G'])).toEqual([]);
  });

  it('canonicalRotation is rotation-invariant', () => {
    expect(canonicalRotation(['C', 'G', 'Am', 'F'])).toBe(canonicalRotation(['Am', 'F', 'C', 'G']));
  });
});

describe('computeSummary', () => {
  it('computes seconds per key across a modulation', () => {
    const keys: KeyRecord[] = [
      { id: 'k0', sessionId: 's', t: 0, key: C_MAJOR_KEY },
      { id: 'k1', sessionId: 's', t: 155, key: A_MINOR_KEY },
      { id: 'k2', sessionId: 's', t: 200, key: C_MAJOR_KEY },
    ];
    const s = computeSummary([], keys, [], 300);
    expect(s.keys).toEqual([
      { key: { tonic: 0, mode: 'major' }, seconds: 255 },
      { key: { tonic: 9, mode: 'minor' }, seconds: 45 },
    ]);
  });

  it('returns no key seconds when there are no key records', () => {
    expect(computeSummary([], [], [], 120).keys).toEqual([]);
  });

  it('detects top repeating progressions and merges rotations', () => {
    const pop = POP_PROGRESSION;
    const rotated = [pop[2], pop[3], pop[0], pop[1]];
    const jazz = JAZZ_PROGRESSION.slice(0, 3);
    const seq = [
      ...repeat(pop, 4),
      ...repeat(jazz, 2),
      null, // a gap does not break chord identity
      ...repeat(rotated, 2),
      { root: 4, quality: 'min' } as Chord,
    ];
    const top = topProgressions(records(seq));
    expect(top.map((p) => [names(p.chords), p.count])).toEqual([
      ['C G Am F', 6],
      ['Dm7 G7 Cmaj7', 2],
    ]);
  });

  it('matches the mock fixtures (12 cycles of the pop progression)', () => {
    const s = computeSummary(
      mockChordRecords(),
      [{ id: 'k', sessionId: 's', t: 0, key: C_MAJOR_KEY }],
      mockMarkers(),
      72,
    );
    expect(s).toEqual({
      keys: [{ key: { tonic: 0, mode: 'major' }, seconds: 72 }],
      topProgressions: [{ chords: POP_PROGRESSION, count: 12 }],
      chordCount: 48,
      bookmarks: 1,
    });
  });

  it('counts non-null chords and bookmarks only', () => {
    const markers: Marker[] = [
      { id: 'm0', sessionId: 's', t: 0, kind: 'intro' },
      { id: 'm1', sessionId: 's', t: 1, kind: 'bookmark' },
      { id: 'm2', sessionId: 's', t: 2, kind: 'bookmark', label: 'x' },
    ];
    const s = computeSummary(
      records([POP_PROGRESSION[0], null, POP_PROGRESSION[1]]),
      [],
      markers,
      3,
    );
    expect(s.chordCount).toBe(2);
    expect(s.bookmarks).toBe(2);
  });

  it('summarises 5,000 chords in well under 200 ms', () => {
    const many = records(repeat([...POP_PROGRESSION, ...JAZZ_PROGRESSION], 625));
    const t = performance.now();
    computeSummary(many, [], [], 5000);
    expect(performance.now() - t).toBeLessThan(perfBudget(200));
  });
});
