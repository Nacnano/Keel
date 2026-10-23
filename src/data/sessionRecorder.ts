/**
 * Session recorder: turns the live AnalysisEvent / MidiEvent streams into
 * IndexedDB rows without blocking the UI thread.
 *
 * - Chord rows only when the chord changes; key rows only when tonic/mode
 *   changes. Times are seconds from session start (`event.t - t0`).
 * - Rows are buffered in memory and written with `bulkAdd` every 2 s (one
 *   transaction per flush) and on `stop()`. All writes go through a single
 *   serial queue, so `stop()` racing a periodic flush can neither lose nor
 *   duplicate rows. A failed flush puts its rows back in the buffer so the
 *   next flush (or `stop()`) retries them.
 * - The MIDI performance is one `MidiTrack` row per session, checkpointed every
 *   30 s while dirty and written in full on `stop()`.
 */
import { v4 as uuid } from 'uuid';
import type {
  AudioRecording,
  ChordRecord,
  KeyRecord,
  Marker,
  MarkerKind,
  Session,
} from '@/core/session';
import type { AnalysisEvent, Instrument, JamMode, MidiEvent, VocabLevel } from '@/core/types';
import { db as defaultDb, type KeelDB } from './db';
import { chordKey } from './chordSymbol';
import { computeSummary } from './summary';

export const FLUSH_INTERVAL_MS = 2000;
export const MIDI_CHECKPOINT_MS = 30_000;

export interface SessionMeta {
  name?: string;
  mode: JamMode;
  instrument: Instrument;
  vocabLevel: VocabLevel;
  tags?: string[];
  /**
   * Event-clock time (same base as `AnalysisEvent.t` / `MidiEvent.t`) that maps
   * to session t = 0. Defaults to `clock()` at start when a clock is given,
   * otherwise to the `t` of the first event received.
   */
  t0?: number;
  /** Event-clock "now" in seconds (e.g. `clock.now` from `@/core/clock`). */
  clock?: () => number;
  /** Wall clock in epoch ms. Injectable for tests. */
  now?: () => number;
  flushIntervalMs?: number;
  midiCheckpointMs?: number;
  /** Database to write to (tests). Defaults to the app `db`. */
  database?: KeelDB;
}

export interface SessionHandle {
  readonly id: string;
  /** Epoch ms. */
  readonly startedAt: number;
  /** Resolves once the session row exists. */
  readonly ready: Promise<void>;
  readonly stopped: boolean;
  onAnalysisEvent(e: AnalysisEvent): void;
  onMidiEvent(e: MidiEvent): void;
  /** `t` is session seconds; defaults to the current session time. */
  addMarker(kind: MarkerKind, label?: string, t?: number): Marker;
  /** Stores the audio take. Can be called before or after `stop()`. */
  setAudioBlob(blob: Blob, mimeType: string, durationSec: number): Promise<void>;
  /** Current session time in seconds. */
  currentTime(): number;
  /** Write buffered rows now (normally automatic every 2 s). */
  flush(): Promise<void>;
  /**
   * Flush everything, compute the summary and finalise the session row.
   * `endT` (event clock) overrides the end time. Idempotent while pending or
   * after success; after a failed write it may be called again to retry.
   */
  stop(opts?: { endT?: number }): Promise<Session>;
}

function defaultName(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number) => String(n).padStart(2, '0');
  return `Jam ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

export function startSession(meta: SessionMeta): SessionHandle {
  const database = meta.database ?? defaultDb;
  const now = meta.now ?? Date.now;
  const clock = meta.clock;
  const id = uuid();
  const startedAt = now();

  let t0: number | null = meta.t0 ?? (clock ? clock() : null);
  let lastT = 0;
  let stopped = false;
  let stopPromise: Promise<Session> | null = null;

  const session: Session = {
    id,
    name: meta.name?.trim() || defaultName(startedAt),
    createdAt: startedAt,
    endedAt: null,
    durationSec: 0,
    mode: meta.mode,
    instrument: meta.instrument,
    vocabLevel: meta.vocabLevel,
    tags: meta.tags ?? [],
    hasAudio: false,
    hasMidi: false,
    summary: null,
    updatedAt: startedAt,
    deleted: false,
  };

  // Everything ever recorded (for the summary) and what is not yet written.
  const allChords: ChordRecord[] = [];
  const allKeys: KeyRecord[] = [];
  const allMarkers: Marker[] = [];
  const midiEvents: MidiEvent[] = [];
  let pendingChords: ChordRecord[] = [];
  let pendingKeys: KeyRecord[] = [];
  let pendingMarkers: Marker[] = [];
  let midiDirty = false;
  let lastMidiCheckpoint = startedAt;
  let audio: AudioRecording | null = null;

  let lastChordKey: string | undefined;
  let lastKeyId: string | undefined;

  // Serial write queue.
  let chain: Promise<void> = Promise.resolve();
  function enqueue(op: () => Promise<void>): Promise<void> {
    const p = chain.then(op);
    chain = p.catch((err: unknown) => {
      console.error('[sessionRecorder] write failed', err);
    });
    return p;
  }

  const ready = enqueue(async () => {
    await database.sessions.add({ ...session });
  });

  function rel(t: number): number {
    if (t0 === null) t0 = t;
    const r = Math.max(0, t - t0);
    if (r > lastT) lastT = r;
    return r;
  }

  function currentTime(): number {
    if (clock && t0 !== null) return Math.max(0, clock() - t0);
    return lastT;
  }

  function writePending(final: boolean): Promise<void> {
    const chords = pendingChords;
    const keys = pendingKeys;
    const markers = pendingMarkers;
    pendingChords = [];
    pendingKeys = [];
    pendingMarkers = [];
    const checkpointMidi =
      midiDirty &&
      (final || now() - lastMidiCheckpoint >= (meta.midiCheckpointMs ?? MIDI_CHECKPOINT_MS));
    if (checkpointMidi) {
      midiDirty = false;
      lastMidiCheckpoint = now();
    }
    if (!chords.length && !keys.length && !markers.length && !checkpointMidi) {
      return enqueue(async () => {});
    }
    const events = checkpointMidi ? midiEvents.slice() : null;
    return enqueue(async () => {
      try {
        await database.transaction(
          'rw',
          [database.chords, database.keys, database.markers, database.midiTracks],
          async () => {
            if (chords.length) await database.chords.bulkAdd(chords);
            if (keys.length) await database.keys.bulkAdd(keys);
            if (markers.length) await database.markers.bulkAdd(markers);
            if (events) await database.midiTracks.put({ sessionId: id, events });
          },
        );
      } catch (err) {
        // Nothing was committed (single transaction): retry on the next flush.
        pendingChords = chords.concat(pendingChords);
        pendingKeys = keys.concat(pendingKeys);
        pendingMarkers = markers.concat(pendingMarkers);
        if (events) midiDirty = true;
        throw err;
      }
    });
  }

  const timer = setInterval(() => {
    writePending(false).catch(() => {});
  }, meta.flushIntervalMs ?? FLUSH_INTERVAL_MS);

  const handle: SessionHandle = {
    id,
    startedAt,
    ready,
    get stopped() {
      return stopped;
    },

    onAnalysisEvent(e) {
      if (stopped) return;
      const t = rel(e.t);
      if (e.type === 'chord') {
        const k = chordKey(e.chord);
        if (k === lastChordKey) return;
        lastChordKey = k;
        const rec: ChordRecord = {
          id: uuid(),
          sessionId: id,
          t,
          chord: e.chord,
          confidence: e.confidence,
          source: e.source,
          manual: false,
        };
        allChords.push(rec);
        pendingChords.push(rec);
      } else if (e.type === 'key') {
        const k = `${e.key.tonic}:${e.key.mode}`;
        if (k === lastKeyId) return;
        lastKeyId = k;
        const rec: KeyRecord = { id: uuid(), sessionId: id, t, key: e.key };
        allKeys.push(rec);
        pendingKeys.push(rec);
      }
    },

    onMidiEvent(e) {
      if (stopped) return;
      midiEvents.push({ ...e, t: rel(e.t) });
      midiDirty = true;
    },

    addMarker(kind, label, t) {
      const m: Marker = { id: uuid(), sessionId: id, t: t ?? currentTime(), kind };
      if (label !== undefined) m.label = label;
      allMarkers.push(m);
      if (stopped) {
        // Late marker: write directly and refresh the summary.
        enqueue(async () => {
          await database.markers.add(m);
          await database.sessions.update(id, {
            summary: computeSummary(allChords, allKeys, allMarkers, session.durationSec),
            updatedAt: now(),
          });
        }).catch(() => {});
      } else {
        pendingMarkers.push(m);
      }
      return m;
    },

    setAudioBlob(blob, mimeType, durationSec) {
      audio = { sessionId: id, blob, mimeType, durationSec };
      session.hasAudio = true;
      const rec = audio;
      return enqueue(async () => {
        await database.transaction('rw', [database.recordings, database.sessions], async () => {
          await database.recordings.put(rec);
          await database.sessions.update(id, { hasAudio: true, updatedAt: now() });
        });
      });
    },

    currentTime,

    flush() {
      return writePending(false);
    },

    stop(opts) {
      if (stopPromise) return stopPromise;
      stopped = true;
      clearInterval(timer);
      const endRel =
        opts?.endT !== undefined && t0 !== null
          ? Math.max(0, opts.endT - t0)
          : Math.max(currentTime(), lastT, (now() - startedAt) / 1000);
      const durationSec = round3(Math.max(endRel, audio?.durationSec ?? 0));
      const flushed = writePending(true);
      stopPromise = (async () => {
        await flushed;
        const final: Partial<Session> = {
          endedAt: now(),
          durationSec,
          hasAudio: audio !== null,
          hasMidi: midiEvents.length > 0,
          summary: computeSummary(allChords, allKeys, allMarkers, durationSec),
          updatedAt: now(),
        };
        Object.assign(session, final);
        await enqueue(async () => {
          await database.sessions.update(id, final);
        });
        return { ...session };
      })().catch((err: unknown) => {
        // Rows were put back in the buffer; allow the caller to retry stop().
        stopPromise = null;
        throw err;
      });
      return stopPromise;
    },
  };
  return handle;
}
