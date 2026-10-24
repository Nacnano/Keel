import { describe, expect, it } from 'vitest';
import { createAnalysisEngine } from '@/analysis';
import type { AnalysisEvent } from '@/core';
import { synthChord, noteNumber, mix } from '@/core/testing/synth';
import { roomNoiseTrials } from '../../eval/noiseFixtures';
import { pinkNoise } from '../../eval/conditions';
import { createChromaPipeline } from './pipeline';

function analyse(samples: Float32Array, sampleRate: number, sensitivity = 0.5) {
  const pipeline = createChromaPipeline({ sampleRate, sensitivity });
  const engine = createAnalysisEngine();
  const events: AnalysisEvent[] = [];
  engine.subscribe((e) => events.push(e));
  const hop = pipeline.config.hopSize;
  for (let i = 0; i + hop <= samples.length; i += hop) {
    const frame = pipeline.process(samples.subarray(i, i + hop), i / sampleRate);
    if (frame) engine.push(frame);
  }
  return events;
}

describe.each([44100, 48000])('room-noise rejection at %i Hz', (sampleRate) => {
  // Different seeds from the development controls; include startup and mid-session noise.
  for (const seed of [7, 123]) {
    for (const trial of roomNoiseTrials(sampleRate, 5, seed)) {
      it(`${trial.name}, seed ${seed}: does not invent a chord or key`, () => {
        for (const sensitivity of [0, 0.5, 1]) {
          const events = analyse(trial.samples, sampleRate, sensitivity);
          expect(events.filter((e) => e.type === 'chord' && e.chord)).toEqual([]);
          expect(events.filter((e) => e.type === 'key' && e.key)).toEqual([]);
          expect(events.filter((e) => e.type === 'notes' && e.pitchClasses.length)).toEqual([]);
        }
      });
    }
  }

  it('still recognises quiet piano over a fan without a calibration pause', () => {
    const piano = synthChord({
      notes: ['C3', 'E4', 'G4'].map(noteNumber),
      sampleRate,
      seconds: 3,
      gain: 0.01,
    });
    const samples = mix(piano, pinkNoise(piano.length, 0.0002, 81));
    const chords = analyse(samples, sampleRate).filter((e) => e.type === 'chord' && e.chord);
    expect(chords.length).toBeGreaterThan(0);
    expect(chords[0]).toMatchObject({ chord: { root: 0, quality: 'maj' } });
  });

  it('lights a piano chord and does not light inharmonic tones', () => {
    const played = analyse(
      synthChord({
        notes: ['C4', 'E4', 'G4'].map(noteNumber),
        sampleRate,
        seconds: 1.2,
      }),
      sampleRate,
    ).filter((e) => e.type === 'notes' && e.pitchClasses.length);
    const seen = new Set(played.flatMap((e) => (e.type === 'notes' ? e.pitchClasses : [])));
    expect(seen.has(0)).toBe(true);
    expect(seen.has(4)).toBe(true);
    expect(seen.has(7)).toBe(true);
    const keys = new Set(played.flatMap((e) => (e.type === 'notes' ? (e.midiNotes ?? []) : [])));
    expect(keys.has(60)).toBe(true);
    expect(keys.has(64)).toBe(true);
    expect(keys.has(67)).toBe(true);
    for (const note of keys) expect([60, 64, 67]).toContain(note);

    const n = Math.floor(sampleRate * 2);
    const ring = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      ring[i] =
        0.2 * Math.sin((2 * Math.PI * 173 * i) / sampleRate) +
        0.15 * Math.sin((2 * Math.PI * 640 * i) / sampleRate) +
        0.1 * Math.sin((2 * Math.PI * 2100 * i) / sampleRate);
    }
    const events = analyse(ring, sampleRate);
    expect(events.filter((e) => e.type === 'chord' && e.chord)).toEqual([]);
    expect(events.filter((e) => e.type === 'notes' && e.pitchClasses.length)).toEqual([]);
  });

  it.each(['G1', 'A#1', 'B1'])('preserves low musical note %s near mains frequencies', (name) => {
    const samples = synthChord({ notes: [noteNumber(name)], sampleRate, seconds: 0.8 });
    const p = createChromaPipeline({ sampleRate });
    const hop = p.config.hopSize;
    let sounding = 0;
    for (let i = 0; i + hop <= samples.length; i += hop) {
      const frame = p.process(samples.subarray(i, i + hop), i / sampleRate);
      if (frame?.chroma.some((v) => v > 0)) sounding++;
    }
    expect(sounding).toBeGreaterThan(10);
  });
});
