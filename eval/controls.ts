/** Deterministic music-free controls and immediate-start sample-piano trial. */
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { createAnalysisEngine } from '@/analysis';
import { createChromaPipeline } from '@/audio/pipeline';
import { MIN_DISPLAY_CONFIDENCE } from '@/core/constants';
import type { Chord } from '@/core/types';
import { conditionById } from './conditions';
import { roomNoiseTrials } from './noiseFixtures';
import { renderSession, SESSIONS } from './render';

interface ControlTrial {
  name: string;
  samples: Float32Array;
  chord: Chord | null;
}

export async function evaluateControls(extraTrials: ControlTrial[] = []) {
  const sr = 48000;
  const seconds = 10;
  const piano = await renderSession(SESSIONS[0], sr);
  const quiet = conditionById('low40').apply(piano.samples, {
    sampleRate: sr,
    key: piano.key,
    seed: piano.spec.seed * 1000,
  });
  const gt = piano.chords[0];
  const trials = [
    ...roomNoiseTrials(sr, seconds).map((trial) => ({ ...trial, chord: null })),
    ...extraTrials,
    {
      name: 'immediate quiet piano (peak -40 dBFS session), first C chord only',
      samples: quiet.slice(Math.floor(gt.t0 * sr), Math.floor(gt.t1 * sr)),
      chord: gt.chord,
    },
  ];
  const results = [];
  for (const sensitivity of [0, 0.5, 1]) {
    for (const trial of trials) {
      const pipeline = createChromaPipeline({ sampleRate: sr, sensitivity });
      const engine = createAnalysisEngine({ vocabLevel: 2, stability: 0.5 });
      let displayed: Chord | null = null;
      let keysPublished = 0;
      let firstCorrect: number | null = null;
      let displayedSec = 0;
      let correctSec = 0;
      let shownAfterWarmupSec = 0;
      engine.subscribe((event) => {
        if (event.type === 'key' && event.key) keysPublished++;
        if (event.type === 'chord') {
          displayed = event.confidence >= MIN_DISPLAY_CONFIDENCE ? event.chord : null;
        }
      });
      const hop = pipeline.config.hopSize;
      for (let i = 0; i + hop <= trial.samples.length; i += hop) {
        const frame = pipeline.process(trial.samples.subarray(i, i + hop), i / sr);
        if (!frame) continue;
        engine.push(frame);
        const wall = (i + hop) / sr;
        if (displayed) {
          displayedSec += hop / sr;
          if (wall >= 3) shownAfterWarmupSec += hop / sr;
          const chord = displayed as Chord;
          if (
            trial.chord &&
            chord.root === trial.chord.root &&
            chord.quality === trial.chord.quality
          ) {
            correctSec += hop / sr;
            firstCorrect ??= wall;
          }
        }
      }
      const duration = (Math.floor(trial.samples.length / hop) * hop) / sr;
      results.push({
        trial: trial.name,
        sensitivity,
        keysPublished,
        durationSec: +duration.toFixed(3),
        displayedPercent: +((100 * displayedSec) / duration).toFixed(1),
        displayedAfter3sec: +shownAfterWarmupSec.toFixed(3),
        correctPercent: trial.chord ? +((100 * correctSec) / duration).toFixed(1) : null,
        firstCorrectMs: firstCorrect === null ? null : Math.round(firstCorrect * 1000),
      });
    }
  }
  return { synth: piano.synth, results };
}

export function formatControls(result: Awaited<ReturnType<typeof evaluateControls>>): string {
  const rows = result.results.filter((r) => r.sensitivity === 0.5);
  return [
    '## Startup and music-free controls',
    '',
    'Reproduce with `pnpm exec tsx --tsconfig eval/tsconfig.json eval/controls.ts`. ' +
      '48 kHz, stability 0.5, vocabulary 2, Solo; noise seed 42. Noise controls run for 9.984 s, ' +
      'including gate warmup. The piano trial starts on the first written downbeat, with no quiet ' +
      'lead-in. Trials run at sensitivities 0, 0.5 and 1; the table shows 0.5. ' +
      'These simulated controls do not establish accuracy in a real room.',
    '',
    '| Trial | Chord displayed % | Displayed time after 3 s | Correct chord % | First correct (ms) | Keys published |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(
      (r) =>
        `| ${r.trial} | ${r.displayedPercent.toFixed(1)} | ${r.durationSec < 3 ? 'n/a' : `${r.displayedAfter3sec.toFixed(3)} s`} | ${r.correctPercent === null ? 'n/a' : r.correctPercent.toFixed(1)} | ${r.firstCorrectMs ?? 'never'} | ${r.keysPublished} |`,
    ),
    '',
    'Any displayed chord or published key on a noise-only trial is a false positive. ' +
      'The pipeline now requires prominent tonal energy and rejects isolated mains hum; ' +
      'the decoder no longer repeats a brief noise candidate through its release hold. ' +
      'Speech, TV music and tonal room sounds can still pass these heuristics. ' +
      'The adaptive level gate still learns the room floor over its first second.',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Optional mono float32 little-endian PCM at 48 kHz, for a reproducible speech/noise clip.
  const pcmIndex = process.argv.indexOf('--pcm');
  const extra: ControlTrial[] = [];
  if (pcmIndex >= 0) {
    const file = process.argv[pcmIndex + 1];
    if (!file) throw new Error('--pcm requires a 48 kHz mono float32 PCM file');
    const bytes = readFileSync(file);
    if (bytes.length % 4 !== 0) throw new Error('PCM file length must be a multiple of 4');
    const samples = new Float32Array(bytes.length / 4);
    for (let i = 0; i < samples.length; i++) samples[i] = bytes.readFloatLE(i * 4);
    extra.push({ name: 'external noise-only PCM clip', samples, chord: null });
  }
  console.log(JSON.stringify(await evaluateControls(extra), null, 2));
}
