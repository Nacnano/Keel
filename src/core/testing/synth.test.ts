import { describe, expect, it } from 'vitest';
import { midiToHz, noteNumber, synthChord, synthProgression } from './synth';

/** Naive Goertzel power at frequency f. */
function power(x: Float32Array, f: number, sr: number): number {
  const w = (2 * Math.PI * f) / sr;
  let re = 0;
  let im = 0;
  for (let i = 0; i < x.length; i++) {
    re += x[i] * Math.cos(w * i);
    im -= x[i] * Math.sin(w * i);
  }
  return re * re + im * im;
}

describe('synth', () => {
  it('maps note names and MIDI to Hz', () => {
    expect(noteNumber('A4')).toBe(69);
    expect(noteNumber('C4')).toBe(60);
    expect(noteNumber('F#3')).toBe(54);
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(60)).toBeCloseTo(261.63, 1);
  });

  it('puts energy at chord tones and not elsewhere', () => {
    const sr = 48000;
    const x = synthChord({
      notes: [60, 64, 67],
      sampleRate: sr,
      seconds: 0.5,
      harmonics: 1,
      decay: 0,
    });
    const c = power(x, midiToHz(60), sr);
    const e = power(x, midiToHz(64), sr);
    const g = power(x, midiToHz(67), sr);
    const db = power(x, midiToHz(61), sr);
    expect(c).toBeGreaterThan(db * 100);
    expect(e).toBeGreaterThan(db * 100);
    expect(g).toBeGreaterThan(db * 100);
  });

  it('concatenates a progression', () => {
    const x = synthProgression(
      [
        { notes: [60], seconds: 0.1 },
        { notes: [62], seconds: 0.2 },
      ],
      { sampleRate: 1000, gapSeconds: 0.05 },
    );
    expect(x.length).toBe(100 + 50 + 200 + 50);
  });
});
