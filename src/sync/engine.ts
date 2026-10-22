/**
 * Last-write-wins sync between Dexie and Supabase. See `src/sync/README.md`.
 *
 * - The unit of sync is a session: its row plus its chords, keys, markers and
 *   MIDI track. Every local mutation bumps `session.updatedAt` (repo.ts), so
 *   `updatedAt` versions the whole session.
 * - Push: sessions with `updatedAt > lastPushedAt` are upserted unless the
 *   remote copy is at least as new. Children go first, the session row last, so
 *   a half-finished push never advertises a version whose children are missing.
 * - Pull: sessions with `updated_at > lastPulledAt` replace the local copy when
 *   newer, written as-is (the remote `updated_at` becomes the local
 *   `updatedAt`; nothing is bumped, so pulls never echo back as pushes).
 * - Soft deletes are ordinary updates of `deleted`. Nothing is hard-deleted
 *   remotely. Audio recordings never leave the device.
 * - Cursors live in the Dexie `settings` table, per user.
 */
import type { ChordRecord, KeyRecord, Marker, MidiTrack, Session } from '@/core/session';
import { db, sessionRange } from '@/data/db';
import { onAuthChange } from './auth';
import { getSupabase, isSyncConfigured, SyncError, type SupabaseClient } from './client';

export { SyncError };
import {
  fromRemoteChord,
  fromRemoteKey,
  fromRemoteMarker,
  fromRemoteMidi,
  fromRemoteSession,
  toRemoteChord,
  toRemoteKey,
  toRemoteMarker,
  toRemoteMidi,
  toRemoteSession,
  type RemoteChord,
  type RemoteKey,
  type RemoteMarker,
  type RemoteMidiTrack,
  type RemoteSession,
} from './rows';
import { onSessionSaved } from './signals';
import { syncStore, type SyncState, type SyncStatus } from './store';

/** Rows per page when reading (Supabase caps responses at 1000 by default). */
export const PAGE_SIZE = 500;
/** Rows per upsert request. */
export const UPSERT_CHUNK = 500;
/** Sessions pushed per round (children of a round are upserted together). */
export const SESSION_BATCH = 20;
/** Ids per `in (...)` filter, to keep URLs short. */
const IN_CHUNK = 100;
export const DEFAULT_SYNC_INTERVAL_MS = 5 * 60_000;

export const pushCursorKey = (userId: string) => `sync:${userId}:lastPushedAt`;
export const pullCursorKey = (userId: string) => `sync:${userId}:lastPulledAt`;
export const LAST_SYNC_KEY = 'sync:lastSyncAt';

export interface PushResult {
  pushed: number;
  skipped: number;
}
export interface PullResult {
  pulled: number;
  skipped: number;
}
export interface SyncReport {
  push: PushResult;
  pull: PullResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PgResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function check<T>(res: PgResult<T>, what: string): T | null {
  if (res.error) throw new SyncError(`${what}: ${res.error.message}`);
  return res.data;
}

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PgResult<T[]>>,
  what: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = check(await page(from, from + PAGE_SIZE - 1), what) ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

function chunks<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

async function upsertAll(
  client: SupabaseClient,
  table: string,
  rows: readonly object[],
  onConflict: string,
  chunkSize = UPSERT_CHUNK,
): Promise<void> {
  for (const chunk of chunks(rows, chunkSize)) {
    check(await client.from(table).upsert(chunk, { onConflict }), `push ${table}`);
  }
}

async function getNumber(key: string): Promise<number> {
  const row = await db.settings.get(key);
  return typeof row?.value === 'number' ? row.value : 0;
}

async function setNumber(key: string, value: number): Promise<void> {
  await db.settings.put({ key, value });
}

/** Persisted cursors for a user (0 when never synced). */
export async function getCursors(
  userId: string,
): Promise<{ lastPushedAt: number; lastPulledAt: number }> {
  const [lastPushedAt, lastPulledAt] = await Promise.all([
    getNumber(pushCursorKey(userId)),
    getNumber(pullCursorKey(userId)),
  ]);
  return { lastPushedAt, lastPulledAt };
}

/**
 * Largest version `v` such that every row with version <= v is among
 * `rows[0..done)`. Rows are sorted by version; ties straddling `done` hold the
 * cursor back so a retry does not skip them.
 */
function safeCursor(versions: readonly number[], done: number, fallback: number): number {
  if (done >= versions.length) return Math.max(fallback, versions[versions.length - 1] ?? 0);
  let j = done - 1;
  while (j >= 0 && versions[j] === versions[done]) j--;
  return j >= 0 ? Math.max(fallback, versions[j]) : fallback;
}

async function requireUser(): Promise<{ client: SupabaseClient; userId: string }> {
  const client = await getSupabase();
  if (!client) throw new SyncError('Sync is not configured');
  const { data, error } = await client.auth.getSession();
  if (error) throw new SyncError(error.message);
  const userId = data.session?.user.id;
  if (!userId) throw new SyncError('Not signed in');
  return { client, userId };
}

async function localChildren(sessionId: string) {
  const [lo, hi] = sessionRange(sessionId);
  const [chords, keys, markers, midi] = await Promise.all([
    db.chords.where('[sessionId+t]').between(lo, hi, true, true).toArray(),
    db.keys.where('[sessionId+t]').between(lo, hi, true, true).toArray(),
    db.markers.where('[sessionId+t]').between(lo, hi, true, true).toArray(),
    db.midiTracks.get(sessionId),
  ]);
  return { chords, keys, markers, midi };
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

async function remoteVersions(
  client: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const chunk of chunks(ids, IN_CHUNK)) {
    const rows = check<Array<Pick<RemoteSession, 'id' | 'updated_at'>>>(
      await client.from('sessions').select('id, updated_at').in('id', chunk),
      'read remote versions',
    );
    for (const r of rows ?? []) out.set(r.id, Number(r.updated_at));
  }
  return out;
}

async function pushBatch(
  client: SupabaseClient,
  userId: string,
  sessions: readonly Session[],
): Promise<void> {
  if (!sessions.length) return;
  const chords: RemoteChord[] = [];
  const keys: RemoteKey[] = [];
  const markers: RemoteMarker[] = [];
  const midi: RemoteMidiTrack[] = [];
  for (const s of sessions) {
    // A tombstone only needs its session row; the children stay as they were.
    if (s.deleted) continue;
    const c = await localChildren(s.id);
    chords.push(...c.chords.map((r) => toRemoteChord(r, userId, s.updatedAt)));
    keys.push(...c.keys.map((r) => toRemoteKey(r, userId, s.updatedAt)));
    markers.push(...c.markers.map((r) => toRemoteMarker(r, userId, s.updatedAt)));
    if (c.midi) midi.push(toRemoteMidi(c.midi, userId, s.updatedAt));
  }
  await upsertAll(client, 'chords', chords, 'id');
  await upsertAll(client, 'keys', keys, 'id');
  await upsertAll(client, 'markers', markers, 'id');
  // MIDI tracks can be large; one per request.
  await upsertAll(client, 'midi_tracks', midi, 'session_id', 1);
  await upsertAll(
    client,
    'sessions',
    sessions.map((s) => toRemoteSession(s, userId)),
    'id',
  );
}

/**
 * Upload local sessions changed since the last push. A session is skipped when
 * the remote copy is at least as new (last write wins), or when it is a
 * tombstone the server never saw.
 */
export async function pushChanges(): Promise<PushResult> {
  const { client, userId } = await requireUser();
  const key = pushCursorKey(userId);
  const since = await getNumber(key);
  const local = await db.sessions.where('updatedAt').above(since).sortBy('updatedAt');
  const result: PushResult = { pushed: 0, skipped: 0 };
  if (!local.length) return result;

  const remote = await remoteVersions(
    client,
    local.map((s) => s.id),
  );
  const versions = local.map((s) => s.updatedAt);
  for (let i = 0; i < local.length; i += SESSION_BATCH) {
    const batch = local.slice(i, i + SESSION_BATCH);
    const todo = batch.filter((s) => {
      const r = remote.get(s.id);
      if (r === undefined) return !s.deleted;
      return r < s.updatedAt;
    });
    try {
      await pushBatch(client, userId, todo);
    } catch (err) {
      await setNumber(key, safeCursor(versions, i, since));
      throw err;
    }
    result.pushed += todo.length;
    result.skipped += batch.length - todo.length;
  }
  await setNumber(key, safeCursor(versions, local.length, since));
  return result;
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

interface RemoteChildren {
  chords: ChordRecord[];
  keys: KeyRecord[];
  markers: Marker[];
  midi: MidiTrack | null;
}

async function remoteChildren(
  client: SupabaseClient,
  sessionId: string,
  version: number,
): Promise<RemoteChildren> {
  // Only rows stamped with this session version (or newer, if a later push is
  // half-way) belong to it; older stamps are rows the owner since removed.
  const children = <T>(table: string) =>
    fetchAll<T>(
      (from, to) =>
        client
          .from(table)
          .select('*')
          .eq('session_id', sessionId)
          .gte('updated_at', version)
          .order('t')
          .order('id')
          .range(from, to),
      `pull ${table}`,
    );
  const [chords, keys, markers, midiRes] = await Promise.all([
    children<RemoteChord>('chords'),
    children<RemoteKey>('keys'),
    children<RemoteMarker>('markers'),
    client
      .from('midi_tracks')
      .select('*')
      .eq('session_id', sessionId)
      .gte('updated_at', version)
      .maybeSingle(),
  ]);
  const midi = check<RemoteMidiTrack>(midiRes, 'pull midi_tracks');
  return {
    chords: chords.map(fromRemoteChord),
    keys: keys.map(fromRemoteKey),
    markers: markers.map(fromRemoteMarker),
    midi: midi ? fromRemoteMidi(midi) : null,
  };
}

/** Write one pulled session. Returns false when the local copy turned out newer. */
async function applyRemoteSession(
  rs: RemoteSession,
  children: RemoteChildren | null,
): Promise<boolean> {
  const id = rs.id;
  const hasAudio = (await db.recordings.where('sessionId').equals(id).count()) > 0;
  const session = fromRemoteSession(rs, hasAudio);
  const [lo, hi] = sessionRange(id);
  return db.transaction(
    'rw',
    [db.sessions, db.chords, db.keys, db.markers, db.midiTracks],
    async () => {
      const cur = await db.sessions.get(id);
      if (cur && cur.updatedAt >= session.updatedAt) return false;
      if (children) {
        await Promise.all([
          db.chords.where('[sessionId+t]').between(lo, hi, true, true).delete(),
          db.keys.where('[sessionId+t]').between(lo, hi, true, true).delete(),
          db.markers.where('[sessionId+t]').between(lo, hi, true, true).delete(),
        ]);
        await db.chords.bulkPut(children.chords);
        await db.keys.bulkPut(children.keys);
        await db.markers.bulkPut(children.markers);
        if (children.midi) await db.midiTracks.put(children.midi);
        else if (!session.hasMidi) await db.midiTracks.delete(id);
      }
      await db.sessions.put(session);
      return true;
    },
  );
}

/**
 * Download sessions changed remotely since the last pull and apply the ones
 * newer than the local copy, without bumping `updatedAt`.
 */
export async function pullChanges(): Promise<PullResult> {
  const { client, userId } = await requireUser();
  const key = pullCursorKey(userId);
  const since = await getNumber(key);
  const remote = await fetchAll<RemoteSession>(
    (from, to) =>
      client
        .from('sessions')
        .select('*')
        .gt('updated_at', since)
        .order('updated_at')
        .order('id')
        .range(from, to),
    'pull sessions',
  );
  const result: PullResult = { pulled: 0, skipped: 0 };
  const versions = remote.map((r) => Number(r.updated_at));
  for (let i = 0; i < remote.length; i++) {
    const rs = remote[i];
    try {
      const local = await db.sessions.get(rs.id);
      let applied = false;
      if (local && local.updatedAt >= versions[i]) {
        applied = false;
      } else if (rs.deleted) {
        // Tombstone: apply to a local copy; ignore sessions this device never had.
        if (local) applied = await applyRemoteSession(rs, null);
      } else {
        applied = await applyRemoteSession(rs, await remoteChildren(client, rs.id, versions[i]));
      }
      if (applied) result.pulled++;
      else result.skipped++;
    } catch (err) {
      await setNumber(key, safeCursor(versions, i, since));
      throw err;
    }
  }
  if (remote.length) await setNumber(key, safeCursor(versions, remote.length, since));
  return result;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

type StatusListener = (state: SyncState) => void;
const statusListeners = new Set<StatusListener>();

function setState(patch: Partial<SyncState>): void {
  syncStore.setState(patch);
  const state = syncStore.getState();
  for (const l of statusListeners) l(state);
}

function setStatus(status: SyncStatus, extra: Partial<SyncState> = {}): void {
  setState({ status, ...extra });
}

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

let inflight: Promise<SyncReport | null> | null = null;
let again = false;

async function runOnce(): Promise<SyncReport | null> {
  if (!isSyncConfigured()) {
    setStatus('off');
    return null;
  }
  if (!syncStore.getState().user) {
    setStatus('off');
    return null;
  }
  if (!isOnline()) {
    setState({ online: false });
    return null;
  }
  setStatus('syncing', { online: true });
  try {
    const push = await pushChanges();
    const pull = await pullChanges();
    const now = Date.now();
    await setNumber(LAST_SYNC_KEY, now);
    setStatus('idle', { lastSyncAt: now, error: null });
    return { push, pull };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus('error', { error: message });
    return null;
  }
}

/**
 * Push then pull. Never throws: failures set status `error` with a message and
 * resolve `null` (as do "off" and offline). Calls made while a sync is running
 * coalesce into one follow-up run.
 */
export function syncNow(): Promise<SyncReport | null> {
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = (async () => {
    try {
      let report: SyncReport | null;
      do {
        again = false;
        report = await runOnce();
      } while (again);
      return report;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export interface AutoSyncOptions {
  /** Periodic sync interval. Default 5 minutes. */
  intervalMs?: number;
  onStatus?: StatusListener;
}

/**
 * Keep the local library in sync: on sign-in (and on load when already signed
 * in), when the browser comes back online, every `intervalMs`, and after a jam
 * session is saved. Returns a stop function. Does nothing when unconfigured.
 */
export function startAutoSync(opts: AutoSyncOptions = {}): () => void {
  if (!isSyncConfigured()) {
    setStatus('off');
    return () => {};
  }
  const { intervalMs = DEFAULT_SYNC_INTERVAL_MS, onStatus } = opts;
  if (onStatus) statusListeners.add(onStatus);
  let stopped = false;
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const kick = () => {
    if (!stopped) void syncNow();
  };

  void getNumber(LAST_SYNC_KEY)
    .then((t) => {
      if (!stopped && t && syncStore.getState().lastSyncAt === null) setState({ lastSyncAt: t });
    })
    .catch(() => {});

  const unsubscribeAuth = onAuthChange((user) => {
    if (stopped) return;
    const prev = syncStore.getState().user;
    const status = syncStore.getState().status;
    setState({ user, status: user ? (status === 'off' ? 'idle' : status) : 'off' });
    // Defer: Supabase must not be called from inside its own auth callback.
    if (user && user.id !== prev?.id) timers.push(setTimeout(kick, 0));
  });

  const onOnline = () => {
    setState({ online: true });
    kick();
  };
  const onOffline = () => setState({ online: false });
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  const interval = setInterval(kick, intervalMs);
  const unsubscribeSaved = onSessionSaved(kick);

  return () => {
    stopped = true;
    unsubscribeAuth();
    unsubscribeSaved();
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    clearInterval(interval);
    timers.forEach(clearTimeout);
    if (onStatus) statusListeners.delete(onStatus);
  };
}
