import { describe, expect, it } from 'vitest';
import type { AnalysisEvent, Chord } from '@/core/types';
import { noteNumber, synthProgression } from '@/core/testing/synth';
import { analyseSamplesToEvents, dropShortChords, headlineKey, type OfflineStage } from './offline';

const SR = 44100;
const STEP = 2;
const notes = (...names: string[]) => names.map(noteNumber);

// C – G – Am – F, root position with the bass an octave down, twice: 16 s.
const PROGRESSION = [
  { notes: notes('C3', 'C4', 'E4', 'G4'), seconds: STEP },
  { notes: notes('G2', 'B3', 'D4', 'G4'), seconds: STEP },
  { notes: notes('A2', 'C4', 'E4', 'A4'), seconds: STEP },
  { notes: notes('F2', 'A3', 'C4', 'F4'), seconds: STEP },
];
const EXPECTED: Chord[] = [
  { root: 0, quality: 'maj' },
  { root: 7, quality: 'maj' },
  { root: 9, quality: 'min' },
  { root: 5, quality: 'maj' },
];

const song = () =>
  synthProgression([...PROGRESSION, ...PROGRESSION], { sampleRate: SR, decay: 0.3 });

type ChordEvent = Extract<AnalysisEvent, { type: 'chord' }>;
const chordsOf = (events: AnalysisEvent[]) =>
  events.filter((e): e is ChordEvent => e.type === 'chord');
const label = (c: Chord | null) => (c ? `${c.root}:${c.quality}${c.bass ?? ''}` : 'N.C.');

describe('analyseSamplesToEvents', () => {
  it('finds the key and the chord sequence of a synthesised 4-chord progression', async () => {
    const samples = song();
    const res = await analyseSamplesToEvents(samples, SR, { vocabLevel: 1 });
    expect(res.sampleRate).toBe(SR);
    expect(res.durationSec).toBeCloseTo(samples.length / SR, 6);
    expect(res.events.every((e) => e.type === 'chord' || e.type === 'key')).toBe(true);
    expect(res.events.map((e) => e.t)).toEqual(
      [...res.events.map((e) => e.t)].sort((a, b) => a - b),
    );

    const chords = chordsOf(res.events);
    const sequence = chords.filter((c) => c.chord).map((c) => label(c.chord));
    expect(sequence).toEqual([...EXPECTED, ...EXPECTED].map(label));

    // Each change lands within 0.3 s of where it is in the audio.
    const named = chords.filter((c) => c.chord);
    named.forEach((c, i) => expect(Math.abs(c.t - i * STEP)).toBeLessThan(0.3));
    // The tail flush reports the end of the last chord.
    expect(chords[chords.length - 1].chord).toBeNull();
    expect(chords[chords.length - 1].t).toBeLessThanOrEqual(res.durationSec);

    const keys = res.events.filter((e) => e.type === 'key');
    expect(keys.length).toBeGreaterThan(0);
    const last = keys[keys.length - 1];
    expect(last.type === 'key' && { tonic: last.key.tonic, mode: last.key.mode }).toEqual({
      tonic: 0,
      mode: 'major',
    });
  });

  it('keeps chord roots at the 7ths level', async () => {
    const res = await analyseSamplesToEvents(song(), SR, { vocabLevel: 2 });
    const roots = chordsOf(res.events)
      .filter((c) => c.chord)
      .map((c) => c.chord!.root);
    expect(roots).toEqual([0, 7, 9, 5, 0, 7, 9, 5]);
  });

  it('reports progress in order and yields between chunks', async () => {
    const calls: Array<[number, OfflineStage]> = [];
    let ticks = 0;
    const timer = setInterval(() => ticks++, 0);
    try {
      await analyseSamplesToEvents(song(), SR, {
        chunkFrames: 32,
        onProgress: (f, stage) => calls.push([f, stage]),
      });
    } finally {
      clearInterval(timer);
    }
    expect(calls[0]).toEqual([0, 'analysing']);
    expect(calls[calls.length - 1]).toEqual([1, 'analysing']);
    expect(calls.length).toBeGreaterThan(5);
    const fractions = calls.map((c) => c[0]);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
    expect(ticks).toBeGreaterThan(0);
  });

  it('stops with an AbortError when the signal fires', async () => {
    const ctrl = new AbortController();
    const p = analyseSamplesToEvents(song(), SR, {
      chunkFrames: 16,
      signal: ctrl.signal,
      onProgress: (f) => f > 0.2 && ctrl.abort(),
    });
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('silence gives no chords and no key', async () => {
    const res = await analyseSamplesToEvents(new Float32Array(SR * 3), SR);
    expect(res.events.filter((e) => e.type === 'chord' && e.chord)).toEqual([]);
    expect(res.events.filter((e) => e.type === 'key')).toEqual([]);
    expect(res.durationSec).toBeCloseTo(3, 6);
  });
});

describe('dropShortChords', () => {
  const C: Chord = { root: 0, quality: 'maj' };
  const CG: Chord = { root: 0, quality: 'maj', bass: 7 };
  const G: Chord = { root: 7, quality: 'maj' };
  const ev = (t: number, chord: Chord | null): AnalysisEvent => ({
    type: 'chord',
    t,
    chord,
    confidence: 0.8,
    source: 'mic',
  });

  it('folds a transition blip into the chord before it', () => {
    const out = dropShortChords([ev(0, C), ev(1.95, CG), ev(2, G)], 0.2, 4);
    expect(chordsOf(out).map((e) => [e.t, label(e.chord)])).toEqual([
      [0, label(C)],
      [2, label(G)],
    ]);
  });

  it('merges the neighbours of a dropped gap and keeps key events and the last chord', () => {
    const key: AnalysisEvent = {
      type: 'key',
      t: 1,
      key: {
        tonic: 0,
        mode: 'major',
        confidence: 0.5,
        relative: { tonic: 9, mode: 'minor' },
        alternatives: [],
      },
    };
    const out = dropShortChords([ev(0, C), key, ev(2, null), ev(2.1, C), ev(3.9, G)], 0.2, 4);
    expect(out.map((e) => (e.type === 'chord' ? label(e.chord) : 'key'))).toEqual([
      label(C),
      'key',
      label(G),
    ]);
  });

  it('is a copy when disabled', () => {
    const input = [ev(0, C), ev(0.05, G)];
    expect(dropShortChords(input, 0, 1)).toEqual(input);
  });
});

describe('headlineKey', () => {
  const key = (
    t: number,
    tonic: number,
    mode: 'major' | 'minor',
    confidence = 0.6,
  ): AnalysisEvent =>
    ({
      type: 'key',
      t,
      key: { tonic, mode, confidence, relative: { tonic, mode }, alternatives: [] },
    }) as AnalysisEvent;

  it('picks the key that covers the most time, not the first one', () => {
    // B♭ minor for the first 7 s, A♭ major for the remaining 92 s.
    const events = [key(2, 10, 'minor'), key(7, 8, 'major', 0.5), key(40, 8, 'major', 0.9)];
    expect(headlineKey(events, 99)).toMatchObject({ tonic: 8, mode: 'major', confidence: 0.9 });
  });

  it('sums separate stretches of the same key and handles no keys', () => {
    const events = [key(0, 0, 'major'), key(10, 7, 'major'), key(25, 0, 'major')];
    expect(headlineKey(events, 30)).toMatchObject({ tonic: 0, mode: 'major' });
    expect(headlineKey([], 30)).toBeNull();
  });
});
