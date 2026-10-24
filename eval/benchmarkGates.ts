import type { BenchmarkMetrics, BenchmarkResult, ExactNoteChannelMetrics } from './benchmarkTypes';

export interface BenchmarkBaseline {
  version: 2;
  corpusHash: string;
  detectorCommit: string;
  suites: { ci: string[]; full: string[] };
  cases: Record<string, BenchmarkMetrics>;
}

const METRIC_KEYS: (keyof BenchmarkMetrics)[] = [
  'durationSec',
  'musicSec',
  'noiseSec',
  'annotatedFraction',
  'accuracy',
  'steadyAccuracy',
  'coverage',
  'noteCoverage',
  'missedChanges',
  'expectedChanges',
  'latencyP90Sec',
  'wrongChanges',
  'chordFlickers',
  'noteChanges',
  'noteFlashes',
  'falseChordSec',
  'falseNoteSec',
  'falseKeyEvents',
  'releaseSec',
];
function validMetrics(m: BenchmarkMetrics) {
  return (
    validExactMetrics(m) &&
    METRIC_KEYS.every((key) => {
      const value = m[key];
      if (value === null)
        return ['accuracy', 'steadyAccuracy', 'latencyP90Sec', 'releaseSec'].includes(key);
      return typeof value === 'number' && Number.isFinite(value) && value >= 0;
    })
  );
}

function validExactMetrics(m: BenchmarkMetrics) {
  const e = m.exactNotes;
  if (!e || e.protocol !== 1) return false;
  if (
    ![e.annotatedSec, e.expectedNoteSec, e.expectedOnsets].every(
      (v) => Number.isFinite(v) && v >= 0,
    )
  )
    return false;
  const keys: (keyof ExactNoteChannelMetrics)[] = [
    'visibleSec',
    'activityCoverage',
    'trueNoteSec',
    'falseNoteSec',
    'missedNoteSec',
    'octaveErrorSec',
    'falseVisibleSec',
    'precision',
    'recall',
    'onsetP90Sec',
    'missedOnsets',
    'releaseSec',
  ];
  return [e.confirmed, e.tentative, e.union].every(
    (channel) =>
      channel &&
      keys.every((key) => {
        const value = channel[key];
        return value === null
          ? ['precision', 'recall', 'onsetP90Sec', 'releaseSec'].includes(key)
          : typeof value === 'number' && Number.isFinite(value) && value >= 0;
      }),
  );
}

/** Fixed tolerances, not fitted per failing clip. Baseline updates require an explicit review. */
const MIN_METRICS = {
  accuracy: 0.02,
  steadyAccuracy: 0.02,
  coverage: 0.02,
  noteCoverage: 0.02,
} as const;
const MAX_METRICS = {
  missedChanges: 0,
  latencyP90Sec: 0.1,
  wrongChanges: 0,
  chordFlickers: 0,
  noteChanges: 2,
  noteFlashes: 0,
  falseChordSec: 0.05,
  falseNoteSec: 0.05,
  falseKeyEvents: 0,
  releaseSec: 0.1,
} as const;

export function regressionFailures(result: BenchmarkResult, base: BenchmarkMetrics): string[] {
  const failures: string[] = [];
  const m = result.metrics;
  if (!validMetrics(m) || !validMetrics(base)) return ['missing, negative or non-finite metric'];
  for (const key of [
    'durationSec',
    'musicSec',
    'noiseSec',
    'annotatedFraction',
    'expectedChanges',
  ] as const) {
    if (Math.abs(m[key] - base[key]) > 1e-6) failures.push(`${key}: benchmark coverage changed`);
  }
  for (const [key, tolerance] of Object.entries(MIN_METRICS)) {
    if ((key === 'coverage' || key === 'noteCoverage') && m.musicSec === 0 && m.noiseSec > 0)
      continue;
    const k = key as keyof typeof MIN_METRICS,
      actual = m[k],
      before = base[k];
    if (before !== null && (actual === null || actual < before - tolerance - 1e-6))
      failures.push(`${key}: ${actual} below baseline ${before} minus ${tolerance}`);
  }
  for (const [key, tolerance] of Object.entries(MAX_METRICS)) {
    const k = key as keyof typeof MAX_METRICS,
      actual = m[k],
      before = base[k];
    if (before !== null && (actual === null || actual > before + tolerance + 1e-6))
      failures.push(`${key}: ${actual} above baseline ${before} plus ${tolerance}`);
  }
  if (
    result.strictNoise &&
    (m.falseChordSec > 1e-6 || m.falseKeyEvents > 0 || m.falseNoteSec > 1e-6)
  )
    failures.push('music-free control must produce zero chords, keys and piano highlights');
  const exact = m.exactNotes,
    oldExact = base.exactNotes;
  for (const key of ['annotatedSec', 'expectedNoteSec', 'expectedOnsets'] as const)
    if (Math.abs(exact[key] - oldExact[key]) > 1e-6)
      failures.push(`exactNotes.${key}: reference coverage changed`);
  // Tentative predictions remain visible errors through the union. Confirmed activity/recall
  // also stays gated, so moving every correct note into tentative cannot manufacture a pass.
  for (const channel of ['confirmed', 'union'] as const) {
    const actual = exact[channel],
      before = oldExact[channel];
    for (const key of ['precision', 'recall', 'activityCoverage'] as const) {
      if (key === 'activityCoverage' && m.musicSec === 0 && m.noiseSec >= m.durationSec - 1e-6)
        continue;
      if (before[key] !== null && (actual[key] ?? 0) < before[key]! - 0.02 - 1e-6)
        failures.push(`exactNotes.${channel}.${key}: below baseline minus 0.02`);
    }
    for (const [key, tolerance] of Object.entries({
      falseNoteSec: 0.05,
      octaveErrorSec: 0,
      falseVisibleSec: 0.05,
      missedOnsets: 0,
      onsetP90Sec: 0.1,
      releaseSec: 0.1,
    })) {
      const k = key as
        | 'falseNoteSec'
        | 'octaveErrorSec'
        | 'falseVisibleSec'
        | 'missedOnsets'
        | 'onsetP90Sec'
        | 'releaseSec';
      if (before[k] !== null && (actual[k] === null || actual[k]! > before[k]! + tolerance + 1e-6))
        failures.push(`exactNotes.${channel}.${key}: above baseline plus ${tolerance}`);
    }
  }
  if (result.strictNoise && exact.union.visibleSec > 1e-6)
    failures.push('music-free control must produce zero confirmed or tentative MIDI highlights');
  const previousGaps = qualityGaps(base);
  for (const gap of qualityGaps(m))
    if (!previousGaps.includes(gap)) failures.push(`New quality-target failure: ${gap}`);
  return failures;
}

/** Aspirational quality targets stay visible even when an existing baseline is weak. */
export function qualityGaps(m: BenchmarkMetrics): string[] {
  const gaps: string[] = [];
  if (m.musicSec > 0) {
    if ((m.accuracy ?? 0) < 0.8) gaps.push('chord accuracy <80%');
    if ((m.steadyAccuracy ?? 0) < 0.9) gaps.push('settled accuracy <90%');
    if (m.missedChanges > m.expectedChanges * 0.1) gaps.push('missed changes >10%');
    if (m.latencyP90Sec === null || m.latencyP90Sec > 1.5)
      gaps.push('p90 response >1.5s or no hits');
    if ((m.wrongChanges / m.musicSec) * 60 > 6) gaps.push('wrong changes >6/min');
  }
  if (m.noiseSec > 0 && m.musicSec === 0) {
    if (m.falseChordSec > 0.001) gaps.push('false chords in noise');
    if (m.falseNoteSec > 0.1) gaps.push('false piano highlights in noise');
    if (m.falseKeyEvents > 0) gaps.push('false key in noise');
  }
  if (m.chordFlickers) gaps.push('A–B–A chord flicker');
  if (m.releaseSec !== null && m.releaseSec > 3) gaps.push('release >3s');
  return gaps;
}

export function validateBaseline(
  b: BenchmarkBaseline,
  hash: string,
  ids: string[],
  suite: 'ci' | 'full',
) {
  if (b.version !== 2 || b.corpusHash !== hash)
    throw new Error('Corpus/generator/scorer changed: review a new full-suite baseline candidate');
  if (
    !Array.isArray(b.suites?.[suite]) ||
    [...ids].sort().join('\n') !== [...b.suites[suite]].sort().join('\n')
  )
    throw new Error('Benchmark cases added/removed: review the suite inventory and full baseline');
  for (const id of ids) {
    const m = b.cases[id];
    if (!m || !validMetrics(m)) throw new Error(`Missing/invalid baseline: ${id}`);
  }
}
