/**
 * Offline analysis of audio files through the same pipeline as the live mic.
 *
 * `analyseSamples` is pure and node-safe (used by tests). `analyseFile` adds
 * browser decoding (`decodeAudioData` on an OfflineAudioContext, so no user
 * gesture is needed) and yields to the event loop between chunks so a long
 * file does not freeze the UI.
 */
import type { ChromaFrame } from '@/core/types';
import { createChromaPipeline, type PipelineConfig } from './pipeline';

export type AnalyseOptions = Partial<Omit<PipelineConfig, 'sampleRate'>> & {
  /** Time offset added to every frame. Default 0. */
  startTime?: number;
};

export interface AnalyseFileOptions extends AnalyseOptions {
  /** Rate the file is decoded (resampled) to. Default 44100. */
  decodeSampleRate?: number;
  /** Called with 0..1 while analysing. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Frames analysed between event-loop yields. Default 256 (~6 s of audio). */
  chunkFrames?: number;
}

/** Mono samples → one ChromaFrame per hop. Synchronous. */
export function analyseSamples(
  samples: Float32Array,
  sampleRate: number,
  opts: AnalyseOptions = {},
): ChromaFrame[] {
  const { startTime = 0, ...cfg } = opts;
  const pipeline = createChromaPipeline({ ...cfg, sampleRate });
  const hop = pipeline.config.hopSize;
  const frames: ChromaFrame[] = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    const f = pipeline.process(samples.subarray(i, i + hop), startTime + i / sampleRate);
    if (f) frames.push(f);
  }
  return frames;
}

/** Average all channels of an AudioBuffer-like object into one Float32Array. */
export function mixToMono(buffer: {
  numberOfChannels: number;
  length: number;
  getChannelData(ch: number): Float32Array;
}): Float32Array {
  const { numberOfChannels: ch, length } = buffer;
  if (ch === 1) return Float32Array.from(buffer.getChannelData(0));
  const out = new Float32Array(length);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += data[i] / ch;
  }
  return out;
}

/** Decode a compressed or PCM file (mp3, m4a, wav, …) to an AudioBuffer. Browser only. */
export async function decodeAudio(
  file: Blob | ArrayBuffer,
  sampleRate = 44100,
): Promise<AudioBuffer> {
  const Offline: typeof OfflineAudioContext | undefined =
    globalThis.OfflineAudioContext ??
    (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!Offline) throw new Error('Audio decoding is not supported in this browser.');
  const data = file instanceof ArrayBuffer ? file.slice(0) : await file.arrayBuffer();
  const ctx = new Offline(1, 1, sampleRate);
  // Callback form: older Safari does not return a promise from decodeAudioData.
  return new Promise<AudioBuffer>((resolve, reject) => {
    const p = ctx.decodeAudioData(
      data,
      (buf) => resolve(buf),
      (err) => reject(err ?? new Error('Could not decode audio file.')),
    );
    if (p && typeof p.catch === 'function') p.catch(reject);
  });
}

const yieldToEventLoop = () => new Promise<void>((r) => setTimeout(r, 0));

/** Decode then analyse a file. Browser only (needs decodeAudioData). */
export async function analyseFile(
  file: Blob | ArrayBuffer,
  opts: AnalyseFileOptions = {},
): Promise<ChromaFrame[]> {
  const {
    decodeSampleRate = 44100,
    onProgress,
    signal,
    chunkFrames = 256,
    startTime = 0,
    ...cfg
  } = opts;
  const buffer = await decodeAudio(file, decodeSampleRate);
  const samples = mixToMono(buffer);
  const sr = buffer.sampleRate;
  const pipeline = createChromaPipeline({ ...cfg, sampleRate: sr });
  const hop = pipeline.config.hopSize;
  const frames: ChromaFrame[] = [];
  let count = 0;
  for (let i = 0; i + hop <= samples.length; i += hop) {
    if (signal?.aborted) throw new DOMException('Analysis aborted', 'AbortError');
    const f = pipeline.process(samples.subarray(i, i + hop), startTime + i / sr);
    if (f) frames.push(f);
    if (++count % chunkFrames === 0) {
      onProgress?.(i / samples.length);
      await yieldToEventLoop();
    }
  }
  onProgress?.(1);
  return frames;
}
