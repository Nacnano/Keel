/**
 * DSP worker: hops in, ChromaFrames out. All maths lives in `../pipeline.ts`
 * (shared with offline file analysis); this file is only the message loop.
 *
 * In:  { type: 'config', sampleRate, a4, instrument, mode, gateDb? }
 *      { type: 'hop', samples: Float32Array, t }
 *      { type: 'reset' }
 * Out: { type: 'frame', frame }   (chroma buffer transferred)
 *      { type: 'stats', meanMs, maxMs, frames, load }   every STATS_EVERY hops
 *      { type: 'error', message }
 */
import type { FromDspWorker, ToDspWorker } from '../messages';
import { createChromaPipeline, type ChromaPipeline } from '../pipeline';

interface WorkerScope {
  onmessage: ((e: MessageEvent<ToDspWorker>) => void) | null;
  postMessage(msg: FromDspWorker, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;
const STATS_EVERY = 64;

let pipeline: ChromaPipeline | null = null;
let sumMs = 0;
let maxMs = 0;
let count = 0;

function post(msg: FromDspWorker, transfer?: Transferable[]) {
  scope.postMessage(msg, transfer);
}

scope.onmessage = (e) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'config': {
        const cfg = {
          sampleRate: msg.sampleRate,
          a4: msg.a4,
          instrument: msg.instrument,
          mode: msg.mode,
          ...(msg.gateDb !== undefined ? { gateDb: msg.gateDb } : {}),
        };
        if (pipeline) pipeline.configure(cfg);
        else pipeline = createChromaPipeline(cfg);
        break;
      }
      case 'hop': {
        if (!pipeline) return; // not configured yet: drop
        const t0 = performance.now();
        const frame = pipeline.process(msg.samples, msg.t);
        const dt = performance.now() - t0;
        if (frame) post({ type: 'frame', frame }, [frame.chroma.buffer]);
        sumMs += dt;
        maxMs = Math.max(maxMs, dt);
        if (++count >= STATS_EVERY) {
          const meanMs = sumMs / count;
          const { hopSize, sampleRate } = pipeline.config;
          const load = meanMs / ((1000 * hopSize) / sampleRate);
          post({ type: 'stats', meanMs, maxMs, frames: count, load });
          sumMs = 0;
          maxMs = 0;
          count = 0;
        }
        break;
      }
      case 'reset':
        pipeline?.reset();
        break;
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
