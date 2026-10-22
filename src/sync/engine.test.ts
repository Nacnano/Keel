import { resetDb } from '@/data/testing/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/core/session';
import { mockChordRecords, mockKeyRecords, mockMarkers, mockSession } from '@/core/mocks';
import { db } from '@/data/db';
import { getSessionFull, renameSession, softDeleteSession } from '@/data/repo';
import { enableSyncEnv, fake, TEST_USER } from './testing/mockSupabase';
import {
  getCursors,
  LAST_SYNC_KEY,
  pullChanges,
  pushChanges,
  startAutoSync,
  syncNow,
} from './engine';
import type { RemoteChord, RemoteSession } from './rows';
import { notifySessionSaved } from './signals';
import { initialSyncState, syncStore } from './store';

vi.mock('@supabase/supabase-js', () => import('./testing/mockSupabase'));

const SID = '11111111-1111-4111-8111-111111111111';
const UID = TEST_USER.id;

async function seedLocal(partial: Partial<Session> = {}, id = SID): Promise<Session> {
  const s = mockSession({ id, updatedAt: 1_000, ...partial });
  await db.sessions.put(s);
  await db.chords.bulkPut(mockChordRecords(id, 2));
  await db.keys.bulkPut(mockKeyRecords(id));
  await db.markers.bulkPut(mockMarkers(id));
  await db.midiTracks.put({
    sessionId: id,
    events: [{ t: 0.5, type: 'on', note: 60, velocity: 90, channel: 0 }],
  });
  return s;
}

function remoteSession(partial: Partial<RemoteSession> = {}): RemoteSession {
  return {
    id: SID,
    user_id: UID,
    name: 'From the other device',
    created_at: 500,
    ended_at: 900,
    duration_sec: 120,
    mode: 'solo',
    instrument: 'piano',
    vocab_level: 2,
    tags: ['remote'],
    has_audio: true,
    has_midi: false,
    summary: null,
    updated_at: 5_000,
    deleted: false,
    ...partial,
  };
}

function remoteChord(id: string, t: number, updated_at: number): RemoteChord {
  return {
    id,
    session_id: SID,
    user_id: UID,
    t,
    chord: { root: 7, quality: 'maj' },
    confidence: 0.9,
    source: 'midi',
    manual: true,
    updated_at,
  };
}

const ops = (op: string, table?: string) =>
  fake.calls.filter((c) => c.op === op && (!table || c.table === table));

beforeEach(async () => {
  await resetDb();
  fake.reset();
  enableSyncEnv();
  syncStore.setState(initialSyncState());
  fake.signIn(TEST_USER);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('pushChanges', () => {
  it('uploads new local sessions with all children, stamped with the session version', async () => {
    await seedLocal();
    const res = await pushChanges();
    expect(res).toEqual({ pushed: 1, skipped: 0 });

    const [s] = fake.rows('sessions') as unknown as RemoteSession[];
    expect(s).toMatchObject({ id: SID, user_id: UID, updated_at: 1_000, deleted: false });
    expect(s.name).toBe('Evening idea in C');
    expect(fake.rows('chords')).toHaveLength(8);
    expect(fake.rows('keys')).toHaveLength(1);
    expect(fake.rows('markers')).toHaveLength(3);
    expect(fake.rows('midi_tracks')).toHaveLength(1);
    for (const t of ['chords', 'keys', 'markers', 'midi_tracks']) {
      for (const r of fake.rows(t)) expect(r).toMatchObject({ user_id: UID, updated_at: 1_000 });
    }
    // Children are written before the session row.
    const order = ops('upsert').map((c) => c.table);
    expect(order[order.length - 1]).toBe('sessions');
  });

  it('never uploads audio recordings', async () => {
    await seedLocal({ hasAudio: true });
    await db.recordings.put({
      sessionId: SID,
      blob: new Blob(['x']),
      mimeType: 'audio/webm',
      durationSec: 1,
    });
    await pushChanges();
    expect(fake.calls.some((c) => c.table.includes('record'))).toBe(false);
    expect(JSON.stringify(fake.calls)).not.toContain('audio/webm');
  });

  it('advances the cursor so unchanged rows are not pushed again', async () => {
    await seedLocal();
    await pushChanges();
    expect((await getCursors(UID)).lastPushedAt).toBe(1_000);
    const before = ops('upsert').length;
    expect(await pushChanges()).toEqual({ pushed: 0, skipped: 0 });
    expect(ops('upsert').length).toBe(before);
  });

  it('pushes a local edit made after the last push', async () => {
    await seedLocal();
    await pushChanges();
    await renameSession(SID, 'Renamed');
    expect((await pushChanges()).pushed).toBe(1);
    expect(fake.rows('sessions')[0]).toMatchObject({ name: 'Renamed' });
  });

  it('does not overwrite a newer remote row (last write wins)', async () => {
    await seedLocal();
    fake.rows('sessions').push({ ...remoteSession({ updated_at: 9_000 }) });
    expect(await pushChanges()).toEqual({ pushed: 0, skipped: 1 });
    expect(fake.rows('sessions')[0]).toMatchObject({ name: 'From the other device' });
  });

  it('propagates a soft delete as an update, never a hard delete', async () => {
    await seedLocal();
    await pushChanges();
    await softDeleteSession(SID);
    expect((await pushChanges()).pushed).toBe(1);
    expect(fake.rows('sessions')[0]).toMatchObject({ id: SID, deleted: true });
    expect(fake.rows('chords')).toHaveLength(8);
    expect(ops('delete')).toHaveLength(0);
  });

  it('skips tombstones the server never saw', async () => {
    await seedLocal({ deleted: true });
    expect(await pushChanges()).toEqual({ pushed: 0, skipped: 1 });
    expect(fake.rows('sessions')).toHaveLength(0);
  });

  it('keeps the cursor when an upload fails', async () => {
    await seedLocal();
    fake.failures.set('sessions', 'boom');
    await expect(pushChanges()).rejects.toThrow(/boom/);
    expect((await getCursors(UID)).lastPushedAt).toBe(0);
  });

  it('requires a signed-in user', async () => {
    fake.signOutNow();
    await expect(pushChanges()).rejects.toThrow(/Not signed in/);
  });
});

describe('pullChanges', () => {
  it('applies a newer remote session and replaces its children', async () => {
    await seedLocal();
    fake.rows('sessions').push({ ...remoteSession() });
    fake.rows('chords').push(
      { ...remoteChord('c-new-1', 0, 5_000) },
      { ...remoteChord('c-new-2', 2, 5_000) },
      // Stale row from an older version: the owner removed it since.
      { ...remoteChord('c-stale', 4, 3_000) },
    );
    expect(await pullChanges()).toEqual({ pulled: 1, skipped: 0 });

    const full = await getSessionFull(SID);
    expect(full?.session).toMatchObject({ name: 'From the other device', tags: ['remote'] });
    expect(full?.chords.map((c) => c.id)).toEqual(['c-new-1', 'c-new-2']);
    expect(full?.chords[0]).toMatchObject({ chord: { root: 7, quality: 'maj' }, manual: true });
    expect(full?.keys).toHaveLength(0);
    expect(full?.markers).toHaveLength(0);
    // has_midi false and no remote track: the local track goes too.
    expect(full?.midiTrack).toBeUndefined();
    expect((await getCursors(UID)).lastPulledAt).toBe(5_000);
  });

  it('does not bump updatedAt, so a pulled row is not echoed back', async () => {
    fake.rows('sessions').push({ ...remoteSession({ updated_at: 7_777 }) });
    await pullChanges();
    const local = await db.sessions.get(SID);
    expect(local?.updatedAt).toBe(7_777);
    // hasAudio reflects this device: there is no recording here.
    expect(local?.hasAudio).toBe(false);

    const upsertsBefore = ops('upsert').length;
    expect(await pushChanges()).toEqual({ pushed: 0, skipped: 1 });
    expect(ops('upsert').length).toBe(upsertsBefore);
  });

  it('creates sessions this device has never seen', async () => {
    fake.rows('sessions').push({ ...remoteSession({ id: 'other-id' }) });
    fake.rows('chords').push({ ...remoteChord('c1', 0, 5_000), session_id: 'other-id' });
    await pullChanges();
    const full = await getSessionFull('other-id');
    expect(full?.chords).toHaveLength(1);
  });

  it('keeps a local copy that is newer than the remote one', async () => {
    await seedLocal({ updatedAt: 9_000, name: 'Local wins' });
    fake.rows('sessions').push({ ...remoteSession({ updated_at: 5_000 }) });
    expect(await pullChanges()).toEqual({ pulled: 0, skipped: 1 });
    expect((await db.sessions.get(SID))?.name).toBe('Local wins');
    expect(await db.chords.count()).toBe(8);
    expect((await getCursors(UID)).lastPulledAt).toBe(5_000);
  });

  it('propagates a remote soft delete and keeps the local children', async () => {
    await seedLocal();
    fake.rows('sessions').push({ ...remoteSession({ deleted: true, updated_at: 6_000 }) });
    expect((await pullChanges()).pulled).toBe(1);
    const local = await db.sessions.get(SID);
    expect(local).toMatchObject({ deleted: true, updatedAt: 6_000 });
    expect(await db.chords.count()).toBe(8);
  });

  it('ignores remote tombstones for sessions this device never had', async () => {
    fake.rows('sessions').push({ ...remoteSession({ deleted: true }) });
    expect(await pullChanges()).toEqual({ pulled: 0, skipped: 1 });
    expect(await db.sessions.count()).toBe(0);
  });

  it('advances the cursor and only reads rows changed since', async () => {
    fake.rows('sessions').push({ ...remoteSession({ updated_at: 5_000 }) });
    await pullChanges();
    expect(await pullChanges()).toEqual({ pulled: 0, skipped: 0 });
    fake.rows('sessions')[0].updated_at = 6_000;
    fake.rows('sessions')[0].name = 'Again';
    expect((await pullChanges()).pulled).toBe(1);
    expect((await db.sessions.get(SID))?.name).toBe('Again');
    expect((await getCursors(UID)).lastPulledAt).toBe(6_000);
  });

  it('pages through more rows than one response holds', async () => {
    for (let i = 0; i < 520; i++) {
      fake.rows('sessions').push({
        ...remoteSession({ id: `s-${String(i).padStart(4, '0')}`, updated_at: 5_000 + i }),
      });
    }
    expect((await pullChanges()).pulled).toBe(520);
    expect(await db.sessions.count()).toBe(520);
  });
});

describe('syncNow / startAutoSync', () => {
  it('is off when signed out', async () => {
    syncStore.setState({ user: null });
    expect(await syncNow()).toBeNull();
    expect(syncStore.getState().status).toBe('off');
  });

  it('pushes, pulls and records the last sync time', async () => {
    syncStore.setState({ user: { id: UID, email: TEST_USER.email } });
    await seedLocal();
    fake.rows('sessions').push({ ...remoteSession({ id: 'remote-only', updated_at: 4_000 }) });
    const report = await syncNow();
    expect(report?.push.pushed).toBe(1);
    expect(report?.pull.pulled).toBe(1);
    const st = syncStore.getState();
    expect(st.status).toBe('idle');
    expect(st.lastSyncAt).toEqual(expect.any(Number));
    expect((await db.settings.get(LAST_SYNC_KEY))?.value).toBe(st.lastSyncAt);
  });

  it('reports errors through the status instead of throwing', async () => {
    syncStore.setState({ user: { id: UID, email: TEST_USER.email } });
    await seedLocal();
    fake.failures.set('chords', 'network down');
    expect(await syncNow()).toBeNull();
    expect(syncStore.getState()).toMatchObject({ status: 'error' });
    expect(syncStore.getState().error).toMatch(/network down/);
  });

  it('syncs on sign-in and after a session is saved', async () => {
    fake.signOutNow();
    const statuses: string[] = [];
    const stop = startAutoSync({ intervalMs: 60_000, onStatus: (s) => statuses.push(s.status) });
    await vi.waitFor(() => expect(syncStore.getState().status).toBe('off'));

    await seedLocal();
    fake.signIn(TEST_USER);
    await vi.waitFor(() => expect(fake.rows('sessions')).toHaveLength(1));
    await vi.waitFor(() => expect(syncStore.getState().status).toBe('idle'));
    expect(syncStore.getState().user?.email).toBe(TEST_USER.email);
    expect(statuses).toContain('syncing');

    await renameSession(SID, 'After stop');
    notifySessionSaved();
    await vi.waitFor(() => expect(fake.rows('sessions')[0]).toMatchObject({ name: 'After stop' }));
    stop();
  });

  it('syncs when the browser comes back online', async () => {
    const stop = startAutoSync({ intervalMs: 60_000 });
    await vi.waitFor(() => expect(syncStore.getState().status).toBe('idle'));
    await seedLocal({ updatedAt: Date.now() });
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(fake.rows('sessions')).toHaveLength(1));
    stop();
  });
});
