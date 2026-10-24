import { describe, expect, it } from 'vitest';
import { scoreBenchmark } from './benchmarkMetrics';
import { regressionFailures } from './benchmarkGates';
import { exactNoteCases } from './exactNoteCases';
import type { BenchmarkResult, DisplayFrame, TruthSpan } from './benchmarkTypes';

const truth: TruthSpan[] = [
  { start: 0, end: 1, chord: 'unknown', midiNotes: [60] },
  { start: 1, end: 2, chord: null },
];
const frame = (
  wall: number,
  midiNotes: number[] = [],
  tentativeMidiNotes: number[] = [],
): DisplayFrame => ({
  wall,
  chord: null,
  notes: midiNotes.map((n) => n % 12) as DisplayFrame['notes'],
  midiNotes,
  tentativeMidiNotes,
});
const metric = (frames: DisplayFrame[], labels = truth) => scoreBenchmark(labels, frames, 2, 0);
const good = metric([frame(0.1, [60]), frame(1.1)]);
const result = (metrics = good): BenchmarkResult => ({
  id: 'exact',
  group: 'piano',
  provenance: 'synthetic',
  inputHash: 'test',
  strictNoise: false,
  metrics,
});

describe('exact displayed MIDI protocol', () => {
  it('counts note seconds, true arrival latency and release independently of chord truth', () => {
    expect(good.exactNotes.annotatedSec).toBe(2);
    expect(good.exactNotes.expectedOnsets).toBe(1);
    expect(good.exactNotes.confirmed.trueNoteSec).toBeCloseTo(0.9);
    expect(good.exactNotes.confirmed.falseNoteSec).toBeCloseTo(0.1);
    expect(good.exactNotes.confirmed.recall).toBeCloseTo(0.9);
    expect(good.exactNotes.confirmed.onsetP90Sec).toBeCloseTo(0.1);
    expect(good.exactNotes.confirmed.releaseSec).toBeCloseTo(0.1);
  });
  it('fails octave ghosts even when pitch-class metrics are identical', () => {
    const ghosts = metric([frame(0.1, [48, 60, 72]), frame(1.1)]);
    expect(ghosts.accuracy).toBe(good.accuracy);
    expect(ghosts.noteCoverage).toBe(good.noteCoverage);
    expect(ghosts.exactNotes.union.octaveErrorSec).toBeCloseTo(1.8);
    expect(regressionFailures(result(ghosts), good).join()).toContain('octaveErrorSec');
  });
  it('fails false positives hidden as tentative and deduplicates union overlap', () => {
    const tentativeGhost = metric([frame(0.1, [60], [72]), frame(1.1)]);
    expect(tentativeGhost.falseNoteSec).toBe(good.falseNoteSec);
    expect(tentativeGhost.exactNotes.confirmed).toEqual(good.exactNotes.confirmed);
    expect(regressionFailures(result(tentativeGhost), good).join()).toContain('exactNotes.union');
    const overlap = metric([frame(0.1, [60], [60]), frame(1.1)]);
    expect(overlap.exactNotes.union).toEqual(good.exactNotes.union);
  });
  it('does not permit suppressing every note or keeping every correct note tentative', () => {
    const silent = metric([frame(0)]);
    expect(regressionFailures(result(silent), good).join()).toContain('recall');
    expect(regressionFailures(result(silent), good).join()).toContain('activityCoverage');
    const tentativeOnly = metric([frame(0.1, [], [60]), frame(1.1)]);
    expect(tentativeOnly.exactNotes.union).toEqual(good.exactNotes.union);
    expect(regressionFailures(result(tentativeOnly), good).join()).toContain(
      'exactNotes.confirmed',
    );
  });
  it('requires strict zero visible union highlights on deterministic noise', () => {
    const noise: TruthSpan[] = [{ start: 0, end: 2, chord: null }];
    const quiet = metric([frame(0)], noise);
    const flash = metric([frame(0), frame(1, [], [60]), frame(1.001)], noise);
    expect(flash.falseNoteSec).toBe(0);
    expect(regressionFailures({ ...result(flash), strictNoise: true }, quiet).join()).toContain(
      'zero confirmed or tentative',
    );
  });
  it('allows complete removal of exact false notes on a noise-only clip', () => {
    const noise: TruthSpan[] = [{ start: 0, end: 2, chord: null }];
    const noisy = metric([frame(0.2, [60])], noise);
    const quiet = metric([frame(0)], noise);
    expect(noisy.exactNotes.union.precision).toBe(0);
    expect(quiet.exactNotes.union.precision).toBeNull();
    expect(regressionFailures(result(quiet), noisy)).toEqual([]);
  });
  it('leaves unannotated recorded notes unknown while preserving activity guards', () => {
    const m = metric([frame(0.1, [60, 72])], [{ start: 0, end: 2, chord: 'unknown' }]);
    expect(m.exactNotes.annotatedSec).toBe(0);
    expect(m.exactNotes.union.recall).toBeNull();
    expect(m.exactNotes.union.precision).toBeNull();
    expect(m.exactNotes.union.falseNoteSec).toBe(0);
    expect(m.exactNotes.union.activityCoverage).toBeCloseTo(0.95);
  });
  it('does not reset an onset at a chord boundary while a note continues', () => {
    const m = metric(
      [frame(0.1, [60])],
      [
        { start: 0, end: 1, chord: 'unknown', midiNotes: [60] },
        { start: 1, end: 2, chord: 'unknown', midiNotes: [60] },
      ],
    );
    expect(m.exactNotes.expectedOnsets).toBe(1);
    expect(m.exactNotes.union.onsetP90Sec).toBeCloseTo(0.1);
    expect(m.exactNotes.union.releaseSec).toBeNull();
  });
  it('keeps synthetic exact-note references explicit and both sample rates represented', () => {
    const cases = exactNoteCases('ci');
    expect(cases).toHaveLength(12);
    expect(new Set(cases.map((c) => c.sampleRate))).toEqual(new Set([44100, 48000]));
    expect(
      cases.every(
        (c) =>
          c.provenance === 'synthetic' &&
          c.truth.every((s) => s.chord === null || s.midiNotes !== undefined),
      ),
    ).toBe(true);
  });
});
