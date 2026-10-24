import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Chord } from '@/core/types';
import { scoreBenchmark } from './benchmarkMetrics';
import { regressionFailures, validateBaseline, type BenchmarkBaseline } from './benchmarkGates';
import { packFixture, readFixture, resample, sha256 } from './benchmarkAudio';
import type { BenchmarkResult, DisplayFrame, TruthSpan } from './benchmarkTypes';

const C: Chord = { root: 0, quality: 'maj' },
  G: Chord = { root: 7, quality: 'maj' };
const truth: TruthSpan[] = [
  { start: 0, end: 2, chord: C },
  { start: 2, end: 4, chord: G },
];
const frame = (wall: number, chord: Chord | null): DisplayFrame => ({
  wall,
  chord,
  notes: chord ? [chord.root] : [],
});
const good = scoreBenchmark(truth, [frame(0.5, C), frame(2.5, G)], 4, 0);
const result = (metrics = good): BenchmarkResult => ({
  id: 'control',
  group: 'piano',
  provenance: 'rendered',
  inputHash: 'hash',
  strictNoise: false,
  metrics,
});

describe('benchmark scoring and gates', () => {
  it('counts decoder delay as wrong time and measures settled accuracy separately', () => {
    expect(good.accuracy).toBeCloseTo(0.75);
    expect(good.steadyAccuracy).toBe(1);
    expect(good.latencyP90Sec).toBe(0.5);
    expect(good.missedChanges).toBe(0);
  });
  it('does not count unannotated music as correct or silence as music accuracy', () => {
    const m = scoreBenchmark(
      [
        { start: 0, end: 2, chord: 'unknown' },
        { start: 2, end: 4, chord: null },
      ],
      [frame(0.5, C)],
      4,
      1,
    );
    expect(m.accuracy).toBeNull();
    expect(m.annotatedFraction).toBe(0.5);
    expect(m.falseChordSec).toBe(2);
  });
  it('detects A–B–A flicker inside a held chord, not at a true chord transition', () => {
    const frames = [frame(0.2, C), frame(0.8, G), frame(1, C)];
    expect(scoreBenchmark([{ start: 0, end: 2, chord: C }], frames, 2, 0).chordFlickers).toBe(1);
    expect(
      scoreBenchmark(
        [
          { start: 0, end: 1, chord: C },
          { start: 1, end: 2, chord: G },
        ],
        frames,
        2,
        0,
      ).chordFlickers,
    ).toBe(0);
  });
  it('measures lingering chords and highlight flashes in noise', () => {
    const m = scoreBenchmark(
      [
        { start: 0, end: 1, chord: C },
        { start: 1, end: 4, chord: null },
      ],
      [frame(0.3, C), frame(2.2, null), frame(2.4, G), frame(2.5, null)],
      4,
      0,
    );
    expect(m.releaseSec).toBeCloseTo(1.2);
    expect(m.falseChordSec).toBeCloseTo(1.3);
    expect(m.noteFlashes).toBe(1);
  });
  it('fails silence, frozen chords and disabled piano highlights', () => {
    const silent = scoreBenchmark(truth, [frame(0, null)], 4, 0);
    const frozen = scoreBenchmark(truth, [frame(0.5, C)], 4, 0);
    expect(regressionFailures(result(silent), good).length).toBeGreaterThan(0);
    expect(regressionFailures(result(frozen), good).length).toBeGreaterThan(0);
    expect(regressionFailures(result({ ...good, noteCoverage: 0 }), good).join()).toContain(
      'noteCoverage',
    );
  });
  it('fails new wrong labels, misses and noise false positives even if accuracy improves', () => {
    expect(
      regressionFailures(result({ ...good, accuracy: 1, wrongChanges: 1 }), good).join(),
    ).toContain('wrongChanges');
    expect(regressionFailures(result({ ...good, missedChanges: 1 }), good).join()).toContain(
      'missedChanges',
    );
    const noise = scoreBenchmark([{ start: 0, end: 4, chord: null }], [frame(0, null)], 4, 0);
    expect(
      regressionFailures(
        { ...result({ ...noise, falseKeyEvents: 1 }), strictNoise: true },
        noise,
      ).join(),
    ).toContain('zero chords');
  });
  it('allows noise suppression improvements without demanding the old false-positive coverage', () => {
    const noisy = scoreBenchmark([{ start: 0, end: 4, chord: null }], [frame(0.5, C)], 4, 1);
    const quiet = scoreBenchmark([{ start: 0, end: 4, chord: null }], [frame(0, null)], 4, 0);
    expect(regressionFailures(result(quiet), noisy)).toEqual([]);
  });
  it('does not reward noise highlights after genuine playing stops', () => {
    const mixed: TruthSpan[] = [
      { start: 0, end: 2, chord: C },
      { start: 2, end: 4, chord: null },
    ];
    const noisy = scoreBenchmark(mixed, [frame(0.5, C)], 4, 0);
    const quiet = scoreBenchmark(mixed, [frame(0.5, C), frame(2, null)], 4, 0);
    expect(quiet.coverage).toBe(noisy.coverage);
    expect(quiet.noteCoverage).toBe(noisy.noteCoverage);
    expect(quiet.noteCoverage).toBe(0.75);
    expect(quiet.falseNoteSec).toBe(0);
    expect(regressionFailures(result(quiet), noisy)).toEqual([]);
  });
  it('fails changed corpora, missing baselines, deleted cases and invalid metrics', () => {
    const baseline: BenchmarkBaseline = {
      version: 2,
      corpusHash: 'a',
      detectorCommit: 'test',
      suites: { ci: ['control'], full: ['control'] },
      cases: { control: good },
    };
    expect(() => validateBaseline(baseline, 'b', ['control'], 'ci')).toThrow(/Corpus/);
    expect(() => validateBaseline(baseline, 'a', [], 'ci')).toThrow(/inventory/);
    expect(() =>
      validateBaseline(
        { ...baseline, cases: { control: {} as typeof good } },
        'a',
        ['control'],
        'ci',
      ),
    ).toThrow(/baseline/);
    expect(() => validateBaseline({ ...baseline, cases: {} }, 'a', ['control'], 'ci')).toThrow(
      /baseline/,
    );
    expect(regressionFailures(result({ ...good, accuracy: NaN }), good)).toContain(
      'missing, negative or non-finite metric',
    );
  });
  it('rejects empty audio timelines and overlapping annotations', () => {
    expect(() => scoreBenchmark(truth, [], 4, 0)).toThrow(/Empty/);
    expect(() => scoreBenchmark([...truth, truth[0]], [frame(0, C)], 4, 0)).toThrow(/overlapping/);
  });
});

describe('benchmark audio integrity', () => {
  it('roundtrips lossless mono PCM and rejects a corrupt fixture instead of falling back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'keel-benchmark-'));
    try {
      const data = packFixture(new Float32Array([0, -0.5, 0.5]), 44100),
        file = join(dir, 'clip.wav.gz');
      writeFileSync(file, data);
      expect([...readFixture(file, sha256(data)).samples]).toEqual([0, -0.5, 0.5]);
      expect(() => readFixture(file, 'wrong')).toThrow(/checksum/);
      expect(resample(new Float32Array([0, 1]), 16000, 48000).length).toBe(6);
      expect(() => resample(new Float32Array(10), 48000, 44100)).toThrow(/upsampling/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
