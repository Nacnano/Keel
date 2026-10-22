import { cloneableBlob, resetDb } from './testing/setup';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChordRecord, KeyRecord, Marker } from '@/core/session';
import type { Chord, KeyEstimate } from '@/core/types';
import { C_MAJOR_KEY, JAZZ_PROGRESSION, POP_PROGRESSION, mockSession } from '@/core/mocks';
import { db } from './db';
import { getSessionFull, type SessionFull } from './repo';
import { ImportError, formatTime, fromJSON, toJSON, toText } from './export';

const SID = 'mock-session-1';
const A_MINOR: KeyEstimate = {
  tonic: 9,
  mode: 'minor',
  confidence: 0.7,
  relative: { tonic: 0, mode: 'major' },
  alternatives: [],
};

function chordRows(chords: Chord[], t0: number, step: number, offset = 0): ChordRecord[] {
  return chords.map((chord, i) => ({
    id: `${SID}-c-${offset + i}`,
    sessionId: SID,
    t: t0 + i * step,
    chord,
    confidence: 0.8,
    source: 'mic',
    manual: false,
  }));
}

const repeat = <T>(xs: T[], n: number): T[] => Array.from({ length: n }, () => xs).flat();

function fixture(): SessionFull {
  const intro = chordRows(repeat(POP_PROGRESSION, 4), 0, 1.5);
  const verse = chordRows(repeat(JAZZ_PROGRESSION.slice(0, 3), 2), 24, 2, 16);
  const outro = chordRows(
    [
      { root: 9, quality: 'min' },
      { root: 2, quality: 'min' },
      { root: 4, quality: '7' },
      { root: 9, quality: 'min' },
    ],
    160,
    4,
    22,
  );
  const keys: KeyRecord[] = [
    { id: `${SID}-k-0`, sessionId: SID, t: 0, key: C_MAJOR_KEY },
    { id: `${SID}-k-1`, sessionId: SID, t: 155, key: A_MINOR },
  ];
  const markers: Marker[] = [
    { id: `${SID}-m-0`, sessionId: SID, t: 0, kind: 'intro' },
    { id: `${SID}-m-1`, sessionId: SID, t: 24, kind: 'verse' },
    { id: `${SID}-m-2`, sessionId: SID, t: 60, kind: 'bookmark', label: 'nice' },
  ];
  return {
    session: mockSession({ createdAt: new Date(2026, 9, 22, 20, 0).getTime(), hasMidi: true }),
    chords: [...intro, ...verse, ...outro],
    keys,
    markers,
    midiTrack: {
      sessionId: SID,
      events: [
        { t: 0, type: 'on', note: 60, velocity: 90, channel: 0 },
        { t: 0.5, type: 'off', note: 60, velocity: 0, channel: 0 },
      ],
    },
  };
}

async function seed(full: SessionFull): Promise<void> {
  await db.sessions.add(full.session);
  await db.chords.bulkAdd(full.chords);
  await db.keys.bulkAdd(full.keys);
  await db.markers.bulkAdd(full.markers);
  if (full.midiTrack) await db.midiTracks.add(full.midiTrack);
}

describe('toText', () => {
  it('renders a compressed chord chart with sections, modulations and bookmarks', () => {
    expect(toText(fixture())).toMatchInlineSnapshot(`
      "Evening idea in C — 2026-10-22 — 5:00
      Key: C major
      [intro] | C G Am F | ×4
      [verse] | Dm7 G7 Cmaj7 | ×2
      → A minor at 2:35
      | Am Dm E7 Am |
      Bookmarks: 1:00 nice
      "
    `);
  });

  it('spells chords with flats in flat keys and handles empty sessions', () => {
    const full = fixture();
    full.keys = [{ ...full.keys[0], key: { ...C_MAJOR_KEY, tonic: 5 } }];
    full.markers = [];
    full.chords = chordRows(
      [
        { root: 5, quality: 'maj' },
        { root: 10, quality: 'maj' },
        { root: 5, quality: 'maj', bass: 9 },
      ],
      0,
      1,
    );
    expect(toText(full).split('\n').slice(1, 3)).toEqual(['Key: F major', '| F Bb F/A |']);

    const empty: SessionFull = {
      session: mockSession({ name: 'Empty' }),
      chords: [],
      keys: [],
      markers: [],
    };
    expect(toText(empty).split('\n')).toHaveLength(2);
  });

  it('formats times', () => {
    expect([formatTime(0), formatTime(155), formatTime(3723.4)]).toEqual([
      '0:00',
      '2:35',
      '1:02:03',
    ]);
  });
});

describe('toJSON / fromJSON', () => {
  beforeEach(resetDb);

  it('round-trips through JSON into equal records with new ids', async () => {
    const original = fixture();
    await seed(original);
    await db.recordings.add({
      sessionId: SID,
      blob: await cloneableBlob('audio'),
      mimeType: 'audio/webm',
      durationSec: 300,
    });
    const full = (await getSessionFull(SID))!;
    const exported = toJSON(full);
    expect(exported.version).toBe(1);
    expect(exported).not.toHaveProperty('recording');

    const newId = await fromJSON(JSON.stringify(exported));
    expect(newId).not.toBe(SID);
    const imported = (await getSessionFull(newId))!;

    const strip = <T extends { id: string; sessionId: string }>(rows: T[]) =>
      rows.map(({ id: _id, sessionId: _s, ...rest }) => rest);
    expect(strip(imported.chords)).toEqual(strip(full.chords));
    expect(strip(imported.keys)).toEqual(strip(full.keys));
    expect(strip(imported.markers)).toEqual(strip(full.markers));
    expect(imported.midiTrack?.events).toEqual(full.midiTrack?.events);

    const ids = (rows: Array<{ id: string; sessionId: string }>) =>
      rows.map((r) => [r.id, r.sessionId]);
    for (const [id, sessionId] of ids([
      ...imported.chords,
      ...imported.keys,
      ...imported.markers,
    ])) {
      expect(sessionId).toBe(newId);
      expect(id.startsWith(SID)).toBe(false);
    }

    const { id: _a, updatedAt: _b, hasAudio: _c, ...sessionRest } = imported.session;
    const { id: _d, updatedAt: _e, hasAudio: _f, ...originalRest } = full.session;
    expect(sessionRest).toEqual(originalRest);
    expect(imported.session.hasAudio).toBe(false);
    expect(imported.recording).toBeUndefined();
    expect(await db.sessions.count()).toBe(2);
  });

  it('accepts an object as well as a string', async () => {
    const id = await fromJSON(toJSON(fixture()));
    expect((await getSessionFull(id))?.chords).toHaveLength(26);
  });

  it('rejects unknown versions and malformed input with clear errors', async () => {
    const good = toJSON(fixture());
    await expect(fromJSON({ ...good, version: 2 })).rejects.toThrow(
      /unsupported export version 2.*reads version 1/,
    );
    await expect(fromJSON('{nope')).rejects.toThrow(/not valid JSON/);
    await expect(fromJSON({ hello: 1 })).rejects.toThrow(/not a JamKey session export/);
    await expect(fromJSON({ ...good, chords: 'x' })).rejects.toThrow(/"chords" must be an array/);
    await expect(fromJSON({ ...good, session: null })).rejects.toBeInstanceOf(ImportError);
    expect(await db.sessions.count()).toBe(0);
  });
});
