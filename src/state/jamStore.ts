import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { clock, MIN_DISPLAY_CONFIDENCE } from '@/core';
import type {
  AnalysisEvent,
  Chord,
  ChordRecord,
  InputSource,
  KeyEstimate,
  Marker,
  MarkerKind,
  MidiNote,
  PitchClass,
} from '@/core';

export type JamStatus = 'idle' | 'starting' | 'listening' | 'error';

export interface KeyHistoryEntry {
  /** Seconds from session start. */
  t: number;
  key: KeyEstimate;
}

export interface JamData {
  status: JamStatus;
  error?: string;
  source: InputSource | null;
  currentChord: Chord | null;
  confidence: number;
  key: KeyEstimate | null;
  keyHistory: KeyHistoryEntry[];
  /** Deduplicated chord changes; `t` is seconds from session start. */
  timeline: ChordRecord[];
  activePitchClasses: PitchClass[];
  activeMidiNotes: MidiNote[];
  level: number;
  /** Clock seconds (same timeline as AnalysisEvent.t) at which the session started. */
  sessionStart: number | null;
  sessionId: string | null;
  /** Session-relative time of the most recent event. */
  lastT: number;
  markers: Marker[];
  recordAudio: boolean;
  /** The session is the scripted demo (nothing is saved). */
  demo: boolean;
}

export interface JamActions {
  applyEvent(e: AnalysisEvent): void;
  /** Clears the session data and starts a new session at `t0` (clock seconds, default now). */
  startSession(t0?: number, opts?: { demo?: boolean }): void;
  stopSession(): void;
  /** Clears timeline, key history and markers. Keeps status, source and current key. */
  reset(): void;
  addMarker(kind: MarkerKind, label?: string, t?: number): Marker | null;
  setStatus(status: JamStatus, error?: string): void;
  setSource(source: InputSource | null): void;
  toggleRecordAudio(): void;
  setRecordAudio(on: boolean): void;
}

export type JamState = JamData & JamActions;

function sameChord(a: Chord, b: Chord): boolean {
  return a.root === b.root && a.quality === b.quality && (a.bass ?? a.root) === (b.bass ?? b.root);
}

function sameKey(a: KeyEstimate, b: KeyEstimate): boolean {
  return a.tonic === b.tonic && a.mode === b.mode;
}

const EMPTY_SESSION = {
  currentChord: null,
  confidence: 0,
  keyHistory: [],
  timeline: [],
  activePitchClasses: [],
  activeMidiNotes: [],
  markers: [],
  lastT: 0,
} satisfies Partial<JamData>;

export const initialJamData = (): JamData => ({
  ...EMPTY_SESSION,
  status: 'idle',
  error: undefined,
  source: null,
  key: null,
  level: 0,
  sessionStart: null,
  sessionId: null,
  recordAudio: false,
  demo: false,
});

/** Live jam state. Pure: no audio here; inputs are wired by the integrator via `applyEvent`. */
export const useJamStore = create<JamState>()((set, get) => ({
  ...initialJamData(),

  applyEvent(e) {
    set((s) => {
      const sessionStart = s.sessionStart ?? e.t;
      const sessionId = s.sessionId ?? uuid();
      const t = Math.max(0, e.t - sessionStart);
      const base = { sessionStart, sessionId, lastT: Math.max(s.lastT, t) };
      switch (e.type) {
        case 'chord': {
          const patch = {
            ...base,
            currentChord: e.chord,
            confidence: e.confidence,
            source: e.source,
          };
          if (!e.chord || e.confidence < MIN_DISPLAY_CONFIDENCE) return patch;
          const last = s.timeline[s.timeline.length - 1];
          if (last?.chord && sameChord(last.chord, e.chord)) return patch;
          const rec: ChordRecord = {
            id: uuid(),
            sessionId,
            t,
            chord: e.chord,
            confidence: e.confidence,
            source: e.source,
            manual: false,
          };
          return { ...patch, timeline: [...s.timeline, rec] };
        }
        case 'key': {
          const last = s.keyHistory[s.keyHistory.length - 1];
          if (last && sameKey(last.key, e.key)) return { ...base, key: e.key };
          return { ...base, key: e.key, keyHistory: [...s.keyHistory, { t, key: e.key }] };
        }
        case 'notes':
          return {
            ...base,
            activePitchClasses: e.pitchClasses,
            activeMidiNotes: e.midiNotes ?? [],
          };
        case 'level':
          return { ...base, level: e.energy };
        default:
          return s;
      }
    });
  },

  startSession(t0, opts) {
    set({
      ...EMPTY_SESSION,
      key: null,
      demo: opts?.demo ?? false,
      status: 'listening',
      error: undefined,
      sessionStart: t0 ?? clock.now(),
      sessionId: uuid(),
    });
  },

  stopSession() {
    set({ status: 'idle', activePitchClasses: [], activeMidiNotes: [], level: 0 });
  },

  reset() {
    const s = get();
    const listening = s.status === 'listening';
    set({
      ...EMPTY_SESSION,
      keyHistory: s.key ? [{ t: 0, key: s.key }] : [],
      sessionStart: listening ? clock.now() : null,
      sessionId: listening ? uuid() : null,
    });
  },

  addMarker(kind, label, t) {
    const s = get();
    const sessionId = s.sessionId;
    if (!sessionId) return null;
    const at = t ?? (s.sessionStart !== null ? Math.max(0, clock.now() - s.sessionStart) : s.lastT);
    const marker: Marker = { id: uuid(), sessionId, t: at, kind, ...(label ? { label } : {}) };
    set({ markers: [...s.markers, marker] });
    return marker;
  },

  setStatus(status, error) {
    set({ status, error: status === 'error' ? error : undefined });
  },

  setSource(source) {
    set({ source });
  },

  toggleRecordAudio() {
    set((s) => ({ recordAudio: !s.recordAudio }));
  },

  setRecordAudio(recordAudio) {
    set({ recordAudio });
  },
}));

export const jamStore = useJamStore;
