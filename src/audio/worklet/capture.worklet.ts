/**
 * Capture AudioWorkletProcessor. Runs on the audio rendering thread.
 *
 * Mixes the input to mono, accumulates HOP_SIZE samples (passed in via
 * `processorOptions.hopSize`) and posts each full block to the main thread as
 * a transferable Float32Array together with the AudioContext time of its
 * first sample: `{ type: 'hop', samples, t }`.
 *
 * Self-contained on purpose (no imports): AudioWorkletGlobalScope has no
 * `self`, no fetch and no module graph guarantees across browsers.
 */

// AudioWorkletGlobalScope globals (not part of the DOM lib typings).
declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(
  name: string,
  ctor: new (options: CaptureOptions) => AudioWorkletProcessor,
): void;

interface CaptureOptions {
  processorOptions?: { hopSize?: number };
}

const PROCESSOR_NAME = 'jamkey-capture'; // keep in sync with messages.ts

class CaptureProcessor extends AudioWorkletProcessor {
  private readonly hop: number;
  private buf: Float32Array;
  private fill = 0;
  private blockStart = 0;
  private running = true;

  constructor(options: CaptureOptions) {
    super(options);
    const hop = options?.processorOptions?.hopSize;
    this.hop = typeof hop === 'number' && hop > 0 ? hop : 2048;
    this.buf = new Float32Array(this.hop);
    this.port.onmessage = (e: MessageEvent<{ type?: string }>) => {
      if (e.data?.type === 'stop') this.running = false;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    if (!this.running) return false;
    const input = inputs[0];
    // No connected input yet (or the track ended): keep the node alive.
    if (!input || input.length === 0) return true;
    const channels = input.length;
    const n = input[0].length;
    for (let i = 0; i < n; i++) {
      if (this.fill === 0) this.blockStart = currentTime + i / sampleRate;
      let s = 0;
      for (let c = 0; c < channels; c++) s += input[c][i];
      this.buf[this.fill++] = s / channels;
      if (this.fill === this.hop) {
        this.port.postMessage({ type: 'hop', samples: this.buf, t: this.blockStart }, [
          this.buf.buffer,
        ]);
        // The old buffer is detached by the transfer; 8 KB per hop is cheap.
        this.buf = new Float32Array(this.hop);
        this.fill = 0;
      }
    }
    return true;
  }
}

registerProcessor(PROCESSOR_NAME, CaptureProcessor);
