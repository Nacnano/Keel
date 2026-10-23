/** Message protocol between main thread, capture worklet and DSP worker. */
import type { ChromaFrame, Instrument, JamMode } from '@/core/types';

/** Name the capture worklet registers under (duplicated in the worklet, which has no imports). */
export const CAPTURE_PROCESSOR_NAME = 'keel-capture';

/** Worklet → main → worker: one hop of mono samples starting at AudioContext time `t`. */
export interface HopMessage {
  type: 'hop';
  samples: Float32Array;
  t: number;
}

/** Main → worker. Sent once after spawn and again on every settings change. */
export interface DspConfigMessage {
  type: 'config';
  sampleRate: number;
  a4: number;
  instrument: Instrument;
  mode: JamMode;
  /** Fixed gate in dBFS; absent = adaptive gate (noise floor + sensitivity margin). */
  gateDb?: number;
  /** 0..1, adaptive gate sensitivity (default 0.5). */
  sensitivity?: number;
}

export type ToDspWorker = DspConfigMessage | HopMessage | { type: 'reset' };

/** Live input health (see `InputStatus` in pipeline.ts). */
export interface InputStatusFields {
  /** RMS of the newest hop in dBFS (−Infinity for digital silence). */
  levelDb: number;
  /** Noise-floor estimate in dBFS. */
  noiseFloorDb: number;
  /** Current gate opening threshold in dBFS. */
  gateDb: number;
  /** Nothing reached the gate in the last ~3 s ("can't hear you" / not playing). */
  tooQuiet: boolean;
  /** A sample hit ±0.99 full scale in the last ~1 s. */
  clipping: boolean;
}

export interface DspStats extends InputStatusFields {
  /** Mean / max processing time per hop over the last `frames` hops (ms). */
  meanMs: number;
  maxMs: number;
  frames: number;
  /** meanMs relative to the hop duration (0..1, ≈ worker CPU share). */
  load: number;
}

export type FromDspWorker =
  | { type: 'frame'; frame: ChromaFrame }
  | ({ type: 'stats' } & DspStats)
  | ({ type: 'status' } & InputStatusFields)
  | { type: 'error'; message: string };

/** Main → worklet. */
export type ToCaptureWorklet = { type: 'stop' };
