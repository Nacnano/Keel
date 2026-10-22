import type { AnalysisConfig, PitchClass } from './types';
import type { Settings } from './session';

export const NOTE_NAMES_SHARP = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;
export const NOTE_NAMES_FLAT = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const;

export const ALL_PITCH_CLASSES: readonly PitchClass[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** DSP constants (samples). At 48 kHz: frame = 171 ms, hop = 43 ms. */
export const FRAME_SIZE = 8192;
export const HOP_SIZE = 2048;

export const DEFAULT_A4 = 440;

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  vocabLevel: 2,
  mode: 'solo',
  instrument: 'piano',
  a4: DEFAULT_A4,
  stability: 0.5,
  showSlashChords: true,
};

export const DEFAULT_SETTINGS: Settings = {
  a4: DEFAULT_A4,
  vocabLevel: 2,
  instrument: 'piano',
  mode: 'solo',
  stability: 0.5,
  showSlashChords: true,
  spellingFollowsKey: true,
  audioDeviceId: null,
  midiDeviceId: null,
  recordAudioByDefault: false,
  theme: 'dark',
};

/** Chord confidence below which the UI shows a dash instead of a label. */
export const MIN_DISPLAY_CONFIDENCE = 0.35;
