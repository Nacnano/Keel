import type { Chord, Instrument, JamMode, PitchClass } from '@/core/types';

export interface TruthSpan {
  start: number;
  end: number;
  /** null = no music expected; 'unknown' = unannotated, never counted as correct. */
  chord: Chord | null | 'unknown';
  /** Independently known sounding MIDI notes; absent means unknown (except labeled silence). */
  midiNotes?: number[];
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
  /** Legacy confirmed pitch classes, unchanged protocol. */
  notes: PitchClass[];
  midiNotes?: number[];
  tentativeMidiNotes?: number[];
}

export interface ExactNoteChannelMetrics {
  visibleSec: number;
  activityCoverage: number;
  trueNoteSec: number;
  falseNoteSec: number;
  missedNoteSec: number;
  octaveErrorSec: number;
  falseVisibleSec: number;
  precision: number | null;
  recall: number | null;
  onsetP90Sec: number | null;
  missedOnsets: number;
  releaseSec: number | null;
}

export interface ExactNoteMetrics {
  protocol: 1;
  annotatedSec: number;
  expectedNoteSec: number;
  expectedOnsets: number;
  confirmed: ExactNoteChannelMetrics;
  tentative: ExactNoteChannelMetrics;
  union: ExactNoteChannelMetrics;
}

export interface BenchmarkMetrics {
  exactNotes: ExactNoteMetrics;
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
