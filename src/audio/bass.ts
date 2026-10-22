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
  const { a4 = 440, minHz = 30, maxHz = 260, relativeThreshold = 0.1 } = opts;
  let maxMag = 0;
  for (const p of peaks) if (p.mag > maxMag) maxMag = p.mag;
  if (maxMag <= 0) return null;
  const threshold = maxMag * relativeThreshold;
  for (const p of peaks) {
    if (p.freq < minHz) continue;
    if (p.freq > maxHz) break;
    if (p.mag >= threshold) {
      const midi = Math.round(hzToMidi(p.freq, a4));
      const pc = (((midi % 12) + 12) % 12) as PitchClass;
      return { pc, freq: p.freq, confidence: Math.min(1, p.mag / maxMag) };
    }
  }
  return null;
}
