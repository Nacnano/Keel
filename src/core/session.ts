/**
 * Storage shapes shared by data (WS-F) and UI (WS-E/WS-H). FROZEN after PR 1.
 */
import type {
  Chord,
  InputSource,
  Instrument,
  JamMode,
  Key,
  KeyEstimate,
  MidiEvent,
  VocabLevel,
} from './types';

export interface Session {
  id: string; // uuid v4
  name: string;
  createdAt: number; // epoch ms
  endedAt: number | null;
  durationSec: number;
  mode: JamMode;
  instrument: Instrument;
  vocabLevel: VocabLevel;
  tags: string[];
  hasAudio: boolean;
  hasMidi: boolean;
  summary: SessionSummary | null;
  updatedAt: number;
  deleted: boolean; // soft delete, sync-ready
}

export interface ChordRecord {
  id: string;
  sessionId: string;
  t: number; // seconds from session start
  chord: Chord | null;
  confidence: number;
  source: InputSource;
  manual: boolean; // true if edited in review
}

export interface KeyRecord {
  id: string;
  sessionId: string;
  t: number;
  key: KeyEstimate;
}

export type MarkerKind =
  'bookmark' | 'intro' | 'verse' | 'pre' | 'chorus' | 'bridge' | 'outro' | 'custom';

export interface Marker {
  id: string;
  sessionId: string;
  t: number;
  kind: MarkerKind;
  label?: string;
}

/** One row per session. Event times are seconds from session start. */
export interface MidiTrack {
  sessionId: string;
  events: MidiEvent[];
}

export interface AudioRecording {
  sessionId: string;
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

export interface SessionSummary {
  keys: Array<{ key: Key; seconds: number }>;
  topProgressions: Array<{ chords: Chord[]; count: number }>;
  chordCount: number;
  bookmarks: number;
}

export interface Settings {
  a4: number;
  vocabLevel: VocabLevel;
  instrument: Instrument;
  mode: JamMode;
  stability: number;
  showSlashChords: boolean;
  spellingFollowsKey: boolean;
  audioDeviceId: string | null;
  midiDeviceId: string | null;
  recordAudioByDefault: boolean;
  theme: 'dark' | 'light' | 'system';
}
