import { describe, expect, it } from 'vitest';
import type { AnalysisEvent, ChromaFrame } from '@/core';
import { frameFromNotes } from '@/core/testing/midi';
import { createAnalysisEngine } from './engine';
import { createPlayedNoteTracker } from './noteTracker';
import { chromaFromNotes, progressionFrames } from './testing/chromaFromNotes';

function harness() {
  const engine = createAnalysisEngine();
  const events: AnalysisEvent[] = [];
  engine.subscribe((event) => events.push(event));
  return { engine, events };
}
const mic = (t: number, notes = [48, 60, 64, 67]): ChromaFrame => ({
  ...chromaFromNotes(notes, { t }),
  midiNotes: notes,
});

describe('tentative microphone confirmation', () => {
  it('requires repeated support, confirms continuously and keeps the sets disjoint', () => {
    const tracker = createPlayedNoteTracker();
    expect(tracker.pushState(0, [60])).toEqual({ midiNotes: [], tentativeMidiNotes: [] });
    expect(tracker.pushState(0, [60])).toEqual({ midiNotes: [], tentativeMidiNotes: [] });
    expect(tracker.pushState(0.1, [60])).toEqual({ midiNotes: [], tentativeMidiNotes: [60] });
    expect(tracker.pushState(0.25, [60, 64])).toEqual({ midiNotes: [60], tentativeMidiNotes: [] });
    expect(tracker.pushState(0.35, [60, 64])).toEqual({
      midiNotes: [60],
      tentativeMidiNotes: [64],
    });
    expect(tracker.pushState(0.5, [60, 64])).toEqual({
      midiNotes: [60, 64],
      tentativeMidiNotes: [],
    });
    expect(tracker.pushState(0.51, [])).toEqual({ midiNotes: [60, 64], tentativeMidiNotes: [] });
    expect(tracker.pushState(0.76, [])).toEqual({ midiNotes: [], tentativeMidiNotes: [] });
  });

  it('previews only strong matching observations before the normal confirmation time', () => {
    const { engine, events } = harness();
    for (const t of [0, 0.043, 0.086]) engine.push({ ...mic(t), onset: t === 0 });
    const early = events.filter((event) => event.type === 'notes').at(-1);
    expect(early?.tentativeMidiNotes?.length).toBeGreaterThan(0);
    expect(early?.midiNotes).toEqual([]);
    engine.push(mic(0.13));
    expect(events.filter((event) => event.type === 'notes').at(-1)?.midiNotes).toEqual([
      48, 60, 64, 67,
    ]);
    const weak = harness();
    for (const t of [0, 0.043, 0.086]) weak.engine.push({ ...mic(t), midiNotes: [61] });
    expect(
      weak.events.some((event) => event.type === 'notes' && event.tentativeMidiNotes?.length),
    ).toBe(false);
  });

  it('does not accumulate interrupted candidates and does not confirm tentative across loss of support', () => {
    const tracker = createPlayedNoteTracker();
    for (let t = 0; t < 2; t += 0.1) {
      expect(tracker.pushState(t, [60]).midiNotes).toEqual([]);
      expect(tracker.pushState(t + 0.05, []).tentativeMidiNotes).toEqual([]);
    }
    tracker.reset();
    tracker.pushState(0, [60]);
    expect(tracker.pushState(0.1, [60]).tentativeMidiNotes).toEqual([60]);
    expect(tracker.pushState(0.11, []).tentativeMidiNotes).toEqual([]);
    expect(tracker.pushState(0.3, [60]).midiNotes).toEqual([]);
    expect(tracker.pushState(2, [60])).toEqual({ midiNotes: [], tentativeMidiNotes: [] });
  });
});

describe('transient harmonic evidence', () => {
  it('previews repeated chords before publication and clears them when support disappears', () => {
    const { engine, events } = harness();
    engine.push(mic(0));
    expect(events.some((event) => event.type === 'preview' && event.chord)).toBe(false);
    for (let i = 1; i <= 8; i++) engine.push(mic(i / 23));
    expect(events.some((event) => event.type === 'preview' && event.chord?.root === 0)).toBe(true);
    expect(events.some((event) => event.type === 'chord' && event.chord)).toBe(false);
    engine.push(mic(9 / 23, []));
    expect(events.filter((event) => event.type === 'preview').at(-1)).toMatchObject({
      chord: null,
      key: null,
    });
  });

  it('refreshes committed chord confidence without reintroducing it as a preview', () => {
    const { engine, events } = harness();
    for (let i = 0; i < 100; i++) {
      engine.push(
        chromaFromNotes([48, 60, 64, 67], { t: i / 23, seed: i + 1, noise: i < 40 ? 0.01 : 1.5 }),
      );
    }
    const chords = events
      .filter((event) => event.type === 'chord')
      .filter((event) => event.chord?.root === 0);
    expect(chords.length).toBeGreaterThan(1);
    expect(new Set(chords.map((event) => event.confidence)).size).toBeGreaterThan(1);
    const committed = events.findIndex(
      (event) => event.type === 'chord' && event.chord?.root === 0,
    );
    expect(
      events.slice(committed).some((event) => event.type === 'preview' && event.chord?.root === 0),
    ).toBe(false);
  });

  it('keeps provisional keys out of published events until the existing confirmation gate', () => {
    const { engine, events } = harness();
    for (const frame of progressionFrames([{ notes: ['C3', 'E3', 'G3'], seconds: 3 }]))
      engine.push(frame);
    expect(events.some((event) => event.type === 'preview' && event.key)).toBe(true);
    expect(events.some((event) => event.type === 'key')).toBe(false);
  });

  it('does not accumulate key estimates from flat noise, isolated pitches or interrupted spikes', () => {
    const { engine, events } = harness();
    for (let i = 0; i < 800; i++) {
      const frame =
        i < 200
          ? { ...mic(i / 23), chroma: new Float32Array(12).fill(1 / 12), midiNotes: [] }
          : i < 400
            ? {
                ...mic(i / 23, [48]),
                chroma: new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
              }
            : mic(i / 23, i % 2 ? [] : [48, 64, 67]);
      engine.push(frame);
    }
    expect(
      events.some((event) => event.type === 'key' || (event.type === 'preview' && event.key)),
    ).toBe(false);
  });

  it('does not date the next musical phrase from discarded noise bursts', () => {
    const { engine, events } = harness();
    for (let i = 0; i < 20; i++) engine.push(mic(i / 20, i % 2 ? [] : [48, 64, 67]));
    for (const frame of progressionFrames([{ notes: ['C3', 'E3', 'G3'], seconds: 7 }], { t0: 1 }))
      engine.push(frame);
    const key = events.find((event) => event.type === 'key');
    expect(key).toBeDefined();
    expect(key!.t).toBeGreaterThanOrEqual(1);
  });

  it.each(['mode', 'instrument', 'gap', 'rewind', 'source'] as const)(
    'clears stale observations after %s changes',
    (change) => {
      const { engine, events } = harness();
      for (let i = 0; i < 50; i++) engine.push(mic(i / 23));
      events.length = 0;
      if (change === 'mode') engine.configure({ mode: 'room' });
      else if (change === 'instrument') engine.configure({ instrument: 'guitar' });
      else if (change === 'source') engine.push(frameFromNotes([], 50 / 23));
      else engine.push(mic(change === 'gap' ? 10 : 0));
      expect(
        events.some(
          (event) =>
            event.type === 'notes' &&
            event.midiNotes?.length === 0 &&
            !event.tentativeMidiNotes?.length,
        ),
      ).toBe(true);
      expect(events.some((event) => event.type === 'chord' && event.chord === null)).toBe(true);
      expect(events.filter((event) => event.type === 'preview').at(-1)).toMatchObject({
        chord: null,
        key: null,
      });
    },
  );

  it('keeps exact MIDI immediate and rejects stale mic confirmations after switching back', () => {
    const { engine, events } = harness();
    engine.push(mic(0));
    engine.push(mic(0.13));
    engine.push({ ...frameFromNotes([72, 76, 79], 0.14), midiNotes: [72, 76, 79] });
    expect(events.filter((event) => event.type === 'notes').at(-1)).toMatchObject({
      midiNotes: [72, 76, 79],
    });
    engine.push(mic(0.15));
    expect(events.filter((event) => event.type === 'notes').at(-1)).toMatchObject({
      midiNotes: [],
    });
  });
});
