/**
 * Key estimation (Krumhansl-Schmuckler) on an exponentially decaying chroma histogram, plus
 * chord evidence from the displayed chord stream (which keys the chords fit, cadences into a
 * tonic, tonic chord time), with hysteresis:
 *
 * - **Provisional** key: right after the first estimate (or a re-estimate) a challenger that
 *   leads for `switchHold` seconds takes over, so a song that opens on V settles quickly.
 * - **Settled** key: after `settleAfter` seconds of unchallenged music a challenger has to lead
 *   for `settledHold` seconds, so a bridge or a long vamp on IV does not "modulate".
 * - **New song**: when the recent window (`shortHalfLife`) stops fitting the current key (its
 *   correlation falls below `misfitBelow` while another key fits it much better) for
 *   `misfitHold` seconds, the old notes and chords are dropped and the key is re-estimated
 *   from the recent window.
 * - **Relative major / minor**: the two share every pitch class, so the chroma alone cannot
 *   tell them apart. A minor key pays `minorPenalty` until it has a cadence (V → i or iv → i)
 *   or its tonic chord clearly dominates.
 */
import type { Chord, ChromaFrame, Key, KeyEstimate, KeyMode, PitchClass } from '@/core';
import { KRUMHANSL_MAJOR, KRUMHANSL_MINOR, chordFamily, isDiatonic, relativeKey } from '@/theory';
import { SILENCE_ENERGY } from './chordScorer';

export { KRUMHANSL_MAJOR, KRUMHANSL_MINOR, relativeKey };

export interface KeyEstimatorOptions {
  /** Histogram half-life in seconds. */
  halfLife: number;
  /** Half-life of the recent-window histogram used to notice a new song. */
  shortHalfLife: number;
  /** Required score lead of a challenger over the current key. */
  switchMargin: number;
  /** Seconds (of non-silent input) the lead must be held while the key is provisional. */
  switchHold: number;
  /** `switchHold` for a challenger that is a minor key with a fresh V → i cadence. */
  cadenceHold: number;
  /** Seconds the lead must be held once the key has settled. */
  settledHold: number;
  /** Seconds of unchallenged music after a (re-)estimate before the key counts as settled. */
  settleAfter: number;
  /** Seconds of non-silent input before the first key is reported. */
  minEvidence: number;
  /** Largest frame gap counted as continuous time. */
  maxFrameGap: number;
  /** Added to major-key scores (pop/jazz are mostly major). */
  majorBias: number;
  /** A new song: the recent window's correlation with the current key is below this... */
  misfitBelow: number;
  /** ...while the best key of the recent window leads it by at least this... */
  misfitLead: number;
  /** ...for this many seconds of music. */
  misfitHold: number;
  /** Half-life (s) of the chord evidence. */
  chordHalfLife: number;
  /** Score bonus of a minor key per (decayed) cadence into its tonic, up to one cadence. */
  cadenceBonus: number;
  /**
   * Score bonus × the share of recent chord time whose chords are diatonic to the key (minor:
   * natural or harmonic), so that the chords, not only the notes, have to fit a key.
   */
  chordFitBonus: number;
  /** Blues: decayed seconds of IV7 shown, and the blue-note level (see `blueness`). */
  bluesIV7: number;
  bluesNotes: number;
  /**
   * Score bonus × the share of recent chord time on the tonic chords of the key's relative pair
   * (A♭ and Fm for A♭ major): a key whose tonic is hardly played is a poor reading.
   */
  tonicBonus: number;
  /** Subtracted from a minor key's score while it has no minor evidence (cadence or tonic). */
  minorPenalty: number;
  /** How far the relative minor may trail the major and still be chosen on minor evidence. */
  relativeMargin: number;
}

export const DEFAULT_KEY_OPTIONS: KeyEstimatorOptions = {
  halfLife: 12,
  shortHalfLife: 2.5,
  switchMargin: 0.08,
  switchHold: 2,
  cadenceHold: 0.5,
  settledHold: 13,
  settleAfter: 12,
  minEvidence: 1.5,
  maxFrameGap: 0.25,
  majorBias: 0.02,
  misfitBelow: 0.5,
  misfitLead: 0.35,
  misfitHold: 3,
  chordHalfLife: 20,
  cadenceBonus: 0.2,
  chordFitBonus: 0.25,
  tonicBonus: 0.4,
  bluesIV7: 1,
  bluesNotes: 0.45,
  minorPenalty: 0.1,
  relativeMargin: 0.3,
};

export interface KeyEstimator {
  /** Feed a frame; returns a new estimate only when the reported key changes. */
  push(frame: ChromaFrame): KeyEstimate | null;
  /** Feed the displayed chord (on change; null for no chord) at time `t`. */
  observeChord(t: number, chord: Chord | null): void;
  /** Latest reported key (with current scores), or null before the first one. */
  current(): KeyEstimate | null;
  /**
   * Time the current key's evidence started (first sound, the challenger's lead, or the start
   * of the misfit for a new song): a timeline draws the key from there.
   */
  since(): number | null;
  /**
   * The current key is a major-key blues: its IV7 has been shown recently and the ♭3 / ♭7 blue
   * notes are strong in the histogram. The tonic triad then reads as I7.
   */
  blues(): boolean;
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
export function relativeIndex(index: number): number {
  return index < 12 ? 12 + ((index + 9) % 12) : (index - 12 + 3) % 12;
}

function keyOf(index: number): Key {
  return { tonic: (index % 12) as PitchClass, mode: MODES[index < 12 ? 0 : 1] };
}

/** 'maj' for major tonic chords, 'dom' for dominant sevenths, 'min' for minor tonic chords. */
function chordKind(chord: Chord | null): 'maj' | 'dom' | 'min' | null {
  if (!chord) return null;
  const f = chordFamily(chord.quality);
  if (f === 'maj' || f === 'maj7') return 'maj';
  if (f === '7') return 'dom';
  if (f === 'min' || f === 'min7' || f === 'mMaj7') return 'min';
  return null;
}

function correlateInto(hist: Float64Array, out: Float64Array) {
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
    out[k] = r * inv;
  }
}

/** Diatonic to the key (minor: natural or harmonic, so V and vii° fit). */
function fitsKey(chord: Chord, key: Key): boolean {
  return isDiatonic(chord, key) || (key.mode === 'minor' && isDiatonic(chord, key, 'harmonic'));
}

export function createKeyEstimator(options: Partial<KeyEstimatorOptions> = {}): KeyEstimator {
  const opts = { ...DEFAULT_KEY_OPTIONS, ...options };
  const hist = new Float64Array(12);
  const recent = new Float64Array(12);
  const score = new Float64Array(24);
  const recentScore = new Float64Array(24);
  /** Decayed cadence count into each key's tonic. */
  const cadence = new Float64Array(24);
  /** Decayed seconds each key's tonic chord was displayed. */
  const tonicTime = new Float64Array(24);
  /** Decayed seconds of chords diatonic to each key. */
  const fitTime = new Float64Array(24);
  /** Decayed seconds of displayed chords. */
  let chordTime = 0;
  /** Per key: 1 when the displayed chord is diatonic to it. */
  const shownFits = new Uint8Array(24);
  /** Decayed seconds a dominant seventh was shown on each root. */
  const domTime = new Float64Array(12);
  /** Displayed chords of the last seconds, replayed when a new song is re-estimated. */
  const recentChords: Array<{ t: number; chord: Chord | null }> = [];
  /** Seconds each challenger (relative pair, by its major) has led the current key. */
  const held = new Float64Array(12);
  const leadStart = new Float64Array(12);
  let lastT: number | null = null;
  let evidence = 0;
  let firstSoundT: number | null = null;
  let currentIdx = -1;
  let currentSince = 0;
  /** Seconds of unchallenged music since the current key was (re-)estimated. */
  let age = 0;
  /** Seconds of music since the current key was adopted. */
  let tenure = 0;
  let misfit = 0;
  let misfitStart = 0;
  let shownChord: Chord | null = null;

  const biased = (s: Float64Array, k: number) =>
    s[k] +
    (k < 12 ? opts.majorBias : 0) +
    // V → I is also I → IV, so only the minor cadence (V → i) moves the key
    (k >= 12 ? opts.cadenceBonus * Math.min(1, cadence[k]) : 0) +
    // chord shares are only telling once a few chords have been heard (a lone first Cm on a
    // blues fits C minor, not C major)
    (chordTime > 0
      ? (Math.min(1, chordTime / 8) *
          (opts.chordFitBonus * fitTime[k] +
            opts.tonicBonus * (tonicTime[k] + tonicTime[relativeIndex(k)]))) /
        chordTime
      : 0);

  /**
   * The minor key has a cadence into its tonic (more than the relative major has), or its
   * tonic chord clearly dominates. `keep` is the weaker test for staying in a minor key.
   */
  function minorEvidence(minor: number, keep: boolean): boolean {
    const major = relativeIndex(minor);
    if (keep ? cadence[minor] >= 0.4 : cadence[minor] >= 1 + cadence[major]) return true;
    return (
      chordTime >= 4 &&
      tonicTime[minor] >= 0.35 * chordTime &&
      tonicTime[minor] >= 3 * tonicTime[major]
    );
  }

  /** Score used to choose: minor keys pay `minorPenalty` until they have minor evidence. */
  function adjusted(s: Float64Array, k: number): number {
    const pay = k >= 12 && !minorEvidence(k, k === currentIdx) ? opts.minorPenalty : 0;
    return biased(s, k) - pay;
  }

  /** Best key for a score vector, preferring the major of a relative pair. */
  function choose(s: Float64Array): number {
    let best = 0;
    for (let k = 1; k < 24; k++) if (adjusted(s, k) > adjusted(s, best)) best = k;
    const rel = relativeIndex(best);
    const close = adjusted(s, rel) >= adjusted(s, best) - opts.relativeMargin;
    // the minor of a relative pair needs minor evidence; without it the major is read
    if (best < 12) return close && minorEvidence(rel, rel === currentIdx) ? rel : best;
    return close && !minorEvidence(best, best === currentIdx) ? rel : best;
  }

  /** Score of a key for switching: the better of the relative pair, so relatives do not compete. */
  function strength(s: Float64Array, k: number): number {
    return Math.max(adjusted(s, k), adjusted(s, relativeIndex(k)));
  }

  /**
   * Blue-note level of a major key: the ♭3 and ♭7 in the long histogram relative to the mean
   * scale tone (0 for minor keys or before a key).
   */
  function blueness(): number {
    if (currentIdx < 0 || currentIdx >= 12) return 0;
    const t = currentIdx;
    let scale = 0;
    for (const d of [0, 2, 4, 5, 7, 9, 11]) scale += hist[(t + d) % 12];
    scale /= 7;
    if (scale <= 0) return 0;
    return (hist[(t + 3) % 12] + hist[(t + 10) % 12]) / 2 / scale;
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

  function adopt(idx: number, since: number): KeyEstimate {
    currentIdx = idx;
    currentSince = since;
    tenure = 0;
    held.fill(0);
    misfit = 0;
    return estimate();
  }

  /** Decay the chord evidence by `decay` and add `dt` seconds of the displayed chord. */
  function addChordTime(dt: number, decay: number) {
    chordTime *= decay;
    for (let k = 0; k < 24; k++) {
      cadence[k] *= decay;
      tonicTime[k] *= decay;
      fitTime[k] *= decay;
      if (shownFits[k]) fitTime[k] += dt;
    }
    for (let r = 0; r < 12; r++) domTime[r] *= decay;
    if (!shownChord) return;
    if (chordFamily(shownChord.quality) === '7') domTime[shownChord.root] += dt;
    chordTime += dt;
    const kind = chordKind(shownChord);
    if (kind === 'maj') tonicTime[shownChord.root] += dt;
    else if (kind === 'min') tonicTime[12 + shownChord.root] += dt;
  }

  /** The displayed chord changes: per-key fit, and cadences into a tonic. */
  function setChord(chord: Chord | null) {
    const prev = shownChord;
    shownChord = chord;
    for (let k = 0; k < 24; k++) shownFits[k] = chord && fitsKey(chord, keyOf(k)) ? 1 : 0;
    const kind = chordKind(chord);
    const prevKind = chordKind(prev);
    if (!chord || !prev || !kind || !prevKind) return;
    const fall = (prev.root - chord.root + 12) % 12;
    // a V is a major triad or a dominant seventh (Gmaj7 → C is not a cadence)
    const prevMajor =
      prevKind === 'dom' || (prevKind === 'maj' && chordFamily(prev.quality) === 'maj');
    // V → I and V7 → I
    if (kind === 'maj' && fall === 7 && prevMajor) cadence[chord.root] += 1;
    // V → i and V7 → i; iv → i counts half (ii → vi in the relative major sounds the same)
    if (kind === 'min' && fall === 7 && prevMajor) cadence[12 + chord.root] += 1;
    else if (kind === 'min' && fall === 5 && prevKind === 'min') cadence[12 + chord.root] += 0.5;
  }

  /** Drop the chord evidence and rebuild it from the chords shown since `from`. */
  function replayChordsSince(from: number, now: number) {
    const keep = recentChords.filter(
      (_, i) => i + 1 >= recentChords.length || recentChords[i + 1].t > from,
    );
    chordTime = 0;
    cadence.fill(0);
    tonicTime.fill(0);
    fitTime.fill(0);
    domTime.fill(0);
    shownChord = null;
    for (let i = 0; i < keep.length; i++) {
      setChord(keep[i].chord);
      const t0 = Math.max(from, keep[i].t);
      const t1 = i + 1 < keep.length ? keep[i + 1].t : now;
      addChordTime(Math.max(0, t1 - t0), 1);
    }
  }

  function push(frame: ChromaFrame): KeyEstimate | null {
    const dt = lastT === null ? 0 : Math.min(opts.maxFrameGap, Math.max(0, frame.t - lastT));
    lastT = frame.t;
    if (dt > 0) {
      const decay = Math.pow(0.5, dt / opts.halfLife);
      const fast = Math.pow(0.5, dt / opts.shortHalfLife);
      for (let pc = 0; pc < 12; pc++) {
        hist[pc] *= decay;
        recent[pc] *= fast;
      }
    }
    let sum = 0;
    for (let pc = 0; pc < 12; pc++) sum += frame.chroma[pc];
    if (sum <= 0 || frame.energy < SILENCE_ENERGY) return null;
    firstSoundT ??= frame.t;
    for (let pc = 0; pc < 12; pc++) {
      hist[pc] += frame.chroma[pc] / sum;
      recent[pc] += frame.chroma[pc] / sum;
    }
    addChordTime(dt, Math.pow(0.5, dt / opts.chordHalfLife));
    evidence += dt;
    if (evidence < opts.minEvidence) return null;

    correlateInto(hist, score);
    if (currentIdx < 0) {
      age = 0;
      return adopt(choose(score), firstSoundT);
    }

    // A new song: the recent window does not fit the current key (nor its relative).
    correlateInto(recent, recentScore);
    let recentBest = 0;
    for (let k = 1; k < 24; k++) if (recentScore[k] > recentScore[recentBest]) recentBest = k;
    const fit = Math.max(recentScore[currentIdx], recentScore[relativeIndex(currentIdx)]);
    if (fit < opts.misfitBelow && recentScore[recentBest] - fit >= opts.misfitLead) {
      if (misfit === 0) misfitStart = frame.t;
      misfit += dt;
      if (misfit >= opts.misfitHold) {
        // Re-estimate from the recent window only: the old song's notes and chords are dropped.
        const from = misfitStart - opts.shortHalfLife;
        hist.set(recent);
        replayChordsSince(from, frame.t);
        correlateInto(hist, score);
        age = 0;
        const next = choose(score);
        if (next === currentIdx) {
          misfit = 0;
          return null;
        }
        return adopt(next, Math.max(currentSince, from));
      }
    } else misfit = Math.max(0, misfit - dt);

    const best = choose(score);
    // The relative major/minor follows the chord evidence without the switching hold.
    // A major needs a second cadence before it turns into its relative minor.
    tenure += dt;
    if (best === relativeIndex(currentIdx)) {
      // a key just adopted is not turned into its relative on the next frame
      if (tenure < opts.switchHold) return null;
      const evidence =
        best >= 12
          ? minorEvidence(best, false) && cadence[best] >= 2 + cadence[currentIdx]
          : !minorEvidence(currentIdx, true);
      return evidence ? adopt(best, frame.t) : null;
    }
    const challenged =
      best !== currentIdx &&
      strength(score, best) - strength(score, currentIdx) >= opts.switchMargin;
    // the key only settles while nothing challenges it
    if (!challenged) age += dt;
    // a provisional key gives way at once to a minor key that has just been cadenced into
    const cadenced = best >= 12 && cadence[best] >= 0.75 ? opts.cadenceHold : opts.switchHold;
    const hold = age >= opts.settleAfter ? opts.settledHold : cadenced;
    // the lead is counted per relative pair, so a challenger that wavers between A♭ major and
    // F minor still accumulates
    const pair = best < 12 ? best : relativeIndex(best);
    for (let k = 0; k < 12; k++) {
      if (!(challenged && k === pair)) held[k] = Math.max(0, held[k] - dt);
    }
    if (challenged) {
      if (held[pair] === 0) leadStart[pair] = frame.t;
      held[pair] += dt;
      if (held[pair] >= hold) {
        // a key that won a settled contest is settled itself
        age = hold === opts.settledHold ? opts.settleAfter : 0;
        return adopt(best, leadStart[pair]);
      }
    }
    return null;
  }

  function observeChord(t: number, chord: Chord | null) {
    setChord(chord);
    recentChords.push({ t, chord });
    while (recentChords.length > 2 && recentChords[1].t < t - 15) recentChords.shift();
  }

  return {
    push,
    observeChord,
    current: () => (currentIdx < 0 ? null : estimate()),
    since: () => (currentIdx < 0 ? null : currentSince),
    blues: () =>
      currentIdx >= 0 &&
      currentIdx < 12 &&
      domTime[(currentIdx + 5) % 12] >= opts.bluesIV7 &&
      blueness() >= opts.bluesNotes,
    scores: () => score.slice(),
    reset() {
      hist.fill(0);
      recent.fill(0);
      score.fill(0);
      recentScore.fill(0);
      cadence.fill(0);
      tonicTime.fill(0);
      fitTime.fill(0);
      shownFits.fill(0);
      domTime.fill(0);
      held.fill(0);
      recentChords.length = 0;
      chordTime = 0;
      lastT = null;
      evidence = 0;
      firstSoundT = null;
      currentIdx = -1;
      currentSince = 0;
      age = 0;
      misfit = 0;
      shownChord = null;
    },
  };
}
