/**
 * Energy gate and spectral-flux onset detector. Pure, node-safe.
 *
 * The gate decides whether a hop is "silent" (→ zero chroma). The onset
 * detector works on a short spectrum of the newest hop only (not the long
 * analysis frame), so an attack shows up in exactly one hop instead of being
 * smeared over the four hops an 8192-sample window overlaps.
 */

/** RMS of a block in dBFS (-Infinity for digital silence). */
export function rmsDb(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  if (s === 0 || x.length === 0) return -Infinity;
  return 10 * Math.log10(s / x.length);
}

/** Map dBFS to the 0..1 `energy` loudness proxy: `floorDb` → 0, 0 dBFS → 1. */
export function dbToEnergy(db: number, floorDb = -60): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db - floorDb) / -floorDb));
}

export interface EnergyGateOptions {
  /** Gate opens at or above this level. Default -50 dBFS. */
  openDb?: number;
  /** Gate closes below `openDb - hysteresisDb`. Default 4 dB. */
  hysteresisDb?: number;
}

export interface EnergyGate {
  /** Feed the level of the newest hop; returns true when sound is present. */
  update(db: number): boolean;
  isOpen(): boolean;
  reset(): void;
}

export function createEnergyGate(opts: EnergyGateOptions = {}): EnergyGate {
  const { openDb = -50, hysteresisDb = 4 } = opts;
  let open = false;
  return {
    update(db) {
      open = open ? db >= openDb - hysteresisDb : db >= openDb;
      return open;
    },
    isOpen: () => open,
    reset() {
      open = false;
    },
  };
}

export interface AdaptiveGateOptions {
  /** Hop duration in seconds (the follower rates are per second). */
  hopSec: number;
  /**
   * 0..1 (default 0.5). Maps to the margin above the noise floor at which the gate opens:
   * 0 → 14 dB (only clearly audible playing), 0.5 → 9 dB, 1 → 4 dB (almost anything).
   */
  sensitivity?: number;
  /** Clamp of the opening threshold. Default −78 / −40 dBFS. */
  minDb?: number;
  maxDb?: number;
  /** Once open, the gate stays open down to `floor + closeMarginDb`. Default 3 dB. */
  closeMarginDb?: number;
  /** Floor estimate before anything has been measured. Default −70 dBFS. */
  initialFloorDb?: number;
  /** During the first `learnSec` the floor is the plain minimum of the hop levels. Default 1 s. */
  learnSec?: number;
}

export interface AdaptiveGate extends EnergyGate {
  /** Current noise-floor estimate in dBFS. */
  floorDb(): number;
  /** Current opening threshold in dBFS. */
  thresholdDb(): number;
  setSensitivity(sensitivity: number): void;
}

/** Opening margin above the noise floor (dB) for a sensitivity 0..1. */
export function sensitivityMarginDb(sensitivity: number): number {
  const s = Number.isFinite(sensitivity) ? Math.min(1, Math.max(0, sensitivity)) : 0.5;
  return 14 - 10 * s;
}

/**
 * Energy gate that follows the measured noise floor, so a quiet mic a few metres from the
 * piano still opens it, and a noisy room does not hold it open on noise alone.
 *
 * Floor tracker (per-hop level in dBFS):
 * - first `learnSec`: collect the minimum, using a provisional `initialFloorDb` threshold;
 *   at warmup completion adopt the measured minimum (startup noise can pass temporarily);
 * - then it falls quickly towards quieter hops (30 % of the gap per hop) and rises at 1.5 dB/s
 *   while the gate is closed (the room got noisier), 0.05 dB/s while it is open, so a long
 *   stretch of continuous playing does not drag the floor up into the music.
 * Opens at clamp(floor + margin(sensitivity), minDb, maxDb); once open it stays open down to
 * floor + `closeMarginDb`, so a decaying chord is followed into the noise instead of being cut
 * 10 dB above it.
 */
export function createAdaptiveGate(opts: AdaptiveGateOptions): AdaptiveGate {
  const {
    hopSec,
    minDb = -78,
    maxDb = -40,
    closeMarginDb = 3,
    initialFloorDb = -70,
    learnSec = 1,
  } = opts;
  let margin = sensitivityMarginDb(opts.sensitivity ?? 0.5);
  let floor = initialFloorDb;
  let learned = 0;
  let learningMinimum = Infinity;
  let open = false;
  const upClosed = 1.5 * hopSec;
  const upOpen = 0.05 * hopSec;
  const threshold = () => Math.min(maxDb, Math.max(minDb, floor + margin));

  return {
    update(db) {
      const level = Number.isFinite(db) ? db : -120;
      if (learned < learnSec) {
        learningMinimum = Math.min(learningMinimum, level);
        learned += hopSec;
        // A provisional quiet-room floor lets an immediate quiet attack through. At the end
        // of warmup adopt the observed minimum so stationary room noise cannot hold us open.
        floor = learned < learnSec ? Math.min(initialFloorDb, learningMinimum) : learningMinimum;
      } else if (level < floor) {
        floor += 0.3 * (level - floor);
      } else {
        floor = Math.min(level, floor + (open ? upOpen : upClosed));
      }
      const close = Math.min(threshold(), Math.max(minDb, floor + closeMarginDb));
      open = open ? level >= close : level >= threshold();
      return open;
    },
    isOpen: () => open,
    floorDb: () => floor,
    thresholdDb: threshold,
    setSensitivity(s) {
      margin = sensitivityMarginDb(s);
    },
    reset() {
      open = false;
      floor = initialFloorDb;
      learned = 0;
      learningMinimum = Infinity;
    },
  };
}

export interface OnsetOptions {
  sampleRate: number;
  /** FFT size of the short spectrum fed to `update` (bins = size / 2 + 1). */
  fftSize: number;
  /**
   * Fire when the relative spectral flux exceeds this (0..1). Relative flux =
   * Σ max(0, ΔL) / Σ L with L = log(1 + γ |X|), so it is level-independent:
   * ≈ 1 for an attack after silence, ≈ 0 during a decaying sustain.
   */
  threshold?: number;
  /** Frames within this time after an onset are flagged `hold`. Default 40 ms. */
  holdMs?: number;
  /** No new onset within this time of the previous one. Default 100 ms. */
  refractoryMs?: number;
  /** Compression constant γ for the log magnitude. Default 100. */
  compression?: number;
  minHz?: number;
  maxHz?: number;
}

export interface OnsetResult {
  onset: boolean;
  /** true on the onset hop and for `holdMs` after it (attack transient). */
  hold: boolean;
  flux: number;
}

export interface OnsetDetector {
  /**
   * `mag`: amplitude-scaled magnitude spectrum of the newest hop.
   * `t`: hop time in seconds. `gateOpen`: onsets are suppressed while silent
   * (the reference spectrum is still updated).
   */
  update(mag: ArrayLike<number>, t: number, gateOpen: boolean): OnsetResult;
  reset(): void;
}

export function createOnsetDetector(opts: OnsetOptions): OnsetDetector {
  const {
    sampleRate,
    fftSize,
    threshold = 0.3,
    holdMs = 40,
    refractoryMs = 100,
    compression = 100,
    minHz = 30,
    maxHz = 8000,
  } = opts;
  const binHz = sampleRate / fftSize;
  const bins = fftSize / 2 + 1;
  const lo = Math.max(1, Math.floor(minHz / binHz));
  const hi = Math.min(bins - 1, Math.ceil(maxHz / binHz));
  const prev = new Float32Array(bins);
  let lastOnset = -Infinity;

  return {
    update(mag, t, gateOpen) {
      let up = 0;
      let total = 0;
      for (let k = lo; k <= hi; k++) {
        const l = Math.log1p(compression * mag[k]);
        const d = l - prev[k];
        if (d > 0) up += d;
        total += l;
        prev[k] = l;
      }
      const flux = total > 1e-9 ? up / total : 0;
      // small tolerance so a hop that lands exactly on the boundary still counts
      const eps = 1e-6;
      let onset = false;
      if (gateOpen && flux >= threshold && t - lastOnset >= refractoryMs / 1000 - eps) {
        onset = true;
        lastOnset = t;
      }
      const hold = t - lastOnset < holdMs / 1000 - eps;
      return { onset, hold, flux };
    },
    reset() {
      prev.fill(0);
      lastOnset = -Infinity;
    },
  };
}
