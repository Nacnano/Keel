import { describe, expect, it } from 'vitest';
import { synthChord } from '@/core/testing/synth';
import { biquad, pinkNoise } from '../../eval/conditions';
import { createChromaPipeline } from './pipeline';
import { createPlayedNoteTracker } from '@/analysis/noteTracker';

function noteFrames(samples: Float32Array, sampleRate: number) {
  const pipeline = createChromaPipeline({ sampleRate, sensitivity: 1 });
  const notes: number[][] = [];
  const hop = pipeline.config.hopSize;
  for (let i = 0; i + hop <= samples.length; i += hop) {
    const frame = pipeline.process(samples.subarray(i, i + hop), i / sampleRate);
    if (frame?.midiNotes?.length) notes.push(frame.midiNotes);
  }
  return notes;
}

describe.each([44100, 48000])('colored noise note evidence at %i Hz', (sampleRate) => {
  it.each([7, 42, 123])('rejects low-pass pink rumble, seed %i', (seed) => {
    // Development control, not a recording of a fan. Whole-band flatness is
    // misleadingly tiny because the filter removes the upper spectrum.
    const samples = biquad(pinkNoise(sampleRate * 4, 0.05, seed), sampleRate, 'lowpass', 100);
    // A few residual isolated candidates are allowed here; temporal confirmation
    // owns their visibility. Before local flatness, this produces 28–40 frames
    // at 48 kHz. Do not mistake this candidate count for a visible-note metric.
    expect(noteFrames(samples, sampleRate).length).toBeLessThanOrEqual(3);
  });

  it.each([31, 34, 35, 48, 60, 84])('preserves quiet harmonic note %i through sustain', (note) => {
    const samples = synthChord({ notes: [note], sampleRate, seconds: 2, gain: 0.01 });
    const frames = noteFrames(samples, sampleRate);
    expect(frames.filter((notes) => notes.includes(note)).length).toBeGreaterThan(15);
  });
});

it('keeps quiet upper notes audible over low-frequency rumble', () => {
  const sampleRate = 48000;
  const piano = synthChord({ notes: [60, 64, 67], sampleRate, seconds: 6, gain: 0.01 });
  const rumble = biquad(pinkNoise(piano.length, 0.01, 7), sampleRate, 'lowpass', 100);
  const pipeline = createChromaPipeline({ sampleRate, sensitivity: 1 });
  const tracker = createPlayedNoteTracker();
  const counts = new Map<number, number>();
  const hop = pipeline.config.hopSize;
  for (let i = 0; i + hop <= piano.length; i += hop) {
    const block = Float32Array.from(piano.subarray(i, i + hop), (v, j) => v + rumble[i + j]);
    const frame = pipeline.process(block, i / sampleRate)!;
    for (const note of tracker.push(frame.t, frame.midiNotes ?? [])) {
      counts.set(note, (counts.get(note) ?? 0) + 1);
    }
  }
  // This deliberately difficult mixture already masks most E4 observations in
  // the unchanged detector. Keep the supported C4/G4 sustain and surviving E4.
  expect(counts.get(60) ?? 0).toBeGreaterThanOrEqual(30);
  expect(counts.get(64) ?? 0).toBeGreaterThanOrEqual(7);
  expect(counts.get(67) ?? 0).toBeGreaterThanOrEqual(30);
});
