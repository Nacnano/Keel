import { describe, expect, it } from 'vitest';
import { FRAME_SIZE } from '@/core/constants';
import { noteNumber, synthChord } from '@/core/testing/synth';
import { detectBass } from './bass';
import { computeChroma, harmonicWeights, hzToMidi } from './chroma';
import { createRealFFT } from './fft';
import { findPeaks, type Peak } from './peaks';
import { amplitudeScale, hann } from './window';

function spectrumPeaks(x: Float32Array, sampleRate: number, offset = 0): Peak[] {
  const n = FRAME_SIZE;
  const w = hann(n);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = (x[offset + i] ?? 0) * w[i];
  const mag = new Float32Array(n / 2 + 1);
  createRealFFT(n).magnitudes(buf, mag);
  const s = amplitudeScale(w);
  for (let k = 0; k < mag.length; k++) mag[k] *= s;
  return findPeaks(mag, { sampleRate, fftSize: n });
}

function massAt(chroma: Float32Array, pcs: number[]): number {
  return pcs.reduce((a, pc) => a + chroma[pc], 0);
}

describe('peaks', () => {
  it('interpolates a between-bins sinusoid to within a few cents', () => {
    const sr = 48000;
    const f = 261.63; // C4, not bin-centred
    const x = synthChord({ notes: [60], sampleRate: sr, seconds: 0.5, harmonics: 1, decay: 0 });
    const peaks = spectrumPeaks(x, sr, 4000);
    const top = peaks.reduce((a, b) => (b.mag > a.mag ? b : a));
    const cents = 1200 * Math.log2(top.freq / f);
    expect(Math.abs(cents)).toBeLessThan(5);
    expect(top.mag).toBeCloseTo(0.5, 1);
  });

  it('returns no peaks for silence', () => {
    expect(spectrumPeaks(new Float32Array(FRAME_SIZE), 48000)).toEqual([]);
  });
});

describe('chroma', () => {
  it('uses 1/h sub-harmonic weights', () => {
    expect(harmonicWeights(4).map((w) => +w.toFixed(2))).toEqual([1, 0.5, 0.33, 0.25]);
  });

  it('respects the A4 reference', () => {
    expect(hzToMidi(440)).toBeCloseTo(69);
    expect(hzToMidi(432, 432)).toBeCloseTo(69);
  });

  it.each([48000, 44100])(
    'C major (C4 E4 G4) puts > 70 percent of mass on C, E, G at %i Hz',
    (sr) => {
      const x = synthChord({ notes: [60, 64, 67], sampleRate: sr, seconds: 1 });
      const chroma = computeChroma(spectrumPeaks(x, sr, 8000), { harmonics: 6 });
      const sum = chroma.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
      const mass = massAt(chroma, [0, 4, 7]);
      expect(mass).toBeGreaterThan(0.7);
      const top3 = Array.from(chroma.keys())
        .sort((a, b) => chroma[b] - chroma[a])
        .slice(0, 3)
        .sort((a, b) => a - b);
      expect(top3).toEqual([0, 4, 7]);
    },
  );

  it('tracks a detuned instrument when a4 is set', () => {
    const sr = 48000;
    const x = synthChord({ notes: [60, 64, 67], sampleRate: sr, a4: 432 });
    const peaks = spectrumPeaks(x, sr, 8000);
    const tuned = computeChroma(peaks, { a4: 432 });
    expect(massAt(tuned, [0, 4, 7])).toBeGreaterThan(0.7);
  });

  it('is all zeros without peaks', () => {
    expect(Array.from(computeChroma([]))).toEqual(new Array(12).fill(0));
  });
});

describe('bass', () => {
  it('Fmaj7 with F2 bass → F', () => {
    const sr = 48000;
    const notes = ['F2', 'A3', 'C4', 'E4', 'F4'].map(noteNumber);
    const x = synthChord({ notes, sampleRate: sr });
    const bass = detectBass(spectrumPeaks(x, sr, 8000));
    expect(bass?.pc).toBe(5);
    expect(bass?.freq).toBeCloseTo(87.31, 0);
  });

  it('returns null without low peaks', () => {
    const sr = 48000;
    const x = synthChord({ notes: [72, 76, 79], sampleRate: sr }); // C5 triad
    expect(detectBass(spectrumPeaks(x, sr, 8000))).toBeNull();
    expect(detectBass([])).toBeNull();
  });
});
