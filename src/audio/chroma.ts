/**
 * HPCP-style harmonic pitch-class profile. Pure, node-safe.
 *
 * Every spectral peak at frequency f votes for the pitch class of f and for
 * the sub-harmonic candidates f/2, f/3, … f/H with weights 1/h
 * ([1, 0.5, 0.33, 0.25, …]). A partial that is really the 3rd harmonic of a
 * lower note therefore also reinforces that lower note, and harmonics end up
 * down-weighted relative to fundamentals. Each vote is shared between the two
 * nearest semitones with cos² weights (a partition of unity), so slightly
 * detuned partials are not dropped.
 */
import type { Peak } from './peaks';

export interface ChromaOptions {
  /** Reference tuning in Hz. Default 440. */
  a4?: number;
  /** Number of sub-harmonic candidates per peak (piano 6, guitar 4). */
  harmonics?: number;
  /** Candidates below this frequency are ignored. Default 25 Hz. */
  minCandidateHz?: number;
  /** Magnitude exponent applied before voting (1 = linear, 2 = power). */
  magnitudeExponent?: number;
  /**
   * Harmonic sieve: a peak only votes for a sub-harmonic candidate f/h (h ≥ 2)
   * when another peak lies within `supportCents` of f/h, i.e. the implied
   * fundamental is actually present. Removes "ghost" pitch classes a fifth or
   * a major third below every note (f/3, f/5). Default true.
   */
  requireSupport?: boolean;
  supportCents?: number;
}

/** True when a peak in `sorted` (ascending freq) lies within `cents` of `freq`. */
function hasPeakNear(sorted: readonly Peak[], freq: number, cents: number): boolean {
  const ratio = Math.pow(2, cents / 1200);
  const lo = freq / ratio;
  const hi = freq * ratio;
  let a = 0;
  let b = sorted.length;
  while (a < b) {
    const mid = (a + b) >>> 1;
    if (sorted[mid].freq < lo) a = mid + 1;
    else b = mid;
  }
  return a < sorted.length && sorted[a].freq <= hi;
}

/** Sub-harmonic weights 1/h for h = 1..n. */
export function harmonicWeights(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 1 / (i + 1));
}

/** Fractional MIDI number of a frequency for a given A4. */
export function hzToMidi(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

/**
 * Accumulate the chroma of `peaks` into `out` (length 12, not cleared, not
 * normalised). Returns the total mass added.
 */
export function accumulateChroma(
  peaks: readonly Peak[],
  out: Float32Array | Float64Array,
  opts: ChromaOptions = {},
): number {
  const {
    a4 = 440,
    harmonics = 6,
    minCandidateHz = 25,
    magnitudeExponent = 1,
    requireSupport = true,
    supportCents = 50,
  } = opts;
  const weights = harmonicWeights(harmonics);
  let total = 0;
  for (const peak of peaks) {
    if (!(peak.freq > 0) || !(peak.mag > 0)) continue;
    const m = magnitudeExponent === 1 ? peak.mag : Math.pow(peak.mag, magnitudeExponent);
    for (let h = 0; h < weights.length; h++) {
      const f = peak.freq / (h + 1);
      if (f < minCandidateHz) break;
      if (h > 0 && requireSupport && !hasPeakNear(peaks, f, supportCents)) continue;
      const midi = hzToMidi(f, a4);
      const lower = Math.floor(midi);
      const frac = midi - lower; // 0..1 distance above the lower semitone
      const wLower = Math.cos((Math.PI / 2) * frac) ** 2;
      const v = m * weights[h];
      const pcLower = ((lower % 12) + 12) % 12;
      out[pcLower] += v * wLower;
      out[(pcLower + 1) % 12] += v * (1 - wLower);
      total += v;
    }
  }
  return total;
}

/** L1-normalise in place. Leaves all zeros untouched. Returns the original sum. */
export function normalizeL1(x: Float32Array | Float64Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  if (s > 0) for (let i = 0; i < x.length; i++) x[i] /= s;
  return s;
}

/** Chroma of a peak list: 12 bins, index 0 = C, L1-normalised or all zeros. */
export function computeChroma(peaks: readonly Peak[], opts: ChromaOptions = {}): Float32Array {
  const out = new Float32Array(12);
  accumulateChroma(peaks, out, opts);
  normalizeL1(out);
  return out;
}
