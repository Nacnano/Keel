/**
 * Store an offline file analysis (src/audio/offline.ts) as a regular session, so the
 * library, review screen, reharm and export all work on it.
 *
 * Saving replays the events through `startSession` with `t0 = 0` and an injected clock that
 * follows the replay, so chord / key rows get the same dedupe and relative `t` as a live jam.
 * `draftFromAnalysis` builds the same rows in memory (Analyze screen preview, "Copy chart").
 */
import type { ChordRecord, KeyRecord, Session } from '@/core/session';
import type { AnalysisEvent, Instrument, JamMode, VocabLevel } from '@/core/types';
import { chordKey } from './chordSymbol';
import type { JamKeyDB } from './db';
import type { SessionFull } from './repo';
import { normalizeTags } from './repo';
import { startSession } from './sessionRecorder';
import { computeSummary } from './summary';

export const ANALYZED_TAG = 'analyzed';

export interface AnalysedSessionInput {
  name: string;
  /** `chord` / `key` events, `t` in seconds from the start of the audio. Other types are ignored. */
  events: readonly AnalysisEvent[];
  durationSec: number;
  /** Default `['analyzed']`. */
  tags?: string[];
  mode: JamMode;
  instrument: Instrument;
  vocabLevel: VocabLevel;
  /** The analysed file, stored as the session recording so review can play it. */
  audio?: { blob: Blob; mimeType: string } | null;
  /** Wall clock in epoch ms (tests). */
  now?: () => number;
  /** Database (tests). Defaults to the app `db`. */
  database?: JamKeyDB;
}

const byT = (a: AnalysisEvent, b: AnalysisEvent) => a.t - b.t;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** File name without its extension, as a session name. */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, '').trim();
  return base || 'Analyzed file';
}

/** In-memory session (not stored) with the rows `saveAnalysedSession` would write. */
export function draftFromAnalysis(input: AnalysedSessionInput): SessionFull {
  const now = input.now ?? Date.now;
  const id = 'draft';
  const chords: ChordRecord[] = [];
  const keys: KeyRecord[] = [];
  let lastChord: string | undefined;
  let lastKey: string | undefined;
  const events = [...input.events].sort(byT);
  for (const e of events) {
    const t = Math.max(0, e.t);
    if (e.type === 'chord') {
      const k = chordKey(e.chord);
      if (k === lastChord) continue;
      lastChord = k;
      chords.push({
        id: `c${chords.length}`,
        sessionId: id,
        t,
        chord: e.chord,
        confidence: e.confidence,
        source: e.source,
        manual: false,
      });
    } else if (e.type === 'key') {
      const k = `${e.key.tonic}:${e.key.mode}`;
      if (k === lastKey) continue;
      lastKey = k;
      keys.push({ id: `k${keys.length}`, sessionId: id, t, key: e.key });
    }
  }
  const durationSec = round3(input.durationSec);
  const createdAt = now();
  const session: Session = {
    id,
    name: input.name.trim() || 'Analyzed file',
    createdAt,
    endedAt: createdAt,
    durationSec,
    mode: input.mode,
    instrument: input.instrument,
    vocabLevel: input.vocabLevel,
    tags: normalizeTags(input.tags ?? [ANALYZED_TAG]),
    hasAudio: !!input.audio,
    hasMidi: false,
    summary: computeSummary(chords, keys, [], durationSec),
    updatedAt: createdAt,
    deleted: false,
  };
  return { session, chords, keys, markers: [] };
}

/** Write the analysis as a finished session. Resolves with the new session id. */
export async function saveAnalysedSession(input: AnalysedSessionInput): Promise<string> {
  let cursor = 0;
  const handle = startSession({
    name: input.name.trim() || 'Analyzed file',
    mode: input.mode,
    instrument: input.instrument,
    vocabLevel: input.vocabLevel,
    tags: normalizeTags(input.tags ?? [ANALYZED_TAG]),
    t0: 0,
    clock: () => cursor,
    now: input.now,
    database: input.database,
  });
  await handle.ready;
  for (const e of [...input.events].sort(byT)) {
    if (e.type !== 'chord' && e.type !== 'key') continue;
    cursor = Math.max(cursor, e.t);
    handle.onAnalysisEvent(e);
  }
  if (input.audio) {
    await handle.setAudioBlob(input.audio.blob, input.audio.mimeType, input.durationSec);
  }
  await handle.stop({ endT: input.durationSec });
  return handle.id;
}
