import { describe, expect, it, vi } from 'vitest';
import type { MidiEvent } from '@/core';
import type { PianoPlayer } from '@/midi';
import { createPlaybackController, type MediaLike, type PlaybackDeps } from './playback';

const EVENTS: MidiEvent[] = [
  { t: 0, type: 'on', note: 60, velocity: 80, channel: 0 },
  { t: 5, type: 'off', note: 60, velocity: 0, channel: 0 },
];

function fakeClock() {
  const c = { t: 100, now: () => c.t };
  return c;
}

function fakePlayer(clock: { t: number }) {
  let playing = false;
  let anchorPos = 0;
  let anchorT = 0;
  let rate = 1;
  let end = 0;
  let loaded = false;
  const ends = new Set<() => void>();
  const position = () =>
    playing ? Math.min(end, anchorPos + (clock.t - anchorT) * rate) : anchorPos;
  const p = {
    plays: [] as number[],
    seeks: [] as number[],
    load: vi.fn(async () => {
      loaded = true;
    }),
    isLoaded: () => loaded,
    isPlaying: () => playing,
    play(events: MidiEvent[], opts?: { from?: number; rate?: number }) {
      end = Math.max(...events.map((e) => e.t));
      anchorPos = opts?.from ?? 0;
      anchorT = clock.t;
      if (opts?.rate) rate = opts.rate;
      playing = true;
      p.plays.push(anchorPos);
    },
    position,
    duration: () => end,
    seek(t: number) {
      p.seeks.push(t);
      anchorPos = t;
      anchorT = clock.t;
    },
    pause() {
      anchorPos = position();
      playing = false;
    },
    stop() {
      playing = false;
      anchorPos = 0;
    },
    setRate(r: number) {
      anchorPos = position();
      anchorT = clock.t;
      rate = r;
    },
    onEnd(cb: () => void) {
      ends.add(cb);
      return () => ends.delete(cb);
    },
    fireEnd() {
      playing = false;
      anchorPos = end;
      ends.forEach((cb) => cb());
    },
    onTick: () => () => {},
    noteOn() {},
    noteOff() {},
    getContext: () => null,
  };
  return p;
}

function fakeAudio(): MediaLike & { playCalls: number } {
  return {
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    playCalls: 0,
    play() {
      this.paused = false;
      this.playCalls++;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
  };
}

function setup(overrides: Partial<PlaybackDeps> = {}) {
  const clock = fakeClock();
  const player = fakePlayer(clock);
  const onChange = vi.fn();
  const c = createPlaybackController({
    duration: 10,
    getAudio: () => null,
    midiEvents: null,
    createPlayer: () => player as unknown as PianoPlayer,
    now: clock.now,
    onChange,
    ...overrides,
  });
  return { c, clock, player, onChange };
}

describe('playback controller', () => {
  it('timer clock: play, rate, pause, seek, stop at the end', () => {
    const { c, clock, onChange } = setup();
    expect(c.getState().source).toBe('timer');
    c.play();
    clock.t += 2;
    expect(c.tick()).toBeCloseTo(2);
    c.setRate(0.5);
    clock.t += 2;
    expect(c.position()).toBeCloseTo(3);
    c.pause();
    clock.t += 5;
    expect(c.position()).toBeCloseTo(3);
    c.seek(9);
    expect(c.getState().time).toBe(9);
    c.setRate(1);
    c.play();
    clock.t += 5;
    expect(c.tick()).toBe(10);
    expect(c.getState().playing).toBe(false);
    // Play from the end restarts at 0.
    c.play();
    expect(c.position()).toBe(0);
    expect(onChange).toHaveBeenCalled();
  });

  it('MIDI-only session: the piano is the master clock', async () => {
    const { c, clock, player } = setup({ midiEvents: EVENTS });
    expect(c.getState()).toMatchObject({ source: 'midi', pianoOn: true, piano: 'idle' });
    c.seek(1);
    c.play();
    expect(player.plays).toEqual([1]);
    await Promise.resolve();
    expect(c.getState().piano).toBe('ready');
    clock.t += 1.5;
    expect(c.position()).toBeCloseTo(2.5);
    c.seek(4);
    expect(player.seeks).toEqual([4]);
  });

  it('hands over to the timer when the MIDI performance ends before the session', () => {
    const { c, clock, player } = setup({ midiEvents: EVENTS });
    c.play();
    clock.t += 5;
    player.fireEnd();
    clock.t += 2;
    expect(c.tick()).toBeCloseTo(7);
    expect(c.getState().playing).toBe(true);
  });

  it('turning the piano off in a MIDI session falls back to the timer', () => {
    const { c, clock } = setup({ midiEvents: EVENTS });
    c.play();
    clock.t += 1;
    c.setPianoOn(false);
    expect(c.getState()).toMatchObject({ source: 'timer', pianoOn: false, playing: true });
    clock.t += 1;
    expect(c.position()).toBeCloseTo(2);
  });

  it('audio is master; an enabled piano follows and is re-seeked on drift', () => {
    const audio = fakeAudio();
    const { c, player } = setup({ getAudio: () => audio, midiEvents: EVENTS });
    expect(c.getState()).toMatchObject({ source: 'audio', pianoOn: false });
    c.seek(2);
    c.play();
    expect(audio.currentTime).toBe(2);
    expect(audio.playCalls).toBe(1);
    expect(player.plays).toEqual([]);

    c.setPianoOn(true);
    expect(player.plays).toEqual([2]);
    audio.currentTime = 3.5; // audio ran on, the piano did not
    expect(c.tick()).toBe(3.5);
    expect(player.seeks).toEqual([3.5]);

    c.setRate(0.75);
    expect(audio.playbackRate).toBe(0.75);
    c.pause();
    expect(audio.paused).toBe(true);
    expect(player.isPlaying()).toBe(false);
  });

  it('a failed piano load falls back to the timer', async () => {
    const { c, player } = setup({ midiEvents: EVENTS });
    player.load.mockRejectedValueOnce(new Error('offline'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    c.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(c.getState()).toMatchObject({ piano: 'error', source: 'timer', playing: true });
    err.mockRestore();
  });
});
