/**
 * Offline song analysis: audio file → key + chord events, through the same chroma
 * pipeline and analysis engine as the live mic (DESIGN.md §3.5).
 *
 *   decodeAudio ─► mixToMono ─► createChromaPipeline (hop by hop) ─► createAnalysisEngine
 *               ─► chord / key events, `t` in seconds from the start of the file
 *
 * `analyseSamplesToEvents` is node-safe (tests use `@/core/testing/synth`). It works in
 * chunks and awaits a macrotask between them so the UI stays responsive on a long song.
 * Only decoding (`decodeFileToMono`, `analyseFileToEvents`) needs a browser.
 *
 * Two offline-only details, both documented in src/audio/README.md:
 * - Event times are moved from the frame's newest hop to the centre of its analysis window
 *   (−(frame/2 − hop)/sr, ≈ 46 ms at 44.1 kHz), which is where a chord change registers.
 *   The live path does not need this because the jam screen only shows "now".
 * - After the last sample the pipeline is fed silent hops until the window is empty and the
 *   fixed-lag smoother has decided every frame, so the final chord (and its end) is reported.
 * - With the whole song known, chords shorter than `minChordSec` (default 0.2 s: the one-off
 *   transition labels such as `C/G` between C and G) are folded into the chord before them.
 */
import { createAnalysisEngine, lagForStability, RELEASE_HOLD_SEC, sameChord } from '@/analysis';
import { DEFAULT_ANALYSIS_CONFIG } from '@/core/constants';
import type { AnalysisConfig, AnalysisEvent, KeyEstimate } from '@/core/types';
import { decodeAudio, mixToMono } from './fileInput';
import { createChromaPipeline } from './pipeline';

export type OfflineStage = 'decoding' | 'analysing';

export interface OfflineAnalysisOptions extends Partial<AnalysisConfig> {
  /** Fraction 0..1 of the current stage. Decoding reports only 0 and 1. */
  onProgress?: (fraction: number, stage: OfflineStage) => void;
  signal?: AbortSignal;
  /** Hops analysed between event-loop yields. Default 256 (≈ 12 s of audio at 44.1 kHz). */
  chunkFrames?: number;
  /** Energy gate in dBFS (pipeline default −50). */
  gateDb?: number;
  /** Chords (and no-chord gaps) shorter than this are folded into the previous chord. Default 0.2. */
  minChordSec?: number;
}

export interface OfflineFileOptions extends OfflineAnalysisOptions {
  /** Rate the file is decoded (resampled) to. Default 44100. */
  decodeSampleRate?: number;
}

export interface OfflineAnalysisResult {
  /** `chord` and `key` events in time order. `t` is seconds from the start of the audio. */
  events: AnalysisEvent[];
  durationSec: number;
  sampleRate: number;
}

export interface DecodedAudio {
  samples: Float32Array;
  sampleRate: number;
  durationSec: number;
}

export const DEFAULT_MIN_CHORD_SEC = 0.2;

type ChordEvent = Extract<AnalysisEvent, { type: 'chord' }>;

/**
 * Drop chord events that last less than `minSec` (until the next chord event, the last one
 * until `durationSec`), then merge the neighbours that became equal. Key events are kept.
 */
export function dropShortChords(
  events: readonly AnalysisEvent[],
  minSec: number,
  durationSec: number,
): AnalysisEvent[] {
  if (!(minSec > 0)) return [...events];
  const chords = events.filter((e): e is ChordEvent => e.type === 'chord');
  const keep = new Set<AnalysisEvent>();
  let last: ChordEvent | null = null;
  chords.forEach((e, i) => {
    const end = i + 1 < chords.length ? chords[i + 1].t : Math.max(durationSec, e.t);
    if (end - e.t < minSec && i + 1 < chords.length) return;
    if (last && sameChord(last.chord, e.chord)) return;
    keep.add(e);
    last = e;
  });
  return events.filter((e) => e.type !== 'chord' || keep.has(e));
}

/**
 * Headline key of a whole file: the key that sounds for the most time, not the first one
 * detected (a song often opens on the relative minor or the dominant). The first key also
 * covers the seconds before it was found. Of equal totals the earlier key wins. Returns the
 * last estimate of the winning key, so its confidence reflects the most evidence.
 */
export function headlineKey(
  events: readonly AnalysisEvent[],
  durationSec: number,
): KeyEstimate | null {
  const keys = events
    .filter((e): e is Extract<AnalysisEvent, { type: 'key' }> => e.type === 'key')
    .sort((a, b) => a.t - b.t);
  const totals = new Map<string, { seconds: number; first: number; key: KeyEstimate }>();
  keys.forEach((e, i) => {
    const start = i === 0 ? 0 : e.t;
    const end = i + 1 < keys.length ? keys[i + 1].t : Math.max(durationSec, e.t);
    const id = `${e.key.tonic}:${e.key.mode}`;
    const entry = totals.get(id) ?? { seconds: 0, first: i, key: e.key };
    entry.seconds += Math.max(0, end - start);
    entry.key = e.key;
    totals.set(id, entry);
  });
  let best: { seconds: number; first: number; key: KeyEstimate } | null = null;
  for (const entry of totals.values()) {
    if (
      !best ||
      entry.seconds > best.seconds ||
      (entry.seconds === best.seconds && entry.first < best.first)
    ) {
      best = entry;
    }
  }
  return best?.key ?? null;
}

const yieldToEventLoop = () => new Promise<void>((r) => setTimeout(r, 0));

const abortError = () => new DOMException('Analysis aborted', 'AbortError');

/** Decode any browser-supported audio file to mono samples. Browser only. */
export async function decodeFileToMono(
  file: Blob | ArrayBuffer,
  sampleRate = 44100,
): Promise<DecodedAudio> {
  const buffer = await decodeAudio(file, sampleRate);
  const samples = mixToMono(buffer);
  return {
    samples,
    sampleRate: buffer.sampleRate,
    durationSec: samples.length / buffer.sampleRate,
  };
}

/** Mono samples → chord and key events. Pure apart from the event-loop yields. */
export async function analyseSamplesToEvents(
  samples: Float32Array,
  sampleRate: number,
  opts: OfflineAnalysisOptions = {},
): Promise<OfflineAnalysisResult> {
  const {
    onProgress,
    signal,
    chunkFrames = 256,
    gateDb,
    minChordSec = DEFAULT_MIN_CHORD_SEC,
    ...config
  } = opts;
  const cfg: AnalysisConfig = { ...DEFAULT_ANALYSIS_CONFIG, ...config };
  const pipeline = createChromaPipeline({
    sampleRate,
    a4: cfg.a4,
    instrument: cfg.instrument,
    mode: cfg.mode,
    ...(gateDb === undefined ? {} : { gateDb }),
  });
  const { hopSize, frameSize } = pipeline.config;
  const durationSec = samples.length / sampleRate;
  const shift = (frameSize / 2 - hopSize) / sampleRate;
  const clampT = (t: number) => Math.min(durationSec, Math.max(0, t - shift));

  const engine = createAnalysisEngine(cfg);
  const events: AnalysisEvent[] = [];
  const off = engine.subscribe((e) => {
    if (e.type === 'chord' || e.type === 'key') events.push({ ...e, t: clampT(e.t) });
  });

  try {
    onProgress?.(0, 'analysing');
    const silent = new Float32Array(hopSize);
    // Enough silent hops to empty the window, outlast the engine's release hold and let the
    // smoother decide every frame.
    const tailHops =
      Math.ceil(frameSize / hopSize) +
      Math.ceil((RELEASE_HOLD_SEC * sampleRate) / hopSize) +
      lagForStability(cfg.stability) +
      2;
    const totalHops = Math.floor(samples.length / hopSize) + tailHops;
    for (let h = 0; h < totalHops; h++) {
      if (signal?.aborted) throw abortError();
      const i = h * hopSize;
      const hop = i + hopSize <= samples.length ? samples.subarray(i, i + hopSize) : silent;
      const frame = pipeline.process(hop, i / sampleRate);
      if (frame) engine.push(frame);
      if ((h + 1) % chunkFrames === 0) {
        onProgress?.(Math.min(1, (h + 1) / totalHops), 'analysing');
        await yieldToEventLoop();
      }
    }
    if (signal?.aborted) throw abortError();
    onProgress?.(1, 'analysing');
  } finally {
    off();
  }
  // Window-centre alignment can reorder a key event against a chord event a hop apart.
  events.sort((a, b) => a.t - b.t);
  return { events: dropShortChords(events, minChordSec, durationSec), durationSec, sampleRate };
}

/** Decode a file and analyse it. Browser only (needs `decodeAudioData`). */
export async function analyseFileToEvents(
  file: Blob | ArrayBuffer,
  opts: OfflineFileOptions = {},
): Promise<OfflineAnalysisResult> {
  const { decodeSampleRate = 44100, ...rest } = opts;
  rest.onProgress?.(0, 'decoding');
  const decoded = await decodeFileToMono(file, decodeSampleRate);
  if (rest.signal?.aborted) throw abortError();
  rest.onProgress?.(1, 'decoding');
  return analyseSamplesToEvents(decoded.samples, decoded.sampleRate, rest);
}
