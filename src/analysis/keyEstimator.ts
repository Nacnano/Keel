/**
 * Key estimation (Krumhansl-Schmuckler) on an exponentially decaying chroma histogram,
 * with hysteresis so the key only flips on sustained evidence.
 */
import type { ChromaFrame, Key, KeyEstimate, KeyMode, PitchClass } from '@/core';
import { SILENCE_ENERGY } from './chordScorer';

// TODO(integration): replace with import from '@/theory/keys' once feat/theory merges
export const KRUMHANSL_MAJOR = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
// TODO(integration): replace with import from '@/theory/keys' once feat/theory merges
export const KRUMHANSL_MINOR = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

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
}

export const DEFAULT_KEY_OPTIONS: KeyEstimatorOptions = {
  halfLife: 8,
  switchMargin: 0.08,
  switchHold: 2,
  minEvidence: 1.5,
  maxFrameGap: 0.25,
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

function keyOf(index: number): Key {
  return { tonic: (index % 12) as PitchClass, mode: MODES[index < 12 ? 0 : 1] };
}

export function relativeKey(key: Key): Key {
  return key.mode === 'major'
    ? { tonic: ((key.tonic + 9) % 12) as PitchClass, mode: 'minor' }
    : { tonic: ((key.tonic + 3) % 12) as PitchClass, mode: 'major' };
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
    let best = 0;
    for (let k = 1; k < 24; k++) if (score[k] > score[best]) best = k;
    if (currentIdx < 0) {
      currentIdx = best;
      candidateIdx = -1;
      return estimate();
    }
    if (best !== currentIdx && score[best] - score[currentIdx] >= opts.switchMargin) {
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
