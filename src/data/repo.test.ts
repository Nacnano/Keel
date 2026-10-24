import { cloneableBlob, resetDb } from './testing/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@/core/session';
import { mockChordRecords, mockKeyRecords, mockMarkers, mockSession } from '@/core/mocks';
import { DEFAULT_SETTINGS } from '@/core/constants';
import { db } from './db';
import { startSession } from './sessionRecorder';
import {
  addMarker,
  deleteMarker,
  getSession,
  getSessionFull,
  getSetting,
  getSettings,
  listSessions,
  listTags,
  purgeDeleted,
  renameSession,
  restoreSession,
  setSetting,
  setTags,
  softDeleteSession,
  storageEstimate,
  getChartPreview,
  updateChord,
  updateChordsLike,
  updateMarker,
} from './repo';

const DAY = 86_400_000;
const BASE = new Date(2020, 0, 1, 18, 0).getTime();

async function seed(): Promise<Session[]> {
  const sessions = [
    mockSession({ id: 's1', name: 'Evening idea in C', createdAt: BASE, updatedAt: BASE }),
    mockSession({
      id: 's2',
      name: 'Neo soul groove',
      tags: ['jazz', 'Groove'],
      createdAt: BASE + DAY,
      updatedAt: BASE + DAY,
      durationSec: 900,
      summary: {
        keys: [{ key: { tonic: 9, mode: 'minor' }, seconds: 900 }],
        topProgressions: [],
        chordCount: 0,
        bookmarks: 0,
      },
    }),
    mockSession({ id: 's3', name: 'ballad sketch', tags: [], createdAt: BASE + 2 * DAY }),
  ];
  await db.sessions.bulkAdd(sessions);
  await db.chords.bulkAdd(mockChordRecords('s1', 2));
  await db.keys.bulkAdd(mockKeyRecords('s1'));
  await db.markers.bulkAdd(mockMarkers('s1'));
  await db.midiTracks.add({
    sessionId: 's1',
    events: [{ t: 0, type: 'on', note: 60, velocity: 90, channel: 0 }],
  });
  return sessions;
}

describe('repo', () => {
  beforeEach(async () => {
    await resetDb();
    await seed();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lists newest first and sorts by other keys', async () => {
    expect((await listSessions()).map((s) => s.id)).toEqual(['s3', 's2', 's1']);
    expect((await listSessions({ sort: 'oldest' })).map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect((await listSessions({ sort: 'name' })).map((s) => s.id)).toEqual(['s3', 's1', 's2']);
    expect((await listSessions({ sort: 'longest' }))[0].id).toBe('s2');
  });

  it('hides the session being recorded and empty unfinished stubs', async () => {
    await db.sessions.add(mockSession({ id: 'stub', endedAt: null, createdAt: BASE + 3 * DAY }));
    await db.sessions.add(mockSession({ id: 'crashed', endedAt: null, createdAt: BASE + 4 * DAY }));
    await db.chords.bulkAdd(mockChordRecords('crashed', 1));
    const live = startSession({ mode: 'solo', instrument: 'piano', vocabLevel: 1, t0: 0 });
    await live.ready;
    live.onAnalysisEvent({
      type: 'chord',
      t: 1,
      chord: { root: 0, quality: 'maj' },
      confidence: 1,
      source: 'mic',
    });
    await live.flush();
    expect((await listSessions()).map((s) => s.id)).toEqual(['crashed', 's3', 's2', 's1']);
    await live.stop({ endT: 5 });
    expect((await listSessions()).map((s) => s.id)).toContain(live.id);
  });

  it('searches name, tags, key names and date; filters by tag', async () => {
    expect((await listSessions({ query: 'EVENING' })).map((s) => s.id)).toEqual(['s1']);
    expect((await listSessions({ query: 'groove' })).map((s) => s.id)).toEqual(['s2']);
    expect((await listSessions({ query: 'a minor' })).map((s) => s.id)).toEqual(['s2']);
    expect((await listSessions({ query: '2020-01-03' })).map((s) => s.id)).toEqual(['s3']);
    expect((await listSessions({ tag: 'jazz' })).map((s) => s.id)).toEqual(['s2']);
    expect(await listSessions({ query: 'nothing matches' })).toEqual([]);
    expect(await listTags()).toEqual(['Groove', 'idea', 'jazz']);
  });

  it('renames and sets tags, bumping updatedAt', async () => {
    await renameSession('s1', '  Night idea ');
    await setTags('s1', ['a', ' b ', 'A', '', 'c']);
    const s = await getSession('s1');
    expect(s?.name).toBe('Night idea');
    expect(s?.tags).toEqual(['a', 'b', 'c']);
    expect(s!.updatedAt).toBeGreaterThan(BASE);
    expect((await listSessions({ tag: 'b' })).map((x) => x.id)).toEqual(['s1']);
    await expect(renameSession('s1', '   ')).rejects.toThrow(/empty/);
    await expect(renameSession('missing', 'x')).rejects.toThrow(/not found/);
  });

  it('soft deletes, restores and purges with all child rows', async () => {
    await softDeleteSession('s1');
    expect((await listSessions()).map((s) => s.id)).toEqual(['s3', 's2']);
    expect((await listSessions({ includeDeleted: true })).map((s) => s.id)).toContain('s1');
    await restoreSession('s1');
    expect((await listSessions()).map((s) => s.id)).toContain('s1');

    await softDeleteSession('s1');
    expect(await purgeDeleted()).toBe(1);
    expect(await getSession('s1')).toBeUndefined();
    expect(await db.chords.count()).toBe(0);
    expect(await db.keys.count()).toBe(0);
    expect(await db.markers.count()).toBe(0);
    expect(await db.midiTracks.count()).toBe(0);
    expect(await db.sessions.count()).toBe(2);
  });

  it('getSessionFull returns rows in time order', async () => {
    const full = await getSessionFull('s1');
    expect(full?.session.id).toBe('s1');
    expect(full?.chords).toHaveLength(8);
    expect(full?.chords.map((c) => c.t)).toEqual(
      [...full!.chords.map((c) => c.t)].sort((a, b) => a - b),
    );
    expect(full?.keys).toHaveLength(1);
    expect(full?.markers.map((m) => m.kind)).toEqual(['intro', 'verse', 'bookmark']);
    expect(full?.midiTrack?.events).toHaveLength(1);
    expect(full?.recording).toBeUndefined();
    expect(await getSessionFull('missing')).toBeUndefined();
  });

  it('updateChord marks the record manual and refreshes the summary', async () => {
    const before = (await getSession('s1'))!;
    const rec = await updateChord('s1-c-1', { root: 2, quality: 'min7' });
    expect(rec).toMatchObject({ manual: true, chord: { root: 2, quality: 'min7' } });
    expect((await db.chords.get('s1-c-1'))?.manual).toBe(true);
    const after = (await getSession('s1'))!;
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt);
    expect(after.summary?.chordCount).toBe(8);
    await updateChord('s1-c-2', null);
    expect((await getSession('s1'))?.summary?.chordCount).toBe(7);
    await expect(updateChord('nope', null)).rejects.toThrow(/not found/);
  });

  it('updateChordsLike changes every chord of the same root and quality', async () => {
    // s1 is C G Am F twice: both Am become A.
    const changed = await updateChordsLike(
      's1',
      { root: 9, quality: 'min', bass: 4 },
      {
        root: 9,
        quality: 'maj',
      },
    );
    expect(changed.map((c) => c.id)).toEqual(['s1-c-2', 's1-c-6']);
    const rows = (await getSessionFull('s1'))!.chords;
    expect(rows.filter((c) => c.chord?.root === 9).every((c) => c.chord?.quality === 'maj')).toBe(
      true,
    );
    expect(rows.filter((c) => c.manual).map((c) => c.id)).toEqual(['s1-c-2', 's1-c-6']);
  });

  it('getChartPreview returns the first folded row of the chart', async () => {
    const preview = await getChartPreview('s1');
    expect(preview?.key).toEqual({ tonic: 0, mode: 'major' });
    expect(preview?.row[0]).toMatchObject({ repeat: 2 });
    expect(preview?.row[0].chords.map((c) => c.root)).toEqual([0, 7, 9, 5]);
    expect(await getChartPreview('missing')).toBeNull();
  });

  it('adds, updates and deletes markers', async () => {
    const m = await addMarker('s1', { t: 30, kind: 'bookmark', label: 'that bit' });
    expect((await getSession('s1'))?.summary?.bookmarks).toBe(2);
    const u = await updateMarker(m.id, { kind: 'chorus', label: undefined });
    expect(u).toEqual({ id: m.id, sessionId: 's1', t: 30, kind: 'chorus' });
    expect((await getSession('s1'))?.summary?.bookmarks).toBe(1);
    await deleteMarker(m.id);
    expect(await db.markers.get(m.id)).toBeUndefined();
    await expect(addMarker('missing', { t: 0, kind: 'verse' })).rejects.toThrow(/not found/);
  });

  it('storageEstimate uses navigator.storage and falls back without it', async () => {
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ usage: 1234, quota: 10_000 }) },
    });
    expect(await storageEstimate()).toEqual({ usage: 1234, quota: 10_000, exact: true });
    vi.stubGlobal('navigator', {});
    await db.recordings.add({
      sessionId: 's1',
      blob: await cloneableBlob('12345'),
      mimeType: 'audio/webm',
      durationSec: 1,
    });
    expect(await storageEstimate()).toEqual({ usage: 5, quota: null, exact: false });
  });

  it('reads settings with defaults and persists overrides', async () => {
    expect(await getSetting('a4')).toBe(DEFAULT_SETTINGS.a4);
    await setSetting('a4', 442);
    await setSetting('theme', 'light');
    expect(await getSetting('a4')).toBe(442);
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, a4: 442, theme: 'light' });
  });
});
