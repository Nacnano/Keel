import { attributeHarmonics, hzToMidi } from './chroma';
import type { Peak } from './peaks';

/** Coarse evidence, not an instrument classifier or source separator. */
export function spectralEvidence(peaks: readonly Peak[], a4: number) {
  // Attribute partials before measuring a shared semitone-grid offset. Raw harmonics
  // (especially the 5th/7th) would bias that offset away from the played fundamentals.
  const { own, claimed } = attributeHarmonics(peaks, 8, 0.6);
  let power = 0,
    narrow = 0,
    mass = 0,
    re = 0,
    im = 0;
  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i],
      w = own[i] + claimed[i];
    const phase = 2 * Math.PI * hzToMidi(p.freq, a4);
    power += p.mag * p.mag;
    if ((p.curvature ?? 0) < -1.1) narrow += p.mag * p.mag;
    mass += w;
    re += w * Math.cos(phase);
    im += w * Math.sin(phase);
  }
  return {
    // Circular concentration is invariant to shared detuning, unlike distance to A440.
    concentration: mass > 0 ? Math.hypot(re, im) / mass : 0,
    cents: (Math.atan2(im, re) * 100) / (2 * Math.PI),
    narrowFraction: power > 0 ? narrow / power : 0,
    // Tuning must not learn the pitch of electrical hum mixed with an instrument.
    hasMains: peaks.some(
      (p) =>
        (Math.abs(p.freq - 50) < 1.5 || Math.abs(p.freq - 60) < 1.5) &&
        p.mag * p.mag > power * 0.005,
    ),
  };
}

function nearestPeak(peaks: readonly Peak[], target: number, cents: number): number {
  const lo = target * 2 ** (-cents / 1200);
  const hi = target * 2 ** (cents / 1200);
  let a = 0;
  let b = peaks.length;
  while (a < b) {
    const mid = (a + b) >>> 1;
    if (peaks[mid].freq < lo) a = mid + 1;
    else b = mid;
  }
  let best = -1;
  let bestD = Infinity;
  for (let i = a; i < peaks.length && peaks[i].freq <= hi; i++) {
    const d = Math.abs(1200 * Math.log2(peaks[i].freq / target));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Fraction of peak power that sits on a harmonic series (fundamental + at least one partial).
 * Random peaks and inharmonic rings (dishes, fan whine, clinks) score low. Piano and guitar
 * partials score high, including a high note whose third partial is above the analysis band.
 * Tolerance widens slightly for upper partials, which stretch sharp on a piano.
 */
export function harmonicPowerFraction(peaks: readonly Peak[]): number {
  const n = peaks.length;
  if (n === 0) return 0;
  const power = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const p = peaks[i].mag * peaks[i].mag;
    power[i] = p;
    total += p;
  }
  if (total <= 0) return 0;
  const explained = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const f0 = peaks[i].freq;
    if (f0 < 40 || f0 > 4200) continue;
    const members = [i];
    for (let h = 2; h <= 8; h++) {
      const target = f0 * h;
      if (target > 5000) break;
      const j = nearestPeak(peaks, target, Math.max(25, 15 + 4 * h));
      if (j > i && !members.includes(j)) members.push(j);
    }
    if (members.length >= 2) for (const j of members) explained[j] = 1;
  }
  let explainedPower = 0;
  for (let i = 0; i < n; i++) if (explained[i]) explainedPower += power[i];
  return explainedPower / total;
}

export interface PartialPhase {
  freq: number;
  mag: number;
  /** FFT phase, radians, at the peak's nearest bin. */
  phase: number;
}

/**
 * Phase-lock of spectral peaks across hops. A real partial advances by `2π f hop`;
 * noise peaks do not. Returns the fraction of this frame's peak power that matches.
 * The first frame after a reset is 0: nothing has been locked yet.
 */
export function createPartialCoherence(hopSec: number) {
  let prev: { freq: number; phase: number; power: number }[] = [];
  return {
    reset() {
      prev = [];
    },
    update(peaks: readonly PartialPhase[]): number {
      let total = 0;
      let matched = 0;
      const cur = peaks.map((p) => ({
        freq: p.freq,
        phase: p.phase,
        power: p.mag * p.mag,
      }));
      if (prev.length > 0) {
        for (const p of cur) {
          total += p.power;
          let best = -1;
          let bestD = 30;
          for (let i = 0; i < prev.length; i++) {
            const d = Math.abs(1200 * Math.log2(p.freq / prev[i].freq));
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          if (best < 0) continue;
          const predicted = prev[best].phase + 2 * Math.PI * prev[best].freq * hopSec;
          const err = Math.atan2(Math.sin(p.phase - predicted), Math.cos(p.phase - predicted));
          if (Math.abs(err) < 1) matched += p.power;
        }
      }
      prev = cur;
      return total > 0 ? matched / total : 0;
    },
  };
}

export interface NoiseFrameFeatures {
  flatness: number;
  harmonicFraction: number;
  coherence: number;
  concentration: number;
}

/**
 * A few unrelated steady tones: peaked, not a noisy spectrum, and almost none of the
 * peak power on a harmonic series. Kept stricter than a noisy guitar, which still has
 * a harmonic series under distortion and room noise.
 */
export function inharmonicDrone(features: NoiseFrameFeatures): boolean {
  // Phase lock separates a steady ring from a noisy guitar frame that merely
  // lost a few partials. A ring stays coherent; the guitar frame does not.
  return (
    features.harmonicFraction < 0.2 &&
    features.concentration < 0.3 &&
    features.flatness < 0.05 &&
    features.coherence > 0.8
  );
}

/**
 * Random room sound that must not light piano keys. A played note fails this test.
 * Broadband hiss and an inharmonic ring pass it.
 */
export function randomNoiseFrame(features: NoiseFrameFeatures): boolean {
  return features.flatness > 0.45 || inharmonicDrone(features);
}

/**
 * Reject sustained noisy spectra, while allowing attacks and brief percussion/vocal
 * masking after musical evidence. Thresholds are amplitude-independent: quiet playing
 * is governed by the existing energy gate. Stable pitched machinery can still pass.
 */
export function createMusicalGate() {
  let lastMusicalT = -Infinity;
  let candidateSince = NaN;
  let lastT = -Infinity;
  function reset() {
    lastMusicalT = lastT = -Infinity;
    candidateSince = NaN;
  }
  return {
    reset,
    close() {
      candidateSince = NaN;
    },
    accepts(t: number, tonal: number, concentration: number, narrowFraction: number) {
      if (t < lastT || t - lastT > 0.5) reset();
      lastT = t;
      if (tonal < 0.55) candidateSince = NaN;
      else if (Number.isNaN(candidateSince)) candidateSince = t;
      const onGrid = tonal > 0.85 && concentration > 0.5;
      if ((tonal > 0.95 && concentration > 0.25) || (onGrid && narrowFraction > 0.5))
        lastMusicalT = t;
      // Short provisional attacks cannot on their own complete the note tracker's
      // 120 ms confirmation. They stop smearing from delaying real chord attacks.
      return (
        tonal >= 0.55 &&
        (t - lastMusicalT <= 1.5 || t - candidateSince <= 0.12 || onGrid || tonal > 0.95)
      );
    },
  };
}
