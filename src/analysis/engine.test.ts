import { describe, expect, it } from 'vitest';
import { NOTE_NAMES_SHARP } from '@/core';
import type { AnalysisConfig, AnalysisEvent, Chord, ChromaFrame, PitchClass } from '@/core';
import { frameFromNotes, midiChord } from '@/core/testing/midi';
import {
  ROOM_VOCAB_LEVEL,
  createAnalysisEngine,
  dwellSeconds,
  effectiveVocabLevel,
  keyReading,
} from './engine';
import { CHORD_VOCAB, chordTones, qualitiesForLevel } from './templates';
import { FPS, chromaFromNotes, progressionFrames } from './testing/chromaFromNotes';
import type { Step } from './testing/chromaFromNotes';
import { perfBudget } from '@/core/testing/perf';

const C = ['C3', 'C4', 'E4', 'G4'];
const Am = ['A2', 'A3', 'C4', 'E4'];
const F = ['F2', 'F3', 'A3', 'C4'];
const G = ['G2', 'G3', 'B3', 'D4'];

function label(c: Chord | null): string {
  if (!c) return '-';
  const slash = c.bass !== undefined ? `/${NOTE_NAMES_SHARP[c.bass]}` : '';
  return `${NOTE_NAMES_SHARP[c.root]}${c.quality}${slash}`;
}

type ChordEvent = Extract<AnalysisEvent, { type: 'chord' }>;

function runFrames(frames: ChromaFrame[], config: Partial<AnalysisConfig> = {}) {
  const engine = createAnalysisEngine(config);
  const events: Array<AnalysisEvent & { frame: number }> = [];
  let frame = 0;
  engine.subscribe((e) => events.push({ ...e, frame }));
  for (const f of frames) {
    engine.push(f);
    frame++;
  }
  const chords = events.filter((e): e is ChordEvent & { frame: number } => e.type === 'chord');
  return { engine, events, chords, labels: chords.map((e) => label(e.chord)) };
}

/** Expected labels must appear in order; at most one extra label per change. */
function expectSequence(labels: string[], expected: string[]) {
  let i = -1;
  const spurious = new Array<number>(expected.length + 1).fill(0);
  for (const l of labels) {
    if (l === expected[i + 1]) i++;
    else if (i < 0 || l !== expected[i]) spurious[i + 1]++;
  }
  expect(i, `labels: ${labels.join(' ')}`).toBe(expected.length - 1);
  for (const s of spurious) expect(s, `labels: ${labels.join(' ')}`).toBeLessThanOrEqual(1);
}

const steps = (chords: string[][], seconds = 1.5): Step[] =>
  chords.map((notes) => ({ notes, seconds }));

describe('mic path', () => {
  it('decodes C Am F G and finds C major within 4 s', () => {
    for (const noise of [0.05, 0.2]) {
      const { events, labels } = runFrames(progressionFrames(steps([C, Am, F, G]), { noise }));
      expectSequence(labels, ['Cmaj', 'Amin', 'Fmaj', 'Gmaj']);
      const key = events.find((e) => e.type === 'key');
      expect(key?.type === 'key' && key.key).toMatchObject({ tonic: 0, mode: 'major' });
      expect(key!.t).toBeLessThanOrEqual(4);
    }
  });

  it('places chord changes at the true onset time with source mic', () => {
    const { chords } = runFrames(progressionFrames(steps([C, Am, F, G])));
    expect(chords.map((c) => Math.round(c.t * 10) / 10)).toEqual([0, 1.5, 3, 4.6]);
    for (const c of chords) {
      expect(c.source).toBe('mic');
      expect(c.confidence).toBeGreaterThan(0.5);
      expect(c.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('switch latency increases monotonically with stability', () => {
    const frames = progressionFrames(steps([C, Am], 3), { noise: 0.2 });
    const change = Math.round(3 * FPS);
    const latency = [0, 0.5, 1].map((stability) => {
      const { chords } = runFrames(frames, { stability });
      const am = chords.find((c) => label(c.chord) === 'Amin');
      expect(am).toBeDefined();
      return am!.frame - change;
    });
    expect(latency[0]).toBeLessThan(latency[1]);
    expect(latency[1]).toBeLessThan(latency[2]);
  });

  it('vocab level 2 names only triads, the five sevenths and sus4 (mic and MIDI)', () => {
    const coloured = [
      ['C3', 'C4', 'D4', 'E4', 'G4'], // Cadd9
      ['F2', 'F3', 'A3', 'C4', 'D4'], // F6
      ['G2', 'G3', 'A3', 'D4'], // Gsus2
      ['A2', 'A3', 'C4', 'E4', 'G#4'], // Am(maj7)
      ['D2', 'D3', 'A3', 'D4'], // D5
      ['E2', 'E3', 'G#3', 'C4'], // Eaug
    ];
    const l2 = new Set(qualitiesForLevel(2));
    const { chords } = runFrames(progressionFrames(steps(coloured)));
    expect(chords.length).toBeGreaterThan(0);
    for (const c of chords) if (c.chord) expect(l2.has(c.chord.quality), label(c.chord)).toBe(true);
    const exact = runFrames(coloured.map((n, i) => frameFromNotes(midiChord(n), i)));
    for (const c of exact.chords)
      if (c.chord) expect(l2.has(c.chord.quality), label(c.chord)).toBe(true);
  });

  it('prefers the dominant seventh when the flat seventh clearly sounds', () => {
    const c7 = ['C3', 'C4', 'E4', 'G4', 'Bb4'];
    expect(runFrames(progressionFrames(steps([c7]))).labels).toEqual(['C7']);
  });

  it('vocab level 1 never emits a 7th chord', () => {
    const sevenths = [
      ['G2', 'G3', 'B3', 'D4', 'F4'],
      ['C3', 'C4', 'E4', 'G4', 'B4'],
      ['D3', 'D4', 'F4', 'A4', 'C5'],
      ['B2', 'B3', 'D4', 'F4', 'A4'],
    ];
    const l1 = new Set(qualitiesForLevel(1));
    const { chords } = runFrames(progressionFrames(steps(sevenths)), { vocabLevel: 1 });
    expect(chords.length).toBeGreaterThan(0);
    for (const c of chords) if (c.chord) expect(l1.has(c.chord.quality), label(c.chord)).toBe(true);
    const exact = runFrames(
      sevenths.map((n, i) => frameFromNotes(midiChord(n), i)),
      { vocabLevel: 1 },
    );
    for (const c of exact.chords) if (c.chord) expect(l1.has(c.chord.quality)).toBe(true);
  });

  it('vocab level 3 identifies Cmaj9 (mic and MIDI)', () => {
    const notes = ['C3', 'E3', 'G3', 'B3', 'D4'];
    const { labels } = runFrames(progressionFrames(steps([notes])), { vocabLevel: 3 });
    expect(labels).toEqual(['Cmaj9']);
    const exact = runFrames([frameFromNotes(midiChord(notes))], { vocabLevel: 3 });
    expect(exact.labels).toEqual(['Cmaj9']);
  });

  it('configure() switches vocab level at runtime', () => {
    const engine = createAnalysisEngine({ vocabLevel: 1 });
    const labels: string[] = [];
    engine.subscribe((e) => e.type === 'chord' && labels.push(label(e.chord)));
    const cmaj7 = progressionFrames(steps([['C3', 'C4', 'E4', 'G4', 'B4']], 1));
    for (const f of cmaj7) engine.push(f);
    engine.configure({ vocabLevel: 2 });
    for (const f of cmaj7) engine.push({ ...f, t: f.t + 1 });
    expect(labels).toEqual(['Cmaj', 'Cmaj7']);
  });

  it('shows slash chords from a stable bass when enabled (off by default)', () => {
    const frames = progressionFrames(
      steps([
        ['E2', 'G3', 'C4', 'E4'],
        ['B2', 'G3', 'D4'],
      ]),
    );
    expect(runFrames(frames, { showSlashChords: true }).labels).toEqual(['Cmaj/E', 'Gmaj/B']);
    expect(runFrames(frames).labels).toEqual(['Cmaj', 'Gmaj']);
  });

  it('a new bass note under the same chord is not a chord change', () => {
    const frames = progressionFrames(steps([C, ['E2', 'G3', 'C4', 'E4'], G, ['B2', 'G3', 'D4']]));
    expect(runFrames(frames, { showSlashChords: true }).labels).toEqual(['Cmaj', 'Gmaj']);
  });

  it('an added tone over the same chord is not a chord change (level 3)', () => {
    const add9 = ['C3', 'C4', 'D4', 'E4', 'G4'];
    const { labels } = runFrames(progressionFrames(steps([C, add9, C, add9, G])), {
      vocabLevel: 3,
    });
    expect(labels).toEqual(['Cmaj', 'Gmaj']);
  });

  it('holds a chord for the minimum dwell: a short passing chord is not shown', () => {
    const frames = progressionFrames([
      { notes: C, seconds: 1.5 },
      { notes: F, seconds: 0.2 },
      { notes: C, seconds: 1.5 },
      { notes: G, seconds: 1.5 },
    ]);
    expect(runFrames(frames).labels).toEqual(['Cmaj', 'Gmaj']);
  });

  it('a genuine change still shows within about half a second (solo), later in room mode', () => {
    const frames = progressionFrames(steps([C, Am], 2.6));
    const change = Math.round(2.6 * FPS);
    const delay = (mode: 'solo' | 'room') => {
      const am = runFrames(frames, { mode }).chords.find((c) => label(c.chord) === 'Amin');
      expect(am).toBeDefined();
      return (am!.frame - change) / FPS;
    };
    expect(delay('solo')).toBeLessThanOrEqual(0.55);
    expect(delay('room')).toBeGreaterThan(delay('solo'));
    expect(dwellSeconds(0.5, 'solo')).toBeCloseTo(0.45);
    expect(dwellSeconds(0.5, 'room')).toBeCloseTo(0.6);
    expect(dwellSeconds(1, 'room')).toBeCloseTo(0.8);
  });

  it('keeps the chord through a short stretch it cannot name while there is sound', () => {
    const noise = (t: number, seed: number): ChromaFrame => {
      const chroma = new Float32Array(12).fill(1 / 12);
      chroma[seed % 12] += 0.01;
      return { t, chroma, energy: 0.6, bass: null, onset: false, exact: false };
    };
    const frames = progressionFrames(steps([C], 1.5));
    const t0 = frames.length;
    for (let i = 0; i < Math.round(1.2 * FPS); i++) frames.push(noise((t0 + i) / FPS, i));
    frames.push(...progressionFrames(steps([C], 1.5), { t0: frames.length / FPS }));
    expect(runFrames(frames).labels).toEqual(['Cmaj']);
    const t1 = frames.length;
    for (let i = 0; i < Math.round(3 * FPS); i++) frames.push(noise((t1 + i) / FPS, i));
    expect(runFrames(frames).labels).toEqual(['Cmaj', '-']);
  });

  it('ignores a bass note that lasts fewer than 3 frames', () => {
    const notes = midiChord(C);
    const frames = Array.from({ length: 40 }, (_, i) =>
      chromaFromNotes(notes, { t: i / FPS, seed: i + 1, bass: i === 20 || i === 21 ? 4 : 0 }),
    );
    expect(runFrames(frames).labels).toEqual(['Cmaj']);
  });

  it('emits no-chord after the music stops', () => {
    const frames = progressionFrames([
      { notes: C, seconds: 1.5 },
      { notes: [], seconds: 3 },
    ]);
    const { chords } = runFrames(frames);
    expect(chords.map((c) => label(c.chord))).toEqual(['Cmaj', '-']);
  });

  it('keeps the chord through a short gate closure (decay into room noise), not a long one', () => {
    const notes = midiChord(C);
    const frames: ChromaFrame[] = [];
    let t = 0;
    const push = (sound: boolean, seconds: number) => {
      for (let i = 0; i < Math.round(seconds * FPS); i++, t += 1 / FPS) {
        frames.push(
          sound
            ? chromaFromNotes(notes, { t, seed: frames.length + 1 })
            : {
                t,
                chroma: new Float32Array(12),
                energy: 0.1,
                bass: null,
                onset: false,
                exact: false,
              },
        );
      }
    };
    push(true, 1.5);
    push(false, 0.6); // shorter than RELEASE_HOLD_SEC
    push(true, 1.5);
    expect(runFrames(frames).labels).toEqual(['Cmaj']);
    push(false, 3);
    expect(runFrames(frames).labels).toEqual(['Cmaj', '-']);
  });

  it('emits notes on change and level on every frame', () => {
    const frames = progressionFrames(steps([C, Am], 0.5));
    const { events } = runFrames(frames);
    expect(events.filter((e) => e.type === 'level')).toHaveLength(frames.length);
    const notes = events
      .filter((e) => e.type === 'notes')
      .map((e) => e.type === 'notes' && e.pitchClasses);
    expect(notes).toEqual([
      [0, 4, 7],
      [0, 4, 9],
    ]);
  });

  it('is deterministic and reset() clears all state', () => {
    const frames = progressionFrames(steps([C, Am, F, G]));
    const a = runFrames(frames);
    const b = runFrames(frames);
    expect(b.events).toEqual(a.events);

    const expected = a.events.filter((e) => e.type !== 'level').map(({ frame: _f, ...e }) => e);
    const engine = a.engine;
    const after: AnalysisEvent[] = [];
    engine.subscribe((e) => e.type !== 'level' && after.push(e));
    engine.reset();
    for (const f of frames) engine.push(f);
    expect(after).toEqual(expected);
  });
});

describe('key-aware reading', () => {
  const Dminor = { tonic: 2 as PitchClass, mode: 'minor' as const };
  const Cmajor = { tonic: 0 as PitchClass, mode: 'major' as const };

  it('minor key: a diminished tonic folds into i, the ii° reads iiø7 when 7ths are allowed', () => {
    expect(keyReading({ root: 2, quality: 'dim' }, Dminor, 2)).toEqual({ root: 2, quality: 'min' });
    expect(keyReading({ root: 2, quality: 'm7b5' }, Dminor, 2).quality).toBe('min7');
    expect(keyReading({ root: 4, quality: 'dim' }, Dminor, 2).quality).toBe('m7b5');
    expect(keyReading({ root: 4, quality: 'dim' }, Dminor, 1).quality).toBe('dim');
    // the leading-tone chord stays diminished
    expect(keyReading({ root: 1, quality: 'dim' }, Dminor, 2).quality).toBe('dim');
  });

  it('major key: a minor tonic is the tonic with a blue third (Cm → C, Cm7 → C7)', () => {
    expect(keyReading({ root: 0, quality: 'min' }, Cmajor, 2).quality).toBe('maj');
    expect(keyReading({ root: 0, quality: 'min7' }, Cmajor, 2).quality).toBe('7');
    expect(keyReading({ root: 0, quality: 'min7' }, Cmajor, 1).quality).toBe('maj');
    // other minor chords are untouched (ii, iii, vi, and the borrowed iv)
    expect(keyReading({ root: 5, quality: 'min' }, Cmajor, 2).quality).toBe('min');
  });

  it('major-key blues: the tonic triad reads as I7 when 7ths are allowed', () => {
    expect(keyReading({ root: 0, quality: 'maj' }, Cmajor, 2, true).quality).toBe('7');
    expect(keyReading({ root: 0, quality: 'maj' }, Cmajor, 1, true).quality).toBe('maj');
    expect(keyReading({ root: 0, quality: 'maj' }, Cmajor, 2, false).quality).toBe('maj');
  });

  it('reads Cm as C on the mic path once the key is C major', () => {
    const Cm = ['C3', 'C4', 'Eb4', 'G4'];
    const { chords } = runFrames(progressionFrames(steps([C, F, G, C, F, G, C, Cm, Cm, C], 1.5)));
    const after = chords.filter((c) => c.t > 6).map((c) => label(c.chord));
    expect(after).not.toContain('Cmin');
  });

  it('a diminished tonic in D minor shows as Dm', () => {
    const Dm = ['D3', 'D4', 'F4', 'A4'];
    const Gm = ['G2', 'G3', 'Bb3', 'D4'];
    const A7 = ['A2', 'A3', 'C#4', 'G4'];
    const Ddim = ['D3', 'D4', 'F4', 'Ab4'];
    const { labels } = runFrames(
      progressionFrames(steps([A7, Dm, Gm, A7, Dm, Gm, A7, Ddim, Ddim])),
    );
    expect(labels.slice(4)).not.toContain('Ddim');
  });
});

describe('room mode (With a band)', () => {
  it('decodes triads only, whatever the chord-detail level', () => {
    expect(effectiveVocabLevel({ mode: 'room', vocabLevel: 3 })).toBe(ROOM_VOCAB_LEVEL);
    expect(effectiveVocabLevel({ mode: 'solo', vocabLevel: 3 })).toBe(3);
    const sevenths = [
      ['G2', 'G3', 'B3', 'D4', 'F4'],
      ['C3', 'C4', 'E4', 'G4', 'B4'],
      ['D3', 'D4', 'F4', 'A4', 'C5'],
      ['C3', 'C4', 'F4', 'G4'],
    ];
    const l1 = new Set(qualitiesForLevel(1));
    for (const vocabLevel of [2, 3] as const) {
      const { chords } = runFrames(progressionFrames(steps(sevenths)), {
        mode: 'room',
        vocabLevel,
      });
      expect(chords.length).toBeGreaterThan(0);
      for (const c of chords)
        if (c.chord) expect(l1.has(c.chord.quality), label(c.chord)).toBe(true);
    }
  });

  it('switching mode at runtime rebuilds the vocabulary', () => {
    const c7 = ['C3', 'C4', 'E4', 'G4', 'Bb4'];
    const engine = createAnalysisEngine({ vocabLevel: 2 });
    const labels: string[] = [];
    engine.subscribe((e) => e.type === 'chord' && labels.push(label(e.chord)));
    for (const f of progressionFrames(steps([c7]))) engine.push(f);
    engine.configure({ mode: 'room' });
    for (const f of progressionFrames(steps([C, c7]), { t0: 2 })) engine.push(f);
    expect(labels[0]).toBe('C7');
    expect(labels.slice(1)).not.toContain('C7');
  });

  it('prefers the in-key chord when two triads score about the same', () => {
    // C–E♭–E–G with the two thirds equally loud: in C major the band reading is C, not Cm.
    const ambiguous = ['C3', 'C4', 'Eb4', 'E4', 'G4'];
    const prog = steps([C, F, G, C, F, G, ambiguous, ambiguous, ambiguous], 1.5);
    const { chords } = runFrames(progressionFrames(prog), { mode: 'room' });
    const late = chords.filter((c) => c.t > 9).map((c) => label(c.chord));
    expect(late).not.toContain('Cmin');
  });
});

describe('key events', () => {
  it('the first key is dated from the first sound, before the first chord', () => {
    const { events } = runFrames(progressionFrames(steps([C, Am, F, G])));
    const key = events.find((e) => e.type === 'key')!;
    const chord = events.find((e) => e.type === 'chord' && e.chord)!;
    expect(key.t).toBeLessThanOrEqual(chord.t);
    // but it is emitted only once there is evidence
    expect(key.frame / FPS).toBeGreaterThanOrEqual(1.4);
  });

  it('resetKey() forgets the key and estimates it again from what follows', () => {
    const Ab = ['Ab2', 'Ab3', 'C4', 'Eb4'];
    const Db = ['Db3', 'Db4', 'F4', 'Ab4'];
    const Eb = ['Eb3', 'Eb4', 'G4', 'Bb4'];
    const Fm = ['F2', 'F3', 'Ab3', 'C4'];
    const engine = createAnalysisEngine();
    const keys: Array<{ t: number; tonic: number; mode: string }> = [];
    const chords: Array<{ t: number; label: string }> = [];
    engine.subscribe((e) => {
      if (e.type === 'key') keys.push({ t: e.t, tonic: e.key.tonic, mode: e.key.mode });
      if (e.type === 'chord') chords.push({ t: e.t, label: label(e.chord) });
    });
    for (const f of progressionFrames(steps([C, G, Am, F, C, G, Am, F, C, G, Am, F])))
      engine.push(f);
    expect(keys.at(-1)).toMatchObject({ tonic: 0, mode: 'major' });
    const before = chords.length;
    engine.resetKey();
    const t0 = 18;
    for (const f of progressionFrames(steps([Ab, Db, Eb, Ab, Fm, Db, Eb, Ab]), { t0 }))
      engine.push(f);
    const after = keys.filter((k) => k.t >= t0);
    expect(after[0]).toMatchObject({ tonic: 8, mode: 'major' });
    // the first key of the new song arrives about as fast as at the start of a jam
    expect(after[0].t - t0).toBeLessThan(1);
    // the chord display carries on (no reset of the chord state)
    expect(chords.length).toBeGreaterThan(before);
  });
});

describe('exact (MIDI) path', () => {
  const l2 = qualitiesForLevel(2);
  const sig = (pcs: PitchClass[]) => [...new Set(pcs)].sort((x, y) => x - y).join(',');

  it('identifies every level-2 quality in all inversions instantly', () => {
    const engine = createAnalysisEngine({ vocabLevel: 2, showSlashChords: true });
    let last: ChordEvent | null = null;
    engine.subscribe((e) => {
      if (e.type === 'chord') last = e;
    });
    let cases = 0;
    let exactMatches = 0;
    for (const quality of l2) {
      for (let root = 0; root < 12; root++) {
        const base = CHORD_VOCAB[quality].intervals.map((i) => 60 + root + i).sort((x, y) => x - y);
        for (let inv = 0; inv < base.length; inv++) {
          const notes = [...base.slice(inv), ...base.slice(0, inv).map((n) => n + 12)];
          const bass = (notes[0] % 12) as PitchClass;
          const input = sig(chordTones(root as PitchClass, quality));
          engine.reset();
          last = null;
          engine.push(frameFromNotes(notes, 0));
          const ev = last as ChordEvent | null;
          const name = `${NOTE_NAMES_SHARP[root]}${quality} inv${inv}`;
          expect(ev, name).not.toBeNull();
          expect(ev!.source).toBe('midi');
          const got = ev!.chord!;
          expect(sig(chordTones(got.root, got.quality)), name).toBe(input);
          expect(got.bass ?? got.root, name).toBe(bass);
          // Same pitch-class set spelled by another (root, quality) of the vocabulary?
          const alts: Array<[number, string]> = [];
          for (const q of l2)
            for (let r = 0; r < 12; r++)
              if (sig(chordTones(r as PitchClass, q)) === input) alts.push([r, q]);
          if (alts.some(([r]) => r === bass)) {
            expect(got.root, name).toBe(bass);
            expect(got.bass, name).toBeUndefined();
          } else if (alts.length === 1) {
            expect(got, name).toEqual(bass === root ? { root, quality } : { root, quality, bass });
          }
          if (got.root === root && got.quality === quality) exactMatches++;
          // any re-spelling must be of an inherently ambiguous set (C6 = Am7, dim7, aug, sus)
          else expect(alts.length, name).toBeGreaterThan(1);
          expect(ev!.confidence).toBe(1);
          cases++;
        }
      }
    }
    expect(cases).toBe(12 * l2.reduce((n, q) => n + CHORD_VOCAB[q].intervals.length, 0));
    // 720 cases; the rest are re-spellings of symmetric/ambiguous sets checked above
    expect(exactMatches / cases).toBeGreaterThan(0.7);
  });

  it('collapses inversions when slash chords are hidden', () => {
    const { labels } = runFrames([frameFromNotes(midiChord(['E3', 'G3', 'C4']))], {
      showSlashChords: false,
    });
    expect(labels).toEqual(['Cmaj']);
    expect(
      runFrames([frameFromNotes(midiChord(['E3', 'G3', 'C4']))], { showSlashChords: true }).labels,
    ).toEqual(['Cmaj/E']);
  });

  it('emits all held pitch classes and null on release', () => {
    const { events } = runFrames([
      frameFromNotes(midiChord(['C3', 'E4', 'G4', 'C5'])),
      frameFromNotes([], 0.1),
    ]);
    const types = events.filter((e) => e.type !== 'level');
    expect(types).toEqual([
      { type: 'notes', t: 0, pitchClasses: [0, 4, 7], frame: 0 },
      {
        type: 'chord',
        t: 0,
        chord: { root: 0, quality: 'maj' },
        confidence: 1,
        source: 'midi',
        frame: 0,
      },
      { type: 'notes', t: 0.1, pitchClasses: [], frame: 1 },
      { type: 'chord', t: 0.1, chord: null, confidence: 1, source: 'midi', frame: 1 },
    ]);
  });
});

describe('performance', () => {
  it('level 3 averages < 1 ms per frame', () => {
    const frames = progressionFrames(
      steps([C, Am, F, G, ['C3', 'E3', 'G3', 'B3', 'D4'], ['G2', 'B3', 'F4', 'A#4']], 4),
    );
    const engine = createAnalysisEngine({ vocabLevel: 3 });
    engine.subscribe(() => {});
    const n = 1000;
    for (let i = 0; i < 50; i++) engine.push(frames[i]); // warm-up
    engine.reset();
    const start = performance.now();
    for (let i = 0; i < n; i++) {
      const f = frames[i % frames.length];
      engine.push({ ...f, t: i / FPS });
    }
    const perFrame = (performance.now() - start) / n;
    console.log(`[analysis perf] level 3: ${perFrame.toFixed(4)} ms/frame over ${n} frames`);
    expect(perFrame).toBeLessThan(perfBudget(1));
  });
});
