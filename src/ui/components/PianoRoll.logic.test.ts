import { describe, expect, it } from 'vitest';
import type { MidiEvent, MidiNoteEvent } from '@/core';
import { buildNoteIndex, pitchWindow, visibleNotes } from './PianoRoll.logic';

const on = (t: number, note: number, velocity = 80): MidiNoteEvent => ({
  t,
  type: 'on',
  note,
  velocity,
  channel: 0,
});
const off = (t: number, note: number): MidiEvent => ({
  t,
  type: 'off',
  note,
  velocity: 0,
  channel: 0,
});

/** n notes, one every `step` seconds, each `len` long, cycling over two octaves. */
function track(n: number, step = 0.05, len = 0.2): MidiEvent[] {
  const out: MidiEvent[] = [];
  for (let i = 0; i < n; i++) {
    const note = 48 + (i % 24);
    out.push(on(i * step, note), off(i * step + len, note));
  }
  return out.sort((a, b) => a.t - b.t);
}

describe('buildNoteIndex', () => {
  it('pairs on/off, treats velocity-0 note-on as off, closes re-strikes and held notes', () => {
    const idx = buildNoteIndex([
      on(0, 60),
      { t: 0.5, type: 'cc', controller: 64, value: 127, channel: 0 },
      on(0.2, 64),
      { ...on(1, 60), velocity: 0 }, // vel-0 = off
      on(1.5, 64), // re-strike closes the first 64 at 1.5
      off(2, 64),
      on(2.5, 67), // never released: closes at the last event time
      off(3, 72), // stray off is ignored
    ]);
    expect(idx.notes.map((n) => [n.note, n.t, n.end])).toEqual([
      [60, 0, 1],
      [64, 0.2, 1.5],
      [64, 1.5, 2],
      [67, 2.5, 3],
    ]);
    expect(idx.pitchMin).toBe(60);
    expect(idx.pitchMax).toBe(67);
    expect(idx.maxDuration).toBeCloseTo(1.3);
    expect(idx.end).toBe(3);
  });

  it('sorts unsorted input and handles an empty track', () => {
    expect(buildNoteIndex([off(1, 60), on(0, 60)]).notes).toHaveLength(1);
    const empty = buildNoteIndex([]);
    expect(empty.notes).toEqual([]);
    expect(pitchWindow(empty)).toEqual({ lo: 48, hi: 72 });
  });
});

describe('visibleNotes (viewport culling)', () => {
  it('returns exactly the notes overlapping the window, including long notes started before it', () => {
    const idx = buildNoteIndex([on(0, 40), off(100, 40), ...track(2000)]);
    const got = visibleNotes(idx, { t0: 50, t1: 52 });
    const expected = idx.notes.filter((n) => n.end >= 50 && n.t <= 52);
    expect(got).toEqual(expected);
    // The 100 s pedal note that began at 0 is still visible at 50..52.
    expect(got.some((n) => n.note === 40)).toBe(true);
  });

  it('filters by pitch window and handles empty / inverted windows', () => {
    const idx = buildNoteIndex(track(500));
    const got = visibleNotes(idx, { t0: 0, t1: 10, pitchLo: 60, pitchHi: 62 });
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((n) => n.note >= 60 && n.note <= 62)).toBe(true);
    expect(visibleNotes(idx, { t0: 10, t1: 5 })).toEqual([]);
    expect(visibleNotes(idx, { t0: 1000, t1: 2000 })).toEqual([]);
  });

  it('culls a 50k-event track to the viewport quickly', () => {
    const idx = buildNoteIndex(track(25_000, 0.072)); // 50k events, ~30 min
    expect(idx.notes).toHaveLength(25_000);
    const t = performance.now();
    let total = 0;
    for (let frame = 0; frame < 600; frame++) {
      const t0 = frame * 3;
      total += visibleNotes(idx, { t0, t1: t0 + 10 }).length;
    }
    const perFrameMs = (performance.now() - t) / 600;
    expect(total).toBeGreaterThan(0);
    // Generous bound for CI; real cost is a few microseconds per frame.
    expect(perFrameMs).toBeLessThan(2);
    const tenSeconds = visibleNotes(idx, { t0: 900, t1: 910 });
    expect(tenSeconds.length).toBeLessThan(200);
  });
});

describe('pitchWindow', () => {
  it('pads the used range and keeps at least two octaves', () => {
    expect(pitchWindow(buildNoteIndex([on(0, 60), off(1, 60)]))).toEqual({ lo: 48, hi: 72 });
    expect(pitchWindow(buildNoteIndex(track(48)))).toEqual({ lo: 46, hi: 73 });
  });
});
