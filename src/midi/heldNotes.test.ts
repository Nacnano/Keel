import { describe, expect, it } from 'vitest';
import type { MidiEvent } from '@/core/types';
import { frameFromNotes, midiChord } from '@/core/testing/midi';
import { createHeldNotes } from './heldNotes';

const on = (note: number, velocity = 100, t = 0): MidiEvent => ({
  t,
  type: 'on',
  note,
  velocity,
  channel: 0,
});
const off = (note: number, t = 0): MidiEvent => ({ t, type: 'off', note, velocity: 0, channel: 0 });
const pedal = (down: boolean, t = 0): MidiEvent => ({
  t,
  type: 'cc',
  controller: 64,
  value: down ? 127 : 0,
  channel: 0,
});

const notes = (h: ReturnType<typeof createHeldNotes>) => [...h.held().keys()].sort((a, b) => a - b);

describe('createHeldNotes', () => {
  it('tracks key down / key up without sustain', () => {
    const h = createHeldNotes();
    expect(h.apply(on(60))).toBe(true);
    expect(h.apply(on(64, 80))).toBe(true);
    expect(h.held().get(64)).toBe(80);
    expect(h.apply(off(60))).toBe(true);
    expect(notes(h)).toEqual([64]);
    expect(h.apply(off(99))).toBe(false); // never held
  });

  it('keeps notes while the sustain pedal is down and releases them when it lifts', () => {
    const h = createHeldNotes();
    h.apply(on(60));
    expect(h.apply(pedal(true))).toBe(false); // pedal alone changes nothing audible
    h.apply(on(64));
    expect(h.apply(off(60))).toBe(false);
    expect(h.apply(off(64))).toBe(false);
    h.apply(on(67));
    expect(notes(h)).toEqual([60, 64, 67]);
    expect(h.isSustainDown()).toBe(true);

    expect(h.apply(pedal(false))).toBe(true);
    // 67 is still physically down, 60/64 were only sustained
    expect(notes(h)).toEqual([67]);
    expect(h.apply(off(67))).toBe(true);
    expect(notes(h)).toEqual([]);
  });

  it('treats CC64 values >= 64 as down and ignores repeated pedal values', () => {
    const h = createHeldNotes();
    h.apply(on(60));
    h.apply({ t: 0, type: 'cc', controller: 64, value: 64, channel: 0 });
    h.apply({ t: 0, type: 'cc', controller: 64, value: 100, channel: 0 });
    h.apply(off(60));
    expect(notes(h)).toEqual([60]);
    expect(h.apply({ t: 0, type: 'cc', controller: 64, value: 63, channel: 0 })).toBe(true);
    expect(notes(h)).toEqual([]);
  });

  it('ignores unrelated controllers and honours all-notes-off', () => {
    const h = createHeldNotes();
    h.apply(on(60));
    expect(h.apply({ t: 0, type: 'cc', controller: 1, value: 90, channel: 0 })).toBe(false);
    expect(h.apply({ t: 0, type: 'cc', controller: 123, value: 0, channel: 0 })).toBe(true);
    expect(notes(h)).toEqual([]);
  });

  it('C/E voicing (E in the bass) gives bass === 4', () => {
    const h = createHeldNotes();
    for (const n of midiChord(['E3', 'C4', 'G4'])) h.apply(on(n));
    const f = h.toFrame(1.5);
    expect(f.bass).toBe(4);
    expect(f.t).toBe(1.5);
    expect(f.exact).toBe(true);
    expect(f.energy).toBe(1);
  });

  it('produces an L1-normalised velocity-weighted chroma matching the core fixture', () => {
    const h = createHeldNotes();
    const chord = midiChord(['C3', 'C4', 'E4', 'G4']);
    const vels = [100, 60, 90, 120];
    chord.forEach((n, i) => h.apply(on(n, vels[i])));
    const f = h.toFrame(0);
    const sum = f.chroma.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    const expected = frameFromNotes(chord, 0, vels);
    for (let i = 0; i < 12; i++) expect(f.chroma[i]).toBeCloseTo(expected.chroma[i], 6);
    expect(f.chroma[0]).toBeCloseTo(160 / 370, 6);
  });

  it('emits a silent frame when nothing is held', () => {
    const f = createHeldNotes().toFrame(0);
    expect(Array.from(f.chroma)).toEqual(new Array(12).fill(0));
    expect(f.energy).toBe(0);
    expect(f.bass).toBeNull();
    expect(f.onset).toBe(false);
  });

  it('sets onset only on the frame right after a note-on', () => {
    const h = createHeldNotes();
    h.apply(on(60));
    expect(h.toFrame(0).onset).toBe(true);
    expect(h.toFrame(0.01).onset).toBe(false);
    h.apply(off(60));
    expect(h.toFrame(0.02).onset).toBe(false);
    h.apply(on(62));
    h.apply(on(65));
    expect(h.toFrame(0.03).onset).toBe(true);
    expect(h.toFrame(0.04).onset).toBe(false);
  });

  it('re-striking a sustained note updates its velocity and flags an onset', () => {
    const h = createHeldNotes();
    h.apply(pedal(true));
    h.apply(on(60, 40));
    h.apply(off(60));
    h.toFrame(0);
    expect(h.apply(on(60, 110))).toBe(true);
    expect(h.held().get(60)).toBe(110);
    expect(h.toFrame(0).onset).toBe(true);
  });

  it('reset clears everything and reports whether notes were held', () => {
    const h = createHeldNotes();
    expect(h.reset()).toBe(false);
    h.apply(pedal(true));
    h.apply(on(60));
    expect(h.reset()).toBe(true);
    expect(notes(h)).toEqual([]);
    expect(h.isSustainDown()).toBe(false);
  });
});
