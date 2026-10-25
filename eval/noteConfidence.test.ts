import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createChromaPipeline } from '@/audio/pipeline';
import { createAnalysisEngine } from '@/analysis';

interface Observation {
  wall: number;
  midiNotes: number[];
  scores: Record<number, number>;
  rawScores: Record<number, number>;
}
const weak = [1, 0.03, 0.015];
const rich = [1, 0.4, 0.25, 0.15, 0.1];

/** Known sounding keys with independently controlled upper partials. No fake confidence inputs. */
function signal(
  sampleRate: number,
  notes: Array<{ note: number; partials: number[] }>,
  gain = 0.08,
) {
  const samples = new Float32Array(Math.round(sampleRate * 5.5));
  for (let i = Math.ceil(sampleRate * 0.5); i < sampleRate * 4.5; i++) {
    const t = i / sampleRate - 0.5;
    const envelope = Math.min(1, t / 0.01, (4.5 - i / sampleRate) / 0.01);
    for (const { note, partials } of notes) {
      const hz = 440 * 2 ** ((note - 69) / 12);
      for (let h = 1; h <= partials.length; h++)
        samples[i] += gain * envelope * partials[h - 1] * Math.sin(2 * Math.PI * hz * h * t);
    }
  }
  return samples;
}

function observations(samples: Float32Array, sampleRate: number): Observation[] {
  const pipeline = createChromaPipeline({
    sampleRate,
    instrument: 'piano',
    mode: 'solo',
    sensitivity: 0.5,
  });
  const engine = createAnalysisEngine({
    instrument: 'piano',
    mode: 'solo',
    stability: 0.5,
    vocabLevel: 2,
  });
  let midiNotes: number[] = [],
    scores: Record<number, number> = {};
  engine.subscribe((e) => {
    if (e.type === 'notes') {
      midiNotes = e.midiNotes ?? [];
      scores = e.noteConfidences ?? {};
    }
  });
  const result: Observation[] = [],
    hop = pipeline.config.hopSize;
  for (let i = 0; i + hop <= samples.length; i += hop) {
    const frame = pipeline.process(samples.subarray(i, i + hop), i / sampleRate)!;
    const rawScores = { ...frame.noteConfidences };
    engine.push(structuredClone(frame, { transfer: [frame.chroma.buffer] }));
    const wall = (i + hop) / sampleRate;
    // Every sampled note has already sounded for >1 second. This must not saturate on age alone.
    if (wall >= 1.6 && wall <= 4.2)
      result.push({ wall, midiNotes: [...midiNotes], scores: { ...scores }, rawScores });
  }
  return result;
}
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const scoresFor = (rows: Observation[], note: number) =>
  rows.filter((r) => r.midiNotes.includes(note)).map((r) => r.scores[note]);

for (const sampleRate of [44100, 48000])
  describe(`sustained acoustic note evidence at ${sampleRate}Hz`, () => {
    it('keeps weak upper-partial support below rich support after several seconds, through actual key opacity', async () => {
      const weakRows = observations(signal(sampleRate, [{ note: 60, partials: weak }]), sampleRate);
      const richRows = observations(signal(sampleRate, [{ note: 60, partials: rich }]), sampleRate);
      const weakScores = scoresFor(weakRows, 60),
        richScores = scoresFor(richRows, 60);
      expect(weakScores.length).toBeGreaterThan(weakRows.length * 0.8);
      expect(richScores.length).toBeGreaterThan(richRows.length * 0.8);
      expect(weakScores.every(Number.isFinite)).toBe(true);
      expect(median(weakRows.map((r) => r.rawScores[60]))).toBeLessThan(
        median(richRows.map((r) => r.rawScores[60])) - 0.2,
      );
      expect(median(weakScores)).toBeLessThan(0.8);
      expect(median(richScores)).toBeGreaterThan(0.85);
      expect(median(richScores) - median(weakScores)).toBeGreaterThan(0.2);
      // Variable import keeps this Node evaluation project independent of the app's JSX tsconfig;
      // Vite still loads the real component. These are measured engine scores, not invented props.
      const componentPath = '../src/ui/components/Piano';
      const { Piano } = await import(componentPath);
      const opacity = (score: number) => {
        const html = renderToStaticMarkup(
          createElement(Piano, {
            range: [60, 60],
            activeMidiNotes: [60],
            noteConfidences: { 60: score },
          }),
        );
        const match = html.match(/<rect[^>]*data-note-accent="60"[^>]*fill-opacity="([\d.]+)"/);
        expect(match).not.toBeNull();
        return Number(match![1]);
      };
      expect(opacity(median(weakScores))).toBeLessThan(opacity(median(richScores)) - 0.2);
    });

    it('keeps shape evidence stable when the same supported tone is louder', () => {
      const normal = observations(signal(sampleRate, [{ note: 60, partials: weak }]), sampleRate);
      const louder = observations(
        signal(sampleRate, [{ note: 60, partials: weak }], 0.16),
        sampleRate,
      );
      expect(scoresFor(normal, 60).length).toBeGreaterThan(20);
      expect(scoresFor(louder, 60).length).toBeGreaterThan(20);
      expect(
        Math.abs(median(scoresFor(normal, 60)) - median(scoresFor(louder, 60))),
      ).toBeLessThanOrEqual(0.05);
      expect(
        Math.abs(
          median(normal.map((r) => r.rawScores[60])) - median(louder.map((r) => r.rawScores[60])),
        ),
      ).toBeLessThan(0.01);
    });

    it('retains distinct simultaneous confidence after both keys have sustained beyond one second', () => {
      // A tritone avoids the strong shared low-order harmonics of C/G; no source isolation claim.
      const rows = observations(
        signal(sampleRate, [
          { note: 60, partials: weak },
          { note: 66, partials: rich },
        ]),
        sampleRate,
      );
      const together = rows.filter((r) => r.midiNotes.includes(60) && r.midiNotes.includes(66));
      expect(together.length).toBeGreaterThan(rows.length * 0.8);
      const differences = together.map((r) => r.scores[66] - r.scores[60]);
      expect(median(differences)).toBeGreaterThanOrEqual(0.1);
      expect(together.filter((r) => r.scores[60] < r.scores[66]).length).toBeGreaterThan(
        together.length * 0.8,
      );
    });
  });
