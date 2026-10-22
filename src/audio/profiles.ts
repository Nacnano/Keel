/** Instrument profiles for the chroma pipeline. */
import type { Instrument } from '@/core/types';

export interface InstrumentProfile {
  /** Sub-harmonic candidates per peak in the HPCP (see chroma.ts). */
  harmonics: number;
  /** Relative spectral-flux onset threshold (see gate.ts). */
  onsetThreshold: number;
  /** Post-onset hold: chroma/bass are frozen this long after an attack. */
  onsetHoldMs: number;
  /** Release time constant of the reported `energy` (level meter decay). */
  energyReleaseSec: number;
  /**
   * Peak magnitudes are raised to this power before the chroma (0.6 ≈ loudness-like
   * compression): a chord tone struck a second ago, 15–20 dB below the newest attack, still
   * counts, and a doubled root does not swamp the third.
   */
  peakExponent: number;
  /** Peaks must stand this far (dB) above the local noise level (see peaks.ts). */
  peakProminenceDb: number;
  /** Bass: lowest peak at least this fraction of the strongest one … */
  bassRelativeThreshold: number;
  /** … that also has a partial at 2f or 3f of at least this fraction (see bass.ts). */
  bassHarmonicSupport: number;
}

export const INSTRUMENT_PROFILES: Record<Instrument, InstrumentProfile> = {
  // Strong, stretched partials and long sustain: harmonic attribution up to h = 8 (measured
  // on the Splendid Grand samples: partials 2–5 within 0–15 dB of the strongest), slow meter.
  piano: {
    harmonics: 8,
    onsetThreshold: 0.3,
    onsetHoldMs: 40,
    energyReleaseSec: 0.4,
    peakExponent: 0.6,
    peakProminenceDb: 10,
    bassRelativeThreshold: 0.03,
    bassHarmonicSupport: 0.01,
  },
  // Fewer strong harmonics, strummed attacks: more aggressive onset gating.
  // Chroma/bass values are the piano ones (not measured on guitar recordings yet).
  guitar: {
    harmonics: 4,
    onsetThreshold: 0.25,
    onsetHoldMs: 60,
    energyReleaseSec: 0.15,
    peakExponent: 0.6,
    peakProminenceDb: 10,
    bassRelativeThreshold: 0.03,
    bassHarmonicSupport: 0.01,
  },
};
