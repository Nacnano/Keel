import { cloneableBlob, resetDb } from './testing/setup';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ChordRecord, KeyRecord, Marker } from '@/core/session';
import type { Chord, KeyEstimate } from '@/core/types';
import { C_MAJOR_KEY, JAZZ_PROGRESSION, POP_PROGRESSION, mockSession } from '@/core/mocks';
import { db } from './db';
import { getSessionFull, type SessionFull } from './repo';
import { ImportError, buildChart, formatTime, fromJSON, toJSON, toText } from './export';
import { sessionName } from './sessionRecorder';

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
  it('renders the folded chart: sections, loops, numerals, key changes and bookmarks', () => {
    expect(toText(fixture())).toMatchInlineSnapshot(`
      "Evening idea in C — 5:00
      Key: C major

      [Intro]
      [C G Am F] ×4
       I V vi IV

      [Verse]
      [Dm7 G7 Cmaj7] ×2
       ii7 V7 Imaj7

      → A minor at 2:35
      Am Dm E7 Am
      i  iv V7 i

      Bookmarks: 1:00 nice
      "
    `);
  });

  it('spells chords with flat glyphs in flat keys and handles empty sessions', () => {
    const full = fixture();
    full.keys = [{ ...full.keys[0], key: { ...C_MAJOR_KEY, tonic: 5 } }];
    full.markers = [];
    full.chords = chordRows(
      [
        { root: 5, quality: 'maj' },
        { root: 10, quality: 'maj' },
        { root: 7, quality: 'm7b5' },
        { root: 5, quality: 'maj', bass: 9 },
      ],
      0,
      2,
    );
    expect(toText(full).split('\n').slice(1, 5)).toMatchInlineSnapshot(`
      [
        "Key: F major",
        "",
        "F B♭ Gm7♭5 F/A",
        "I IV iiø7  I",
      ]
    `);

    const empty: SessionFull = {
      session: mockSession({ name: 'Empty' }),
      chords: [],
      keys: [],
      markers: [],
    };
    expect(toText(empty)).toBe('Empty — 5:00\n');
  });

  it('renders the clean take as two titled sections with one numerals line each', () => {
    const full = fixture();
    full.keys = [full.keys[0]];
    full.markers = [
      { id: 'm0', sessionId: SID, t: 0, kind: 'intro' },
      { id: 'm1', sessionId: SID, t: 12, kind: 'chorus' },
    ];
    full.chords = chordRows(repeat(POP_PROGRESSION, 5), 0, 1.5);
    const text = toText(full);
    expect(text).toMatchInlineSnapshot(`
      "Evening idea in C — 5:00
      Key: C major

      [Intro]
      [C G Am F] ×2
       I V vi IV

      [Chorus]
      [C G Am F] ×3
       I V vi IV
      "
    `);
    const lines = text.trimEnd().split('\n');
    expect(lines.filter((l) => /^\[[A-Z][a-z-]+\]$/.test(l))).toEqual(['[Intro]', '[Chorus]']);
    expect(lines.filter((l) => /^ I\s+V\s+vi\s+IV/.test(l))).toHaveLength(2);
    // No row is a lone chord, and there are no bar lines.
    expect(lines.some((l) => /^\S+$/.test(l) && !l.startsWith('['))).toBe(false);
    expect(text).not.toContain('|');
  });

  it('folds a short tail into the row before and keeps user labels', () => {
    const full = fixture();
    full.keys = [full.keys[0]];
    full.markers = [
      { id: 'm0', sessionId: SID, t: 0, kind: 'chorus' },
      { id: 'm1', sessionId: SID, t: 30, kind: 'custom', label: 'tag ending' },
    ];
    full.chords = [
      ...chordRows([...repeat(POP_PROGRESSION, 3), { root: 2, quality: 'min' }], 0, 2),
      ...chordRows(
        [
          { root: 7, quality: 'maj' },
          { root: 0, quality: 'maj' },
        ],
        30,
        2,
        100,
      ),
    ];
    expect(toText(full).split('\n').slice(2)).toMatchInlineSnapshot(`
      [
        "",
        "[Chorus]",
        "[C G Am F] ×3  Dm",
        " I V vi IV     ii",
        "",
        "[Tag ending]",
        "G C",
        "V I",
        "",
      ]
    `);
  });

  it('heads the chart with the key by time and hides key wobbles under ten seconds', () => {
    const full = fixture();
    full.markers = [];
    full.session = { ...full.session, durationSec: 60 };
    // B major for the first 8 s, E major, an A major wobble of 6 s, E major again.
    const key = (tonic: number) => ({ ...C_MAJOR_KEY, tonic: tonic as 0 });
    full.keys = [
      { id: 'k0', sessionId: SID, t: 1, key: key(11) },
      { id: 'k1', sessionId: SID, t: 8, key: key(4) },
      { id: 'k2', sessionId: SID, t: 33, key: key(9) },
      { id: 'k3', sessionId: SID, t: 39, key: key(4) },
    ];
    full.chords = chordRows(
      repeat(
        [
          { root: 1, quality: 'min' },
          { root: 9, quality: 'maj' },
          { root: 4, quality: 'maj' },
          { root: 11, quality: 'maj' },
        ],
        6,
      ),
      0,
      2.5,
    );
    const text = toText(full);
    expect(text.split('\n')[1]).toBe('Key: E major');
    expect(text).not.toContain('→');
    expect(text).toContain('[C♯m A  E B] ×6');
    expect(text).toContain(' vi  IV I V');

    const chart = buildChart({ ...full, durationSec: 60 });
    expect(chart.keys.map((k) => [k.key.tonic, k.start, k.end])).toEqual([[4, 0, 60]]);
  });

  it('folds chords held under 1.5 s into the longer neighbour, in the chart only', () => {
    const full = fixture();
    full.keys = [full.keys[0]];
    full.markers = [];
    const C: Chord = { root: 0, quality: 'maj' };
    const Em: Chord = { root: 4, quality: 'min' };
    const F: Chord = { root: 5, quality: 'maj' };
    const G7: Chord = { root: 7, quality: '7' };
    // C 3 s, a 1 s passing Em, F 3.5 s and a 0.5 s G7 wobble, three times.
    const pass = [
      [C, 3],
      [Em, 1],
      [F, 3.5],
      [G7, 0.5],
    ] as const;
    let t = 0;
    const chords: ChordRecord[] = [];
    for (let n = 0; n < 3; n++) {
      for (const [chord, len] of pass) {
        chords.push(...chordRows([chord], t, 0, chords.length));
        t += len;
      }
    }
    full.chords = chords;
    full.session = { ...full.session, durationSec: t };
    const before = structuredClone(full.chords);

    const chart = buildChart({ ...full, durationSec: t });
    const rows = chart.parts.flatMap((p) => (p.type === 'section' ? p.rows : []));
    expect(rows).toHaveLength(1);
    expect(rows[0][0].repeat).toBe(3);
    expect(rows[0][0].chords).toEqual([C, F]);
    // Each short chord goes to its longer neighbour: the Em and the G7 both to the F.
    expect(rows[0][0].spans.slice(0, 2)).toEqual([
      { chord: C, t: 0, end: 3 },
      { chord: F, t: 3, end: 8 },
    ]);
    expect(toText(full).split('\n').slice(2, 5)).toEqual(['', '[C F] ×3', ' I IV']);
    // The stored rows are untouched.
    expect(full.chords).toEqual(before);
  });

  it('prints a loop in brackets, the way the screen draws it, with its tail after', () => {
    const full = fixture();
    full.markers = [];
    full.keys = [{ ...full.keys[0], key: { ...C_MAJOR_KEY, tonic: 4 } }];
    full.chords = chordRows(
      [
        { root: 9, quality: 'maj' },
        { root: 11, quality: '7' },
        { root: 9, quality: 'maj' },
        { root: 11, quality: '7' },
        { root: 1, quality: 'min7' },
      ],
      0,
      2,
    );
    full.session = { ...full.session, durationSec: 10 };
    expect(toText(full).split('\n').slice(3)).toMatchInlineSnapshot(`
      [
        "[A  B7] ×2  C♯m7",
        " IV V7      vi7",
        "",
      ]
    `);
  });

  it('never shows the parallel key as a key change (a blue third is not a modulation)', () => {
    const full = fixture();
    full.markers = [];
    full.session = { ...full.session, durationSec: 99 };
    const cMinor = { ...C_MAJOR_KEY, mode: 'minor' as const };
    full.keys = [
      { id: 'k0', sessionId: SID, t: 0, key: cMinor },
      { id: 'k1', sessionId: SID, t: 38, key: C_MAJOR_KEY },
      { id: 'k2', sessionId: SID, t: 60, key: cMinor },
      { id: 'k3', sessionId: SID, t: 75, key: C_MAJOR_KEY },
    ];
    full.chords = chordRows(
      repeat(
        [
          { root: 0, quality: '7' },
          { root: 9, quality: '7' },
          { root: 2, quality: 'min7' },
          { root: 7, quality: '7' },
        ],
        6,
      ),
      0,
      4,
    );
    const chart = buildChart({ ...full, durationSec: 99 });
    // C minor 38 + 15 s, C major 22 + 24 s: one C span, named by the mode heard longest...
    expect(chart.keys).toEqual([{ key: { tonic: 0, mode: 'minor' }, start: 0, end: 99 }]);

    // ...and with more C major than C minor the chart, header and numerals are all C major.
    full.keys[0] = { ...full.keys[0], t: 0, key: C_MAJOR_KEY };
    full.keys[1] = { ...full.keys[1], t: 20, key: cMinor };
    full.keys[2] = { ...full.keys[2], t: 45, key: C_MAJOR_KEY };
    full.keys.splice(3);
    const text = toText(full);
    expect(buildChart({ ...full, durationSec: 99 }).keys).toEqual([
      { key: { tonic: 0, mode: 'major' }, start: 0, end: 99 },
    ]);
    expect(text.split('\n')[1]).toBe('Key: C major');
    expect(text).not.toContain('→');
    expect(text).toContain('V7/ii');
    expect(text).not.toContain('VI7');
  });

  it('splits a set into songs at New song marks, each with its own key', () => {
    const full = fixture();
    full.session = { ...full.session, name: 'Jam in C major · A♭ major', durationSec: 60 };
    const Ab = { ...C_MAJOR_KEY, tonic: 8 as const };
    full.keys = [
      { id: 'k0', sessionId: SID, t: 0, key: C_MAJOR_KEY },
      // The new song's key arrives 1.6 s after the tap.
      { id: 'k1', sessionId: SID, t: 31.6, key: Ab },
    ];
    full.markers = [
      { id: 'm0', sessionId: SID, t: 0, kind: 'verse' },
      { id: 'm1', sessionId: SID, t: 30, kind: 'custom', label: 'New song' },
      { id: 'm2', sessionId: SID, t: 30, kind: 'verse' },
    ];
    full.chords = [
      ...chordRows(repeat(POP_PROGRESSION, 3), 0, 2.5),
      ...chordRows(
        repeat(
          [
            { root: 10, quality: 'min' },
            { root: 0, quality: 'min' },
            { root: 5, quality: 'min' },
            { root: 8, quality: 'maj' },
          ],
          3,
        ),
        30,
        2.5,
        100,
      ),
    ];
    const chart = buildChart({ ...full, durationSec: 60 });
    expect(chart.songs).toEqual([
      { t: 0, key: { tonic: 0, mode: 'major' } },
      { t: 30, key: { tonic: 8, mode: 'major' } },
    ]);
    expect(chart.parts.filter((p) => p.type === 'key')).toEqual([]);
    expect(sessionName(chart)).toBe('Jam in C major · A♭ major');
    expect(toText(full)).toMatchInlineSnapshot(`
      "Jam in C major · A♭ major — 1:00

      Song 1 · C major
      [Verse]
      [C G Am F] ×3
       I V vi IV

      Song 2 · A♭ major
      [Verse]
      [B♭m Cm  Fm A♭] ×3
       ii  iii vi I
      "
    `);

    // One song: no song headings, and the name has one key.
    full.markers = full.markers.filter((m) => m.label !== 'New song');
    const single = buildChart({ ...full, durationSec: 60 });
    expect(single.parts.some((p) => p.type === 'song')).toBe(false);
    expect(sessionName(single)).not.toContain('·');
  });

  it('lays a run that does not repeat out in even lines of at most four chords', () => {
    const full = fixture();
    full.keys = [full.keys[0]];
    full.markers = [];
    const run = (n: number) =>
      chordRows(
        Array.from({ length: n }, (_, i): Chord => ({ root: ((i * 5) % 12) as 0, quality: 'maj' })),
        0,
        2,
      );
    const sizes = (n: number) => {
      const chart = buildChart({ ...full, chords: run(n), durationSec: n * 2 });
      return chart.parts.flatMap((p) =>
        p.type === 'section' ? p.rows.map((r) => r[0].chords.length) : [],
      );
    };
    expect(sizes(9)).toEqual([3, 3, 3]);
    expect(sizes(12)).toEqual([4, 4, 4]);
    expect(sizes(25)).toEqual([4, 4, 4, 4, 3, 3, 3]);
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
    await expect(fromJSON({ hello: 1 })).rejects.toThrow(/not a Keel session export/);
    await expect(fromJSON({ ...good, chords: 'x' })).rejects.toThrow(/"chords" must be an array/);
    await expect(fromJSON({ ...good, session: null })).rejects.toBeInstanceOf(ImportError);
    expect(await db.sessions.count()).toBe(0);
  });
});
