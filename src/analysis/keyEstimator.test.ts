import { describe, expect, it } from 'vitest';
import type { Chord, KeyEstimate } from '@/core';
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

  it('does not flip to the relative minor on a vi-heavy stretch', () => {
    const { events } = run(steps([C, G, Am, F, Am, F, C, G, Am, F, C, G, Am, F, C, G]));
    expect(events.map((e) => [e.key.tonic, e.key.mode])).toEqual([[0, 'major']]);
  });
});

// ---------------------------------------------------------------- round 2: hysteresis

const E = ['E2', 'E3', 'G#3', 'B3'];
const A = ['A2', 'A3', 'C#4', 'E4'];
const B = ['B2', 'B3', 'D#4', 'F#4'];
const CsM = ['C#3', 'C#4', 'E4', 'G#4'];
const Dm = ['D3', 'D4', 'F4', 'A4'];
const Gm = ['G2', 'G3', 'Bb3', 'D4'];
const A7 = ['A2', 'A3', 'C#4', 'G4'];
const Ab = ['Ab2', 'Ab3', 'C4', 'Eb4'];
const Fm = ['F2', 'F3', 'Ab3', 'C4'];
const Bbm = ['Bb2', 'Bb3', 'Db4', 'F4'];
const Db = ['Db3', 'Db4', 'F4', 'Ab4'];
const Eb = ['Eb3', 'Eb4', 'G4', 'Bb4'];

const pc = (name: string) => ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[name[0]]!;

/** Frames plus the chord stream the engine would show (one chord per step). */
function runWithChords(stepsList: Step[], chordOf: (notes: string[]) => Chord) {
  const events: Array<{ t: number; key: KeyEstimate; since: number | null }> = [];
  // the chord of each step is observed when its first frame arrives
  const est2 = createKeyEstimator();
  const starts: number[] = [];
  let acc = 0;
  for (const s of stepsList) {
    starts.push(acc);
    acc += s.seconds;
  }
  let next = 0;
  for (const f of progressionFrames(stepsList)) {
    while (next < starts.length && starts[next] <= f.t + 1e-9) {
      est2.observeChord(starts[next], chordOf(stepsList[next].notes));
      next++;
    }
    const k = est2.push(f);
    if (k) events.push({ t: f.t, key: k, since: est2.since() });
  }
  return { est: est2, events };
}

/** Root position triads: the lowest note's letter (and accidental) names the root. */
const NAMED: Array<[string[], Chord]> = [
  [C, { root: 0, quality: 'maj' }],
  [Am, { root: 9, quality: 'min' }],
  [F, { root: 5, quality: 'maj' }],
  [G, { root: 7, quality: 'maj' }],
  [Em, { root: 4, quality: 'min' }],
  [D, { root: 2, quality: 'maj' }],
  [E, { root: 4, quality: 'maj' }],
  [A, { root: 9, quality: 'maj' }],
  [B, { root: 11, quality: 'maj' }],
  [CsM, { root: 1, quality: 'min' }],
  [Dm, { root: 2, quality: 'min' }],
  [Gm, { root: 7, quality: 'min' }],
  [A7, { root: 9, quality: '7' }],
  [Ab, { root: 8, quality: 'maj' }],
  [Fm, { root: 5, quality: 'min' }],
  [Bbm, { root: 10, quality: 'min' }],
  [Db, { root: 1, quality: 'maj' }],
  [Eb, { root: 3, quality: 'maj' }],
];
const chordOf = (notes: string[]): Chord => {
  const hit = NAMED.find(([n]) => n === notes);
  if (!hit) throw new Error(`unnamed chord ${notes.join(' ')} (${pc(notes[0])})`);
  return hit[1];
};
const path = (events: Array<{ key: KeyEstimate }>) =>
  events.map((e) => `${e.key.tonic}${e.key.mode === 'major' ? 'M' : 'm'}`);

describe('keyEstimator: settled key', () => {
  it('holds E major through a 12 s stretch that leans on A (IV) after settling', () => {
    const inE = steps([E, B, CsM, A, E, B, CsM, A, E, B, CsM, A], 1.5);
    const onA = steps([A, E, D, A, A, E, D, A], 1.5);
    const { events } = runWithChords([...inE, ...onA, ...inE], chordOf);
    expect(path(events)).toEqual(['4M']);
  });

  it('a genuine new song re-estimates from the recent window, not 15 s later', () => {
    const inC = steps([C, G, Am, F, C, G, Am, F, C, G, Am, F, C, G, Am, F, C, G, Am, F], 1.5);
    const inAb = steps([Fm, Ab, Bbm, Eb, Fm, Ab, Db, Eb, Fm, Ab, Bbm, Eb, Fm, Ab, Db, Eb], 1.5);
    const change = inC.length * 1.5;
    const { events } = runWithChords([...inC, ...inAb], chordOf);
    expect(path(events)[0]).toBe('0M');
    expect(events.filter((e) => e.t < change)).toHaveLength(1);
    const ab = events.findIndex((e) => e.key.tonic === 8 && e.key.mode === 'major');
    expect(ab, path(events).join(' ')).toBeGreaterThan(0);
    expect(ab).toBe(events.length - 1);
    expect(events[ab].t - change).toBeLessThan(10);
    // never the old tonic's minor (C minor), the usual neighbour of a C → A♭ change
    expect(path(events)).not.toContain('0m');
    // the new song's key is drawn from where it started, not from where it was decided
    const first = events[1];
    expect(first.since!).toBeLessThan(first.t);
    expect(first.since!).toBeGreaterThan(change - 3);
  });
});

describe('keyEstimator: relative major / minor', () => {
  it('reads a minor key with a V7 → i cadence as minor within a few seconds', () => {
    const { events } = runWithChords(
      steps([A7, Dm, Gm, A7, Dm, Gm, A7, Dm, Gm, A7, Dm], 1.5),
      chordOf,
    );
    const minor = events.find((e) => e.key.tonic === 2 && e.key.mode === 'minor');
    expect(minor, path(events).join(' ')).toBeDefined();
    expect(minor!.t).toBeLessThan(6);
    expect(path(events).at(-1)).toBe('2m');
  });

  it('settles on the major of a relative pair without a minor cadence (vi IV I V)', () => {
    const { events } = runWithChords(
      steps([Am, F, C, G, Am, F, C, G, Am, F, C, G, Am, F, C, G], 1.5),
      chordOf,
    );
    // a lone Am chord may read A minor for a moment; the loop is in C major
    expect(path(events).at(-1)).toBe('0M');
    expect(events.at(-1)!.t).toBeLessThan(5);
  });

  it('a song in A♭ with F minor and B♭ minor chords stays A♭ major', () => {
    const { events } = runWithChords(
      steps([Fm, Ab, Bbm, Eb, Fm, Ab, Db, Eb, Fm, Ab, Bbm, Eb, Fm, Ab, Db, Eb], 1.5),
      chordOf,
    );
    expect(path(events).at(-1)).toBe('8M');
    expect(events.at(-1)!.t).toBeLessThan(5);
  });
});

describe('keyEstimator: since and reset', () => {
  it('dates the first key from the first sound', () => {
    const { events } = runWithChords(steps([C, Am, F, G]), chordOf);
    expect(events[0].since).toBe(0);
  });
});
