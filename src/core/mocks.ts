/**
 * Scripted AnalysisEvent streams and session fixtures so UI work does not
 * depend on audio or MIDI being wired.
 */
import type { AnalysisEvent, Chord, KeyEstimate, PitchClass } from './types';
import type { ChordRecord, KeyRecord, Marker, Session } from './session';
import { createEmitter } from './events';

export const C_MAJOR_KEY: KeyEstimate = {
  tonic: 0,
  mode: 'major',
  confidence: 0.82,
  relative: { tonic: 9, mode: 'minor' },
  alternatives: [
    { tonic: 9, mode: 'minor', score: 0.74 },
    { tonic: 7, mode: 'major', score: 0.61 },
  ],
};

export const POP_PROGRESSION: Chord[] = [
  { root: 0, quality: 'maj' },
  { root: 7, quality: 'maj' },
  { root: 9, quality: 'min' },
  { root: 5, quality: 'maj' },
];

export const JAZZ_PROGRESSION: Chord[] = [
  { root: 2, quality: 'min7' },
  { root: 7, quality: '7' },
  { root: 0, quality: 'maj7' },
  { root: 0, quality: 'maj7', bass: 4 },
];

export function chordPitchClasses(c: Chord): PitchClass[] {
  const base: Record<string, number[]> = {
    maj: [0, 4, 7],
    min: [0, 3, 7],
    '7': [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    min7: [0, 3, 7, 10],
  };
  const iv = base[c.quality] ?? [0, 4, 7];
  return iv.map((i) => ((c.root + i) % 12) as PitchClass);
}

export interface MockStreamOptions {
  chords?: Chord[];
  key?: KeyEstimate;
  /** ms per chord */
  stepMs?: number;
  loop?: boolean;
  startT?: number;
}

export interface MockStream {
  subscribe(cb: (e: AnalysisEvent) => void): () => void;
  start(): void;
  stop(): void;
}

/** Emits level/notes/chord events on a timer; emits key once at start. */
export function createMockAnalysisStream(opts: MockStreamOptions = {}): MockStream {
  const { chords = POP_PROGRESSION, key = C_MAJOR_KEY, stepMs = 1500, loop = true } = opts;
  const emitter = createEmitter<AnalysisEvent>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let i = 0;
  const t0 = opts.startT ?? 0;
  const now = () =>
    t0 + (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  return {
    subscribe: emitter.subscribe,
    start() {
      if (timer) return;
      i = 0;
      emitter.emit({ type: 'key', t: now(), key });
      const tick = () => {
        if (i >= chords.length) {
          if (!loop) return this.stop();
          i = 0;
        }
        const chord = chords[i++];
        const t = now();
        emitter.emit({ type: 'level', t, energy: 0.6 + 0.3 * Math.random() });
        emitter.emit({ type: 'notes', t, pitchClasses: chordPitchClasses(chord) });
        emitter.emit({
          type: 'chord',
          t,
          chord,
          confidence: 0.7 + 0.25 * Math.random(),
          source: 'mic',
        });
      };
      tick();
      timer = setInterval(tick, stepMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

export function mockSession(partial: Partial<Session> = {}): Session {
  const now = Date.now();
  return {
    id: partial.id ?? 'mock-session-1',
    name: 'Evening idea in C',
    createdAt: now - 600_000,
    endedAt: now - 300_000,
    durationSec: 300,
    mode: 'solo',
    instrument: 'piano',
    vocabLevel: 2,
    tags: ['idea'],
    hasAudio: false,
    hasMidi: false,
    summary: {
      keys: [{ key: { tonic: 0, mode: 'major' }, seconds: 300 }],
      topProgressions: [{ chords: POP_PROGRESSION, count: 12 }],
      chordCount: 48,
      bookmarks: 1,
    },
    updatedAt: now,
    deleted: false,
    ...partial,
  };
}

export function mockChordRecords(
  sessionId = 'mock-session-1',
  cycles = 12,
  stepSec = 1.5,
): ChordRecord[] {
  const out: ChordRecord[] = [];
  let t = 0;
  for (let c = 0; c < cycles; c++) {
    for (const chord of POP_PROGRESSION) {
      out.push({
        id: `${sessionId}-c-${out.length}`,
        sessionId,
        t,
        chord,
        confidence: 0.8,
        source: 'mic',
        manual: false,
      });
      t += stepSec;
    }
  }
  return out;
}

export function mockKeyRecords(sessionId = 'mock-session-1'): KeyRecord[] {
  return [{ id: `${sessionId}-k-0`, sessionId, t: 0, key: C_MAJOR_KEY }];
}

export function mockMarkers(sessionId = 'mock-session-1'): Marker[] {
  return [
    { id: `${sessionId}-m-0`, sessionId, t: 0, kind: 'intro' },
    { id: `${sessionId}-m-1`, sessionId, t: 24, kind: 'verse' },
    { id: `${sessionId}-m-2`, sessionId, t: 60, kind: 'bookmark', label: 'nice' },
  ];
}
