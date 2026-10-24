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
