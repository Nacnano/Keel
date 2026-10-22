import { describe, expect, it } from 'vitest';
import { midiChordEvents } from '@/core/testing/midi';
import type { MidiEvent, MidiNoteEvent } from '@/core/types';
import { performanceEnd, resolveSustain, scheduleWindow, soundingAt } from './schedule';

const on = (t: number, note: number, velocity = 90): MidiEvent => ({
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
const pedal = (t: number, down: boolean): MidiEvent => ({
  t,
  type: 'cc',
  controller: 64,
  value: down ? 127 : 0,
  channel: 0,
});
const brief = (es: MidiNoteEvent[]) => es.map((e) => `${e.t}:${e.type}${e.note}`);

describe('resolveSustain', () => {
  it('passes plain note on/off through, sorted', () => {
    const events = midiChordEvents([60, 64], 1, 0.5).reverse();
    expect(brief(resolveSustain(events))).toEqual(['1:on64', '1:on60', '1.5:off64', '1.5:off60']);
  });

  it('defers note-offs until the pedal lifts', () => {
    const notes = resolveSustain([
      pedal(0, true),
      on(0.1, 60),
      off(0.5, 60),
      on(1, 64),
      off(1.2, 64),
      on(1.5, 67), // still down when the pedal lifts
      pedal(2, false),
      off(3, 67),
    ]);
    expect(brief(notes)).toEqual([
      '0.1:on60',
      '1:on64',
      '1.5:on67',
      '2:off60',
      '2:off64',
      '3:off67',
    ]);
  });

  it('re-strike of a sustained note closes the previous voice first', () => {
    const notes = resolveSustain([
      pedal(0, true),
      on(0, 60),
      off(0.2, 60),
      on(1, 60),
      off(1.2, 60),
      pedal(2, false),
    ]);
    expect(brief(notes)).toEqual(['0:on60', '1:off60', '1:on60', '2:off60']);
  });

  it('keeps tie order and handles all-notes-off', () => {
    const notes = resolveSustain([
      on(0, 60),
      off(0, 60),
      on(0, 62),
      { t: 1, type: 'cc', controller: 123, value: 0, channel: 0 },
    ]);
    expect(brief(notes)).toEqual(['0:on60', '0:off60', '0:on62', '1:off62']);
  });
});

describe('scheduleWindow', () => {
  const notes = resolveSustain([on(0, 60), off(0.1, 60), on(0.1, 62), off(0.25, 62), on(1, 64)]);

  it('returns events with from <= t < to', () => {
    expect(brief(scheduleWindow(notes, 0, 0.1))).toEqual(['0:on60']);
    expect(brief(scheduleWindow(notes, 0.1, 0.2))).toEqual(['0.1:off60', '0.1:on62']);
    expect(brief(scheduleWindow(notes, 0.2, 0.3))).toEqual(['0.25:off62']);
    expect(scheduleWindow(notes, 0.3, 0.9)).toEqual([]);
    expect(scheduleWindow(notes, 0.5, 0.5)).toEqual([]);
  });

  it('consecutive windows cover every event exactly once', () => {
    const seen: MidiNoteEvent[] = [];
    for (let t = 0; t < 2; t += 0.025) seen.push(...scheduleWindow(notes, t, t + 0.025));
    expect(seen).toEqual(notes);
  });
});

describe('soundingAt / performanceEnd', () => {
  const notes = resolveSustain([
    pedal(0, true),
    on(0, 60),
    off(0.5, 60),
    on(1, 64),
    off(2, 64),
    pedal(3, false),
  ]);

  it('finds notes held (incl. by sustain) across a seek point', () => {
    expect(soundingAt(notes, 0).map((e) => e.note)).toEqual([]);
    expect(soundingAt(notes, 2).map((e) => e.note)).toEqual([60, 64]);
    expect(soundingAt(notes, 3.5)).toEqual([]);
  });

  it('measures the timeline', () => {
    expect(performanceEnd(notes)).toBe(3);
    expect(performanceEnd([])).toBe(0);
  });
});
