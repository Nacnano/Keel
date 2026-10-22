/**
 * Room-mode tweaks (jamming along to a song / singing while playing).
 * Best effort, pure, node-safe.
 *
 * 1. Unstable-peak de-emphasis in the vocal/lead band (default 250–1000 Hz).
 *    A peak is "unstable" in a frame when it is
 *    - smeared: its log-parabola curvature is flatter than `smearCurvature`
 *      (a stationary Hann-windowed sinusoid gives -1.39..-1.61; a 5–6 Hz
 *      vibrato over a 171 ms window gives roughly -0.1..-0.9), or
 *    - drifting: it moved more than `driftCents` (but less than `matchCents`)
 *      from the nearest in-band peak of the previous frame.
 *    Peaks that stay unstable for `minFrames` consecutive frames (tracked per
 *    semitone slot, ±1 semitone) are attenuated. The persistence requirement
 *    keeps note attacks (which briefly flatten every peak because the window
 *    is only partly filled) from being attenuated.
 * 2. Averaging: the output chroma is the mean of the last `averageFrames`
 *    frames, trading ~1 hop of latency for stability on dense mixes.
 *
 * Known limits: a singer holding a perfectly steady note looks like an
 * instrument partial and is not attenuated; a lead instrument with vibrato
 * (violin, sax, bent guitar strings) is attenuated like a voice; vocals
 * outside 250–1000 Hz are untouched; detection kicks in only after
 * `minFrames` hops (~130 ms at 48 kHz).
 */
import { hzToMidi } from './chroma';
import type { Peak } from './peaks';

export interface RoomOptions {
  bandHz?: [number, number];
  /** Curvature above (flatter than) this counts as smeared. Default -1.0. */
  smearCurvature?: number;
  /** Frame-to-frame movement above which a sustained peak counts as drifting. */
  driftCents?: number;
  /** Max distance to match a peak with one in the previous frame. */
  matchCents?: number;
  /** Consecutive unstable frames before attenuation. Default 3. */
  minFrames?: number;
  /** Magnitude multiplier for unstable peaks. Default 0.2 (-14 dB). */
  attenuation?: number;
  /** Frames averaged into the output chroma. Default 2. */
  averageFrames?: number;
}

export interface RoomProcessor {
  /** Returns a new peak list with unstable in-band peaks attenuated. */
  deemphasize(peaks: readonly Peak[]): Peak[];
  /** Average with the previous frames. Input is L1-normalised or zeros. */
  average(chroma: Float32Array): Float32Array;
  reset(): void;
}

const SLOTS = 128;

export function createRoomProcessor(opts: RoomOptions = {}): RoomProcessor {
  const {
    bandHz = [200, 4000],
    smearCurvature = -1.0,
    driftCents = 12,
    matchCents = 80,
    minFrames = 2,
    attenuation = 0.05,
    averageFrames = 2,
  } = opts;
  let prevBand: number[] = [];
  let prevCounts = new Uint8Array(SLOTS);
  const history: Float32Array[] = [];

  return {
    deemphasize(peaks) {
      const band: number[] = [];
      const counts = new Uint8Array(SLOTS);
      const out = peaks.map((p) => {
        if (p.freq < bandHz[0] || p.freq > bandHz[1]) return p;
        band.push(p.freq);
        let nearest = Infinity;
        for (const f of prevBand) {
          const c = Math.abs(1200 * Math.log2(p.freq / f));
          if (c < nearest) nearest = c;
        }
        const drifting = nearest <= matchCents && nearest > driftCents;
        const smeared = p.curvature !== undefined && p.curvature > smearCurvature;
        if (!drifting && !smeared) return p;
        const slot = Math.max(1, Math.min(SLOTS - 2, Math.round(hzToMidi(p.freq))));
        const run = 1 + Math.max(prevCounts[slot - 1], prevCounts[slot], prevCounts[slot + 1]);
        counts[slot] = Math.max(counts[slot], Math.min(255, run));
        return run >= minFrames ? { ...p, mag: p.mag * attenuation } : p;
      });
      prevBand = band;
      prevCounts = counts;
      return out;
    },
    average(chroma) {
      let silent = true;
      for (let i = 0; i < 12; i++) if (chroma[i] > 0) silent = false;
      if (silent) {
        history.length = 0;
        return chroma;
      }
      history.push(Float32Array.from(chroma));
      while (history.length > averageFrames) history.shift();
      const out = new Float32Array(12);
      for (const h of history) for (let i = 0; i < 12; i++) out[i] += h[i];
      let s = 0;
      for (let i = 0; i < 12; i++) s += out[i];
      if (s > 0) for (let i = 0; i < 12; i++) out[i] /= s;
      return out;
    },
    reset() {
      prevBand = [];
      prevCounts = new Uint8Array(SLOTS);
      history.length = 0;
    },
  };
}
