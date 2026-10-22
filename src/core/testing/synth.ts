/**
 * Deterministic audio synthesis for tests (WS-B, WS-C). Node-safe, no DOM.
 */
import type { MidiNote } from '../types';

export interface SynthOptions {
  /** MIDI note numbers to sound together. */
  notes: MidiNote[];
  sampleRate?: number;
  seconds?: number;
  /** Number of harmonics per note (1 = pure sine). */
  harmonics?: number;
  /** Per-harmonic amplitude roll-off exponent. amp_k = 1 / k^rolloff. */
  rolloff?: number;
  /** Exponential amplitude decay per second (0 = sustain). Piano ≈ 0.8. */
  decay?: number;
  a4?: number;
  /** Peak amplitude of the mix. */
  gain?: number;
  /** Linear attack time in seconds. */
  attack?: number;
}

export function midiToHz(note: MidiNote, a4 = 440): number {
  return a4 * Math.pow(2, (note - 69) / 12);
}

/** Sum of harmonic sines per note, piano-like decay. */
export function synthChord(opts: SynthOptions): Float32Array {
  const {
    notes,
    sampleRate = 48000,
    seconds = 1,
    harmonics = 6,
    rolloff = 1.2,
    decay = 0.8,
    a4 = 440,
    gain = 0.5,
    attack = 0.005,
  } = opts;
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  if (notes.length === 0) return out;
  const nyquist = sampleRate / 2;
  for (const note of notes) {
    const f0 = midiToHz(note, a4);
    for (let k = 1; k <= harmonics; k++) {
      const f = f0 * k;
      if (f >= nyquist) break;
      const amp = 1 / Math.pow(k, rolloff);
      const w = (2 * Math.PI * f) / sampleRate;
      for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-decay * t) * Math.min(1, attack > 0 ? t / attack : 1);
        out[i] += amp * env * Math.sin(w * i);
      }
    }
  }
  // normalise to requested gain
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const s = gain / peak;
    for (let i = 0; i < n; i++) out[i] *= s;
  }
  return out;
}

export interface ProgressionStep {
  notes: MidiNote[];
  seconds: number;
}

/** Concatenate chords, optionally with silence gaps between them. */
export function synthProgression(
  steps: ProgressionStep[],
  opts: Omit<SynthOptions, 'notes' | 'seconds'> & { gapSeconds?: number } = {},
): Float32Array {
  const sampleRate = opts.sampleRate ?? 48000;
  const gap = Math.floor((opts.gapSeconds ?? 0) * sampleRate);
  const parts = steps.map((s) => synthChord({ ...opts, notes: s.notes, seconds: s.seconds }));
  const total = parts.reduce((a, p) => a + p.length + gap, 0);
  const out = new Float32Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length + gap;
  }
  return out;
}

/** White noise for robustness tests. Deterministic LCG. */
export function noise(samples: number, amplitude = 0.01, seed = 1): Float32Array {
  const out = new Float32Array(samples);
  let x = seed >>> 0;
  for (let i = 0; i < samples; i++) {
    x = (1664525 * x + 1013904223) >>> 0;
    out[i] = ((x / 0xffffffff) * 2 - 1) * amplitude;
  }
  return out;
}

export function mix(a: Float32Array, b: Float32Array): Float32Array {
  const n = Math.max(a.length, b.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

/** Convenience: note names like 'C4', 'F#3' → MIDI. */
export function noteNumber(name: string): MidiNote {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`bad note name: ${name}`);
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pc = base[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}
