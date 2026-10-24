import type { Peak } from './peaks';

/** Reject near-pure mains buzz; require its fundamental and overwhelming harmonic power. */
export function isMainsHum(peaks: readonly Peak[]): boolean {
  let total = 0;
  for (const p of peaks) total += p.mag * p.mag;
  if (total <= 0) return false;
  for (const mains of [50, 60]) {
    // A measured fundamental is required: a high piano note near a multiple is not hum.
    if (!peaks.some((p) => Math.abs(p.freq - mains) < 0.8 && p.mag * p.mag > total * 0.05))
      continue;
    let explained = 0;
    for (const p of peaks) {
      const harmonic = Math.round(p.freq / mains);
      if (harmonic >= 1 && Math.abs(p.freq - harmonic * mains) < Math.max(1, p.freq * 0.003)) {
        explained += p.mag * p.mag;
      }
    }
    if (explained / total > 0.9) return true;
  }
  return false;
}

/**
 * Fraction of spectral power explained by prominent, narrow peaks. Random local maxima
 * must not become a full-strength chord just because chroma is normalised to sum to one.
 * Peaks must be sorted by frequency and already pass the local prominence check.
 * ±2 FFT bins include a Hann-windowed tone's main lobe; overlaps are counted only once.
 */
export function tonalEnergyRatio(
  mag: ArrayLike<number>,
  peaks: readonly Peak[],
  sampleRate: number,
  fftSize: number,
): number {
  const binHz = sampleRate / fftSize;
  const lo = Math.max(1, Math.ceil(30 / binHz));
  const hi = Math.min(mag.length - 1, Math.floor(5000 / binHz));
  let total = 0;
  for (let k = lo; k <= hi; k++) total += mag[k] * mag[k];
  if (total <= 0) return 0;
  let tonal = 0;
  let covered = lo - 1;
  for (const peak of peaks) {
    const bin = Math.round(peak.freq / binHz);
    const start = Math.max(lo, bin - 2, covered + 1);
    const end = Math.min(hi, bin + 2);
    for (let k = start; k <= end; k++) tonal += mag[k] * mag[k];
    covered = Math.max(covered, end);
  }
  return tonal / total;
}

/**
 * Wiener entropy of the 80–5000 Hz magnitude spectrum (geometric mean / arithmetic mean).
 * Broadband noise and clicks land near 1. A harmonic instrument leaves most bins quiet, so
 * the geometric mean collapses and flatness stays near 0 even when the note is quiet.
 */
export function spectralFlatness(
  mag: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
): number {
  const binHz = sampleRate / fftSize;
  const lo = Math.max(1, Math.ceil(80 / binHz));
  const hi = Math.min(mag.length - 1, Math.floor(5000 / binHz));
  let logSum = 0;
  let sum = 0;
  let n = 0;
  for (let k = lo; k <= hi; k++) {
    const power = mag[k] * mag[k] + 1e-20;
    logSum += Math.log(power);
    sum += power;
    n++;
  }
  if (n === 0 || sum <= 0) return 1;
  return Math.exp(logSum / n) / (sum / n);
}
