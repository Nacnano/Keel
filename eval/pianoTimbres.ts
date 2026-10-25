/** Synthetic timbre probes, independent of the checked-in benchmark corpus.
 * These oscillator recipes approximate spectral/envelope families, not branded patches,
 * real instruments, microphone recordings, or listener-validated bell pitch perception.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { JamMode } from '@/core/types';
import { runBenchmarkCase } from './benchmark';
import { sha256 } from './benchmarkAudio';
import { roomNoiseTrials } from './noiseFixtures';
import type { BenchmarkCase, TruthSpan } from './benchmarkTypes';

export const PIANO_TIMBRES = [
  'acoustic-mellow',
  'acoustic-bright',
  'electric-tine',
  'electric-reed',
  'electric-fm',
  'electric-bell',
] as const;
export type PianoTimbre = (typeof PIANO_TIMBRES)[number];

/** Fundamental is the nominal played MIDI key. Bell partials deliberately challenge harmonic
 * attribution: that key assignment is generator truth, not a claim of unambiguous perceived pitch.
 */
export function pianoTimbreSample(timbre: PianoTimbre, hz: number, t: number): number {
  const sine = (ratio: number) => Math.sin(2 * Math.PI * hz * ratio * t);
  switch (timbre) {
    case 'acoustic-mellow':
      return (
        Math.exp(-t / 2.8) *
        (sine(1) + 0.3 * Math.exp(-t / 1.2) * sine(2) + 0.12 * Math.exp(-t / 0.6) * sine(3))
      );
    case 'acoustic-bright': {
      let value = 0;
      for (let h = 1; h <= 8; h++) value += (Math.exp(-t * (0.3 + h * 0.13)) / h ** 1.1) * sine(h);
      return value;
    }
    case 'electric-tine':
      return (
        Math.exp(-t / 2.5) *
        (sine(1) +
          0.45 * Math.exp(-t / 0.4) * sine(2) +
          0.3 * Math.exp(-t / 1.1) * sine(3) +
          0.15 * Math.exp(-t / 0.2) * sine(7))
      );
    case 'electric-reed':
      return (
        Math.exp(-t / 2.1) *
        (sine(1) +
          0.3 * Math.exp(-t / 1.7) * sine(3) +
          0.12 * Math.exp(-t / 0.7) * sine(5) +
          0.06 * Math.exp(-t / 0.3) * sine(7))
      );
    case 'electric-fm':
      return (
        Math.exp(-t / 2.5) *
        (Math.sin(2 * Math.PI * hz * t + 2.5 * Math.exp(-t / 0.65) * sine(2)) + 0.15 * sine(1))
      );
    case 'electric-bell':
      return (
        0.4 * Math.exp(-t / 3.0) * sine(1) +
        0.65 * Math.exp(-t / 1.3) * sine(2.76) +
        0.3 * Math.exp(-t / 0.8) * sine(5.4) +
        0.1 * Math.exp(-t / 0.3) * sine(8.93)
      );
  }
}

export function buildPianoTimbreCases(
  sampleRates = [44100, 48000],
  modes: JamMode[] = ['solo', 'room'],
): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];
  const seconds = 7;
  for (const sampleRate of sampleRates)
    for (const mode of modes) {
      const duration = (Math.floor((seconds * sampleRate) / 2048) * 2048) / sampleRate;
      for (const timbre of PIANO_TIMBRES)
        for (const gesture of ['register-sustain', 'major-chord'] as const) {
          const truth: TruthSpan[] =
            gesture === 'major-chord'
              ? [
                  { start: 0, end: 0.5, chord: null },
                  {
                    start: 0.5,
                    end: 4.5,
                    chord: { root: 0, quality: 'maj' },
                    midiNotes: [60, 64, 67],
                  },
                  { start: 4.5, end: duration, chord: null },
                ]
              : [
                  { start: 0, end: 0.5, chord: null },
                  { start: 0.5, end: 2.5, chord: 'unknown', midiNotes: [48] },
                  { start: 2.5, end: 4.5, chord: 'unknown', midiNotes: [72] },
                  { start: 4.5, end: duration, chord: null },
                ];
          const samples = new Float32Array(Math.round(duration * sampleRate));
          for (const span of truth)
            for (const note of span.midiNotes ?? []) {
              const hz = 440 * 2 ** ((note - 69) / 12);
              for (
                let i = Math.ceil(span.start * sampleRate);
                i < Math.min(samples.length, span.end * sampleRate);
                i++
              ) {
                const t = i / sampleRate - span.start;
                const envelope = Math.min(1, t / 0.005, (span.end - i / sampleRate) / 0.01);
                // Fixed gain; never normalize away meaningful attack/decay differences.
                samples[i] += 0.1 * envelope * pianoTimbreSample(timbre, hz, t);
              }
            }
          cases.push({
            id: `piano-timbre/${timbre}/${gesture}/${mode}/${sampleRate}`,
            group: 'piano',
            provenance: 'synthetic',
            sampleRate,
            mode,
            instrument: 'piano',
            sensitivity: 0.5,
            truth,
            samples,
          });
        }
      const noise = roomNoiseTrials(sampleRate, seconds, 42);
      for (const index of [5, 7, 8])
        cases.push({
          id: `piano-timbre/control-${['fan-switch', 'hum50', 'hum60'][[5, 7, 8].indexOf(index)]}/${mode}/${sampleRate}`,
          group: 'noise',
          provenance: 'synthetic',
          sampleRate,
          mode,
          instrument: 'piano',
          sensitivity: 0.5,
          samples: noise[index].samples.slice(0, Math.round(duration * sampleRate)),
          strictNoise: true,
          truth: [{ start: 0, end: duration, chord: null }],
        });
    }
  return cases;
}

async function main() {
  const output =
    process.argv.find((a) => a.startsWith('--output='))?.slice(9) ?? '.context/piano-timbres';
  const out = resolve(output);
  mkdirSync(out, { recursive: true });
  const source = readFileSync(fileURLToPath(import.meta.url));
  const hash = sha256(
    Buffer.concat([
      source,
      readFileSync(new URL('./exactNoteMetrics.ts', import.meta.url)),
      readFileSync(new URL('./benchmark.ts', import.meta.url)),
    ]),
  );
  const results = buildPianoTimbreCases().map((c) => runBenchmarkCase(c, hash));
  const detectorCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  writeFileSync(
    join(out, 'results.json'),
    JSON.stringify(
      {
        protocol: 'synthetic-piano-timbres-1',
        detectorCommit,
        generatorHash: hash,
        caveat:
          'Development synthetic approximations. Bell nominal key need not imply unambiguous perceived acoustic pitch. Not field validation.',
        results,
      },
      null,
      2,
    ) + '\n',
  );
  for (const r of results)
    console.log(
      r.id,
      JSON.stringify({
        chordAccuracy: r.metrics.accuracy,
        confirmed: r.metrics.exactNotes.confirmed,
        union: r.metrics.exactNotes.union,
      }),
    );
  console.log(`Measured ${results.length} cases; no baseline rewritten. ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
