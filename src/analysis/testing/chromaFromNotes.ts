/**
 * Synthetic "mic-like" chroma frames for analysis tests, independent of src/audio.
 *
 * Each note contributes 1 to its pitch class (the lowest note 1.3), leaks 0.15 into the
 * fifth above (3rd partial) and 0.1 into the major third above (5th partial), and every bin
 * gets a little deterministic noise. The result is L1-normalised with `exact: false`.
 */
import type { ChromaFrame, MidiNote, PitchClass } from '@/core';
import { midiChord } from '@/core/testing/midi';

export interface MicChromaOptions {
  t?: number;
  energy?: number;
  /** Max uniform noise added per bin (before normalisation). */
  noise?: number;
  seed?: number;
  /** Override the detected bass (default: lowest note). */
  bass?: PitchClass | null;
  onset?: boolean;
}

function lcg(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 0xffffffff;
  };
}

export function chromaFromNotes(notes: MidiNote[], opts: MicChromaOptions = {}): ChromaFrame {
  const { t = 0, energy = 0.6, noise = 0.05, seed = 1, onset = false } = opts;
  const rand = lcg(seed);
  const chroma = new Float32Array(12);
  if (notes.length === 0) {
    return { t, chroma, energy: 0, bass: null, onset, exact: false };
  }
  const lowest = Math.min(...notes);
  for (const n of notes) {
    const w = n === lowest ? 1.3 : 1;
    chroma[n % 12] += w;
    chroma[(n + 7) % 12] += 0.15 * w;
    chroma[(n + 4) % 12] += 0.1 * w;
  }
  for (let b = 0; b < 12; b++) chroma[b] += noise * rand();
  const sum = chroma.reduce((a, b) => a + b, 0);
  for (let b = 0; b < 12; b++) chroma[b] /= sum;
  const bass = opts.bass === undefined ? ((lowest % 12) as PitchClass) : opts.bass;
  return { t, chroma, energy, bass, onset, exact: false };
}

export const FPS = 23;

export interface Step {
  /** Note names, e.g. ['C3', 'E3', 'G3']. */
  notes: string[];
  seconds: number;
}

/** Mic-like frames for a chord progression at ~23 fps; noise seed varies per frame. */
export function progressionFrames(
  steps: Step[],
  opts: { t0?: number; noise?: number } = {},
): ChromaFrame[] {
  const frames: ChromaFrame[] = [];
  let t = opts.t0 ?? 0;
  let i = 0;
  for (const step of steps) {
    const notes = midiChord(step.notes);
    const count = Math.round(step.seconds * FPS);
    for (let k = 0; k < count; k++) {
      frames.push(chromaFromNotes(notes, { t, seed: 7919 * ++i, noise: opts.noise }));
      t += 1 / FPS;
    }
  }
  return frames;
}
