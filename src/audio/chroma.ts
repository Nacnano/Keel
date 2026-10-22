/**
 * Harmonic pitch-class profile from spectral peaks. Pure, node-safe.
 *
 * Default method, `transfer` (harmonic attribution): peaks are visited from low to high.
 * Each one predicts its partials at h·f (h = 2..H, allowing for piano stretch) with an
 * expected relative amplitude `PARTIAL_PROFILE[h]`; up to that much of every matching
 * higher peak is moved onto the lower peak's pitch class. A real piano note's 3rd partial
 * (a fifth up), 5th (a major third up) and 7th (a minor seventh up) therefore count for the
 * note itself instead of adding phantom fifths, thirds and sevenths, while a chord tone
 * that is much louder than the predicted partial keeps most of its own mass. The
 * prediction uses what is left of the lower peak after even lower notes claimed it, so
 * chains (C2 → G3 → D5) are not double counted.
 *
 * Legacy method, `hpcp`: every peak votes for its own pitch class and for f/2 … f/H with
 * weights 1/h when a peak exists there (harmonic sieve). Partials keep their full weight on
 * their own pitch class, which is what made triads read as power chords, sus chords and 7ths
 * on real pianos (see docs/ACCURACY.md).
 *
 * Votes are shared between the two nearest semitones with cos² weights (a partition of unity),
 * so slightly detuned partials are not dropped.
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
  /** `transfer` (default) or the legacy `hpcp` sub-harmonic voting. */
  method?: 'transfer' | 'hpcp';
}

/**
 * Expected partial amplitude relative to the fundamental's remaining magnitude, index = h.
 * Generous on purpose (piano partials 2–4 are often as strong as the fundamental, and laptop
 * mics lose the fundamental of bass notes): only the excess over this stays on a partial.
 */
export const PARTIAL_PROFILE = [0, 1, 1, 0.8, 0.7, 0.55, 0.45, 0.35, 0.3];

/** Partial h of f0 is searched in [h·f0 − 35 cents, h·f0 + 65 cents] (string stretch). */
const STRETCH_LO = Math.pow(2, -35 / 1200);
const STRETCH_HI = Math.pow(2, 65 / 1200);

/** Index of the peak nearest `freq` within [freq·lo, freq·hi], or -1. */
function nearestPeak(sorted: readonly Peak[], freq: number, lo: number, hi: number): number {
  const a0 = freq * lo;
  const b0 = freq * hi;
  let a = 0;
  let b = sorted.length;
  while (a < b) {
    const mid = (a + b) >>> 1;
    if (sorted[mid].freq < a0) a = mid + 1;
    else b = mid;
  }
  let best = -1;
  let bestD = Infinity;
  for (let i = a; i < sorted.length && sorted[i].freq <= b0; i++) {
    const d = Math.abs(Math.log(sorted[i].freq / freq));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Per-peak mass after harmonic attribution: `own[i]` stays on peak i's pitch class,
 * `claimed[i]` is mass taken from i's partials (also voted on i's pitch class).
 * `peaks` must be sorted by ascending frequency.
 */
export function attributeHarmonics(
  peaks: readonly Peak[],
  harmonics: number,
  magnitudeExponent = 1,
): { own: Float64Array; claimed: Float64Array } {
  const n = peaks.length;
  const own = new Float64Array(n);
  const claimed = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const m = peaks[i].mag > 0 ? peaks[i].mag : 0;
    own[i] = magnitudeExponent === 1 ? m : Math.pow(m, magnitudeExponent);
  }
  const maxH = Math.min(harmonics, PARTIAL_PROFILE.length - 1);
  for (let i = 0; i < n; i++) {
    const base = own[i];
    if (!(base > 0) || !(peaks[i].freq > 0)) continue;
    for (let h = 2; h <= maxH; h++) {
      const j = nearestPeak(peaks, peaks[i].freq * h, STRETCH_LO, STRETCH_HI);
      if (j <= i) continue;
      const take = Math.min(own[j], base * PARTIAL_PROFILE[h]);
      if (take <= 0) continue;
      own[j] -= take;
      claimed[i] += take;
    }
  }
  return { own, claimed };
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
    method = 'transfer',
  } = opts;
  const vote = (f: number, v: number) => {
    const midi = hzToMidi(f, a4);
    const lower = Math.floor(midi);
    const frac = midi - lower; // 0..1 distance above the lower semitone
    const wLower = Math.cos((Math.PI / 2) * frac) ** 2;
    const pcLower = ((lower % 12) + 12) % 12;
    out[pcLower] += v * wLower;
    out[(pcLower + 1) % 12] += v * (1 - wLower);
  };
  let total = 0;
  if (method === 'transfer') {
    const { own, claimed } = attributeHarmonics(peaks, harmonics, magnitudeExponent);
    for (let i = 0; i < peaks.length; i++) {
      const v = own[i] + claimed[i];
      if (!(peaks[i].freq >= minCandidateHz) || !(v > 0)) continue;
      vote(peaks[i].freq, v);
      total += v;
    }
    return total;
  }
  const weights = harmonicWeights(harmonics);
  for (const peak of peaks) {
    if (!(peak.freq > 0) || !(peak.mag > 0)) continue;
    const m = magnitudeExponent === 1 ? peak.mag : Math.pow(peak.mag, magnitudeExponent);
    for (let h = 0; h < weights.length; h++) {
      const f = peak.freq / (h + 1);
      if (f < minCandidateHz) break;
      if (h > 0 && requireSupport && !hasPeakNear(peaks, f, supportCents)) continue;
      const v = m * weights[h];
      vote(f, v);
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
