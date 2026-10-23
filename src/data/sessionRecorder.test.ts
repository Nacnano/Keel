import { cloneableBlob, resetDb } from './testing/setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisEvent, Chord, KeyEstimate, MidiEvent } from '@/core/types';
import { C_MAJOR_KEY, JAZZ_PROGRESSION, POP_PROGRESSION } from '@/core/mocks';
import { db } from './db';
import { startSession } from './sessionRecorder';
import { perfBudget } from '@/core/testing/perf';

const A_MINOR_KEY: KeyEstimate = {
  tonic: 9,
  mode: 'minor',
  confidence: 0.7,
  relative: { tonic: 0, mode: 'major' },
  alternatives: [],
};
const META = { mode: 'solo', instrument: 'piano', vocabLevel: 2 } as const;
const WALL = Date.UTC(2026, 9, 22, 19, 0);

function chordEvent(t: number, chord: Chord | null, confidence = 0.8): AnalysisEvent {
  return { type: 'chord', t, chord, confidence, source: 'mic' };
}

/** Event-clock script starting at T0 = 100 s. */
function script(): AnalysisEvent[] {
  const T0 = 100;
  const ev: AnalysisEvent[] = [{ type: 'key', t: T0, key: C_MAJOR_KEY }];
  let t = T0;
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const chord of POP_PROGRESSION) {
      ev.push({ type: 'level', t, energy: 0.7 });
      ev.push({ type: 'notes', t, pitchClasses: [chord.root] });
      ev.push(chordEvent(t, chord));
      ev.push(chordEvent(t + 0.25, chord, 0.9)); // same label: deduped
      t += 1;
    }
  }
  // same key again with a new confidence: not a key change
  ev.push({ type: 'key', t: 105, key: { ...C_MAJOR_KEY, confidence: 0.5 } });
  ev.push({ type: 'key', t: 112, key: A_MINOR_KEY });
  ev.push(chordEvent(112, { root: 9, quality: 'min' }));
  ev.push(chordEvent(113, { root: 2, quality: 'min' }));
  ev.push({ type: 'level', t: 115, energy: 0.1 });
  return ev.sort((a, b) => a.t - b.t);
}

const midi: MidiEvent[] = [
  { t: 100.5, type: 'on', note: 60, velocity: 90, channel: 0 },
  { t: 101, type: 'cc', controller: 64, value: 127, channel: 0 },
  { t: 101.5, type: 'off', note: 60, velocity: 0, channel: 0 },
];

describe('sessionRecorder', () => {
  beforeEach(resetDb);

  it('records a scripted jam: dedupe, relative t, summary, midi, duration', async () => {
    const h = startSession({ ...META, name: '  Evening idea  ', now: () => WALL });
    await h.ready;
    expect(await db.sessions.get(h.id)).toMatchObject({ name: 'Evening idea', endedAt: null });

    const events = script();
    const half = Math.floor(events.length / 2);
    events.slice(0, half).forEach(h.onAnalysisEvent);
    midi.forEach(h.onMidiEvent);
    const bookmark = h.addMarker('bookmark', 'nice');
    await h.flush();
    expect(await db.chords.count()).toBeGreaterThan(0);
    events.slice(half).forEach(h.onAnalysisEvent);

    const s = await h.stop();
    expect(h.stopped).toBe(true);

    const chords = await db.chords
      .where('[sessionId+t]')
      .between([h.id, -1], [h.id, 1e9])
      .toArray();
    expect(chords).toHaveLength(14);
    expect(chords.map((c) => c.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(chords.every((c) => c.sessionId === h.id && !c.manual)).toBe(true);
    expect(chords[0].confidence).toBe(0.8); // first event of the run wins

    const keys = await db.keys.toArray();
    expect(keys.map((k) => [k.t, k.key.tonic, k.key.mode]).sort()).toEqual([
      [0, 0, 'major'],
      [12, 9, 'minor'],
    ]);

    const markers = await db.markers.toArray();
    expect(markers).toEqual([bookmark]);
    expect(bookmark.t).toBeGreaterThan(0);

    const track = await db.midiTracks.get(h.id);
    expect(track?.events.map((e) => e.t)).toEqual([0.5, 1, 1.5]);

    expect(s).toMatchObject({ durationSec: 15, endedAt: WALL, hasMidi: true, hasAudio: false });
    expect(s.summary).toEqual({
      keys: [
        { key: { tonic: 0, mode: 'major' }, seconds: 12 },
        { key: { tonic: 9, mode: 'minor' }, seconds: 3 },
      ],
      topProgressions: [{ chords: POP_PROGRESSION, count: 3 }],
      chordCount: 14,
      bookmarks: 1,
    });
    expect(await db.sessions.get(h.id)).toEqual(s);
  });

  it('uses an explicit t0 and ignores events after stop', async () => {
    const h = startSession({ ...META, t0: 50, now: () => WALL });
    h.onAnalysisEvent(chordEvent(52.5, POP_PROGRESSION[0]));
    h.onMidiEvent({ t: 51, type: 'on', note: 64, velocity: 80, channel: 0 });
    const s = await h.stop({ endT: 60 });
    h.onAnalysisEvent(chordEvent(55, POP_PROGRESSION[1]));
    expect(s.durationSec).toBe(10);
    expect((await db.chords.toArray()).map((c) => c.t)).toEqual([2.5]);
    expect((await db.midiTracks.get(h.id))?.events[0].t).toBe(1);
    expect(s.name).toBe('Jam'); // no key heard
  });

  it('names an unnamed session after the key heard longest', async () => {
    const h = startSession({ ...META, t0: 100, now: () => WALL });
    await h.ready;
    expect((await db.sessions.get(h.id))?.name).toBe('Jam');
    h.onAnalysisEvent({ type: 'key', t: 100, key: A_MINOR_KEY });
    h.onAnalysisEvent({
      type: 'key',
      t: 102,
      key: { ...C_MAJOR_KEY, tonic: 10, relative: { tonic: 7, mode: 'minor' } },
    });
    const s = await h.stop({ endT: 120 });
    expect(s.name).toBe('Jam in B♭ major');
    expect((await db.sessions.get(h.id))?.name).toBe('Jam in B♭ major');
  });

  it('keeps a name the user gave while the session was running', async () => {
    const h = startSession({ ...META, t0: 100, now: () => WALL });
    await h.ready;
    await db.sessions.update(h.id, { name: 'Sunday set' });
    h.onAnalysisEvent({ type: 'key', t: 100, key: C_MAJOR_KEY });
    expect((await h.stop({ endT: 110 })).name).toBe('Sunday set');
    expect((await db.sessions.get(h.id))?.name).toBe('Sunday set');
  });

  it('is robust to stop() racing periodic flushes (no loss, no duplicates)', async () => {
    const h = startSession({ ...META, flushIntervalMs: 1, now: () => WALL });
    const progression = [...POP_PROGRESSION, ...JAZZ_PROGRESSION];
    for (let i = 0; i < 400; i++) {
      h.onAnalysisEvent(chordEvent(i, progression[i % progression.length]));
      if (i % 50 === 0) await new Promise((r) => setTimeout(r, 2));
      if (i % 97 === 0) void h.flush();
    }
    void h.flush();
    const [a, b] = await Promise.all([h.stop(), h.stop()]);
    expect(a).toEqual(b);
    const rows = await db.chords.toArray();
    expect(rows).toHaveLength(400);
    expect(new Set(rows.map((r) => r.id)).size).toBe(400);
    expect(a.summary?.chordCount).toBe(400);
  });

  it('retries rows from a failed flush on the next write', async () => {
    const h = startSession({ ...META, now: () => WALL });
    await h.ready;
    const spy = vi.spyOn(db.chords, 'bulkAdd').mockRejectedValueOnce(new Error('QuotaExceeded'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.onAnalysisEvent(chordEvent(0, POP_PROGRESSION[0]));
    await expect(h.flush()).rejects.toThrow('QuotaExceeded');
    h.onAnalysisEvent(chordEvent(1, POP_PROGRESSION[1]));
    await h.stop();
    spy.mockRestore();
    errors.mockRestore();
    expect((await db.chords.toArray()).map((c) => c.t).sort()).toEqual([0, 1]);
  });

  it('discards a session in which nothing was heard when asked to', async () => {
    const h = startSession({ ...META, t0: 0, now: () => WALL });
    await h.ready;
    h.onAnalysisEvent({ type: 'key', t: 1, key: C_MAJOR_KEY });
    h.onAnalysisEvent(chordEvent(1, null));
    h.addMarker('bookmark', undefined, 2);
    await h.flush();
    expect(await h.stop({ endT: 10, discardIfEmpty: true })).toBeNull();
    expect(await db.sessions.count()).toBe(0);
    expect(await db.keys.count()).toBe(0);
    expect(await db.chords.count()).toBe(0);
    expect(await db.markers.count()).toBe(0);
  });

  it('keeps a session with chords even when discardIfEmpty is set', async () => {
    const h = startSession({ ...META, t0: 0, now: () => WALL });
    h.onAnalysisEvent(chordEvent(1, POP_PROGRESSION[0]));
    const s = await h.stop({ endT: 10, discardIfEmpty: true });
    expect(s?.summary?.chordCount).toBe(1);
    expect(await db.sessions.count()).toBe(1);
  });

  it('stores the audio take and sets hasAudio', async () => {
    const h = startSession({ ...META, now: () => WALL });
    h.onAnalysisEvent(chordEvent(0, POP_PROGRESSION[0]));
    await h.setAudioBlob(await cloneableBlob('abc', 'audio/webm'), 'audio/webm', 42);
    const s = await h.stop();
    expect(s.hasAudio).toBe(true);
    expect(s.durationSec).toBe(42);
    const rec = await db.recordings.get(h.id);
    expect(rec).toMatchObject({ sessionId: h.id, mimeType: 'audio/webm', durationSec: 42 });
    expect(rec?.blob.size).toBe(3);
    expect(await rec?.blob.text()).toBe('abc');
  });

  it('flushes and stops 5,000 chords + 50,000 MIDI events in < 2 s', async () => {
    const h = startSession({ ...META, now: () => WALL });
    const progression = [...POP_PROGRESSION, ...JAZZ_PROGRESSION];
    for (let i = 0; i < 5000; i++) {
      h.onAnalysisEvent(chordEvent(i * 0.72, progression[i % progression.length]));
    }
    for (let i = 0; i < 50_000; i++) {
      h.onMidiEvent({
        t: i * 0.072,
        type: i % 2 ? 'off' : 'on',
        note: 60,
        velocity: 80,
        channel: 0,
      });
    }
    const t = performance.now();
    await h.flush();
    const s = await h.stop();
    const ms = performance.now() - t;
    console.info(`[perf] flush+stop 5,000 chords + 50,000 MIDI events: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(perfBudget(2000));
    expect(await db.chords.count()).toBe(5000);
    expect((await db.midiTracks.get(h.id))?.events).toHaveLength(50_000);
    expect(s.summary?.chordCount).toBe(5000);
  });
});
