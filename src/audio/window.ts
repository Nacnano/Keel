/** Window functions. Pure, node-safe. */

/**
 * Hann window of length `n`. `periodic` (default) is the DFT-even form used
 * for spectral analysis with overlapping frames.
 */
export function hann(n: number, periodic = true): Float32Array {
  const w = new Float32Array(n);
  const denom = periodic ? n : n - 1;
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / denom);
  return w;
}

/** out[i] = x[i] * w[i]. `out` may alias `x`. */
export function applyWindow(
  x: ArrayLike<number>,
  w: ArrayLike<number>,
  out: Float32Array | Float64Array,
): void {
  for (let i = 0; i < w.length; i++) out[i] = x[i] * w[i];
}

/**
 * Factor that converts an FFT magnitude of a windowed sinusoid back to its
 * time-domain amplitude: amplitude ≈ |X[k]| * 2 / sum(w).
 */
export function amplitudeScale(w: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += w[i];
  return s > 0 ? 2 / s : 0;
}
