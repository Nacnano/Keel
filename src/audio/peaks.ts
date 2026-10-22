/** Spectral peak picking with parabolic interpolation. Pure, node-safe. */

export interface Peak {
  /** Interpolated frequency in Hz. */
  freq: number;
  /** Interpolated magnitude (same scale as the input spectrum). */
  mag: number;
  /**
   * Second difference of the log magnitudes around the peak bin. A stationary
   * sinusoid under a Hann window gives -1.39 (bin-centred) to -1.61 (half-bin
   * offset); smeared peaks (vibrato, glides) are flatter (closer to 0).
   */
  curvature?: number;
}

export interface PeakOptions {
  sampleRate: number;
  /** FFT size the spectrum came from (bins = fftSize / 2 + 1). */
  fftSize: number;
  minHz?: number;
  maxHz?: number;
  /** Ignore peaks below `maxPeakMag * 10^(relativeDb / 20)`. Default -50 dB. */
  relativeDb?: number;
  /** Ignore peaks below this absolute magnitude. Default 1e-5. */
  absoluteFloor?: number;
  /** Keep at most this many peaks (strongest first, then re-sorted by freq). */
  maxPeaks?: number;
  /**
   * Local noise rejection (0 = off): a peak must stand this many dB above the local noise
   * level, estimated as the 30th percentile of the magnitudes within ±max(12 bins, 6 % of the
   * frequency) around it (its own main lobe excluded). The local noise level is subtracted
   * from the reported magnitude. Broadband noise produces many small local maxima that
   * otherwise get votes; tonal partials sit 20–30 dB above it in an 8192-point frame.
   */
  minProminenceDb?: number;
}

const scratch = new Float32Array(1024);

/** 30th percentile of |mag| in [lo, hi] excluding [skipLo, skipHi]. */
function localNoise(
  mag: ArrayLike<number>,
  lo: number,
  hi: number,
  skipLo: number,
  skipHi: number,
) {
  let n = 0;
  for (let k = lo; k <= hi && n < scratch.length; k++) {
    if (k >= skipLo && k <= skipHi) continue;
    scratch[n++] = mag[k];
  }
  if (n === 0) return 0;
  const view = scratch.subarray(0, n);
  view.sort();
  return view[Math.floor(0.3 * (n - 1))];
}

/**
 * Find local maxima of a magnitude spectrum and refine each with a parabola
 * fitted to the log magnitudes of the three surrounding bins (accurate to a
 * few cents for a Hann window). Returns peaks sorted by ascending frequency.
 */
export function findPeaks(mag: ArrayLike<number>, opts: PeakOptions): Peak[] {
  const {
    sampleRate,
    fftSize,
    minHz = 30,
    maxHz = 5000,
    relativeDb = -50,
    absoluteFloor = 1e-5,
    maxPeaks = 64,
    minProminenceDb = 0,
  } = opts;
  const promRatio = minProminenceDb > 0 ? Math.pow(10, minProminenceDb / 20) : 0;
  const binHz = sampleRate / fftSize;
  const lo = Math.max(1, Math.floor(minHz / binHz));
  const hi = Math.min(mag.length - 2, Math.ceil(maxHz / binHz));

  const candidates: number[] = [];
  let maxMag = 0;
  for (let k = lo; k <= hi; k++) {
    const m = mag[k];
    if (m > absoluteFloor && m > mag[k - 1] && m >= mag[k + 1]) {
      candidates.push(k);
      if (m > maxMag) maxMag = m;
    }
  }
  if (candidates.length === 0) return [];

  const threshold = Math.max(absoluteFloor, maxMag * Math.pow(10, relativeDb / 20));
  const peaks: Peak[] = [];
  for (const k of candidates) {
    if (mag[k] < threshold) continue;
    let noiseLevel = 0;
    if (promRatio > 0) {
      const w = Math.max(12, Math.round(0.06 * k));
      noiseLevel = localNoise(
        mag,
        Math.max(1, k - w),
        Math.min(mag.length - 1, k + w),
        k - 3,
        k + 3,
      );
      if (mag[k] < noiseLevel * promRatio) continue;
    }
    const a = Math.log(mag[k - 1] + 1e-12);
    const b = Math.log(mag[k] + 1e-12);
    const c = Math.log(mag[k + 1] + 1e-12);
    const denom = a - 2 * b + c;
    const p = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
    const offset = Math.max(-0.5, Math.min(0.5, p));
    const freq = (k + offset) * binHz;
    if (freq < minHz || freq > maxHz) continue;
    const m = Math.exp(b - 0.25 * (a - c) * offset);
    peaks.push({ freq, mag: Math.max(0, m - noiseLevel), curvature: denom });
  }

  if (peaks.length > maxPeaks) {
    peaks.sort((x, y) => y.mag - x.mag);
    peaks.length = maxPeaks;
    peaks.sort((x, y) => x.freq - y.freq);
  }
  return peaks;
}
