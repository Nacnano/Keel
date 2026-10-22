/** Bass note from the lowest significant spectral peak. Pure, node-safe. */
import type { PitchClass } from '@/core/types';
import { hzToMidi } from './chroma';
import type { Peak } from './peaks';

export interface BassOptions {
  a4?: number;
  minHz?: number;
  maxHz?: number;
  /**
   * A peak is "significant" when its magnitude is at least this fraction of
   * the strongest peak in the whole spectrum. Default 0.1 (-20 dB), safely
   * above Hann side lobes (-31 dB).
   */
  relativeThreshold?: number;
  /**
   * When > 0, a candidate must also have a partial at 2f or 3f (±60 cents) of at least this
   * fraction of the strongest peak. Rejects rumble and stray low peaks, which is what allows a
   * low `relativeThreshold` (a piano bass note under the pedal sits 20–30 dB below the newest
   * right-hand notes but is still the bass you hear). Default 0 (off).
   */
  harmonicSupport?: number;
}

function peakNear(peaks: readonly Peak[], freq: number, minMag: number): boolean {
  const lo = freq * Math.pow(2, -60 / 1200);
  const hi = freq * Math.pow(2, 60 / 1200);
  for (const p of peaks) {
    if (p.freq > hi) break;
    if (p.freq >= lo && p.mag >= minMag) return true;
  }
  return false;
}

export interface BassEstimate {
  pc: PitchClass;
  freq: number;
  /** 0..1: bass peak magnitude relative to the strongest peak. */
  confidence: number;
}

/**
 * Lowest significant interpolated peak in [minHz, maxHz] (default 30–260 Hz,
 * B0..C4) → pitch class. `peaks` must be sorted by ascending frequency (as
 * returned by `findPeaks`). Null when no peak qualifies.
 */
export function detectBass(peaks: readonly Peak[], opts: BassOptions = {}): BassEstimate | null {
  const { a4 = 440, minHz = 30, maxHz = 260, relativeThreshold = 0.1, harmonicSupport = 0 } = opts;
  let maxMag = 0;
  for (const p of peaks) if (p.mag > maxMag) maxMag = p.mag;
  if (maxMag <= 0) return null;
  const threshold = maxMag * relativeThreshold;
  for (const p of peaks) {
    if (p.freq < minHz) continue;
    if (p.freq > maxHz) break;
    if (p.mag >= threshold) {
      if (
        harmonicSupport > 0 &&
        !peakNear(peaks, 2 * p.freq, maxMag * harmonicSupport) &&
        !peakNear(peaks, 3 * p.freq, maxMag * harmonicSupport)
      ) {
        continue;
      }
      const midi = Math.round(hzToMidi(p.freq, a4));
      const pc = (((midi % 12) + 12) % 12) as PitchClass;
      return { pc, freq: p.freq, confidence: Math.min(1, p.mag / maxMag) };
    }
  }
  return null;
}
