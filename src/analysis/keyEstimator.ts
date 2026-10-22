/**
 * Key estimation (Krumhansl-Schmuckler) on an exponentially decaying chroma histogram,
 * with hysteresis so the key only flips on sustained evidence.
 */
import type { ChromaFrame, Key, KeyEstimate, KeyMode, PitchClass } from '@/core';
import { KRUMHANSL_MAJOR, KRUMHANSL_MINOR, relativeKey } from '@/theory';
import { SILENCE_ENERGY } from './chordScorer';

export { KRUMHANSL_MAJOR, KRUMHANSL_MINOR, relativeKey };

export interface KeyEstimatorOptions {
  /** Histogram half-life in seconds. */
  halfLife: number;
  /** Required correlation lead of a challenger over the current key. */
  switchMargin: number;
  /** Seconds (of non-silent input) the lead must be held before switching. */
  switchHold: number;
  /** Seconds of non-silent input before the first key is reported. */
  minEvidence: number;
  /** Largest frame gap counted as continuous time. */
  maxFrameGap: number;
  /**
   * Extra lead required to switch to the relative major/minor of the current key. The two
   * share every pitch class, so their correlations differ by little and a single chord that
   * leans on vi (or III) would otherwise flip the key back and forth.
   */
  relativeMargin: number;
  /** Added to major-key correlations when choosing (pop/jazz are mostly major). */
  majorBias: number;
}

export const DEFAULT_KEY_OPTIONS: KeyEstimatorOptions = {
  halfLife: 12,
  switchMargin: 0.08,
  switchHold: 2,
  minEvidence: 1.5,
  maxFrameGap: 0.25,
  relativeMargin: 0.15,
  majorBias: 0.02,
};

export interface KeyEstimator {
  /** Feed a frame; returns a new estimate only when the reported key changes. */
  push(frame: ChromaFrame): KeyEstimate | null;
  /** Latest reported key (with current scores), or null before the first one. */
  current(): KeyEstimate | null;
  /** Pearson correlation for all 24 keys: index = tonic (major) or 12 + tonic (minor). */
  scores(): Float64Array;
  reset(): void;
}

const MODES: KeyMode[] = ['major', 'minor'];

/** Centered, unit-norm rotated profiles: row k = key index k (0..23). */
const PROFILES: Float64Array[] = (() => {
  const rows: Float64Array[] = [];
  for (const base of [KRUMHANSL_MAJOR, KRUMHANSL_MINOR]) {
    const mean = base.reduce((a, b) => a + b, 0) / 12;
    for (let tonic = 0; tonic < 12; tonic++) {
      const row = new Float64Array(12);
      let sq = 0;
      for (let pc = 0; pc < 12; pc++) {
        row[pc] = base[(pc - tonic + 12) % 12] - mean;
        sq += row[pc] * row[pc];
      }
      const inv = 1 / Math.sqrt(sq);
      for (let pc = 0; pc < 12; pc++) row[pc] *= inv;
      rows.push(row);
    }
  }
  return rows;
})();

/** Index of the relative major/minor (C major 0 ↔ A minor 21). */
function relativeIndex(index: number): number {
  return index < 12 ? 12 + ((index + 9) % 12) : (index - 12 + 3) % 12;
}

function keyOf(index: number): Key {
  return { tonic: (index % 12) as PitchClass, mode: MODES[index < 12 ? 0 : 1] };
}

export function createKeyEstimator(options: Partial<KeyEstimatorOptions> = {}): KeyEstimator {
  const opts = { ...DEFAULT_KEY_OPTIONS, ...options };
  const hist = new Float64Array(12);
  const score = new Float64Array(24);
  let lastT: number | null = null;
  let evidence = 0;
  let currentIdx = -1;
  let candidateIdx = -1;
  let candidateHeld = 0;

  function correlate() {
    let mean = 0;
    for (let pc = 0; pc < 12; pc++) mean += hist[pc];
    mean /= 12;
    let sq = 0;
    for (let pc = 0; pc < 12; pc++) sq += (hist[pc] - mean) ** 2;
    const inv = sq > 0 ? 1 / Math.sqrt(sq) : 0;
    for (let k = 0; k < 24; k++) {
      const p = PROFILES[k];
      let r = 0;
      for (let pc = 0; pc < 12; pc++) r += (hist[pc] - mean) * p[pc];
      score[k] = r * inv;
    }
  }

  function estimate(): KeyEstimate {
    const key = keyOf(currentIdx);
    const alternatives = Array.from({ length: 24 }, (_, k) => k)
      .filter((k) => k !== currentIdx)
      .sort((a, b) => score[b] - score[a] || a - b)
      .slice(0, 3)
      .map((k) => ({ ...keyOf(k), score: score[k] }));
    return {
      ...key,
      confidence: Math.min(1, Math.max(0, score[currentIdx])),
      relative: relativeKey(key),
      alternatives,
    };
  }

  function push(frame: ChromaFrame): KeyEstimate | null {
    const dt = lastT === null ? 0 : Math.min(opts.maxFrameGap, Math.max(0, frame.t - lastT));
    lastT = frame.t;
    if (dt > 0) {
      const decay = Math.pow(0.5, dt / opts.halfLife);
      for (let pc = 0; pc < 12; pc++) hist[pc] *= decay;
    }
    let sum = 0;
    for (let pc = 0; pc < 12; pc++) sum += frame.chroma[pc];
    if (sum <= 0 || frame.energy < SILENCE_ENERGY) return null;
    for (let pc = 0; pc < 12; pc++) hist[pc] += frame.chroma[pc] / sum;
    evidence += dt;
    if (evidence < opts.minEvidence) return null;

    correlate();
    const biased = (k: number) => score[k] + (k < 12 ? opts.majorBias : 0);
    let best = 0;
    for (let k = 1; k < 24; k++) if (biased(k) > biased(best)) best = k;
    if (currentIdx < 0) {
      currentIdx = best;
      candidateIdx = -1;
      return estimate();
    }
    const isRelative = best === relativeIndex(currentIdx);
    const margin = isRelative ? opts.relativeMargin : opts.switchMargin;
    if (best !== currentIdx && biased(best) - biased(currentIdx) >= margin) {
      if (best === candidateIdx) candidateHeld += dt;
      else {
        candidateIdx = best;
        candidateHeld = 0;
      }
      if (candidateHeld >= opts.switchHold) {
        currentIdx = best;
        candidateIdx = -1;
        candidateHeld = 0;
        return estimate();
      }
    } else {
      candidateIdx = -1;
      candidateHeld = 0;
    }
    return null;
  }

  return {
    push,
    current: () => (currentIdx < 0 ? null : estimate()),
    scores: () => score.slice(),
    reset() {
      hist.fill(0);
      score.fill(0);
      lastT = null;
      evidence = 0;
      currentIdx = -1;
      candidateIdx = -1;
      candidateHeld = 0;
    },
  };
}
