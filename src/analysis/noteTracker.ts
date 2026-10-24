import type { PitchClass } from '@/core';

/** Separate on/off thresholds prevent borderline microphone estimates from blinking. */
export const NOTE_THRESHOLD = 0.1;
export const NOTE_RELEASE_THRESHOLD = 0.06;
export const NOTE_ATTACK_SEC = 0.12;
export const NOTE_RELEASE_SEC = 0.24;

/** Repeated candidates preview one hop before the historical confirmation gate. */
export const NOTE_TENTATIVE_SEC = 0.08;
export const NOTE_CONFIRM_SEC = NOTE_ATTACK_SEC;

/** Octave-specific microphone observations; exact MIDI bypasses this tracker entirely. */
export function createPlayedNoteTracker() {
  const visible = new Set<number>();
  const confirmed = new Set<number>();
  const attacks = new Map<number, number>();
  const releases = new Map<number, number>();
  let lastT = -Infinity;

  function reset() {
    visible.clear();
    confirmed.clear();
    attacks.clear();
    releases.clear();
    lastT = -Infinity;
  }

  function pushState(
    t: number,
    notes: readonly number[],
    silent = false,
    tentativeNotes: readonly number[] = notes,
  ) {
    if (t < lastT || t - lastT > 0.5) reset();
    const repeated = t > lastT;
    lastT = t;
    const eligible = new Set(tentativeNotes);
    const want = new Set(
      silent ? [] : notes.filter((n) => Number.isInteger(n) && n >= 0 && n <= 127),
    );
    for (const note of attacks.keys()) if (!want.has(note)) attacks.delete(note);
    for (const note of want) {
      releases.delete(note);
      if (!attacks.has(note)) attacks.set(note, t);
      const held = t - attacks.get(note)!;
      if (repeated && eligible.has(note) && held + 1e-6 >= NOTE_TENTATIVE_SEC) visible.add(note);
      if (repeated && held + 1e-6 >= NOTE_CONFIRM_SEC) {
        visible.add(note);
        confirmed.add(note);
      }
    }
    for (const note of visible) {
      if (want.has(note)) continue;
      if (!confirmed.has(note)) {
        visible.delete(note);
        continue;
      }
      if (!releases.has(note)) releases.set(note, t);
      if (t - releases.get(note)! + 1e-6 >= NOTE_RELEASE_SEC) {
        visible.delete(note);
        confirmed.delete(note);
        releases.delete(note);
      }
    }
    return {
      midiNotes: [...confirmed].sort((a, b) => a - b),
      tentativeMidiNotes: [...visible].filter((n) => !confirmed.has(n)).sort((a, b) => a - b),
    };
  }

  return {
    reset,
    pushState,
    /** Historical union API retained for callers that do not distinguish certainty. */
    push(t: number, notes: readonly number[], silent = false): number[] {
      const state = pushState(t, notes, silent);
      return [...state.midiNotes, ...state.tentativeMidiNotes].sort((a, b) => a - b);
    },
  };
}

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
