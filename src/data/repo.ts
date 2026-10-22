/**
 * Repository: everything the UI needs to read and edit saved sessions.
 * Every mutation bumps `session.updatedAt` (sync-ready).
 */
import { v4 as uuid } from 'uuid';
import type {
  AudioRecording,
  ChordRecord,
  KeyRecord,
  Marker,
  MarkerKind,
  MidiTrack,
  Session,
  Settings,
} from '@/core/session';
import type { Chord } from '@/core/types';
import { DEFAULT_SETTINGS } from '@/core/constants';
import { db, sessionRange } from './db';
import { keyName } from './chordSymbol';
import { computeSummary } from './summary';
import { computeStats, rangeStart, type Stats, type StatsRange } from './stats';

export type SessionSort = 'newest' | 'oldest' | 'updated' | 'name' | 'longest';

export interface ListSessionsOptions {
  /** Case-insensitive match on name, tags, key names ("A minor") and date (YYYY-MM-DD). */
  query?: string;
  tag?: string;
  includeDeleted?: boolean;
  /** Default `newest` (createdAt descending). */
  sort?: SessionSort;
}

export interface SessionFull {
  session: Session;
  chords: ChordRecord[];
  keys: KeyRecord[];
  markers: Marker[];
  midiTrack?: MidiTrack;
  recording?: AudioRecording;
}

function isoDate(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function searchText(s: Session): string {
  const keys = s.summary?.keys.map((k) => keyName(k.key)) ?? [];
  return [s.name, ...s.tags, ...keys, isoDate(s.createdAt)].join('\n').toLowerCase();
}

const SORTERS: Record<SessionSort, (a: Session, b: Session) => number> = {
  newest: (a, b) => b.createdAt - a.createdAt,
  oldest: (a, b) => a.createdAt - b.createdAt,
  updated: (a, b) => b.updatedAt - a.updatedAt,
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  longest: (a, b) => b.durationSec - a.durationSec,
};

export async function listSessions(opts: ListSessionsOptions = {}): Promise<Session[]> {
  const rows = opts.tag
    ? await db.sessions.where('tags').equals(opts.tag).toArray()
    : await db.sessions.toArray();
  const terms = (opts.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return rows
    .filter((s) => opts.includeDeleted || !s.deleted)
    .filter((s) => {
      if (!terms.length) return true;
      const text = searchText(s);
      return terms.every((t) => text.includes(t));
    })
    .sort(SORTERS[opts.sort ?? 'newest']);
}

/**
 * Practice stats over non-deleted sessions. Totals, days, keys and progressions cover the
 * range (last 7 / 30 local days including today, or everything); streaks and least-played
 * keys always use every session.
 */
export async function loadStats(range: StatsRange, now = Date.now()): Promise<Stats> {
  const rows = (await db.sessions.toArray()).filter((s) => !s.deleted);
  return computeStats(rows, { since: rangeStart(range, now), now });
}

/** All distinct tags on non-deleted sessions, sorted. */
export async function listTags(): Promise<string[]> {
  const tags = new Set<string>();
  await db.sessions.each((s) => {
    if (!s.deleted) s.tags.forEach((t) => tags.add(t));
  });
  return [...tags].sort((a, b) => a.localeCompare(b));
}

export function getSession(id: string): Promise<Session | undefined> {
  return db.sessions.get(id);
}

export async function getSessionFull(id: string): Promise<SessionFull | undefined> {
  return db.transaction(
    'r',
    [db.sessions, db.chords, db.keys, db.markers, db.midiTracks, db.recordings],
    async () => {
      const session = await db.sessions.get(id);
      if (!session) return undefined;
      const [lo, hi] = sessionRange(id);
      const [chords, keys, markers, midiTrack, recording] = await Promise.all([
        db.chords.where('[sessionId+t]').between(lo, hi, true, true).toArray(),
        db.keys.where('[sessionId+t]').between(lo, hi, true, true).toArray(),
        db.markers.where('[sessionId+t]').between(lo, hi, true, true).toArray(),
        db.midiTracks.get(id),
        db.recordings.get(id),
      ]);
      const full: SessionFull = { session, chords, keys, markers };
      if (midiTrack) full.midiTrack = midiTrack;
      if (recording) full.recording = recording;
      return full;
    },
  );
}

async function patchSession(id: string, patch: Partial<Session>): Promise<void> {
  const n = await db.sessions.update(id, { ...patch, updatedAt: Date.now() });
  // 0 can also mean "nothing changed", so double-check existence.
  if (!n && !(await db.sessions.get(id))) throw new Error(`Session not found: ${id}`);
}

/** Recompute the stored summary from the current rows and bump updatedAt. */
async function refreshSummary(sessionId: string): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  const [lo, hi] = sessionRange(sessionId);
  const [chords, keys, markers] = await Promise.all([
    db.chords.where('[sessionId+t]').between(lo, hi, true, true).toArray(),
    db.keys.where('[sessionId+t]').between(lo, hi, true, true).toArray(),
    db.markers.where('[sessionId+t]').between(lo, hi, true, true).toArray(),
  ]);
  await db.sessions.update(sessionId, {
    summary: computeSummary(chords, keys, markers, session.durationSec),
    updatedAt: Date.now(),
  });
}

export async function renameSession(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Session name cannot be empty');
  await patchSession(id, { name: trimmed });
}

/** Trims, drops empties and de-duplicates case-insensitively (first spelling wins). */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

export async function setTags(id: string, tags: readonly string[]): Promise<void> {
  await patchSession(id, { tags: normalizeTags(tags) });
}

export async function softDeleteSession(id: string): Promise<void> {
  await patchSession(id, { deleted: true });
}

export async function restoreSession(id: string): Promise<void> {
  await patchSession(id, { deleted: false });
}

/** Permanently delete one session and all of its rows. */
export async function purgeSession(id: string): Promise<void> {
  const [lo, hi] = sessionRange(id);
  await db.transaction(
    'rw',
    [db.sessions, db.chords, db.keys, db.markers, db.midiTracks, db.recordings],
    async () => {
      await Promise.all([
        db.chords.where('[sessionId+t]').between(lo, hi, true, true).delete(),
        db.keys.where('[sessionId+t]').between(lo, hi, true, true).delete(),
        db.markers.where('[sessionId+t]').between(lo, hi, true, true).delete(),
        db.midiTracks.delete(id),
        db.recordings.delete(id),
        db.sessions.delete(id),
      ]);
    },
  );
}

/** Permanently delete every soft-deleted session. Returns how many were purged. */
export async function purgeDeleted(): Promise<number> {
  const ids = (await db.sessions.filter((s) => s.deleted).primaryKeys()) as string[];
  for (const id of ids) await purgeSession(id);
  return ids.length;
}

/** Manual chord fix from the review screen. Sets `manual = true`. */
export async function updateChord(chordId: string, chord: Chord | null): Promise<ChordRecord> {
  return db.transaction('rw', [db.sessions, db.chords, db.keys, db.markers], async () => {
    const rec = await db.chords.get(chordId);
    if (!rec) throw new Error(`Chord record not found: ${chordId}`);
    const updated: ChordRecord = { ...rec, chord, manual: true };
    await db.chords.put(updated);
    await refreshSummary(rec.sessionId);
    return updated;
  });
}

export async function addMarker(
  sessionId: string,
  marker: { t: number; kind: MarkerKind; label?: string },
): Promise<Marker> {
  const m: Marker = { id: uuid(), sessionId, t: marker.t, kind: marker.kind };
  if (marker.label !== undefined) m.label = marker.label;
  await db.transaction('rw', [db.sessions, db.chords, db.keys, db.markers], async () => {
    if (!(await db.sessions.get(sessionId))) throw new Error(`Session not found: ${sessionId}`);
    await db.markers.add(m);
    await refreshSummary(sessionId);
  });
  return m;
}

export async function updateMarker(
  markerId: string,
  patch: Partial<Pick<Marker, 't' | 'kind' | 'label'>>,
): Promise<Marker> {
  return db.transaction('rw', [db.sessions, db.chords, db.keys, db.markers], async () => {
    const m = await db.markers.get(markerId);
    if (!m) throw new Error(`Marker not found: ${markerId}`);
    const updated: Marker = { ...m, ...patch };
    if (updated.label === undefined) delete updated.label;
    await db.markers.put(updated);
    await refreshSummary(m.sessionId);
    return updated;
  });
}

export async function deleteMarker(markerId: string): Promise<void> {
  await db.transaction('rw', [db.sessions, db.chords, db.keys, db.markers], async () => {
    const m = await db.markers.get(markerId);
    if (!m) return;
    await db.markers.delete(markerId);
    await refreshSummary(m.sessionId);
  });
}

export interface StorageInfo {
  /** Bytes used, or a lower-bound estimate when the Storage API is missing. */
  usage: number;
  /** Bytes available to the origin, or null when unknown. */
  quota: number | null;
  /** True when the numbers come from `navigator.storage.estimate()`. */
  exact: boolean;
}

export async function storageEstimate(): Promise<StorageInfo> {
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (storage && typeof storage.estimate === 'function') {
    try {
      const { usage, quota } = await storage.estimate();
      return { usage: usage ?? 0, quota: quota ?? null, exact: true };
    } catch {
      // fall through
    }
  }
  // Fallback: audio dominates storage, so sum recording sizes.
  let usage = 0;
  await db.recordings.each((r) => {
    usage += r.blob?.size ?? 0;
  });
  return { usage, quota: null, exact: false };
}

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const row = await db.settings.get(key);
  return row === undefined ? DEFAULT_SETTINGS[key] : (row.value as Settings[K]);
}

export async function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
): Promise<void> {
  await db.settings.put({ key, value });
}

/** All settings merged over DEFAULT_SETTINGS. */
export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in out) (out as unknown as Record<string, unknown>)[r.key] = r.value;
  }
  return out;
}
