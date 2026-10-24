/**
 * Microphone input implementing the `AudioInput` contract.
 *
 * mic (getUserMedia, EC/NS/AGC off) → MediaStreamSource → capture worklet
 *   → (main thread relay) → DSP worker → ChromaFrame → onFrame listeners
 *
 * Browser quirks handled here:
 * - The AudioContext is created lazily inside `start()` and resumed before
 *   any `await`, so calling `start()` from a click/tap handler satisfies
 *   Safari's user-gesture rule.
 * - The context runs at the hardware rate (44.1 kHz or 48 kHz); we never
 *   force a sampleRate (that breaks MediaStreamSource on some browsers) and
 *   pass the actual rate to the worker.
 * - `audioWorklet` is feature-detected with a clear error (it is missing on
 *   insecure origins and on very old Safari).
 * - The worklet node is pulled through a muted gain into the destination so
 *   every browser keeps rendering it.
 */
import { clock } from '@/core/clock';
import { DEFAULT_A4, HOP_SIZE } from '@/core/constants';
import { createEmitter } from '@/core/events';
import type { AudioInput, ChromaFrame, Instrument, JamMode } from '@/core/types';
import {
  CAPTURE_PROCESSOR_NAME,
  type DspStats,
  type FromDspWorker,
  type HopMessage,
  type InputStatusFields,
  type ToDspWorker,
} from './messages';
// `?worker&url` makes Vite compile the worklet (TS → JS) as its own entry and return
// its URL. A plain `new URL('./x.ts', import.meta.url)` would ship the raw .ts file.
import captureWorkletUrl from './worklet/capture.worklet.ts?worker&url';

export interface MicSettings {
  a4: number;
  instrument: Instrument;
  mode: JamMode;
  /**
   * Fixed energy gate in dBFS. Unset (default) = adaptive gate: follows the measured noise
   * floor and opens `sensitivity`-dependent dB above it. Set it to pin the old behaviour
   * (e.g. -50); set it back to `undefined` to return to the adaptive gate.
   */
  gateDb?: number;
  /**
   * 0..1, default 0.5. How far above the noise floor the adaptive gate opens:
   * 0 → 14 dB (only clear, close playing), 0.5 → 9 dB, 1 → 4 dB (quiet piano across the room;
   * more risk of reacting to room noise). Ignored while `gateDb` is set.
   */
  sensitivity?: number;
}

/** Live input health for a level meter and a "can't hear you" hint. */
export interface InputStatus {
  /** RMS of the newest hop in dBFS (−Infinity for digital silence or before the first hop). */
  levelDb: number;
  /** Noise-floor estimate in dBFS (adaptive gate; a fixed gate reports gateDb − 10). */
  noiseFloorDb: number;
  /** Nothing reached the gate during the last ~3 s: too quiet to analyse, or not playing. */
  tooQuiet: boolean;
  /** A sample reached ±0.99 full scale during the last ~1 s: lower the input gain. */
  clipping: boolean;
}

export interface MicStartOptions {
  deviceId?: string;
  a4?: number;
  instrument?: Instrument;
  mode?: JamMode;
  sensitivity?: number;
}

/** `AudioInput` plus a few extras the integrator may use. */
export interface MicInput extends AudioInput {
  start(opts?: MicStartOptions): Promise<void>;
  /** Live settings change (A4, instrument, Solo/Room, sensitivity, gate) without restarting. */
  configure(patch: Partial<MicSettings>): void;
  /** Worker timing + input status, roughly every 1.5 s while running (for a dev overlay). */
  onStats(cb: (s: DspStats) => void): () => void;
  /**
   * Latest input status (updated ≈ 3× per second while running). Before the first update, or
   * when stopped: levelDb −Infinity, noiseFloorDb −Infinity, tooQuiet true, clipping false.
   */
  getInputStatus(): InputStatus;
  /** Input status updates (≈ 3× per second while running). */
  onStatus(cb: (s: InputStatus) => void): () => void;
  /** Runtime errors after start (track ended, worker crash, …). */
  onError(cb: (e: Error) => void): () => void;
  getSampleRate(): number | null;
}

export class AudioInputError extends Error {
  readonly code: 'unsupported' | 'permission' | 'no-device' | 'worklet' | 'unknown';
  constructor(code: AudioInputError['code'], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AudioInputError';
    this.code = code;
  }
}

export const MIC_START_TIMEOUT_MS = 20_000;

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
  const g = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return g.AudioContext ?? g.webkitAudioContext;
}

function audioConstraints(deviceId?: string): MediaStreamConstraints {
  return {
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 1 },
    },
    video: false,
  };
}

function mapGetUserMediaError(err: unknown): AudioInputError {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new AudioInputError('permission', 'Microphone access was denied.', { cause: err });
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new AudioInputError('no-device', 'No microphone was found.', { cause: err });
  }
  if (name === 'NotReadableError') {
    return new AudioInputError('no-device', 'The microphone is in use by another app.', {
      cause: err,
    });
  }
  return new AudioInputError('unknown', 'Could not open the microphone.', { cause: err });
}

export function createMicInput(): MicInput {
  const frames = createEmitter<ChromaFrame>();
  const stats = createEmitter<DspStats>();
  const errors = createEmitter<Error>();
  const statuses = createEmitter<InputStatus>();
  const idleStatus: InputStatus = {
    levelDb: -Infinity,
    noiseFloorDb: -Infinity,
    tooQuiet: true,
    clipping: false,
  };
  let status: InputStatus = idleStatus;
  const setStatus = (s: InputStatusFields) => {
    status = {
      levelDb: s.levelDb,
      noiseFloorDb: s.noiseFloorDb,
      tooQuiet: s.tooQuiet,
      clipping: s.clipping,
    };
    statuses.emit(status);
  };

  let settings: MicSettings = { a4: DEFAULT_A4, instrument: 'piano', mode: 'solo' };
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let node: AudioWorkletNode | null = null;
  let sink: GainNode | null = null;
  let worker: Worker | null = null;
  let deviceId: string | undefined;
  let running = false;
  let starting: Promise<void> | null = null;
  let generation = 0;
  let cancelStart: ((error: Error) => void) | null = null;

  function postToWorker(msg: ToDspWorker, transfer?: Transferable[]) {
    worker?.postMessage(msg, transfer ?? []);
  }

  function sendConfig() {
    if (!ctx) return;
    postToWorker({
      type: 'config',
      sampleRate: ctx.sampleRate,
      a4: settings.a4,
      instrument: settings.instrument,
      mode: settings.mode,
      ...(settings.gateDb !== undefined ? { gateDb: settings.gateDb } : {}),
      ...(settings.sensitivity !== undefined ? { sensitivity: settings.sensitivity } : {}),
    });
  }

  async function openStream(id?: string, current = () => true): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia(audioConstraints(id));
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (current() && id && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
        // The saved device is gone (unplugged): fall back to the default mic.
        console.warn('[audio] device not available, falling back to default', id);
        try {
          return await navigator.mediaDevices.getUserMedia(audioConstraints());
        } catch (err2) {
          throw mapGetUserMediaError(err2);
        }
      }
      throw mapGetUserMediaError(err);
    }
  }

  function attachStream(s: MediaStream) {
    if (!ctx || !node) return;
    source?.disconnect();
    if (stream !== s) stream?.getTracks().forEach((t) => t.stop());
    stream = s;
    source = ctx.createMediaStreamSource(s);
    source.connect(node);
    for (const track of s.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (stream === s && running) {
          errors.emit(new AudioInputError('no-device', 'The microphone was disconnected.'));
        }
      });
    }
  }

  function teardown() {
    running = false;
    if (node) {
      node.port.postMessage({ type: 'stop' });
      node.port.onmessage = null;
    }
    source?.disconnect();
    node?.disconnect();
    sink?.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    const c = ctx;
    if (c) c.onstatechange = null;
    source = null;
    node = null;
    sink = null;
    stream = null;
    worker = null;
    ctx = null;
    status = idleStatus;
    clock.attachAudioContext(null);
    // Native close may itself stall; capture is already disconnected and tracks stopped.
    if (c && c.state !== 'closed') void c.close().catch(() => undefined);
  }

  async function doStart(opts: MicStartOptions, token: number): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new AudioInputError(
        'unsupported',
        'Microphone capture is not available. Use a current Chrome or Safari over https.',
      );
    }
    const Ctor = getAudioContextCtor();
    if (!Ctor) throw new AudioInputError('unsupported', 'Web Audio is not supported here.');

    // Create + resume synchronously, before the first await (Safari gesture rule).
    const c = new Ctor({ latencyHint: 'interactive' });
    ctx = c;
    const resumed = c.state === 'suspended' ? c.resume() : Promise.resolve();

    if (!c.audioWorklet || typeof AudioWorkletNode === 'undefined') {
      await teardown();
      throw new AudioInputError(
        'unsupported',
        'AudioWorklet is not supported in this browser (needs Chrome 66+ or Safari 14.1+, ' +
          'served over https or localhost).',
      );
    }

    try {
      const [s] = await Promise.all([
        openStream(opts.deviceId, () => token === generation).then((s) => {
          if (token !== generation) {
            s.getTracks().forEach((track) => track.stop());
            throw new DOMException('Microphone setup cancelled.', 'AbortError');
          }
          // Own tracks immediately, even if native worklet loading never settles.
          stream = s;
          return s;
        }),
        c.audioWorklet.addModule(captureWorkletUrl).catch((err: unknown) => {
          throw new AudioInputError('worklet', 'Could not load the audio capture worklet.', {
            cause: err,
          });
        }),
        resumed,
      ]);

      if (token !== generation) return;
      worker = new Worker(new URL('./worker/dsp.worker.ts', import.meta.url), {
        type: 'module',
        name: 'keel-dsp',
      });
      worker.onmessage = (e: MessageEvent<FromDspWorker>) => {
        const msg = e.data;
        if (msg.type === 'frame') frames.emit(msg.frame);
        else if (msg.type === 'status') setStatus(msg);
        else if (msg.type === 'stats') {
          const { type: _type, ...rest } = msg;
          stats.emit(rest);
          setStatus(msg);
        } else if (msg.type === 'error') errors.emit(new Error(`[dsp] ${msg.message}`));
      };
      worker.onerror = (e) => {
        errors.emit(new Error(`[dsp] worker error: ${e.message}`));
      };
      sendConfig();

      node = new AudioWorkletNode(c, CAPTURE_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
        processorOptions: { hopSize: HOP_SIZE },
      });
      node.port.onmessage = (e: MessageEvent<HopMessage>) => {
        const msg = e.data;
        if (msg?.type === 'hop') postToWorker(msg, [msg.samples.buffer as ArrayBuffer]);
      };
      sink = c.createGain();
      sink.gain.value = 0;
      node.connect(sink);
      sink.connect(c.destination);

      attachStream(s);
      deviceId = opts.deviceId;
      clock.attachAudioContext(c);
      c.onstatechange = () => {
        // iOS "interrupted" (phone call, other app) → try to come back.
        if (running && (c.state as string) !== 'running' && c.state !== 'closed') {
          c.resume().catch(() => undefined);
        }
      };
      running = true;
    } catch (err) {
      if (token === generation && ctx === c) {
        ++generation;
        teardown();
      }
      throw err;
    }
  }

  return {
    async listDevices() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
        return [];
      }
      // Labels are empty until mic permission has been granted once.
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'audioinput');
    },

    async start(opts = {}) {
      settings = {
        ...settings,
        ...(opts.a4 !== undefined ? { a4: opts.a4 } : {}),
        ...(opts.instrument !== undefined ? { instrument: opts.instrument } : {}),
        ...(opts.mode !== undefined ? { mode: opts.mode } : {}),
        ...(opts.sensitivity !== undefined ? { sensitivity: opts.sensitivity } : {}),
      };
      if (starting) return starting;
      if (running) {
        sendConfig();
        if (opts.deviceId !== undefined && opts.deviceId !== deviceId) {
          // Switch device in place, keeping the context (no new gesture needed).
          const token = generation;
          const s = await openStream(opts.deviceId, () => token === generation);
          if (token !== generation) {
            s.getTracks().forEach((track) => track.stop());
            return;
          }
          attachStream(s);
          deviceId = opts.deviceId;
          postToWorker({ type: 'reset' });
        }
        return;
      }
      const token = ++generation;
      let rejectCancelled!: (error: Error) => void;
      const cancelled = new Promise<void>((_resolve, reject) => {
        rejectCancelled = reject;
      });
      const cancelAttempt = (error: Error) => {
        if (token !== generation) return;
        ++generation;
        teardown();
        rejectCancelled(error);
      };
      cancelStart = cancelAttempt;
      const timer = setTimeout(() => {
        cancelAttempt(new AudioInputError('unknown', 'Microphone setup timed out. Try again.'));
      }, MIC_START_TIMEOUT_MS);
      const pending = Promise.race([doStart(opts, token), cancelled]).finally(() => {
        clearTimeout(timer);
        if (starting === pending) {
          starting = null;
          cancelStart = null;
        }
      });
      starting = pending;
      return pending;
    },

    async stop() {
      cancelStart?.(new DOMException('Microphone setup cancelled.', 'AbortError'));
      ++generation;
      starting = null;
      cancelStart = null;
      teardown();
    },

    isRunning: () => running,
    onFrame: (cb) => frames.subscribe(cb),
    onStats: (cb) => stats.subscribe(cb),
    onStatus: (cb) => statuses.subscribe(cb),
    getInputStatus: () => status,
    onError: (cb) => errors.subscribe(cb),
    getStream: () => stream,
    getContext: () => ctx,
    getSampleRate: () => ctx?.sampleRate ?? null,

    configure(patch) {
      settings = { ...settings, ...patch };
      sendConfig();
    },
  };
}
