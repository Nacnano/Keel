/**
 * Opt-in session audio recording with MediaRecorder. Stored locally only.
 *
 * Import-safe in node: `MediaRecorder` is feature-detected at call time.
 * Chrome records `audio/webm;codecs=opus`, Safari `audio/mp4`.
 */

/** Tried in order; the first one `MediaRecorder.isTypeSupported` accepts wins. */
export const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/aac',
] as const;

export const DEFAULT_MAX_DURATION_SEC = 30 * 60;
export const DEFAULT_WARN_AT_SEC = 25 * 60;
/** Generous: opus at 128 kbit/s for 30 min is ~29 MB. */
export const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;

export type AudioLimitReason = 'duration' | 'size';

export interface AudioRecorderOptions {
  /** Hard cap; recording stops by itself when reached. Default 30 min. */
  maxDurationSec?: number;
  /** `onWarning` fires once at this point. Default 25 min. */
  warnAtSec?: number;
  maxBytes?: number;
  /** Force a mime type instead of auto-picking. */
  mimeType?: string;
  /** MediaRecorder timeslice; chunks arrive this often. Default 1000 ms. */
  timesliceMs?: number;
  onWarning?: (info: { elapsedSec: number; remainingSec: number; bytes: number }) => void;
  /** Fired when a cap auto-stops the recording; `stop()` still returns the take. */
  onLimit?: (reason: AudioLimitReason) => void;
  /** Epoch ms clock (tests). */
  now?: () => number;
}

export interface AudioTake {
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

export type AudioRecorderState = 'idle' | 'recording' | 'stopped';

export interface AudioRecorder {
  readonly state: AudioRecorderState;
  /** Resolved mime type ('' = browser default). */
  readonly mimeType: string;
  start(): void;
  /** Stops (if still running) and resolves with the whole take. */
  stop(): Promise<AudioTake>;
  elapsedSec(): number;
  bytes(): number;
}

export function isAudioRecordingSupported(): boolean {
  return typeof globalThis.MediaRecorder === 'function';
}

/** First supported preferred mime type, or '' to let the browser choose. */
export function pickMimeType(): string {
  if (!isAudioRecordingSupported()) return '';
  const isSupported = MediaRecorder.isTypeSupported?.bind(MediaRecorder);
  if (!isSupported) return '';
  return PREFERRED_MIME_TYPES.find((t) => isSupported(t)) ?? '';
}

export function createAudioRecorder(
  stream: MediaStream,
  opts: AudioRecorderOptions = {},
): AudioRecorder {
  if (!isAudioRecordingSupported()) {
    throw new Error('Audio recording is not supported in this browser (no MediaRecorder).');
  }
  const now = opts.now ?? Date.now;
  const maxDurationSec = opts.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC;
  const warnAtSec = opts.warnAtSec ?? DEFAULT_WARN_AT_SEC;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const requestedMime = opts.mimeType ?? pickMimeType();

  let state: AudioRecorderState = 'idle';
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let byteCount = 0;
  let startedAt = 0;
  let endedAt: number | null = null;
  let warned = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let result: Promise<AudioTake> | null = null;
  let resolveResult: (t: AudioTake) => void = () => {};
  let rejectResult: (e: unknown) => void = () => {};

  const elapsedSec = () => (state === 'idle' ? 0 : ((endedAt ?? now()) - startedAt) / 1000);

  function finish(): Promise<AudioTake> {
    if (!result) return Promise.reject(new Error('Audio recorder was never started.'));
    if (state === 'recording') {
      state = 'stopped';
      endedAt = now();
      if (timer) clearInterval(timer);
      timer = null;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      else complete();
    }
    return result;
  }

  function complete() {
    const mimeType = recorder?.mimeType || requestedMime;
    resolveResult({
      blob: new Blob(chunks, mimeType ? { type: mimeType } : undefined),
      mimeType,
      durationSec: Math.min(elapsedSec(), maxDurationSec),
    });
    chunks = [];
  }

  function checkLimits() {
    if (state !== 'recording') return;
    const elapsed = elapsedSec();
    if (!warned && elapsed >= warnAtSec) {
      warned = true;
      opts.onWarning?.({
        elapsedSec: elapsed,
        remainingSec: Math.max(0, maxDurationSec - elapsed),
        bytes: byteCount,
      });
    }
    const reason: AudioLimitReason | null =
      elapsed >= maxDurationSec ? 'duration' : byteCount >= maxBytes ? 'size' : null;
    if (reason) {
      void finish();
      opts.onLimit?.(reason);
    }
  }

  return {
    get state() {
      return state;
    },
    get mimeType() {
      return recorder?.mimeType || requestedMime;
    },
    start() {
      if (state !== 'idle') throw new Error(`Audio recorder already ${state}.`);
      result = new Promise<AudioTake>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });
      recorder = new MediaRecorder(stream, requestedMime ? { mimeType: requestedMime } : undefined);
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
          byteCount += e.data.size;
          checkLimits();
        }
      };
      recorder.onstop = () => complete();
      recorder.onerror = (e: Event) => {
        if (timer) clearInterval(timer);
        state = 'stopped';
        rejectResult((e as Event & { error?: unknown }).error ?? new Error('MediaRecorder error'));
      };
      recorder.start(opts.timesliceMs ?? 1000);
      state = 'recording';
      startedAt = now();
      timer = setInterval(checkLimits, 1000);
    },
    stop: finish,
    elapsedSec,
    bytes: () => byteCount,
  };
}
