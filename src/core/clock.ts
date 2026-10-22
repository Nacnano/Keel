/**
 * Shared clock so MIDI timestamps, audio-context time and session time agree.
 * `now()` returns seconds on a monotonic timeline. When an AudioContext is
 * attached its currentTime is used; otherwise performance.now().
 */
export interface Clock {
  now(): number;
  attachAudioContext(ctx: { currentTime: number } | null): void;
  /** Convert a DOMHighResTimeStamp (ms, performance.now() based) to clock seconds. */
  fromPerformanceMs(ms: number): number;
}

export function createClock(): Clock {
  let ctx: { currentTime: number } | null = null;
  let offset = 0; // ctx.currentTime - performance.now()/1000 at attach time
  const perfSeconds = () =>
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  return {
    now() {
      return ctx ? ctx.currentTime : perfSeconds();
    },
    attachAudioContext(c) {
      ctx = c;
      offset = c ? c.currentTime - perfSeconds() : 0;
    },
    fromPerformanceMs(ms) {
      return ms / 1000 + offset;
    },
  };
}

export const clock: Clock = createClock();
