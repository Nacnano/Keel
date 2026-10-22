import { describe, expect, it } from 'vitest';
import { HOP_SIZE } from '@/core/constants';
import type { ChromaFrame } from '@/core/types';
import { mix, noise, noteNumber, synthChord, synthProgression } from '@/core/testing/synth';
import { analyseSamples } from './fileInput';
import { createChromaPipeline } from './pipeline';
import { perfBudget } from '@/core/testing/perf';

const notes = (...names: string[]) => names.map(noteNumber);
const argmax = (c: Float32Array) => c.indexOf(Math.max(...c));
const silence = (sr: number, seconds: number) => new Float32Array(Math.round(sr * seconds));
const concat = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
/** Frames whose window lies fully inside [from, to) seconds. */
const steady = (frames: ChromaFrame[], from: number, to: number, sr: number) =>
  frames.filter((f) => f.t - 8192 / sr + HOP_SIZE / sr >= from && f.t + HOP_SIZE / sr <= to);

describe('chroma pipeline', () => {
  it('silence → zero chroma, energy < 0.01, no bass, no onset', () => {
    const sr = 48000;
    const frames = analyseSamples(silence(sr, 1), sr);
    expect(frames.length).toBeGreaterThan(20);
    for (const f of frames) {
      expect(Array.from(f.chroma)).toEqual(new Array(12).fill(0));
      expect(f.energy).toBeLessThan(0.01);
      expect(f.bass).toBeNull();
      expect(f.onset).toBe(false);
      expect(f.exact).toBe(false);
    }
  });

  it('very quiet noise is gated like silence', () => {
    const sr = 48000;
    const frames = analyseSamples(noise(sr, 0.0005), sr);
    for (const f of frames) expect(f.chroma.every((v) => v === 0)).toBe(true);
  });

  it.each([48000, 44100])(
    'C major (C4 E4 G4) → peaks at 0, 4, 7 with > 70 percent of mass @ %i Hz',
    (sr) => {
      const x = synthChord({ notes: notes('C4', 'E4', 'G4'), sampleRate: sr, seconds: 1.5 });
      const frames = steady(analyseSamples(x, sr), 0.1, 1.5, sr);
      expect(frames.length).toBeGreaterThan(10);
      for (const f of frames) {
        const sum = f.chroma.reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1, 5);
        expect(f.chroma[0] + f.chroma[4] + f.chroma[7]).toBeGreaterThan(0.7);
        const top3 = Array.from(f.chroma.keys())
          .sort((a, b) => f.chroma[b] - f.chroma[a])
          .slice(0, 3)
          .sort((a, b) => a - b);
        expect(top3).toEqual([0, 4, 7]);
      }
    },
  );

  it('Fmaj7 with F2 bass → bass === 5', () => {
    const sr = 48000;
    const x = synthChord({ notes: notes('F2', 'A3', 'C4', 'E4'), sampleRate: sr, seconds: 1.5 });
    const frames = steady(analyseSamples(x, sr), 0.1, 1.5, sr);
    expect(frames.length).toBeGreaterThan(10);
    for (const f of frames) expect(f.bass).toBe(5);
  });

  it('onset fires on an attack after silence and not during sustain', () => {
    const sr = 48000;
    for (const lead of [0.5, 0.517]) {
      const x = concat(
        silence(sr, lead),
        synthChord({ notes: notes('C3', 'C4', 'E4', 'G4'), sampleRate: sr, seconds: 2 }),
      );
      const frames = analyseSamples(x, sr);
      const onsets = frames.filter((f) => f.onset);
      expect(onsets).toHaveLength(1);
      // the onset hop contains the attack
      expect(onsets[0].t).toBeLessThanOrEqual(lead);
      expect(onsets[0].t + HOP_SIZE / sr).toBeGreaterThan(lead);
      // nothing fires during the 2 s decaying sustain
      expect(frames.filter((f) => f.t > lead + 0.1 && f.onset)).toHaveLength(0);
    }
  });

  it('onset fires on a chord change without a gap', () => {
    const sr = 48000;
    const x = synthProgression(
      [
        { notes: notes('C3', 'C4', 'E4', 'G4'), seconds: 1 },
        { notes: notes('F2', 'F3', 'A3', 'C4'), seconds: 1 },
      ],
      { sampleRate: sr },
    );
    const onsets = analyseSamples(x, sr).filter((f) => f.onset);
    expect(onsets).toHaveLength(2);
    expect(Math.abs(onsets[1].t - 1)).toBeLessThan(HOP_SIZE / sr);
  });

  it.each([48000, 44100])(
    'analyseSamples tracks a 4-chord progression at ~sr/HOP_SIZE fps @ %i Hz',
    (sr) => {
      const steps = [
        { root: 0, notes: notes('C3', 'C4', 'E4', 'G4') },
        { root: 9, notes: notes('A2', 'A3', 'C4', 'E4') },
        { root: 5, notes: notes('F2', 'F3', 'A3', 'C4') },
        { root: 7, notes: notes('G2', 'G3', 'B3', 'D4') },
      ];
      const seconds = 1.5;
      const x = synthProgression(
        steps.map((s) => ({ notes: s.notes, seconds })),
        { sampleRate: sr },
      );
      const frames = analyseSamples(x, sr);
      const duration = x.length / sr;
      const fps = frames.length / duration;
      expect(Math.abs(fps - sr / HOP_SIZE)).toBeLessThan(1);
      // timestamps advance by exactly one hop
      for (let i = 1; i < frames.length; i++) {
        expect(frames[i].t - frames[i - 1].t).toBeCloseTo(HOP_SIZE / sr, 9);
      }
      steps.forEach((s, i) => {
        const seg = steady(frames, i * seconds, (i + 1) * seconds, sr);
        expect(seg.length).toBeGreaterThan(15);
        const hits = seg.filter((f) => argmax(f.chroma) === s.root).length;
        expect(hits / seg.length).toBeGreaterThan(0.9);
        expect(seg.filter((f) => f.bass === s.root).length / seg.length).toBeGreaterThan(0.9);
      });
    },
  );

  it('is robust to low-level noise', () => {
    const sr = 48000;
    const x = mix(
      synthChord({ notes: notes('C4', 'E4', 'G4'), sampleRate: sr, seconds: 1.5 }),
      noise(sr * 1.5, 0.01),
    );
    const frames = steady(analyseSamples(x, sr), 0.1, 1.5, sr);
    for (const f of frames) expect(f.chroma[0] + f.chroma[4] + f.chroma[7]).toBeGreaterThan(0.6);
  });

  it('accepts blocks that are not hop-sized', () => {
    const sr = 48000;
    const x = synthChord({ notes: notes('C4', 'E4', 'G4'), sampleRate: sr, seconds: 0.5 });
    const p = createChromaPipeline({ sampleRate: sr });
    let frames = 0;
    for (let i = 0; i < x.length; i += 128) {
      if (p.process(x.subarray(i, i + 128), i / sr)) frames++;
    }
    expect(frames).toBe(Math.floor(x.length / HOP_SIZE));
  });

  it('applies config updates live', () => {
    const p = createChromaPipeline({ sampleRate: 48000 });
    p.configure({ instrument: 'guitar', mode: 'room', a4: 442 });
    expect(p.config).toMatchObject({ instrument: 'guitar', mode: 'room', a4: 442 });
    p.configure({ sampleRate: 44100 });
    expect(p.config.sampleRate).toBe(44100);
    expect(() => p.configure({ hopSize: 3000 })).toThrow();
  });

  it('processes a frame in < 2 ms on average', () => {
    const sr = 48000;
    const x = synthChord({
      notes: notes('F2', 'A3', 'C4', 'E4', 'G4'),
      sampleRate: sr,
      seconds: (110 * HOP_SIZE) / sr,
    });
    const p = createChromaPipeline({ sampleRate: sr });
    // warm-up (JIT)
    for (let i = 0; i < 10; i++) p.process(x.subarray(i * HOP_SIZE, (i + 1) * HOP_SIZE), 0);
    const n = 100;
    const t0 = performance.now();
    for (let i = 10; i < 10 + n; i++) {
      p.process(x.subarray(i * HOP_SIZE, (i + 1) * HOP_SIZE), (i * HOP_SIZE) / sr);
    }
    const mean = (performance.now() - t0) / n;
    console.log(`[audio] chroma pipeline: ${mean.toFixed(3)} ms/frame (mean of ${n})`);
    expect(mean).toBeLessThan(perfBudget(2));
  });
});
