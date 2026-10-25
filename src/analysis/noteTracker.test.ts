import { describe, expect, it } from 'vitest';
import { createNoteTracker, createPlayedNoteTracker } from './noteTracker';
import { createAnalysisEngine } from './engine';
import type { AnalysisEvent } from '@/core';

const chroma = (strength: number, pc = 0) => {
  const bins = new Float32Array(12);
  bins[pc] = strength;
  return bins;
};

describe('microphone note display', () => {
  it.each([44100, 48000])('rejects spikes and bridges dropouts at %i Hz', (rate) => {
    const tracker = createNoteTracker();
    const hop = 2048 / rate;
    expect(tracker.push(0, chroma(0.4))).toEqual([]);
    expect(tracker.push(hop, chroma(0))).toEqual([]);
    let t = 2 * hop;
    const start = t;
    while (t - start < 0.12) {
      expect(tracker.push(t, chroma(0.4))).toEqual([]);
      t += hop;
    }
    expect(tracker.push(t, chroma(0.4))).toEqual([0]);
    // A held note can wobble around the old 0.08 threshold without flickering.
    for (let i = 0; i < 50; i++) {
      t += hop;
      expect(tracker.push(t, chroma(i % 2 ? 0.07 : 0.09))).toEqual([0]);
    }
    t += hop;
    expect(tracker.push(t, chroma(0), true)).toEqual([0]);
    t += hop;
    expect(tracker.push(t, chroma(0.3))).toEqual([0]);
    t += hop;
    const release = t;
    while (t - release < 0.24) {
      expect(tracker.push(t, chroma(0), true)).toEqual([0]);
      t += hop;
    }
    expect(tracker.push(t, chroma(0), true)).toEqual([]);
    expect(t - release).toBeLessThan(0.24 + hop);
  });

  it('does not accumulate separate brief note attacks', () => {
    const tracker = createNoteTracker();
    for (let i = 0; i < 100; i++) {
      expect(tracker.push(i * 0.043, chroma(i % 2 ? 0.05 : 0.4))).toEqual([]);
    }
  });

  it('confirms a new note promptly while allowing the previous note to release', () => {
    const tracker = createNoteTracker();
    tracker.push(0, chroma(0.4));
    expect(tracker.push(0.13, chroma(0.4))).toEqual([0]);
    expect(tracker.push(0.2, chroma(0.4, 7))).toEqual([0]);
    expect(tracker.push(0.33, chroma(0.4, 7))).toEqual([0, 7]);
    expect(tracker.push(0.45, chroma(0.4, 7))).toEqual([7]);
  });

  it('clears held notes and confirmations on reset or an interrupted stream', () => {
    const tracker = createNoteTracker();
    tracker.push(0, chroma(0.4));
    tracker.push(0.13, chroma(0.4));
    tracker.reset();
    expect(tracker.push(0, chroma(0.4))).toEqual([]);
    expect(tracker.push(0.13, chroma(0.4))).toEqual([0]);
    expect(tracker.push(2, chroma(0.4))).toEqual([]);
    expect(tracker.push(0, chroma(0.4))).toEqual([]);
  });

  it('reports the exact key separately from the chord pitch classes', () => {
    const engine = createAnalysisEngine();
    const notes: AnalysisEvent[] = [];
    engine.subscribe((e) => {
      if (e.type === 'notes') notes.push(e);
    });
    const chroma = new Float32Array(12);
    chroma[0] = chroma[4] = chroma[7] = 1 / 3;
    const push = (t: number) =>
      engine.push({
        t,
        chroma,
        energy: 0.5,
        bass: null,
        onset: false,
        exact: false,
        midiNotes: [60],
      });
    push(0);
    push(0.13);
    expect(notes).toEqual([
      {
        type: 'notes',
        t: 0.13,
        pitchClasses: [0, 4, 7],
        midiNotes: [60],
        noteConfidences: { 60: 0.55 },
      },
    ]);
  });

  it('holds a confirmed microphone key through a short dropout', () => {
    const tracker = createPlayedNoteTracker();
    expect(tracker.push(0, [60])).toEqual([]);
    expect(tracker.push(0.13, [60])).toEqual([60]);
    expect(tracker.push(0.26, [60])).toEqual([60]);
    expect(tracker.push(0.3, [])).toEqual([60]);
    expect(tracker.push(0.55, [])).toEqual([]);
  });

  it('keeps MIDI press/release immediate and clears mic state when switching inputs', () => {
    const engine = createAnalysisEngine();
    const notes: AnalysisEvent[] = [];
    engine.subscribe((e) => {
      if (e.type === 'notes') notes.push(e);
    });
    const push = (t: number, strength: number, exact = false) =>
      engine.push({
        t,
        chroma: chroma(strength),
        energy: strength,
        bass: null,
        onset: false,
        exact,
      });
    push(0, 0.4);
    push(0.13, 0.4);
    push(0.14, 0, true);
    push(0.15, 0.4, true);
    push(0.16, 0, true);
    push(0.17, 0.4);
    expect(notes).toEqual([
      { type: 'notes', t: 0.13, pitchClasses: [0] },
      { type: 'notes', t: 0.14, pitchClasses: [], midiNotes: [] },
      { type: 'notes', t: 0.15, pitchClasses: [0] },
      { type: 'notes', t: 0.16, pitchClasses: [] },
    ]);
  });
});

describe('microphone key confidence', () => {
  it.each([44100, 48000])('ramps independently per key, fades and rebuilds at %i Hz', (rate) => {
    const tracker = createPlayedNoteTracker();
    const hop = 2048 / rate;
    const seen: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i * hop;
      tracker.pushState(t, i >= 7 ? [60, 64] : [60]);
      const scores = tracker.confidences(t);
      if (scores[60] !== undefined) seen.push(scores[60]);
      if (scores[64] !== undefined) expect(scores[64]).toBeLessThan(scores[60]);
    }
    expect(seen[0]).toBeLessThan(0.6);
    expect(seen.at(-1)).toBe(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    tracker.pushState(11 * hop, []);
    tracker.pushState(13 * hop, []);
    expect(tracker.confidences(13 * hop)[60]).toBeLessThan(1);
    tracker.pushState(14 * hop, [60]);
    expect(tracker.confidences(14 * hop)[60]).toBeLessThan(0.6);
    tracker.pushState(15 * hop, []);
    tracker.pushState(21 * hop, []);
    expect(tracker.confidences(21 * hop)).toEqual({});
    tracker.reset();
    expect(tracker.confidences(0)).toEqual({});
  });

  it('emits confidence changes even when the confirmed keys do not change', () => {
    const engine = createAnalysisEngine();
    const events: Extract<AnalysisEvent, { type: 'notes' }>[] = [];
    engine.subscribe((e) => {
      if (e.type === 'notes') events.push(e);
    });
    for (let i = 0; i <= 12; i++)
      engine.push({
        t: (i * 2048) / 48000,
        chroma: chroma(1),
        energy: 0.5,
        bass: null,
        onset: false,
        exact: false,
        midiNotes: [60],
      });
    const held = events.filter((e) => e.midiNotes?.includes(60));
    expect(held.length).toBeGreaterThan(2);
    expect(held[0].noteConfidences?.[60]).toBeLessThan(0.6);
    expect(held.at(-1)?.noteConfidences?.[60]).toBe(1);
    engine.push({
      t: 1,
      chroma: chroma(1),
      energy: 0.5,
      bass: null,
      onset: false,
      exact: true,
      midiNotes: [60],
    });
    expect(events.at(-1)?.noteConfidences).toBeUndefined();
  });
});
