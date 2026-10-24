import type { PitchClass } from '@/core';

/** Separate on/off thresholds prevent borderline microphone estimates from blinking. */
export const NOTE_THRESHOLD = 0.1;
export const NOTE_RELEASE_THRESHOLD = 0.06;
export const NOTE_ATTACK_SEC = 0.12;
export const NOTE_RELEASE_SEC = 0.24;

/** Display-only smoothing. Chord/key scoring and exact MIDI notes bypass this tracker. */
export function createNoteTracker() {
  const active = new Uint8Array(12);
  const pending = new Float64Array(12).fill(NaN);
  let lastT = -Infinity;

  function reset() {
    active.fill(0);
    pending.fill(NaN);
    lastT = -Infinity;
  }

  return {
    reset,
    push(t: number, chroma: Float32Array, silent = false): PitchClass[] {
      // A new stream or interrupted capture must not inherit old confirmations.
      if (t < lastT || t - lastT > 0.5) reset();
      lastT = t;
      const notes: PitchClass[] = [];
      for (let pc = 0; pc < 12; pc++) {
        const strength = silent ? 0 : chroma[pc];
        const changing = active[pc] ? strength < NOTE_RELEASE_THRESHOLD : strength > NOTE_THRESHOLD;
        if (!changing) pending[pc] = NaN;
        else {
          if (Number.isNaN(pending[pc])) pending[pc] = t;
          const dwell = active[pc] ? NOTE_RELEASE_SEC : NOTE_ATTACK_SEC;
          if (t - pending[pc] + 1e-6 >= dwell) {
            active[pc] = active[pc] ? 0 : 1;
            pending[pc] = NaN;
          }
        }
        if (active[pc]) notes.push(pc as PitchClass);
      }
      return notes;
    },
  };
}
