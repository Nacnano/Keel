import { describe, expect, it } from 'vitest';
import type { KeyEstimate } from '@/core';
import { createKeyEstimator, relativeKey } from './keyEstimator';
import { progressionFrames } from './testing/chromaFromNotes';
import type { Step } from './testing/chromaFromNotes';

const C = ['C3', 'C4', 'E4', 'G4'];
const Am = ['A2', 'A3', 'C4', 'E4'];
const F = ['F2', 'F3', 'A3', 'C4'];
const G = ['G2', 'G3', 'B3', 'D4'];
const Em = ['E2', 'E3', 'G3', 'B3'];
const D = ['D3', 'D4', 'F#4', 'A4'];

const steps = (chords: string[][], seconds = 1.5): Step[] =>
  chords.map((notes) => ({ notes, seconds }));

function run(stepsList: Step[]) {
  const est = createKeyEstimator();
  const events: Array<{ t: number; key: KeyEstimate }> = [];
  for (const f of progressionFrames(stepsList)) {
    const k = est.push(f);
    if (k) events.push({ t: f.t, key: k });
  }
  return { est, events };
}

describe('relativeKey', () => {
  it('maps major <-> relative minor', () => {
    expect(relativeKey({ tonic: 0, mode: 'major' })).toEqual({ tonic: 9, mode: 'minor' });
    expect(relativeKey({ tonic: 9, mode: 'minor' })).toEqual({ tonic: 0, mode: 'major' });
  });
});

describe('keyEstimator', () => {
  it('reports the first key after 1.5 s of evidence, with relative and 3 alternatives', () => {
    const { events } = run(steps([C, Am, F, G]));
    expect(events.length).toBeGreaterThanOrEqual(1);
    const first = events[0];
    expect(first.t).toBeGreaterThanOrEqual(1.5);
    expect(first.t).toBeLessThan(4);
    expect(first.key).toMatchObject({
      tonic: 0,
      mode: 'major',
      relative: { tonic: 9, mode: 'minor' },
    });
    expect(first.key.alternatives).toHaveLength(3);
    const scores = first.key.alternatives.map((a) => a.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(first.key.confidence).toBeGreaterThan(0);
    expect(first.key.confidence).toBeLessThanOrEqual(1);
  });

  it('ignores silence for evidence', () => {
    const est = createKeyEstimator();
    for (let i = 0; i < 100; i++) {
      expect(
        est.push({
          t: i / 23,
          chroma: new Float32Array(12),
          energy: 0,
          bass: null,
          onset: false,
          exact: false,
        }),
      ).toBeNull();
    }
    expect(est.current()).toBeNull();
  });

  it('does not flip on a single out-of-key chord', () => {
    const { events } = run(steps([C, Am, F, G, C, Am, F, G, D, C, Am, F, G, C]));
    expect(events).toHaveLength(1);
    expect(events[0].key).toMatchObject({ tonic: 0, mode: 'major' });
  });

  it('switches C -> G only after sustained evidence', () => {
    const inC = steps([C, Am, F, G, C, Am, F, G]);
    const inG = steps([G, Em, C, D, G, Em, C, D, G, Em, C, D, G, Em, C, D]);
    const gStart = inC.length * 1.5;
    const { events } = run([...inC, ...inG]);
    expect(events.map((e) => [e.key.tonic, e.key.mode])).toEqual([
      [0, 'major'],
      [7, 'major'],
    ]);
    const switchAt = events[1].t;
    // never on the first G chord (or the first bar in G)
    expect(switchAt - gStart).toBeGreaterThan(2);
    expect(events[1].key.relative).toEqual({ tonic: 4, mode: 'minor' });
  });

  it('reset clears history', () => {
    const { est } = run(steps([C, Am, F, G]));
    expect(est.current()).not.toBeNull();
    est.reset();
    expect(est.current()).toBeNull();
  });
});
