/**
 * Test doubles for the train screen: a fake `PianoPlayer`-shaped object for mocking
 * `@/app/live/audition`, and a hand-driven `Playback`.
 */
import type { MidiEvent } from '@/core';
import type { Clip, PlayHandle, Playback } from './playback';

export interface FakePlayer {
  plays: MidiEvent[][];
  stops: number;
  playing: boolean;
  isLoaded(): boolean;
  isPlaying(): boolean;
  play(events: MidiEvent[]): void;
  stop(): void;
  onEnd(cb: () => void): () => void;
  /** Fire `onEnd` as if the performance finished. */
  end(): void;
}

export function createFakePlayer(): FakePlayer {
  const ends = new Set<() => void>();
  const p: FakePlayer = {
    plays: [],
    stops: 0,
    playing: false,
    isLoaded: () => true,
    isPlaying: () => p.playing,
    play(events) {
      p.plays.push(events);
      p.playing = true;
    },
    stop() {
      p.stops += 1;
      p.playing = false;
    },
    onEnd(cb) {
      ends.add(cb);
      return () => ends.delete(cb);
    },
    end() {
      p.playing = false;
      for (const cb of [...ends]) cb();
    },
  };
  return p;
}

export interface ManualPlayback extends Playback {
  clips: Clip[];
  /** Finish the most recent clip. */
  finish(): void;
  cancelled: number;
}

/** Playback whose clips end only when the test says so. */
export function createManualPlayback(): ManualPlayback {
  let last: { resolve(): void } | null = null;
  const pb: ManualPlayback = {
    clips: [],
    cancelled: 0,
    play(clip, opts): PlayHandle {
      last?.resolve();
      pb.clips.push(clip);
      let resolve!: () => void;
      const done = new Promise<void>((r) => (resolve = r));
      last = { resolve };
      opts?.onStart?.();
      return {
        done,
        cancel: () => {
          pb.cancelled += 1;
          resolve();
        },
      };
    },
    stop() {
      last?.resolve();
    },
    finish() {
      last?.resolve();
    },
  };
  return pb;
}
