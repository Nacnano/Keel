import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chord, Key, MidiNoteEvent } from '@/core';
import { createFakePlayer } from './testing';

const fake = vi.hoisted(() => ({ player: null as unknown, loaded: true }));
vi.mock('@/app/live/audition', () => ({
  getPianoPlayer: () => fake.player,
  ensurePianoLoaded: () => Promise.resolve(),
}));

const {
  chordsClip,
  clipDuration,
  clipEvents,
  createPianoPlayback,
  qualityClip,
  qualityNotes,
  voiceLead,
} = await import('./playback');

const C: Key = { tonic: 0, mode: 'major' };
const ch = (root: number, quality: Chord['quality']): Chord => ({
  root: root as Chord['root'],
  quality,
});

describe('clip builders', () => {
  it('quality notes: root position with the root doubled below', () => {
    expect(qualityNotes(ch(0, 'maj'))).toEqual([48, 60, 64, 67]);
    expect(qualityNotes(ch(7, 'min7'))).toEqual([43, 55, 58, 62, 65]);
  });

  it('quality clip: block, arpeggio, block', () => {
    const clip = qualityClip(ch(2, 'min'), 60);
    const ons = clipEvents(clip).filter((e) => e.type === 'on') as MidiNoteEvent[];
    expect(ons).toHaveLength(4 + 3 + 4);
    expect(ons.slice(0, 4).every((e) => e.t === 0)).toBe(true);
    // 2 beats block + 0.5 rest at 60 bpm: the arpeggio starts at 2.5 s
    expect(ons[4].t).toBe(2.5);
    expect(clipDuration(clip)).toBeCloseTo(2 + 0.5 + 1.5 + 0.5 + 2);
  });

  it('events pair every note-on with a later note-off', () => {
    const events = clipEvents(chordsClip([ch(0, 'maj'), ch(5, 'maj')], { bpm: 120 }));
    const ons = events.filter((e) => e.type === 'on');
    const offs = events.filter((e) => e.type === 'off');
    expect(ons.length).toBe(offs.length);
    expect(events.map((e) => e.t)).toEqual([...events.map((e) => e.t)].sort((a, b) => a - b));
  });

  it('voice leading keeps the right hand close', () => {
    const [c, f, g] = voiceLead([ch(0, 'maj'), ch(5, 'maj'), ch(7, 'maj')]);
    const rh = (v: number[]) => v.slice(1);
    const jump = (a: number[], b: number[]) =>
      Math.max(...rh(b).map((n) => Math.min(...rh(a).map((m) => Math.abs(m - n)))));
    expect(jump(c, f)).toBeLessThanOrEqual(2);
    expect(jump(f, g)).toBeLessThanOrEqual(2);
    expect(c[0]).toBeLessThan(48); // left-hand bass
  });

  it('progression clip starts with a softer quick cadence and a rest', () => {
    const clip = chordsClip([ch(9, 'min')], { bpm: 60, cadence: { key: C, level: 1 } });
    expect(clip.steps).toHaveLength(4 + 1 + 1);
    expect(clip.steps.slice(0, 4).every((s) => s.beats === 1 && (s.velocity ?? 0) < 80)).toBe(true);
    expect(clip.steps[4].notes).toEqual([]);
    expect(clip.steps[5].beats).toBe(2);
  });
});

describe('createPianoPlayback', () => {
  let player: ReturnType<typeof createFakePlayer>;
  beforeEach(() => {
    player = createFakePlayer();
    fake.player = player;
  });
  afterEach(() => vi.useRealTimers());

  it('plays the clip on the shared piano and resolves on end', async () => {
    const pb = createPianoPlayback();
    const onStart = vi.fn();
    const h = pb.play(qualityClip(ch(0, 'maj'), 120), { onStart });
    await vi.waitFor(() => expect(player.plays).toHaveLength(1));
    expect(onStart).toHaveBeenCalled();
    let done = false;
    void h.done.then(() => (done = true));
    player.end();
    await h.done;
    expect(done).toBe(true);
    expect(player.stops).toBe(0);
  });

  it('a new clip cancels the previous one and stops the piano', async () => {
    const pb = createPianoPlayback();
    const first = pb.play(qualityClip(ch(0, 'maj'), 120));
    await vi.waitFor(() => expect(player.plays).toHaveLength(1));
    pb.play(qualityClip(ch(2, 'min'), 120));
    await first.done;
    expect(player.stops).toBe(1);
    await vi.waitFor(() => expect(player.plays).toHaveLength(2));
    pb.stop();
    expect(player.stops).toBe(2);
  });

  it('cancel before the samples are ready never starts sound', async () => {
    const pb = createPianoPlayback();
    const h = pb.play(qualityClip(ch(0, 'maj'), 120));
    h.cancel();
    await h.done;
    await Promise.resolve();
    expect(player.plays).toHaveLength(0);
  });
});
