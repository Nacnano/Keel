import { describe, expect, it } from 'vitest';
import { createNoteTracker } from './noteTracker';
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
      { type: 'notes', t: 0.14, pitchClasses: [] },
      { type: 'notes', t: 0.15, pitchClasses: [0] },
      { type: 'notes', t: 0.16, pitchClasses: [] },
    ]);
  });
});
