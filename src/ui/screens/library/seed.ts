/**
 * Dev-only demo data (LibraryScreen with `?seed=1`): writes the core mock fixtures, plus a MIDI
 * performance generated from the chords so the piano roll has something to draw.
 */
import { v4 as uuid } from 'uuid';
import type { ChordRecord, MidiEvent, MidiTrack, Session } from '@/core';
import { mockChordRecords, mockKeyRecords, mockMarkers, mockSession } from '@/core/mocks';
import { computeSummary, db } from '@/data';
import { chordTones } from '../../lib/chordLabel';

/** Block chord (bass + close voicing) per record, plus an optional arpeggio every `arpStep` s. */
export function midiFromChords(
  chords: readonly ChordRecord[],
  endT: number,
  opts: { arpStep?: number } = {},
): MidiEvent[] {
  const out: MidiEvent[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const on = (t: number, note: number, velocity: number) =>
    out.push({ t, type: 'on', note, velocity, channel: 0 });
  const off = (t: number, note: number) =>
    out.push({ t, type: 'off', note, velocity: 0, channel: 0 });

  chords.forEach((rec, i) => {
    if (!rec.chord) return;
    const t0 = rec.t;
    const t1 = i + 1 < chords.length ? chords[i + 1].t : endT;
    const len = Math.max(0.1, t1 - t0);
    const tones = chordTones(rec.chord);
    const bass = 36 + (rec.chord.bass ?? rec.chord.root);
    // Close voicing inside the C4 octave.
    const voicing = tones.slice(0, 4).map((pc) => 60 + pc);
    out.push({ t: t0, type: 'cc', controller: 64, value: 127, channel: 0 });
    on(t0, bass, 70 + Math.floor(rand() * 20));
    off(t0 + len * 0.95, bass);
    voicing.forEach((n, j) => {
      on(t0 + j * 0.012, n, 55 + Math.floor(rand() * 25));
      off(t0 + len * 0.9, n);
    });
    out.push({ t: t0 + len * 0.97, type: 'cc', controller: 64, value: 0, channel: 0 });

    if (opts.arpStep) {
      for (let t = t0, k = 0; t < t1 - opts.arpStep / 2; t += opts.arpStep, k++) {
        const n = 72 + tones[k % tones.length] + (k % 8 >= 4 ? 12 : 0);
        on(t, n, 45 + Math.floor(rand() * 50));
        off(Math.min(t1, t + opts.arpStep * 0.8), n);
      }
    }
  });
  return out.sort((a, b) => a.t - b.t);
}

async function writeSession(
  session: Session,
  chords: ChordRecord[],
  midi: MidiEvent[] | null,
  withMarkers: boolean,
) {
  const keys = mockKeyRecords(session.id);
  const markers = withMarkers ? mockMarkers(session.id) : [];
  session.summary = computeSummary(chords, keys, markers, session.durationSec);
  await db.transaction(
    'rw',
    [db.sessions, db.chords, db.keys, db.markers, db.midiTracks],
    async () => {
      await db.sessions.put(session);
      await db.chords.bulkPut(chords);
      await db.keys.bulkPut(keys);
      await db.markers.bulkPut(markers);
      if (midi) {
        const track: MidiTrack = { sessionId: session.id, events: midi };
        await db.midiTracks.put(track);
      }
    },
  );
}

/** The `mockSession()` fixture with its chords, key, markers and a generated MIDI take. */
export async function seedDemoSession(): Promise<string> {
  const id = uuid();
  const chords = mockChordRecords(id);
  const durationSec = chords.length ? chords[chords.length - 1].t + 1.5 : 60;
  const now = Date.now();
  const session = mockSession({
    id,
    createdAt: now,
    endedAt: now,
    updatedAt: now,
    durationSec,
    hasMidi: true,
  });
  await writeSession(session, chords, midiFromChords(chords, durationSec, { arpStep: 0.25 }), true);
  return id;
}

/** 30-minute stress session: ~900 chords and ~50k MIDI events. */
export async function seedLongSession(): Promise<string> {
  const id = uuid();
  const chords = mockChordRecords(id, 225, 2);
  const durationSec = 1800;
  const now = Date.now();
  const session = mockSession({
    id,
    name: 'Long demo (30 min, ~50k MIDI events)',
    tags: ['demo', 'long'],
    createdAt: now,
    endedAt: now,
    updatedAt: now,
    durationSec,
    hasMidi: true,
  });
  await writeSession(session, chords, midiFromChords(chords, durationSec, { arpStep: 0.09 }), true);
  return id;
}
