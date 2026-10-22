import { describe, expect, it } from 'vitest';
import { NOTE_NAMES_SHARP } from '@/core';
import type { AnalysisConfig, AnalysisEvent, Chord, ChromaFrame, PitchClass } from '@/core';
import { frameFromNotes, midiChord } from '@/core/testing/midi';
import { createAnalysisEngine } from './engine';
import { CHORD_VOCAB, chordTones, qualitiesForLevel } from './templates';
import { FPS, chromaFromNotes, progressionFrames } from './testing/chromaFromNotes';
import type { Step } from './testing/chromaFromNotes';

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

  it('shows slash chords from a stable bass, collapses them when disabled', () => {
    const frames = progressionFrames(steps([C, ['E2', 'G3', 'C4', 'E4'], G, ['B2', 'G3', 'D4']]));
    expect(runFrames(frames).labels).toEqual(['Cmaj', 'Cmaj/E', 'Gmaj', 'Gmaj/B']);
    expect(runFrames(frames, { showSlashChords: false }).labels).toEqual(['Cmaj', 'Gmaj']);
  });

  it('ignores a bass note that lasts fewer than 3 frames', () => {
    const notes = midiChord(C);
    const frames = Array.from({ length: 40 }, (_, i) =>
      chromaFromNotes(notes, { t: i / FPS, seed: i + 1, bass: i === 20 || i === 21 ? 4 : 0 }),
    );
    expect(runFrames(frames).labels).toEqual(['Cmaj']);
  });

  it('emits no-chord after the music stops', () => {
    const frames = progressionFrames(steps([C, []]));
    const { chords } = runFrames(frames);
    expect(chords.map((c) => label(c.chord))).toEqual(['Cmaj', '-']);
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

describe('exact (MIDI) path', () => {
  const l2 = qualitiesForLevel(2);
  const sig = (pcs: PitchClass[]) => [...new Set(pcs)].sort((x, y) => x - y).join(',');

  it('identifies every level-2 quality in all inversions instantly', () => {
    const engine = createAnalysisEngine({ vocabLevel: 2 });
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
    expect(runFrames([frameFromNotes(midiChord(['E3', 'G3', 'C4']))]).labels).toEqual(['Cmaj/E']);
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
    expect(perFrame).toBeLessThan(1);
  });
});
