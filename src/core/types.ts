/**
 * Shared contracts for Keel. FROZEN after PR 1.
 * Changes require a dedicated `core:` PR reviewed by the integrator.
 * See docs/IMPLEMENTATION_PLAN.md §2.
 */

export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11; // 0 = C
export type MidiNote = number; // 0..127
export type Seconds = number; // AudioContext time unless stated

export type VocabLevel = 1 | 2 | 3;

export type ChordQuality =
  // level 1
  | '5'
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | 'sus2'
  | 'sus4'
  // level 2
  | 'maj7'
  | 'min7'
  | '7'
  | 'dim7'
  | 'm7b5'
  | 'mMaj7'
  | '6'
  | 'm6'
  | 'add9'
  | 'madd9'
  // level 3
  | '9'
  | 'maj9'
  | 'min9'
  | '11'
  | 'min11'
  | '13'
  | 'maj13'
  | 'min13'
  | '7b9'
  | '7#9'
  | '7#11'
  | '7b13'
  | '7alt'
  | 'maj7#11'
  | '6/9'
  | '7sus4'
  | '9sus4';

export interface Chord {
  root: PitchClass;
  quality: ChordQuality;
  /** Present only when the bass differs from the root (slash chord). */
  bass?: PitchClass;
}

export type KeyMode = 'major' | 'minor';

export interface Key {
  tonic: PitchClass;
  mode: KeyMode;
}

export interface KeyEstimate extends Key {
  confidence: number; // 0..1
  /** Relative major/minor of the winner, always filled. */
  relative: Key;
  /** Top alternatives, descending. */
  alternatives: Array<Key & { score: number }>;
}

export interface ChromaFrame {
  t: Seconds;
  /** 12 bins, index 0 = C, L1-normalised (sums to 1) or all zeros if silent. */
  chroma: Float32Array;
  /**
   * Piano-key bins when they differ from `chroma`. Absent means the keys follow `chroma`
   * (MIDI, tests, and frames that passed the harmonic/phase check). Zeros suppress keys
   * while a chord may still be scored from `chroma`.
   */
  noteChroma?: Float32Array;
  /**
   * Exact keys for this frame. Present (possibly empty) on microphone frames: only these
   * notes may light, never every octave of a pitch class. Absent on older fixtures, which
   * fall back to pitch-class chroma.
   */
  midiNotes?: MidiNote[];
  /** Per-note acoustic support, 0..1; display evidence, not pitch probabilities. */
  noteConfidences?: Record<MidiNote, number>;
  /** 0..1 loudness proxy. */
  energy: number;
  bass: PitchClass | null;
  onset: boolean;
  /** true when derived from MIDI (no spectral uncertainty). */
  exact: boolean;
}

export interface MidiNoteEvent {
  t: Seconds;
  type: 'on' | 'off';
  note: MidiNote;
  velocity: number; // 0..127
  channel: number;
}

export interface MidiControlEvent {
  t: Seconds;
  type: 'cc';
  controller: number; // 64 = sustain
  value: number;
  channel: number;
}

export type MidiEvent = MidiNoteEvent | MidiControlEvent;

export type InputSource = 'mic' | 'midi';
export type JamMode = 'solo' | 'room';
export type Instrument = 'piano' | 'guitar';

/**
 * A published key. `t` is where the key's evidence starts, so the timeline draws (and numbers)
 * the key from there: the first key of a song is dated from its first sound, a change from
 * where the new key's lead began. The engine only publishes a key once it has held for a few
 * seconds, and never publishes the parallel key (C major → C minor) as a change.
 *
 * A key that turns out short (replaced less than ~10 s after its evidence started) is
 * withdrawn: its replacement carries `supersedes` = the withdrawn event's `id` and
 * `replacesSince` = the withdrawn key's start, and its `t` is that start too, so a timeline
 * drops the short key and draws the replacement from there (a consumer that ignores the fields
 * sees the short key with zero length).
 *
 * All extra fields are optional: events from mocks, files and older sessions have none.
 */
export interface KeyEvent {
  type: 'key';
  t: Seconds;
  key: KeyEstimate;
  /** Set by the analysis engine: unique within a jam (counts up from 1 after `reset()`). */
  id?: number;
  /** Where the evidence for this key started (seconds, the clock of `t`). */
  since?: Seconds;
  /** `id` of the key event this one withdraws (drop it from the key history). */
  supersedes?: number;
  /** Start (`t`) of the withdrawn key: relabel from here. */
  replacesSince?: Seconds;
}

export type AnalysisEvent =
  | { type: 'chord'; t: Seconds; chord: Chord | null; confidence: number; source: InputSource }
  | KeyEvent
  | {
      type: 'notes';
      t: Seconds;
      pitchClasses: PitchClass[];
      midiNotes?: MidiNote[];
      /** Repeated microphone candidates awaiting confirmation. Disjoint from midiNotes. */
      tentativeMidiNotes?: MidiNote[];
      /** Per-note 0..1 acoustic support and stability for display, not a calibrated probability. MIDI omits it. */
      noteConfidences?: Record<MidiNote, number>;
    }
  | {
      /** Display-only estimates; never session history, recorded MIDI or confirmed theory. */
      type: 'preview';
      t: Seconds;
      chord: Chord | null;
      confidence: number;
      key: KeyEstimate | null;
    }
  | { type: 'level'; t: Seconds; energy: number };

export interface AnalysisConfig {
  vocabLevel: VocabLevel;
  mode: JamMode;
  instrument: Instrument;
  a4: number; // Hz, default 440
  /** 0 = snappy, 1 = very stable. Default 0.5. */
  stability: number;
  showSlashChords: boolean;
}

export interface AnalysisEngine {
  configure(patch: Partial<AnalysisConfig>): void;
  push(frame: ChromaFrame): void;
  reset(): void;
  /**
   * Forget the key history and estimate the key from scratch on what comes next ("New song"),
   * leaving the chord state alone. The next `key` event arrives after the usual first-key delay.
   */
  resetKey(): void;
  subscribe(cb: (e: AnalysisEvent) => void): () => void;
}

export interface AudioInput {
  listDevices(): Promise<MediaDeviceInfo[]>;
  start(opts?: { deviceId?: string; a4?: number; instrument?: Instrument }): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  onFrame(cb: (f: ChromaFrame) => void): () => void;
  /** Raw stream for the audio recorder (WS-F). */
  getStream(): MediaStream | null;
  getContext(): AudioContext | null;
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
}

export interface MidiInput {
  isSupported(): boolean;
  listDevices(): Promise<MidiDeviceInfo[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(): void;
  onEvent(cb: (e: MidiEvent) => void): () => void;
  /** ChromaFrame derived from currently held (incl. sustained) notes. */
  onFrame(cb: (f: ChromaFrame) => void): () => void;
}

export interface MidiPlayer {
  load(): Promise<void>; // fetch piano samples
  play(events: MidiEvent[], opts?: { from?: Seconds; rate?: number }): void;
  seek(t: Seconds): void;
  pause(): void;
  stop(): void;
  onTick(cb: (t: Seconds) => void): () => void;
  noteOn(note: MidiNote, velocity?: number): void; // for "tap to hear" chords
  noteOff(note: MidiNote): void;
}
