import { resetDb } from '@/data/testing/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChordRecords, mockKeyRecords, mockMarkers, mockSession } from '@/core/mocks';
import { db } from '@/data/db';
import { fromJSON } from '@/data/export';
import { getSessionFull } from '@/data/repo';
import { disableSyncEnv, enableSyncEnv, fake, TEST_USER } from './testing/mockSupabase';
import {
  createShare,
  fetchShare,
  isSharePayload,
  listShares,
  randomShareCode,
  revokeShare,
  SHARE_CODE_LENGTH,
} from './share';

vi.mock('@supabase/supabase-js', () => import('./testing/mockSupabase'));

const SID = 'share-session-1';

beforeEach(async () => {
  await resetDb();
  fake.reset();
  enableSyncEnv();
  fake.signIn(TEST_USER);
  await db.sessions.put(mockSession({ id: SID, hasMidi: true, hasAudio: true }));
  await db.chords.bulkPut(mockChordRecords(SID, 3));
  await db.keys.bulkPut(mockKeyRecords(SID));
  await db.markers.bulkPut(mockMarkers(SID));
  await db.midiTracks.put({
    sessionId: SID,
    events: [{ t: 0, type: 'on', note: 60, velocity: 80, channel: 0 }],
  });
});

afterEach(() => vi.unstubAllEnvs());

describe('share links', () => {
  it('generates short url-safe codes', () => {
    const codes = new Set(Array.from({ length: 200 }, () => randomShareCode()));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(new RegExp(`^[A-Za-z0-9]{${SHARE_CODE_LENGTH}}$`));
  });

  it('round-trips a self-contained payload without MIDI events', async () => {
    const link = await createShare(SID);
    expect(link.url).toBe(`${window.location.origin}/s/${link.code}`);

    const [row] = fake.rows('shares');
    expect(row).toMatchObject({ code: link.code, user_id: TEST_USER.id, session_id: SID });

    const shared = await fetchShare(link.code);
    expect(shared).not.toBeNull();
    const payload = shared!.payload;
    expect(isSharePayload(payload)).toBe(true);
    expect(payload.chart.midiTrack).toBeNull();
    expect(payload.chart.session).toMatchObject({ hasMidi: false, hasAudio: false });
    expect(payload.chart.chords).toHaveLength(12);
    expect(payload.text).toContain('Evening idea in C');
    expect(payload.text).toContain('Key: C major');

    // "Open in JamKey" imports the chart as a new local session.
    const newId = await fromJSON(payload.chart);
    const imported = await getSessionFull(newId);
    expect(imported?.session.name).toBe('Evening idea in C');
    expect(imported?.chords.map((c) => c.chord)).toEqual(
      mockChordRecords(SID, 3).map((c) => c.chord),
    );
    expect(imported?.midiTrack).toBeUndefined();
  });

  it('reads shares while logged out and returns null for unknown codes', async () => {
    const { code } = await createShare(SID);
    fake.signOutNow();
    expect((await fetchShare(code))?.payload.chart.session.name).toBe('Evening idea in C');
    expect(await fetchShare('doesNotExist')).toBeNull();
  });

  it('lists and revokes the owner’s links', async () => {
    const a = await createShare(SID);
    expect((await listShares(SID)).map((s) => s.code)).toEqual([a.code]);
    await revokeShare(a.code);
    expect(await fetchShare(a.code)).toBeNull();
    expect(await listShares(SID)).toEqual([]);
  });

  it('needs a signed-in user to create a link', async () => {
    fake.signOutNow();
    await expect(createShare(SID)).rejects.toThrow(/Sign in/);
  });

  it('fails clearly when sync is not configured', async () => {
    disableSyncEnv();
    await expect(fetchShare('abc')).rejects.toThrow(/not configured/);
  });
});
