/**
 * The chroma pipeline: hops of raw samples in, `ChromaFrame`s out.
 * Pure and node-safe; used by the DSP worker (live mic) and by
 * `analyseSamples` (files, tests), so both paths are identical.
 *
 * Per hop:
 *   slide FRAME_SIZE window → RMS of the newest hop → energy gate (adaptive: noise floor
 *   + sensitivity margin, or a fixed `gateDb`)
 *   → short Hann FFT of the newest hop → spectral-flux onset (+ hold)
 *   → long Hann FFT of the window → peaks (parabolic interpolation)
 *   → bass (lowest significant peak 30–260 Hz)
 *   → [room: drift de-emphasis] → HPCP chroma → [room: 2-frame average]
 *   → L1 normalise (zeros when gated)
 */
import { DEFAULT_A4, FRAME_SIZE, HOP_SIZE } from '@/core/constants';
import type { ChromaFrame, Instrument, JamMode, PitchClass } from '@/core/types';
import { detectBass } from './bass';
import { computeChroma } from './chroma';
import { createRealFFT, isPowerOfTwo, type RealFFT } from './fft';
import {
  createAdaptiveGate,
  createEnergyGate,
  createOnsetDetector,
  dbToEnergy,
  rmsDb,
  type AdaptiveGate,
} from './gate';
import { findPeaks } from './peaks';
import { INSTRUMENT_PROFILES } from './profiles';
import { createRoomProcessor } from './room';
import { isMainsHum, tonalEnergyRatio } from './tonality';
import { amplitudeScale, hann } from './window';

export interface PipelineConfig {
  sampleRate: number;
  a4: number;
  instrument: Instrument;
  mode: JamMode;
  /** Analysis window (power of two). Default FRAME_SIZE. */
  frameSize: number;
  /** Hop (power of two, ≤ frameSize). Default HOP_SIZE. */
  hopSize: number;
  /**
   * Fixed energy-gate threshold in dBFS. Unset (default) = adaptive gate that follows the
   * measured noise floor (see `createAdaptiveGate`).
   */
  gateDb?: number;
  /** 0..1, adaptive gate only: opening margin above the noise floor 14 dB (0) … 4 dB (1). Default 0.5. */
  sensitivity: number;
}

/** Live input health, for a level meter and a "can't hear you" hint. */
export interface InputStatus {
  /** RMS of the newest hop in dBFS (−Infinity for digital silence). */
  levelDb: number;
  /** Noise-floor estimate in dBFS (the fixed gate reports its threshold − 10 dB). */
  noiseFloorDb: number;
  /** Current gate opening threshold in dBFS. */
  gateDb: number;
  /** Nothing reached the gate during the last ~3 s: too quiet to analyse (or not playing). */
  tooQuiet: boolean;
  /** A sample reached ±0.99 full scale during the last ~1 s. */
  clipping: boolean;
}

export type PipelineConfigInput = Pick<PipelineConfig, 'sampleRate'> &
  Partial<Omit<PipelineConfig, 'sampleRate'>>;

export interface ChromaPipeline {
  readonly config: Readonly<PipelineConfig>;
  /**
   * Push a block of mono samples whose first sample is at time `t` (seconds,
   * AudioContext time for live input). Returns a frame each time a full hop
   * has accumulated, else null. Blocks of exactly `hopSize` give one frame per
   * call; if a block completes several hops, all are analysed and the last
   * frame is returned.
   *
   * `frame.t` is the time of the first sample of the newest hop; the frame
   * covers [t + hop/sr - frame/sr, t + hop/sr].
   */
  process(samples: Float32Array, t: number): ChromaFrame | null;
  /** Level, noise floor, gate and clipping after the latest hop. */
  status(): InputStatus;
  /** Live update (a4, instrument, mode, gateDb, sensitivity). Size/rate changes reset state. */
  configure(patch: Partial<PipelineConfig>): void;
  reset(): void;
}

const PEAK_MIN_HZ = 30;
const PEAK_MAX_HZ = 5000;
const BASS_MIN_HZ = 30;
const BASS_MAX_HZ = 260;

export function resolveConfig(input: PipelineConfigInput): PipelineConfig {
  const cfg: PipelineConfig = {
    a4: DEFAULT_A4,
    instrument: 'piano',
    mode: 'solo',
    frameSize: FRAME_SIZE,
    hopSize: HOP_SIZE,
    sensitivity: 0.5,
    ...input,
  };
  if (cfg.gateDb === undefined) delete cfg.gateDb;
  if (!(cfg.sampleRate > 0)) throw new Error(`invalid sampleRate ${cfg.sampleRate}`);
  if (!isPowerOfTwo(cfg.frameSize) || !isPowerOfTwo(cfg.hopSize) || cfg.hopSize > cfg.frameSize) {
    throw new Error(`frameSize/hopSize must be powers of two with hop ≤ frame`);
  }
  return cfg;
}

export function createChromaPipeline(input: PipelineConfigInput): ChromaPipeline {
  let cfg = resolveConfig(input);

  // Size-dependent state, rebuilt by `build()`.
  let longFft: RealFFT;
  let shortFft: RealFFT;
  let longWin: Float32Array;
  let shortWin: Float32Array;
  let longScale = 0;
  let shortScale = 0;
  let windowBuf: Float32Array; // last frameSize samples, oldest first
  let longIn: Float32Array;
  let longMag: Float32Array;
  let hopBuf: Float32Array; // accumulating hop
  let shortIn: Float32Array;
  let shortMag: Float32Array;
  let pending = 0;

  // Behavioural state, rebuilt by `build()` and `reset()`.
  let gate = makeGate();
  let onset = makeOnset();
  let room = createRoomProcessor();
  let lastChroma = new Float32Array(12);
  let lastBass: PitchClass | null = null;
  let energyOut = 0;

  function makeGate(): AdaptiveGate {
    if (cfg.gateDb !== undefined) {
      const fixed = createEnergyGate({ openDb: cfg.gateDb });
      const openDb = cfg.gateDb;
      return {
        ...fixed,
        floorDb: () => openDb - 10,
        thresholdDb: () => openDb,
        setSensitivity: () => undefined,
      };
    }
    return createAdaptiveGate({
      hopSec: cfg.hopSize / cfg.sampleRate,
      sensitivity: cfg.sensitivity,
    });
  }

  // Input status (meter / hints).
  let levelDb = -Infinity;
  let lastAudibleT = -Infinity;
  let lastClipT = -Infinity;
  let nowT = 0;

  function makeOnset() {
    const profile = INSTRUMENT_PROFILES[cfg.instrument];
    return createOnsetDetector({
      sampleRate: cfg.sampleRate,
      fftSize: cfg.hopSize,
      threshold: profile.onsetThreshold,
      holdMs: profile.onsetHoldMs,
    });
  }

  function resetState() {
    gate = makeGate();
    levelDb = -Infinity;
    lastAudibleT = -Infinity;
    lastClipT = -Infinity;
    onset = makeOnset();
    room = createRoomProcessor();
    lastChroma = new Float32Array(12);
    lastBass = null;
    energyOut = 0;
  }

  function build() {
    longFft = createRealFFT(cfg.frameSize);
    shortFft = createRealFFT(cfg.hopSize);
    longWin = hann(cfg.frameSize);
    shortWin = hann(cfg.hopSize);
    longScale = amplitudeScale(longWin);
    shortScale = amplitudeScale(shortWin);
    windowBuf = new Float32Array(cfg.frameSize);
    longIn = new Float32Array(cfg.frameSize);
    longMag = new Float32Array(longFft.bins);
    hopBuf = new Float32Array(cfg.hopSize);
    shortIn = new Float32Array(cfg.hopSize);
    shortMag = new Float32Array(shortFft.bins);
    pending = 0;
    resetState();
  }
  build();

  function analyseHop(t: number): ChromaFrame {
    const { frameSize, hopSize, sampleRate, a4 } = cfg;
    const profile = INSTRUMENT_PROFILES[cfg.instrument];

    windowBuf.copyWithin(0, hopSize);
    windowBuf.set(hopBuf, frameSize - hopSize);

    const db = rmsDb(hopBuf);
    const open = gate.update(db);
    levelDb = db;
    nowT = t;
    if (open) lastAudibleT = t;
    for (let i = 0; i < hopSize; i++) {
      if (hopBuf[i] >= 0.99 || hopBuf[i] <= -0.99) {
        lastClipT = t;
        break;
      }
    }
    const release = Math.exp(-hopSize / sampleRate / profile.energyReleaseSec);
    energyOut = Math.max(dbToEnergy(db), energyOut * release);

    for (let i = 0; i < hopSize; i++) shortIn[i] = hopBuf[i] * shortWin[i];
    shortFft.magnitudes(shortIn, shortMag);
    for (let k = 0; k < shortMag.length; k++) shortMag[k] *= shortScale;
    const on = onset.update(shortMag, t, open);

    if (!open) {
      room.reset();
      lastChroma = new Float32Array(12);
      lastBass = null;
      return {
        t,
        chroma: new Float32Array(12),
        energy: energyOut,
        bass: null,
        onset: false,
        exact: false,
      };
    }

    for (let i = 0; i < frameSize; i++) longIn[i] = windowBuf[i] * longWin[i];
    longFft.magnitudes(longIn, longMag);
    for (let k = 0; k < longMag.length; k++) longMag[k] *= longScale;

    const peaks = findPeaks(longMag, {
      sampleRate,
      fftSize: frameSize,
      minHz: PEAK_MIN_HZ,
      maxHz: PEAK_MAX_HZ,
      minProminenceDb: profile.peakProminenceDb,
    });
    // Loud broadband room noise can open an energy gate, especially during startup or
    // after a fan switches on. Require actual tonal energy before normalising its peaks.
    if (tonalEnergyRatio(longMag, peaks, sampleRate, frameSize) < 0.55 || isMainsHum(peaks)) {
      room.reset();
      lastChroma = new Float32Array(12);
      lastBass = null;
      return {
        t,
        // The worker transfers this buffer; keep our onset-hold state owned here.
        chroma: new Float32Array(12),
        energy: energyOut,
        bass: null,
        onset: on.onset,
        exact: false,
      };
    }
    const bassEst = detectBass(peaks, {
      a4,
      minHz: BASS_MIN_HZ,
      maxHz: BASS_MAX_HZ,
      relativeThreshold: profile.bassRelativeThreshold,
      harmonicSupport: profile.bassHarmonicSupport,
    });
    const room_ = cfg.mode === 'room';
    const chromaPeaks = room_ ? room.deemphasize(peaks) : peaks;
    let chroma = computeChroma(chromaPeaks, {
      a4,
      harmonics: profile.harmonics,
      magnitudeExponent: profile.peakExponent,
    });
    if (room_) chroma = room.average(chroma);

    let bass: PitchClass | null = bassEst ? bassEst.pc : null;
    if (on.hold) {
      // Attack transient: keep the previous (pre-attack) estimate.
      chroma = Float32Array.from(lastChroma);
      bass = lastBass;
    } else {
      lastChroma = Float32Array.from(chroma);
      lastBass = bass;
    }
    return { t, chroma, energy: energyOut, bass, onset: on.onset, exact: false };
  }

  return {
    get config() {
      return cfg;
    },
    process(samples, t) {
      let frame: ChromaFrame | null = null;
      const { hopSize, sampleRate } = cfg;
      for (let i = 0; i < samples.length;) {
        const n = Math.min(hopSize - pending, samples.length - i);
        hopBuf.set(samples.subarray(i, i + n), pending);
        pending += n;
        i += n;
        if (pending === hopSize) {
          pending = 0;
          frame = analyseHop(t + (i - hopSize) / sampleRate);
        }
      }
      return frame;
    },
    status() {
      return {
        levelDb,
        noiseFloorDb: gate.floorDb(),
        gateDb: gate.thresholdDb(),
        tooQuiet: nowT - lastAudibleT > 3,
        clipping: nowT - lastClipT < 1,
      };
    },
    configure(patch) {
      const next = resolveConfig({ ...cfg, ...patch });
      const rebuild =
        next.sampleRate !== cfg.sampleRate ||
        next.frameSize !== cfg.frameSize ||
        next.hopSize !== cfg.hopSize;
      const instrumentChanged = next.instrument !== cfg.instrument;
      const prevGateDb = cfg.gateDb;
      if ('gateDb' in patch && patch.gateDb === undefined) delete next.gateDb;
      cfg = next;
      if (rebuild) build();
      else {
        if (instrumentChanged) onset = makeOnset();
        if ('gateDb' in patch && patch.gateDb !== prevGateDb) gate = makeGate();
        else if (patch.sensitivity !== undefined) gate.setSensitivity(cfg.sensitivity);
        if (patch.mode !== undefined) room.reset();
      }
    },
    reset() {
      windowBuf.fill(0);
      pending = 0;
      resetState();
    },
  };
}
