import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createAnalysisEngine } from '@/analysis';
import { createChromaPipeline } from '@/audio/pipeline';
import { MIN_DISPLAY_CONFIDENCE } from '@/core/constants';
import type { Chord, PitchClass } from '@/core/types';
import { buildBenchmarkCases, corpusHash, EVAL_DIR } from './benchmarkCases';
import { sha256 } from './benchmarkAudio';
import { scoreBenchmark } from './benchmarkMetrics';
import {
  qualityGaps,
  regressionFailures,
  validateBaseline,
  type BenchmarkBaseline,
} from './benchmarkGates';
import type { BenchmarkCase, BenchmarkResult, DisplayFrame } from './benchmarkTypes';

export function runBenchmarkCase(c: BenchmarkCase, hash: string): BenchmarkResult {
  const pipeline = createChromaPipeline({
    sampleRate: c.sampleRate,
    instrument: c.instrument,
    mode: c.mode,
    sensitivity: c.sensitivity,
  });
  const engine = createAnalysisEngine({
    instrument: c.instrument,
    mode: c.mode,
    stability: 0.5,
    vocabLevel: 2,
    showSlashChords: false,
  });
  const hop = pipeline.config.hopSize;
  let chord: Chord | null = null,
    notes: PitchClass[] = [],
    midiNotes: number[] = [],
    tentativeMidiNotes: number[] = [],
    keys = 0;
  const frames: DisplayFrame[] = [];
  engine.subscribe((e) => {
    if (e.type === 'chord') chord = e.confidence >= MIN_DISPLAY_CONFIDENCE ? e.chord : null;
    if (e.type === 'notes') {
      notes = [...e.pitchClasses];
      midiNotes = [...(e.midiNotes ?? [])];
      tentativeMidiNotes = [...(('tentativeMidiNotes' in e ? e.tentativeMidiNotes : []) ?? [])];
    }
    if (e.type === 'key') keys++;
  });
  for (let i = 0; i + hop <= c.samples.length; i += hop) {
    const frame = pipeline.process(c.samples.subarray(i, i + hop), i / c.sampleRate);
    if (!frame) throw new Error(`Pipeline omitted a hop: ${c.id}`);
    // Match the live worker boundary, including detached-buffer ownership regressions.
    engine.push(structuredClone(frame, { transfer: [frame.chroma.buffer] }));
    frames.push({ wall: (i + hop) / c.sampleRate, chord, notes, midiNotes, tentativeMidiNotes });
  }
  const duration = (Math.floor(c.samples.length / hop) * hop) / c.sampleRate;
  return {
    id: c.id,
    group: c.group,
    provenance: c.provenance,
    strictNoise: !!c.strictNoise,
    inputHash: sha256(
      hash +
        JSON.stringify({
          id: c.id,
          sampleRate: c.sampleRate,
          mode: c.mode,
          sensitivity: c.sensitivity,
          truth: c.truth,
        }),
    ),
    metrics: scoreBenchmark(c.truth, frames, duration, keys),
  };
}

function reportMarkdown(
  results: BenchmarkResult[],
  failures: Record<string, string[]>,
  suite: string,
  commit: string,
) {
  const gaps = results.filter((r) => qualityGaps(r.metrics).length);
  const pct = (v: number | null) => (v === null ? 'unscored' : `${(100 * v).toFixed(1)}%`);
  const lines = [
    '# Chord detector benchmark',
    '',
    `Suite: **${suite}** · detector: \`${commit}\` · ${results.length} cases · ${Object.keys(failures).length} regression failures · ${gaps.length} cases below quality targets.`,
    '',
    '**A regression pass is not an accuracy certification.** Recorded, rendered and hybrid cases remain separate. Unknown labels are excluded, never treated as correct. See eval/BENCHMARK.md for thresholds, provenance and limitations.',
    '',
    '| Case | Source | Annotated | Accuracy / settled | Missed | p90 s | Wrong changes | Chord flicker | Note changes / flashes | False chord / note s | False keys | Regression |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const r of results) {
    const m = r.metrics;
    lines.push(
      `| ${r.id} | ${r.provenance} | ${pct(m.annotatedFraction)} | ${pct(m.accuracy)} / ${pct(m.steadyAccuracy)} | ${m.missedChanges}/${m.expectedChanges} | ${m.latencyP90Sec?.toFixed(2) ?? '—'} | ${m.wrongChanges} | ${m.chordFlickers} | ${m.noteChanges} / ${m.noteFlashes} | ${m.falseChordSec.toFixed(2)} / ${m.falseNoteSec.toFixed(2)} | ${m.falseKeyEvents} | ${failures[r.id] ? 'FAIL' : 'pass'} |`,
    );
  }
  lines.push(
    '',
    '## Exact MIDI highlights (protocol 1)',
    '',
    'Legacy note metrics above are confirmed pitch classes. Exact metrics below measure confirmed / tentative / their visible union; unknown note references remain unscored. Note seconds count simultaneous notes separately.',
    '',
    '| Case | Note annotated s | Channel | Precision / recall | Activity | False note s / octave s | Missed onsets | Onset p90 / release s |',
    '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |',
  );
  for (const r of results)
    for (const channel of ['confirmed', 'tentative', 'union'] as const) {
      const e = r.metrics.exactNotes,
        m = e[channel];
      lines.push(
        `| ${r.id} | ${e.annotatedSec.toFixed(2)} | ${channel} | ${pct(m.precision)} / ${pct(m.recall)} | ${pct(m.activityCoverage)} | ${m.falseNoteSec.toFixed(2)} / ${m.octaveErrorSec.toFixed(2)} | ${m.missedOnsets}/${e.expectedOnsets} | ${m.onsetP90Sec?.toFixed(2) ?? '—'} / ${m.releaseSec?.toFixed(2) ?? '—'} |`,
      );
    }
  lines.push('', '## Quality gaps (not hidden by regression baselines)', '');
  for (const r of gaps) lines.push(`- **${r.id}**: ${qualityGaps(r.metrics).join('; ')}.`);
  if (!gaps.length) lines.push('All scored cases meet the current quality targets.');
  if (Object.keys(failures).length) {
    lines.push('', '## Regression failures', '');
    for (const [id, errors] of Object.entries(failures))
      lines.push(`- **${id}**: ${errors.join('; ')}.`);
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const suiteArg = args.find((a) => a.startsWith('--suite='))?.split('=')[1] ?? 'ci';
  if (suiteArg !== 'ci' && suiteArg !== 'full') throw new Error('Use --suite=ci or --suite=full');
  const suite = suiteArg;
  const candidate = args.includes('--candidate');
  if (candidate && process.env.CI) throw new Error('Baseline candidate mode is forbidden in CI');
  if (candidate && suite !== 'full') throw new Error('Baseline candidates require the full suite');
  if (
    args.some(
      (a) =>
        a !== '--candidate' &&
        !a.startsWith('--suite=') &&
        !a.startsWith('--output=') &&
        !a.startsWith('--baseline=') &&
        !a.startsWith('--detector-commit='),
    )
  )
    throw new Error('Unknown benchmark argument');
  const out = resolve(
    args.find((a) => a.startsWith('--output='))?.slice(9) ?? join(EVAL_DIR, '.cache/benchmark'),
  );
  mkdirSync(out, { recursive: true });
  const hash = corpusHash(),
    cases = buildBenchmarkCases(suite);
  // An archived source tree has no .git and would otherwise inherit its parent's HEAD.
  // Use an explicit revision only after independently verifying the archived detector sources.
  const sourceRevision = args.find((a) => a.startsWith('--detector-commit='))?.slice(18);
  if (sourceRevision !== undefined && !/^[a-f0-9]{7,40}$/.test(sourceRevision))
    throw new Error('Invalid detector commit');
  const commit =
    sourceRevision ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const baselinePath =
    args.find((a) => a.startsWith('--baseline='))?.slice(11) ??
    join(EVAL_DIR, 'benchmark-baseline.json');
  let baseline: BenchmarkBaseline | undefined;
  if (!candidate) {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as BenchmarkBaseline;
    validateBaseline(
      baseline,
      hash,
      cases.map((c) => c.id),
      suite,
    );
  }
  const results: BenchmarkResult[] = [],
    failures: Record<string, string[]> = {};
  const started = performance.now();
  for (const c of cases) {
    const r = runBenchmarkCase(c, hash);
    results.push(r);
    const errors = baseline ? regressionFailures(r, baseline.cases[c.id]) : [];
    if (errors.length) failures[c.id] = errors;
    console.log(
      `${errors.length ? 'FAIL' : candidate ? 'MEASURE' : 'PASS'} ${r.id}: accuracy=${r.metrics.accuracy?.toFixed(3) ?? 'unscored'} falseChordSec=${r.metrics.falseChordSec.toFixed(2)}`,
    );
  }
  const report = {
    version: 2,
    suite,
    detectorCommit: commit,
    corpusHash: hash,
    runtimeSec: (performance.now() - started) / 1000,
    results,
    failures,
  };
  writeFileSync(join(out, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(out, 'summary.md'), reportMarkdown(results, failures, suite, commit));
  if (candidate) {
    const b: BenchmarkBaseline = {
      version: 2,
      corpusHash: hash,
      detectorCommit: commit,
      suites: { ci: buildBenchmarkCases('ci').map((c) => c.id), full: cases.map((c) => c.id) },
      cases: Object.fromEntries(results.map((r) => [r.id, r.metrics])),
    };
    writeFileSync(join(out, 'baseline-candidate.json'), JSON.stringify(b, null, 2) + '\n');
    console.log(
      'Candidate only: not a regression pass. Review quality gaps before explicitly replacing eval/benchmark-baseline.json.',
    );
  }
  console.log(
    `${results.length} cases in ${report.runtimeSec.toFixed(1)}s; ${Object.keys(failures).length} regressions; report: ${out}`,
  );
  if (Object.keys(failures).length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
