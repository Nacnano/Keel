import { describe, expect, it } from 'vitest';
import type { Chord, ChordRecord, KeyRecord } from '@/core';
import { C_MAJOR_KEY, POP_PROGRESSION } from '@/core/mocks';
import { buildChart, cellTime, keySpans, locate } from './chart';

const rec = (t: number, chord: Chord | null): ChordRecord => ({
  id: `c${t}`,
  sessionId: 's',
  t,
  chord,
  confidence: 0.8,
  source: 'mic',
  manual: false,
});
const A_MINOR = { ...C_MAJOR_KEY, tonic: 9 as const, mode: 'minor' as const };
const keyRec = (t: number, key = C_MAJOR_KEY): KeyRecord => ({
  id: `k${t}`,
  sessionId: 's',
  t,
  key,
});

// C G Am F ×2 (2 s each), a no-chord gap, then Dm after the change to A minor.
const chords = [
  ...[0, 1].flatMap((pass) => POP_PROGRESSION.map((c, i) => rec(pass * 8 + i * 2, c))),
  rec(16, null),
  rec(16.5, { root: 2, quality: 'min' }),
];

describe('analyze chart', () => {
  it('compresses repeats and splits blocks at key changes', () => {
    const chart = buildChart(chords, [keyRec(1.5), keyRec(16.2, A_MINOR)], 20);
    expect(chart.items).toHaveLength(9);
    expect(chart.items[7]).toMatchObject({ t: 14, end: 16 });
    expect(chart.blocks).toHaveLength(2);
    expect(chart.blocks[0]).toMatchObject({ t: 0, key: { tonic: 0, mode: 'major' } });
    expect(chart.blocks[0].segments).toHaveLength(1);
    expect(chart.blocks[0].segments[0]).toMatchObject({ repeat: 2, start: 0 });
    expect(chart.blocks[0].segments[0].items).toHaveLength(4);
    expect(chart.blocks[1]).toMatchObject({ t: 16.2, key: { tonic: 9 } });
    expect(chart.blocks[1].segments[0]).toMatchObject({ repeat: 1, start: 8 });
  });

  it('merges identical chords across a no-chord gap', () => {
    const c = POP_PROGRESSION[0];
    const chart = buildChart([rec(0, c), rec(1, null), rec(1.2, c), rec(3, null)], [], 4);
    expect(chart.items).toEqual([{ chord: c, t: 0, end: 3, index: 0 }]);
    expect(chart.blocks).toEqual([
      { key: null, t: 0, segments: [{ items: chart.items, repeat: 1, start: 0 }] },
    ]);
  });

  it('locates the playhead cell and pass, null in gaps', () => {
    const chart = buildChart(chords, [keyRec(1.5)], 20);
    expect(locate(chart, -1)).toBeNull();
    expect(locate(chart, 2.5)).toMatchObject({ block: 0, segment: 0, cell: 1, pass: 1 });
    expect(locate(chart, 13)).toMatchObject({ block: 0, segment: 0, cell: 2, pass: 2 });
    expect(locate(chart, 16.2)).toBeNull();
    expect(locate(chart, 17)).toMatchObject({ segment: 1, cell: 0, pass: 1 });
    const seg = chart.blocks[0].segments[0];
    expect(cellTime(chart, seg, 2)).toBe(4);
    expect(cellTime(chart, seg, 2, 2)).toBe(12);
    expect(cellTime(chart, seg, 2, 9)).toBe(12);
  });

  it('key spans cover the whole file', () => {
    const spans = keySpans([keyRec(1.5), keyRec(3, C_MAJOR_KEY), keyRec(16.2, A_MINOR)], 20);
    expect(spans.map((s) => [s.start, s.end])).toEqual([
      [0, 16.2],
      [16.2, 20],
    ]);
  });
});
