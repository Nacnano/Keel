import type { Chord, Instrument, JamMode, PitchClass } from '@/core/types';

export interface TruthSpan {
  start: number;
  end: number;
  /** null = no music expected; 'unknown' = unannotated, never counted as correct. */
  chord: Chord | null | 'unknown';
}

export interface BenchmarkCase {
  id: string;
  group: 'piano' | 'guitar' | 'band' | 'noise' | 'recorded-noise' | 'recorded-piano';
  provenance: 'recorded' | 'rendered' | 'hybrid' | 'synthetic';
  sampleRate: number;
  instrument: Instrument;
  mode: JamMode;
  sensitivity: number;
  samples: Float32Array;
  truth: TruthSpan[];
  /** Strict zero false chords/keys for deterministic nonmusical controls. */
  strictNoise?: boolean;
}

export interface DisplayFrame {
  wall: number;
  chord: Chord | null;
  notes: PitchClass[];
}

export interface BenchmarkMetrics {
  durationSec: number;
  musicSec: number;
  noiseSec: number;
  annotatedFraction: number;
  accuracy: number | null;
  steadyAccuracy: number | null;
  coverage: number;
  noteCoverage: number;
  missedChanges: number;
  expectedChanges: number;
  latencyP90Sec: number | null;
  wrongChanges: number;
  chordFlickers: number;
  noteChanges: number;
  noteFlashes: number;
  falseChordSec: number;
  falseNoteSec: number;
  falseKeyEvents: number;
  releaseSec: number | null;
}

export interface BenchmarkResult {
  id: string;
  group: BenchmarkCase['group'];
  provenance: BenchmarkCase['provenance'];
  inputHash: string;
  strictNoise: boolean;
  metrics: BenchmarkMetrics;
}
