import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MidiEvent } from '@/core/types';
import { createMidiPlayer, type PianoLike } from './player';

interface Voice {
  note: number;
  velocity?: number;
  time?: number;
  stoppedAt?: number;
}

function setup(opts: { loadDelayMs?: number } = {}) {
  const ctx = { currentTime: 0, state: 'running' };
  const voices: Voice[] = [];
  const piano: PianoLike = {
    start(s) {
      const v: Voice = { ...s };
      voices.push(v);
      return (time) => {
        if (v.stoppedAt === undefined) v.stoppedAt = time;
      };
    },
  };
  const createInstrument = vi.fn(async (_ctx: AudioContext, onProgress: (p: number) => void) => {
    onProgress(0.5);
    if (opts.loadDelayMs) await new Promise((r) => setTimeout(r, opts.loadDelayMs));
    onProgress(1);
    return piano;
  });
  const player = createMidiPlayer(ctx as unknown as AudioContext, {
    createInstrument,
    startDelay: 0,
  });
  /** Advance fake timers and the fake AudioContext clock together. */
  const advance = (ms: number) => {
    for (let i = 0; i < ms; i++) {
      ctx.currentTime += 0.001;
      vi.advanceTimersByTime(1);
    }
  };
  return { ctx, voices, player, createInstrument, advance };
}

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

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createMidiPlayer', () => {
  it('does not touch Web Audio until asked to', () => {
    expect(() => createMidiPlayer()).not.toThrow();
  });

  it('loads once and reports progress', async () => {
    const { player, createInstrument } = setup();
    const progress: number[] = [];
    await player.load({ onProgress: (p) => progress.push(p) });
    await player.load();
    expect(createInstrument).toHaveBeenCalledTimes(1);
    expect(progress).toEqual([0.5, 1]);
    expect(player.isLoaded()).toBe(true);
  });

  it('schedules only within the look-ahead window, at the right AudioContext time', async () => {
    const { player, voices, advance } = setup();
    await player.load();
    player.play([on(0, 60), off(0.5, 60), on(0.3, 64), off(1, 64)]);
    // first pump covers [0, 0.1): only note 60
    expect(voices.map((v) => v.note)).toEqual([60]);
    expect(voices[0].time).toBeCloseTo(0);
    advance(250); // window now reaches past 0.3
    expect(voices.map((v) => v.note)).toEqual([60, 64]);
    expect(voices[1].time).toBeCloseTo(0.3);
    advance(300);
    expect(voices[0].stoppedAt).toBeCloseTo(0.5);
    expect(voices[1].stoppedAt).toBeUndefined();
  });

  it('honours sustain by deferring note-offs to the pedal release', async () => {
    const { player, voices, advance } = setup();
    await player.load();
    player.play([pedal(0, true), on(0, 60), off(0.1, 60), pedal(0.6, false)]);
    advance(300);
    expect(voices[0].stoppedAt).toBeUndefined();
    advance(400);
    expect(voices[0].stoppedAt).toBeCloseTo(0.6);
  });

  it('applies the playback rate', async () => {
    const { player, voices, advance } = setup();
    await player.load();
    player.play([on(0, 60), on(1, 62), off(2, 60), off(2, 62)], { rate: 2 });
    advance(600);
    expect(voices[1].time).toBeCloseTo(0.5);
  });

  it('emits ticks at ~30 Hz and fires onEnd', async () => {
    const { player, advance } = setup();
    await player.load();
    const ticks: number[] = [];
    const ended = vi.fn();
    player.onTick((t) => ticks.push(t));
    player.onEnd(ended);
    player.play([on(0, 60), off(1, 60)]);
    advance(500);
    const during = ticks.length;
    expect(during).toBeGreaterThanOrEqual(14);
    expect(during).toBeLessThanOrEqual(17);
    expect(ticks.at(-1)).toBeCloseTo(0.5, 1);
    advance(600);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(player.isPlaying()).toBe(false);
    expect(ticks.at(-1)).toBe(1);
  });

  it('pause stops voices and keeps the position; play from resumes; seek restarts held notes', async () => {
    const { player, voices, advance, ctx } = setup();
    await player.load();
    const events = [on(0, 60), off(2, 60), on(1, 64), off(3, 64)];
    player.play(events);
    advance(500);
    player.pause();
    expect(player.isPlaying()).toBe(false);
    expect(player.position()).toBeCloseTo(0.5, 2);
    expect(voices[0].stoppedAt).toBeCloseTo(ctx.currentTime);

    player.play(events, { from: player.position() });
    // 60 is held across the resume point, so it is restarted immediately
    expect(voices.at(-1)).toMatchObject({ note: 60 });

    player.seek(1.5);
    expect(voices.slice(-2).map((v) => v.note)).toEqual([60, 64]);
    expect(player.position()).toBeCloseTo(1.5);

    player.stop();
    expect(player.position()).toBe(0);
    expect(voices.every((v) => v.stoppedAt !== undefined)).toBe(true);
  });

  it('seek while paused only moves the position', async () => {
    const { player, voices } = setup();
    await player.load();
    const ticks: number[] = [];
    player.onTick((t) => ticks.push(t));
    player.play([on(0, 60), off(4, 60)]);
    player.pause();
    const n = voices.length;
    player.seek(2);
    expect(voices.length).toBe(n);
    expect(player.position()).toBe(2);
    expect(ticks.at(-1)).toBe(2);
  });

  it('play before load waits for samples; pause cancels a pending start', async () => {
    const { player, voices } = setup({ loadDelayMs: 100 });
    player.play([on(0, 60), off(1, 60)]);
    player.pause();
    await vi.advanceTimersByTimeAsync(200);
    expect(voices).toEqual([]);

    player.play([on(0, 60), off(1, 60)]);
    await vi.advanceTimersByTimeAsync(10);
    expect(voices.map((v) => v.note)).toEqual([60]);
  });

  it('noteOn / noteOff audition live notes', async () => {
    const { player, voices, ctx } = setup();
    await player.load();
    ctx.currentTime = 3;
    player.noteOn(60, 70);
    expect(voices[0]).toMatchObject({ note: 60, velocity: 70, time: 3 });
    ctx.currentTime = 3.5;
    player.noteOff(60);
    expect(voices[0].stoppedAt).toBe(3.5);
  });
});
