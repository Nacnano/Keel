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
