/**
 * Slash-chord resolution from the per-frame bass pitch class.
 *
 * A mic bass note only counts once it has been the same pitch class for >= `minFrames`
 * consecutive frames. Because the chord decision is made `lag` frames late, the run may
 * extend into those look-ahead frames, so a slash chord appears together with its chord
 * instead of a couple of frames after it.
 */
import type { Chord, PitchClass } from '@/core';
import { chordTones } from './templates';

export const MIN_BASS_FRAMES = 3;
const RING = 64;

/** Attach (or strip) the slash bass. Bass must be a chord tone other than the root. */
export function applyBass(
  chord: Chord | null,
  bass: PitchClass | null,
  showSlash: boolean,
): Chord | null {
  if (chord === null) return null;
  const plain: Chord = { root: chord.root, quality: chord.quality };
  if (!showSlash || bass === null || bass === chord.root) return plain;
  if (!chordTones(chord.root, chord.quality).includes(bass)) return plain;
  return { ...plain, bass };
}

export interface BassResolver {
  /** Record the bass of the newest frame. */
  push(bass: PitchClass | null): void;
  /**
   * Stable bass for the frame `delay` frames before the newest one: its bass value, if the
   * run of identical values containing it (bounded by the newest frame) is >= minFrames.
   */
  stableAt(delay: number): PitchClass | null;
  reset(): void;
}

export function createBassResolver(minFrames = MIN_BASS_FRAMES): BassResolver {
  const ring = new Int8Array(RING).fill(-1);
  let t = -1;

  return {
    push(bass) {
      t++;
      ring[t % RING] = bass === null ? -1 : bass;
    },
    stableAt(delay) {
      const k = t - delay;
      if (k < 0 || delay >= RING) return null;
      const v = ring[k % RING];
      if (v < 0) return null;
      let run = 1;
      for (let i = k - 1; i >= 0 && i > t - RING && run < minFrames; i--) {
        if (ring[i % RING] !== v) break;
        run++;
      }
      for (let i = k + 1; i <= t && run < minFrames; i++) {
        if (ring[i % RING] !== v) break;
        run++;
      }
      return run >= minFrames ? (v as PitchClass) : null;
    },
    reset() {
      ring.fill(-1);
      t = -1;
    },
  };
}
