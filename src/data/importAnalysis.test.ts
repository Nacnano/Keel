import { cloneableBlob, resetDb } from './testing/setup';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AnalysisEvent, Chord, KeyEstimate } from '@/core/types';
import { C_MAJOR_KEY, POP_PROGRESSION } from '@/core/mocks';
import { toText } from './export';
import {
  ANALYZED_TAG,
  draftFromAnalysis,
  nameFromFile,
  saveAnalysedSession,
  type AnalysedSessionInput,
} from './importAnalysis';
import { getSessionFull, listSessions } from './repo';

const A_MINOR: KeyEstimate = {
  tonic: 9,
  mode: 'minor',
  confidence: 0.6,
  relative: { tonic: 0, mode: 'major' },
  alternatives: [],
};
const WALL = Date.UTC(2026, 9, 22, 20, 0);

const chord = (t: number, c: Chord | null): AnalysisEvent => ({
  type: 'chord',
  t,
  chord: c,
  confidence: 0.8,
  source: 'mic',
});

/** Two passes of C G Am F (2 s each) from 0.5 s, then A minor from 16.5 s. */
function events(): AnalysisEvent[] {
  const ev: AnalysisEvent[] = [{ type: 'key', t: 2, key: C_MAJOR_KEY }];
  let t = 0.5;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of POP_PROGRESSION) {
      ev.push(chord(t, c));
      t += 2;
    }
  }
  ev.push({ type: 'key', t: 16.5, key: A_MINOR });
  ev.push(chord(16.5, { root: 5, quality: 'maj' })); // same as the last chord: deduped
  ev.push(chord(18, null));
  ev.push({ type: 'level', t: 18.5, energy: 0 });
  return ev;
}

const input = (over: Partial<AnalysedSessionInput> = {}): AnalysedSessionInput => ({
  name: 'Song',
  events: events(),
  durationSec: 19.25,
  mode: 'room',
  instrument: 'piano',
  vocabLevel: 2,
  now: () => WALL,
  ...over,
});

describe('importAnalysis', () => {
  beforeEach(resetDb);

  it('nameFromFile strips the extension', () => {
    expect(nameFromFile('My Song (live).mp3')).toBe('My Song (live)');
    expect(nameFromFile('take.final.m4a')).toBe('take.final');
    expect(nameFromFile('.wav')).toBe('Analyzed file');
  });

  it('round-trips: saved rows have relative t, tags, duration, summary and open in review', async () => {
    const id = await saveAnalysedSession(input());
    const full = await getSessionFull(id);
    expect(full).toBeDefined();
    const { session, chords, keys, markers } = full!;
    expect(session).toMatchObject({
      name: 'Song',
      durationSec: 19.25,
      tags: [ANALYZED_TAG],
      mode: 'room',
      instrument: 'piano',
      vocabLevel: 2,
      hasAudio: false,
      hasMidi: false,
      createdAt: WALL,
      endedAt: WALL,
    });
    expect(chords.map((c) => c.t)).toEqual([0.5, 2.5, 4.5, 6.5, 8.5, 10.5, 12.5, 14.5, 18]);
    expect(chords.at(-1)?.chord).toBeNull();
    expect(keys.map((k) => [k.t, k.key.tonic, k.key.mode])).toEqual([
      [2, 0, 'major'],
      [16.5, 9, 'minor'],
    ]);
    expect(markers).toEqual([]);
    expect(session.summary?.chordCount).toBe(8);
    expect(session.summary?.topProgressions[0]).toMatchObject({ count: 2 });
    expect(session.summary?.keys[0].key).toEqual({ tonic: 0, mode: 'major' });

    const [listed] = await listSessions({ tag: ANALYZED_TAG });
    expect(listed.id).toBe(id);
  });

  it('draft matches what is saved (rows, summary, text chart)', async () => {
    const draft = draftFromAnalysis(input());
    const id = await saveAnalysedSession(input());
    const saved = (await getSessionFull(id))!;
    const strip = <T extends { id: string; sessionId: string }>(rows: T[]) =>
      rows.map(({ id: _id, sessionId: _s, ...rest }) => rest);
    expect(strip(draft.chords)).toEqual(strip(saved.chords));
    expect(strip(draft.keys)).toEqual(strip(saved.keys));
    expect(draft.session.summary).toEqual(saved.session.summary);
    expect(toText(draft)).toEqual(toText(saved));
    expect(toText(draft)).toContain('| C G Am F | ×2');
    expect(toText(draft)).toContain('→ A minor at 0:17');
  });

  it('stores the file as the session recording', async () => {
    const blob = await cloneableBlob('fake audio', 'audio/mpeg');
    const id = await saveAnalysedSession(input({ audio: { blob, mimeType: 'audio/mpeg' } }));
    const full = (await getSessionFull(id))!;
    expect(full.session.hasAudio).toBe(true);
    expect(full.recording).toMatchObject({ mimeType: 'audio/mpeg', durationSec: 19.25 });
    expect(full.session.durationSec).toBe(19.25);
  });

  it('saves an analysis with no events', async () => {
    const id = await saveAnalysedSession(input({ events: [], tags: ['analyzed', 'demo'] }));
    const full = (await getSessionFull(id))!;
    expect(full.chords).toEqual([]);
    expect(full.session.tags).toEqual(['analyzed', 'demo']);
    expect(full.session.durationSec).toBe(19.25);
  });
});
