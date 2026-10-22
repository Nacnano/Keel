/** Deterministic music-free controls and immediate-start sample-piano trial. */
import { pathToFileURL } from 'node:url';
import { createAnalysisEngine } from '@/analysis';
import { createChromaPipeline } from '@/audio/pipeline';
import { MIN_DISPLAY_CONFIDENCE } from '@/core/constants';
import type { Chord } from '@/core/types';
import { conditionById, pinkNoise, whiteNoise } from './conditions';
import { renderSession, SESSIONS } from './render';

export async function evaluateControls() {
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
    { name: 'digital silence', samples: new Float32Array(seconds * sr), chord: null },
    {
      name: 'white noise RMS -55 dBFS',
      samples: whiteNoise(seconds * sr, 10 ** (-55 / 20), 42),
      chord: null,
    },
    {
      name: 'pink noise RMS -55 dBFS',
      samples: pinkNoise(seconds * sr, 10 ** (-55 / 20), 42),
      chord: null,
    },
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
      let firstCorrect: number | null = null;
      let displayedSec = 0;
      let correctSec = 0;
      let shownAfterWarmupSec = 0;
      engine.subscribe((event) => {
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
      'lead-in. All four trials returned identical results at sensitivities 0, 0.5 and 1; ' +
      'these limited controls do not establish performance across sensitivity settings or noise levels.',
    '',
    '| Trial | Chord displayed % | Displayed time after 3 s | Correct chord % | First correct (ms) |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows.map(
      (r) =>
        `| ${r.trial} | ${r.displayedPercent.toFixed(1)} | ${r.durationSec < 3 ? 'n/a' : `${r.displayedAfter3sec.toFixed(3)} s`} | ${r.correctPercent === null ? 'n/a' : r.correctPercent.toFixed(1)} | ${r.firstCorrectMs ?? 'never'} |`,
    ),
    '',
    'Any displayed chord on noise is a false positive. The provisional startup floor admits quiet ' +
      'immediate playing, but white noise caused a brief false chord during warmup in this control. ' +
      'The gate adopts the measured floor after one second; smoothing and release hold can extend ' +
      'a false label. A brief quiet lead-in remains helpful. Continuous playing from startup may ' +
      'temporarily close the gate when its measured minimum is adopted.',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await evaluateControls(), null, 2));
}
