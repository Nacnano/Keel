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

/** A key that is replaced sooner than this was the opening wobble, not a key change. */
export const SHORT_KEY_SEC = 10;

/** A mark snaps back to the start of the sounding chord if that chord began this recently. */
export const MARK_SNAP_SEC = 2;

/**
 * Optional fields a newer engine adds to `key` events (clock seconds, like `t`). Read with
 * optional chaining so today's events (without them) work the same.
 */
type KeyEventExtras = {
  /** Where the evidence for this key started. */
  since?: number;
  /** This key replaces a short-lived previous key instead of following it. */
  supersedes?: unknown;
  /** Start of the short key being replaced. */
  replacesSince?: number;
};

export interface KeyHistoryEntry {
  /** Seconds from session start. */
  t: number;
  key: KeyEstimate;
}

export interface JamData {
  status: JamStatus;
  error?: string;
  /** Persistent runtime capture failure; the current session can still be finished and saved. */
  inputIssue: string | null;
  source: InputSource | null;
  currentChord: Chord | null;
  confidence: number;
  key: KeyEstimate | null;
  keyHistory: KeyHistoryEntry[];
  /** Deduplicated chord changes; `t` is seconds from session start. */
  timeline: ChordRecord[];
  activePitchClasses: PitchClass[];
  activeMidiNotes: MidiNote[];
  tentativeMidiNotes: MidiNote[];
  noteConfidences: Record<MidiNote, number>;
  previewChord: Chord | null;
  previewConfidence: number;
  previewKey: KeyEstimate | null;
  /** Microphone frames named exact keys, so the keyboard must not light every octave. */
  exactKeys: boolean;
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
  /** The input has been too quiet to trust ("Can't hear much"); set by the live input. */
  quiet: boolean;
  /** Session time the next first key is drawn from: the start, or the last New song. */
  keyFrom: number;
  /** Session time the last key change arrived (for the short-key rule). */
  keyChangedAt: number;
}

export interface JamActions {
  applyEvent(e: AnalysisEvent): void;
  /** Clears the session data and starts a new session at `t0` (clock seconds, default now). */
  startSession(t0?: number, opts?: { demo?: boolean }): void;
  stopSession(): void;
  /** Clears live estimates without changing the saved session history. */
  clearLiveReadout(): void;
  /** Clears timeline, key history and markers. Keeps status, source and current key. */
  reset(): void;
  addMarker(kind: MarkerKind, label?: string, t?: number): Marker | null;
  /**
   * Forget the current key (New song); the timeline and key history stay. The next key is
   * drawn from `from` (session seconds, default now), so the new song is labelled from its start.
   */
  clearKey(from?: number): void;
  setQuiet(quiet: boolean): void;
  setInputIssue(issue: string | null): void;
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

/** Append `entry`, folding it into the previous entry when that is already the same key. */
function merged(history: KeyHistoryEntry[], entry: KeyHistoryEntry): KeyHistoryEntry[] {
  const prev = history[history.length - 1];
  return prev && sameKey(prev.key, entry.key) ? history : [...history, entry];
}

/**
 * Where a mark tapped at `t` belongs: the start of the chord sounding at `t` when that chord
 * began at most `MARK_SNAP_SEC` earlier (players tap a little after the downbeat), else `t`.
 */
export function snapToChordStart(timeline: ChordRecord[], t: number): number {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const rec = timeline[i];
    if (!rec.chord || rec.t > t) continue;
    return t - rec.t <= MARK_SNAP_SEC ? rec.t : t;
  }
  return t;
}

const EMPTY_SESSION = {
  currentChord: null,
  confidence: 0,
  keyHistory: [],
  timeline: [],
  activePitchClasses: [],
  activeMidiNotes: [],
  tentativeMidiNotes: [],
  noteConfidences: {},
  previewChord: null,
  previewConfidence: 0,
  previewKey: null,
  exactKeys: false,
  markers: [],
  lastT: 0,
  quiet: false,
  inputIssue: null,
  keyFrom: 0,
  keyChangedAt: 0,
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
      if (e.type === 'preview') {
        return { previewChord: e.chord, previewConfidence: e.confidence, previewKey: e.key };
      }
      const sessionStart = s.sessionStart ?? e.t;
      const sessionId = s.sessionId ?? uuid();
      const t = Math.max(0, e.t - sessionStart);
      const base = { sessionStart, sessionId, lastT: Math.max(s.lastT, t) };
      switch (e.type) {
        case 'chord': {
          const patch = {
            ...base,
            currentChord: e.chord,
            previewChord: null,
            previewConfidence: 0,
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
          const history = s.keyHistory;
          const last = history[history.length - 1];
          if (last && sameKey(last.key, e.key)) return { ...base, key: e.key, previewKey: null };
          const extra = e as typeof e & KeyEventExtras;
          const arrived = base.lastT;
          const patch = { ...base, key: e.key, previewKey: null, keyChangedAt: arrived };
          // The first key of a song labels the song from its start, chords heard before it too.
          if (s.key === null) {
            const from = Math.min(s.keyFrom, t);
            const kept = last && last.t >= from ? history.slice(0, -1) : history;
            return { ...patch, keyHistory: merged(kept, { t: from, key: e.key }) };
          }
          // A key replaced within 10 s was the opening wobble: the new key takes its place.
          const short =
            Boolean(extra.supersedes) ||
            extra.replacesSince !== undefined ||
            arrived - s.keyChangedAt < SHORT_KEY_SEC;
          if (last && short) {
            return {
              ...patch,
              keyHistory: merged(history.slice(0, -1), { t: last.t, key: e.key }),
            };
          }
          const since = extra.since !== undefined ? extra.since - sessionStart : t;
          return {
            ...patch,
            keyHistory: [...history, { t: Math.max(last?.t ?? 0, Math.min(since, t)), key: e.key }],
          };
        }
        case 'notes':
          return {
            ...base,
            activePitchClasses: e.pitchClasses,
            activeMidiNotes: e.midiNotes ?? [],
            tentativeMidiNotes: (e.tentativeMidiNotes ?? []).filter(
              (note) => !e.midiNotes?.includes(note),
            ),
            noteConfidences: e.noteConfidences ?? {},
            exactKeys: e.midiNotes !== undefined,
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
    get().clearLiveReadout();
    set({
      status: 'idle',
      activePitchClasses: [],
      activeMidiNotes: [],
      exactKeys: false,
      level: 0,
      quiet: false,
      inputIssue: null,
    });
  },

  clearLiveReadout() {
    const s = get();
    const now = s.sessionStart !== null ? Math.max(0, clock.now() - s.sessionStart) : s.lastT;
    set({
      currentChord: null,
      confidence: 0,
      key: null,
      keyFrom: now,
      activePitchClasses: [],
      activeMidiNotes: [],
      tentativeMidiNotes: [],
      noteConfidences: {},
      previewChord: null,
      previewConfidence: 0,
      previewKey: null,
      exactKeys: false,
    });
  },

  reset() {
    const s = get();
    const listening = s.status === 'listening';
    set({
      ...EMPTY_SESSION,
      inputIssue: s.inputIssue,
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

  clearKey(from) {
    const s = get();
    const now = s.sessionStart !== null ? Math.max(0, clock.now() - s.sessionStart) : s.lastT;
    set({ key: null, previewKey: null, keyFrom: from ?? now });
  },

  setQuiet(quiet) {
    if (get().quiet !== quiet) set({ quiet });
  },

  setInputIssue(inputIssue) {
    set({ inputIssue });
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
