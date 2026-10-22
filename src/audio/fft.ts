/**
 * Radix-2 FFT, own implementation (no WASM, no dependencies). Pure, node-safe.
 *
 * `createRealFFT(n)` computes the spectrum of a real signal of length `n`
 * (power of two) via one complex FFT of length n/2 plus a post-processing
 * twiddle pass, so a frame costs roughly half a full complex FFT.
 */

export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

export interface ComplexFFT {
  readonly size: number;
  /** In-place forward transform. `re`/`im` must have length `size`. */
  transform(re: Float64Array, im: Float64Array): void;
}

export function createComplexFFT(size: number): ComplexFFT {
  if (!isPowerOfTwo(size)) throw new Error(`FFT size must be a power of two, got ${size}`);
  const levels = Math.round(Math.log2(size));
  const rev = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let b = 0, x = i; b < levels; b++, x >>>= 1) r = (r << 1) | (x & 1);
    rev[i] = r;
  }
  const half = size >>> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / size);
    sin[i] = Math.sin((2 * Math.PI * i) / size);
  }

  return {
    size,
    transform(re, im) {
      for (let i = 0; i < size; i++) {
        const j = rev[i];
        if (j > i) {
          let t = re[i];
          re[i] = re[j];
          re[j] = t;
          t = im[i];
          im[i] = im[j];
          im[j] = t;
        }
      }
      for (let len = 2; len <= size; len <<= 1) {
        const halfLen = len >>> 1;
        const step = size / len;
        for (let start = 0; start < size; start += len) {
          for (let k = 0, tw = 0; k < halfLen; k++, tw += step) {
            const wr = cos[tw];
            const wi = -sin[tw];
            const a = start + k;
            const b = a + halfLen;
            const xr = re[b] * wr - im[b] * wi;
            const xi = re[b] * wi + im[b] * wr;
            re[b] = re[a] - xr;
            im[b] = im[a] - xi;
            re[a] += xr;
            im[a] += xi;
          }
        }
      }
    },
  };
}

export interface RealFFT {
  readonly size: number;
  /** Number of output bins: size / 2 + 1 (DC .. Nyquist). */
  readonly bins: number;
  /**
   * Forward transform of `input` (length `size`). Writes `bins` values into
   * `outRe` / `outIm`.
   */
  forward(input: ArrayLike<number>, outRe: Float64Array, outIm: Float64Array): void;
  /** Convenience: magnitude spectrum |X[k]| for k = 0..size/2. */
  magnitudes(input: ArrayLike<number>, out: Float32Array | Float64Array): void;
}

export function createRealFFT(size: number): RealFFT {
  if (!isPowerOfTwo(size) || size < 4) {
    throw new Error(`real FFT size must be a power of two >= 4, got ${size}`);
  }
  const m = size >>> 1;
  const inner = createComplexFFT(m);
  const zr = new Float64Array(m);
  const zi = new Float64Array(m);
  const cos = new Float64Array(m + 1);
  const sin = new Float64Array(m + 1);
  for (let k = 0; k <= m; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / size);
    sin[k] = Math.sin((2 * Math.PI * k) / size);
  }
  const bins = m + 1;
  const tmpRe = new Float64Array(bins);
  const tmpIm = new Float64Array(bins);

  function forward(input: ArrayLike<number>, outRe: Float64Array, outIm: Float64Array): void {
    // Pack even samples into the real part, odd samples into the imaginary part.
    for (let n = 0; n < m; n++) {
      zr[n] = input[2 * n];
      zi[n] = input[2 * n + 1];
    }
    inner.transform(zr, zi);
    for (let k = 0; k <= m; k++) {
      const kk = k === m ? 0 : k;
      const mk = k === 0 || k === m ? 0 : m - k;
      const a = zr[kk];
      const b = zi[kk];
      const c = zr[mk];
      const d = zi[mk];
      // E[k] = (Z[k] + conj Z[m-k]) / 2 ; O[k] = (Z[k] - conj Z[m-k]) / 2i
      const er = (a + c) * 0.5;
      const ei = (b - d) * 0.5;
      const or = (b + d) * 0.5;
      const oi = -(a - c) * 0.5;
      // X[k] = E[k] + W^k O[k], W = exp(-2πi / size)
      const wr = cos[k];
      const wi = -sin[k];
      outRe[k] = er + (wr * or - wi * oi);
      outIm[k] = ei + (wr * oi + wi * or);
    }
  }

  return {
    size,
    bins,
    forward,
    magnitudes(input, out) {
      forward(input, tmpRe, tmpIm);
      for (let k = 0; k < bins; k++) out[k] = Math.hypot(tmpRe[k], tmpIm[k]);
    },
  };
}
