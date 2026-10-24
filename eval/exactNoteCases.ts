import { pinkNoise } from './conditions';
import type { BenchmarkCase, TruthSpan } from './benchmarkTypes';

/** Oscillator ground truth comes from the generator, never inferred from chord annotations.
 * These deliberately simple harmonic tones are synthetic controls, not piano/guitar recordings.
 */
export function exactNoteCases(suite: 'ci' | 'full'): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];
  for (const sampleRate of [44100, 48000])
    for (const instrument of ['piano', 'guitar'] as const) {
      for (const mode of suite === 'full' ? (['solo', 'room'] as const) : (['solo'] as const)) {
        for (const condition of [
          'noise-before-during-after',
          'fan-switch',
          'immediate-quiet',
        ] as const) {
          const duration = 8;
          const spans: TruthSpan[] =
            condition === 'immediate-quiet'
              ? [
                  { start: 0, end: 3, chord: 'unknown', midiNotes: [60] },
                  { start: 3, end: 5, chord: 'unknown', midiNotes: [48, 67] },
                  { start: 5, end: duration, chord: null },
                ]
              : [
                  { start: 0, end: 1, chord: null },
                  { start: 1, end: 3, chord: 'unknown', midiNotes: [60] },
                  { start: 3, end: 5, chord: 'unknown', midiNotes: [48, 67] },
                  { start: 5, end: duration, chord: null },
                ];
          const samples = new Float32Array(sampleRate * duration);
          const noise = pinkNoise(samples.length, 0.001, 491);
          for (let i = 0; i < samples.length; i++) {
            const t = i / sampleRate;
            const span = spans.find((s) => t >= s.start && t < s.end)!;
            const noiseGain = condition === 'fan-switch' ? (t < 2 ? 0 : t < 4 ? 2 : 4) : 1;
            samples[i] = noise[i] * noiseGain;
            for (const note of span.midiNotes ?? []) {
              const dt = t - span.start;
              const envelope = Math.min(1, dt / 0.01, (span.end - t) / 0.01);
              const hz = 440 * 2 ** ((note - 69) / 12);
              for (let h = 1; h <= 5; h++)
                samples[i] +=
                  (((condition === 'immediate-quiet' ? 0.004 : 0.04) * envelope) / h ** 2) *
                  Math.sin(2 * Math.PI * hz * h * dt);
            }
          }
          cases.push({
            id: `exact-notes/${condition}/${instrument}/${mode}/${sampleRate}`,
            group: instrument,
            provenance: 'synthetic',
            sampleRate,
            instrument,
            mode,
            sensitivity: 0.5,
            samples,
            truth: spans,
          });
        }
      }
    }
  return cases;
}
