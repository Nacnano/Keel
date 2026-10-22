import { describe, expect, it } from 'vitest';
import { createComplexFFT, createRealFFT, isPowerOfTwo } from './fft';
import { amplitudeScale, hann } from './window';

function naiveDft(x: ArrayLike<number>): { re: Float64Array; im: Float64Array } {
  const n = x.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n;
      sr += x[t] * Math.cos(a);
      si += x[t] * Math.sin(a);
    }
    re[k] = sr;
    im[k] = si;
  }
  return { re, im };
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

describe('fft', () => {
  it('validates sizes', () => {
    expect(isPowerOfTwo(8192)).toBe(true);
    expect(isPowerOfTwo(6000)).toBe(false);
    expect(() => createRealFFT(1000)).toThrow();
  });

  it.each([8, 64, 512, 1024])('real FFT of size %i matches a naive DFT', (n) => {
    const rnd = lcg(n);
    const x = new Float64Array(n).map(() => rnd());
    const fft = createRealFFT(n);
    const re = new Float64Array(fft.bins);
    const im = new Float64Array(fft.bins);
    fft.forward(x, re, im);
    const ref = naiveDft(x);
    for (let k = 0; k < fft.bins; k++) {
      expect(Math.abs(re[k] - ref.re[k])).toBeLessThan(1e-4);
      expect(Math.abs(im[k] - ref.im[k])).toBeLessThan(1e-4);
    }
  });

  it('complex FFT matches a naive DFT', () => {
    const n = 256;
    const rnd = lcg(7);
    const x = new Float64Array(n).map(() => rnd());
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    createComplexFFT(n).transform(re, im);
    const ref = naiveDft(x);
    for (let k = 0; k < n; k++) {
      expect(Math.abs(re[k] - ref.re[k])).toBeLessThan(1e-4);
      expect(Math.abs(im[k] - ref.im[k])).toBeLessThan(1e-4);
    }
  });

  it('recovers the amplitude of a windowed bin-centred sinusoid', () => {
    const n = 1024;
    const w = hann(n);
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * 32 * i) / n) * w[i];
    const mag = new Float32Array(n / 2 + 1);
    createRealFFT(n).magnitudes(x, mag);
    expect(mag[32] * amplitudeScale(w)).toBeCloseTo(0.3, 3);
  });
});
