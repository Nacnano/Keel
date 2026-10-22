/**
 * Mapping between local Dexie rows (camelCase, `@/core/session`) and Supabase
 * rows (snake_case, `supabase/migrations/0001_init.sql`).
 *
 * Child rows (chords, keys, markers, MIDI) have no `updatedAt` locally; they
 * are stamped with their session's `updatedAt` when pushed.
 */
import type { ChordRecord, KeyRecord, Marker, MidiTrack, Session } from '@/core/session';

export interface RemoteSession {
  id: string;
  user_id: string;
  name: string;
  created_at: number;
  ended_at: number | null;
  duration_sec: number;
  mode: Session['mode'];
  instrument: Session['instrument'];
  vocab_level: Session['vocabLevel'];
  tags: string[];
  has_audio: boolean;
  has_midi: boolean;
  summary: Session['summary'];
  updated_at: number;
  deleted: boolean;
}

export interface RemoteChord {
  id: string;
  session_id: string;
  user_id: string;
  t: number;
  chord: ChordRecord['chord'];
  confidence: number;
  source: ChordRecord['source'];
  manual: boolean;
  updated_at: number;
}

export interface RemoteKey {
  id: string;
  session_id: string;
  user_id: string;
  t: number;
  key: KeyRecord['key'];
  updated_at: number;
}

export interface RemoteMarker {
  id: string;
  session_id: string;
  user_id: string;
  t: number;
  kind: Marker['kind'];
  label: string | null;
  updated_at: number;
}

export interface RemoteMidiTrack {
  session_id: string;
  user_id: string;
  events: MidiTrack['events'];
  updated_at: number;
}

/** PostgREST returns `bigint` as a JSON number, but be tolerant of strings. */
const num = (x: unknown): number => (typeof x === 'number' ? x : Number(x));
const numOrNull = (x: unknown): number | null => (x == null ? null : num(x));

export function toRemoteSession(s: Session, userId: string): RemoteSession {
  return {
    id: s.id,
    user_id: userId,
    name: s.name,
    created_at: s.createdAt,
    ended_at: s.endedAt,
    duration_sec: s.durationSec,
    mode: s.mode,
    instrument: s.instrument,
    vocab_level: s.vocabLevel,
    tags: s.tags,
    has_audio: s.hasAudio,
    has_midi: s.hasMidi,
    summary: s.summary,
    updated_at: s.updatedAt,
    deleted: s.deleted,
  };
}

/** `hasAudio` reflects this device: recordings never sync. */
export function fromRemoteSession(r: RemoteSession, hasAudio: boolean): Session {
  return {
    id: r.id,
    name: r.name,
    createdAt: num(r.created_at),
    endedAt: numOrNull(r.ended_at),
    durationSec: num(r.duration_sec),
    mode: r.mode,
    instrument: r.instrument,
    vocabLevel: r.vocab_level,
    tags: r.tags ?? [],
    hasAudio,
    hasMidi: r.has_midi,
    summary: r.summary ?? null,
    updatedAt: num(r.updated_at),
    deleted: r.deleted,
  };
}

export function toRemoteChord(c: ChordRecord, userId: string, updatedAt: number): RemoteChord {
  return {
    id: c.id,
    session_id: c.sessionId,
    user_id: userId,
    t: c.t,
    chord: c.chord,
    confidence: c.confidence,
    source: c.source,
    manual: c.manual,
    updated_at: updatedAt,
  };
}

export function fromRemoteChord(r: RemoteChord): ChordRecord {
  return {
    id: r.id,
    sessionId: r.session_id,
    t: num(r.t),
    chord: r.chord ?? null,
    confidence: num(r.confidence),
    source: r.source,
    manual: r.manual,
  };
}

export function toRemoteKey(k: KeyRecord, userId: string, updatedAt: number): RemoteKey {
  return {
    id: k.id,
    session_id: k.sessionId,
    user_id: userId,
    t: k.t,
    key: k.key,
    updated_at: updatedAt,
  };
}

export function fromRemoteKey(r: RemoteKey): KeyRecord {
  return { id: r.id, sessionId: r.session_id, t: num(r.t), key: r.key };
}

export function toRemoteMarker(m: Marker, userId: string, updatedAt: number): RemoteMarker {
  return {
    id: m.id,
    session_id: m.sessionId,
    user_id: userId,
    t: m.t,
    kind: m.kind,
    label: m.label ?? null,
    updated_at: updatedAt,
  };
}

export function fromRemoteMarker(r: RemoteMarker): Marker {
  const m: Marker = { id: r.id, sessionId: r.session_id, t: num(r.t), kind: r.kind };
  if (r.label != null) m.label = r.label;
  return m;
}

export function toRemoteMidi(m: MidiTrack, userId: string, updatedAt: number): RemoteMidiTrack {
  return { session_id: m.sessionId, user_id: userId, events: m.events, updated_at: updatedAt };
}

export function fromRemoteMidi(r: RemoteMidiTrack): MidiTrack {
  return { sessionId: r.session_id, events: r.events ?? [] };
}
