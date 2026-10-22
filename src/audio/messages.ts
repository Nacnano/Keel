/** Message protocol between main thread, capture worklet and DSP worker. */
import type { ChromaFrame, Instrument, JamMode } from '@/core/types';

/** Name the capture worklet registers under (duplicated in the worklet, which has no imports). */
export const CAPTURE_PROCESSOR_NAME = 'jamkey-capture';

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
  gateDb?: number;
}

export type ToDspWorker = DspConfigMessage | HopMessage | { type: 'reset' };

export interface DspStats {
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
  | { type: 'error'; message: string };

/** Main → worklet. */
export type ToCaptureWorklet = { type: 'stop' };
