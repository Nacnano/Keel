import { describe, expect, it } from 'vitest';
import { createNoteTracker } from '@/analysis/noteTracker';
import {
  createMusicalGate,
  createPartialCoherence,
  harmonicPowerFraction,
  inharmonicDrone,
  randomNoiseFrame,
  spectralEvidence,
} from './musicalEvidence';

it('measures common tuning without requiring A440 and identifies mains contamination', () => {
  const peaks = [220, 277.1826, 329.6276].map((freq) => ({
    freq: freq * 2 ** (25 / 1200),
    mag: 1,
    curvature: -1.4,
  }));
  const evidence = spectralEvidence(peaks, 440);
  expect(evidence.cents).toBeCloseTo(25, 2);
  expect(evidence.concentration).toBeGreaterThan(0.99);
  expect(evidence.narrowFraction).toBe(1);
  expect(evidence.hasMains).toBe(false);
  expect(spectralEvidence([{ freq: 60, mag: 0.3 }, ...peaks], 440).hasMains).toBe(true);
  expect(spectralEvidence([], 440).concentration).toBe(0);
});

describe.each([44100, 48000])('musical evidence at %i Hz', (sr) => {
  const hop = 2048 / sr;
  it('provisional noisy attacks cannot light a piano note', () => {
    const gate = createMusicalGate(),
      tracker = createNoteTracker();
    const chroma = new Float32Array(12);
    chroma[0] = 1;
    for (let i = 0; i < 80; i++) {
      const accepted = gate.accepts(i * hop, 0.75, 0.2, 0.1);
      expect(tracker.push(i * hop, chroma, !accepted)).toEqual([]);
    }
  });
  it('passes a real attack through a partial window without another confirmation delay', () => {
    const gate = createMusicalGate();
    expect(gate.accepts(0, 0.3, 0.7, 0)).toBe(false);
    expect(gate.accepts(hop, 0.8, 0.7, 0)).toBe(true);
    expect(gate.accepts(2 * hop, 0.96, 0.7, 0.1)).toBe(true);
    expect(gate.accepts(3 * hop, 0.99, 0.7, 0.99)).toBe(true);
  });
  it('tolerates brief masking, then closes on sustained noise', () => {
    const gate = createMusicalGate();
    expect(gate.accepts(0, 0.99, 0.7, 0.9)).toBe(true);
    for (let t = hop; t < 1.4; t += hop) expect(gate.accepts(t, 0.75, 0.2, 0.1)).toBe(true);
    for (let t = 1.6; t < 2; t += hop) expect(gate.accepts(t, 0.75, 0.2, 0.1)).toBe(false);
    gate.reset();
    for (let i = 0; i < 8; i++) gate.accepts(i * hop, 0.75, 0.2, 0.1);
    expect(gate.accepts(8 * hop, 0.75, 0.2, 0.1)).toBe(false);
  });
});

it('scores a harmonic series and rejects unrelated tones', () => {
  const tone = (freq: number) => ({ freq, mag: 1, curvature: -1.4 });
  expect(harmonicPowerFraction([110, 220, 330, 440].map(tone))).toBe(1);
  expect(harmonicPowerFraction([173, 640, 2100].map(tone))).toBe(0);
  expect(harmonicPowerFraction([])).toBe(0);
});

it('follows partial phase across hops and rejects a phase jump', () => {
  const hop = 0.04;
  const coherence = createPartialCoherence(hop);
  const freq = 440;
  const step = 2 * Math.PI * freq * hop;
  expect(coherence.update([{ freq, mag: 1, phase: 0 }])).toBe(0);
  expect(coherence.update([{ freq, mag: 1, phase: step }])).toBeCloseTo(1);
  expect(coherence.update([{ freq, mag: 1, phase: step * 2 + 2 }])).toBe(0);
  coherence.reset();
  expect(coherence.update([{ freq, mag: 1, phase: 0 }])).toBe(0);
});

it('flags hiss and inharmonic rings, and keeps a harmonic spectrum', () => {
  const music = { flatness: 0.01, harmonicFraction: 0.99, coherence: 0.2, concentration: 0.3 };
  expect(randomNoiseFrame(music)).toBe(false);
  expect(inharmonicDrone(music)).toBe(false);
  const ring = { flatness: 0.01, harmonicFraction: 0, coherence: 1, concentration: 0.24 };
  expect(inharmonicDrone(ring)).toBe(true);
  expect(randomNoiseFrame({ ...music, flatness: 0.5 })).toBe(true);
  expect(
    randomNoiseFrame({ flatness: 0.2, harmonicFraction: 0.5, coherence: 0.2, concentration: 0.4 }),
  ).toBe(false);
});
