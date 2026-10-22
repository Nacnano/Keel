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
}

export const INSTRUMENT_PROFILES: Record<Instrument, InstrumentProfile> = {
  // Strong harmonics, long sustain: more sub-harmonic folding, slow level decay.
  piano: { harmonics: 6, onsetThreshold: 0.3, onsetHoldMs: 40, energyReleaseSec: 0.4 },
  // Fewer strong harmonics, strummed attacks: more aggressive onset gating.
  guitar: { harmonics: 4, onsetThreshold: 0.25, onsetHoldMs: 60, energyReleaseSec: 0.15 },
};
