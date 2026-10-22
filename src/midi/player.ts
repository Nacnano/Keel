/**
 * `MidiPlayer` on top of smplr's SplendidGrandPiano.
 *
 * Everything audio-related is lazy: importing this module never touches Web
 * Audio, and smplr itself is dynamically imported inside `load()`, so the
 * module is safe in node/tests and the sampler lands in its own chunk.
 *
 * Scheduling is the classic look-ahead pattern: a 25 ms timer schedules every
 * note that falls in the next ~100 ms of AudioContext time, so timing is
 * sample-accurate even when the main thread is busy. Sustain (CC64) is applied
 * up front by `resolveSustain`, which defers note-offs to the pedal release.
 */
import { createEmitter } from '@/core/events';
import type { MidiEvent, MidiNote, MidiNoteEvent, MidiPlayer, Seconds } from '@/core/types';
import { performanceEnd, resolveSustain, scheduleWindow, soundingAt } from './schedule';

type StopFn = (time?: number) => void;

/** The bit of a smplr instrument the player needs. */
export interface PianoLike {
  start(sample: { note: number; velocity?: number; time?: number }): StopFn;
}

/** Minimal AudioContext surface used by the player. */
export interface AudioClockLike {
  readonly currentTime: number;
  readonly state?: string;
  resume?(): Promise<void>;
}

export type LoadProgress = (fraction: number) => void;

export interface MidiPlayerOptions {
  /** Build the instrument. Defaults to smplr's SplendidGrandPiano. */
  createInstrument?: (ctx: AudioContext, onProgress: LoadProgress) => Promise<PianoLike>;
  /** Seconds of audio scheduled ahead. Default 0.1. */
  lookAhead?: Seconds;
  /** Scheduler tick in ms. Default 25. */
  scheduleIntervalMs?: number;
  /** `onTick` rate. Default 30 Hz. */
  tickHz?: number;
  /** Gap between `play()` and the first note so the first window is not late. Default 0.05 s. */
  startDelay?: Seconds;
}

export interface PianoPlayer extends MidiPlayer {
  /** Fetch samples. `onProgress` receives 0..1. Safe to call repeatedly. */
  load(opts?: { onProgress?: LoadProgress }): Promise<void>;
  isLoaded(): boolean;
  isPlaying(): boolean;
  /** Current playback position in performance seconds. */
  position(): Seconds;
  /** Total length of the current performance. */
  duration(): Seconds;
  setRate(rate: number): void;
  /** Fires when playback reaches the end of the performance. */
  onEnd(cb: () => void): () => void;
  /** The AudioContext in use (created lazily if none was given). */
  getContext(): AudioContext | null;
}

/** Default instrument: SplendidGrandPiano, with progress derived from sample fetches. */
export async function loadSplendidGrandPiano(
  ctx: AudioContext,
  onProgress: LoadProgress,
): Promise<PianoLike> {
  const { SplendidGrandPiano, HttpStorage, LAYERS } = await import('smplr');
  const total = Math.max(
    1,
    LAYERS.reduce((n, layer) => n + layer.samples.length, 0),
  );
  let done = 0;
  const storage = {
    async fetch(url: string) {
      const res = await HttpStorage.fetch(url);
      done += 1;
      onProgress(Math.min(1, done / total));
      return res;
    },
  };
  const piano = new SplendidGrandPiano(ctx, { storage });
  await piano.load;
  onProgress(1);
  return piano;
}

export function createMidiPlayer(ctx?: AudioContext, opts: MidiPlayerOptions = {}): PianoPlayer {
  const lookAhead = opts.lookAhead ?? 0.1;
  const scheduleIntervalMs = opts.scheduleIntervalMs ?? 25;
  const tickMs = 1000 / (opts.tickHz ?? 30);
  const startDelay = opts.startDelay ?? 0.05;
  const createInstrument = opts.createInstrument ?? loadSplendidGrandPiano;

  const ticks = createEmitter<Seconds>();
  const ends = createEmitter<void>();
  const progress = createEmitter<number>();

  let context: AudioContext | null = ctx ?? null;
  let piano: PianoLike | null = null;
  let loading: Promise<PianoLike> | null = null;

  // Playback state. position(ctxTime) = anchorPos + (ctxTime - anchorCtx) * rate
  let notes: MidiNoteEvent[] = [];
  let end = 0;
  let rate = 1;
  let playing = false;
  let anchorCtx = 0;
  let anchorPos = 0;
  let scheduledUntil = 0;
  let restPos = 0; // position while not playing
  let generation = 0; // invalidates a play() still waiting for samples
  let scheduleTimer: ReturnType<typeof setInterval> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  const voices = new Map<MidiNote, StopFn>();
  const liveVoices = new Map<MidiNote, StopFn>();
  const liveWanted = new Map<MidiNote, number>();

  const getContext = (): AudioContext => {
    if (!context) context = new AudioContext();
    return context;
  };
  const clockNow = () => (context as AudioClockLike | null)?.currentTime ?? 0;
  const resume = () => {
    const c = context as AudioClockLike | null;
    if (c?.state === 'suspended') void c.resume?.();
  };

  const posAt = (ctxTime: number) => anchorPos + (ctxTime - anchorCtx) * rate;
  const ctxAt = (pos: Seconds) => anchorCtx + (pos - anchorPos) / rate;
  const clampPos = (p: Seconds) => Math.min(end, Math.max(0, p));

  const stopVoices = (map: Map<MidiNote, StopFn>, time?: number) => {
    for (const stop of map.values()) stop(time);
    map.clear();
  };

  const clearTimers = () => {
    if (scheduleTimer) clearInterval(scheduleTimer);
    if (tickTimer) clearInterval(tickTimer);
    scheduleTimer = tickTimer = null;
  };

  const startVoice = (e: MidiNoteEvent, time: number) => {
    voices.get(e.note)?.(time);
    voices.set(e.note, piano!.start({ note: e.note, velocity: e.velocity, time }));
  };

  const pump = () => {
    if (!playing || !piano) return;
    const now = clockNow();
    const windowEnd = posAt(now + lookAhead);
    for (const e of scheduleWindow(notes, scheduledUntil, windowEnd)) {
      const when = Math.max(now, ctxAt(e.t));
      if (e.type === 'on') {
        startVoice(e, when);
      } else {
        voices.get(e.note)?.(when);
        voices.delete(e.note);
      }
    }
    scheduledUntil = Math.max(scheduledUntil, windowEnd);
    if (posAt(now) >= end) finish();
  };

  const tick = () => {
    if (playing) ticks.emit(clampPos(Math.max(anchorPos, posAt(clockNow()))));
  };

  const begin = (from: Seconds) => {
    clearTimers();
    resume();
    const now = clockNow();
    anchorCtx = now + startDelay;
    anchorPos = from;
    scheduledUntil = from;
    playing = true;
    for (const e of soundingAt(notes, from)) startVoice(e, anchorCtx);
    pump();
    if (!playing) return; // empty or already finished
    scheduleTimer = setInterval(pump, scheduleIntervalMs);
    tickTimer = setInterval(tick, tickMs);
    ticks.emit(from);
  };

  const halt = (at: Seconds) => {
    generation += 1;
    clearTimers();
    stopVoices(voices, clockNow());
    playing = false;
    restPos = clampPos(at);
  };

  function finish() {
    halt(end);
    ticks.emit(end);
    ends.emit();
  }

  const load: PianoPlayer['load'] = async (loadOpts) => {
    const off = loadOpts?.onProgress ? progress.subscribe(loadOpts.onProgress) : null;
    try {
      if (piano) {
        loadOpts?.onProgress?.(1);
        return;
      }
      if (!loading) {
        loading = createInstrument(getContext(), (p) => progress.emit(p)).then(
          (p) => (piano = p),
          (err: unknown) => {
            loading = null;
            throw err;
          },
        );
      }
      await loading;
    } finally {
      off?.();
    }
  };

  return {
    load,
    isLoaded: () => piano !== null,
    isPlaying: () => playing,
    position: () => (playing ? clampPos(Math.max(anchorPos, posAt(clockNow()))) : restPos),
    duration: () => end,
    getContext: () => context,

    play(events: MidiEvent[], playOpts) {
      halt(0);
      notes = resolveSustain(events);
      end = performanceEnd(notes);
      if (playOpts?.rate && playOpts.rate > 0) rate = playOpts.rate;
      const from = clampPos(playOpts?.from ?? 0);
      restPos = from;
      if (piano) {
        begin(from);
        return;
      }
      const gen = generation;
      load().then(
        () => {
          if (gen === generation) begin(from);
        },
        (err: unknown) => console.error('[midi player] failed to load piano', err),
      );
    },

    seek(t) {
      const target = clampPos(t);
      if (playing) {
        halt(target);
        begin(target);
      } else {
        restPos = target;
        ticks.emit(target);
      }
    },

    pause() {
      const at = playing ? posAt(clockNow()) : restPos;
      halt(Math.max(anchorPos, at));
      ticks.emit(restPos);
    },

    stop() {
      halt(0);
      ticks.emit(0);
    },

    setRate(next) {
      if (!(next > 0)) return;
      if (playing) {
        const now = clockNow();
        const p = Math.max(anchorPos, posAt(now));
        anchorCtx = Math.max(now, anchorCtx);
        anchorPos = p;
      }
      rate = next;
    },

    onTick(cb) {
      return ticks.subscribe(cb);
    },
    onEnd(cb) {
      return ends.subscribe(cb);
    },

    noteOn(note, velocity = 80) {
      liveWanted.set(note, velocity);
      const sound = () => {
        if (!piano || liveWanted.get(note) !== velocity) return;
        resume();
        liveVoices.get(note)?.(clockNow());
        liveVoices.set(note, piano.start({ note, velocity, time: clockNow() }));
      };
      if (piano) sound();
      else load().then(sound, (err: unknown) => console.error('[midi player] load failed', err));
    },

    noteOff(note) {
      liveWanted.delete(note);
      liveVoices.get(note)?.(clockNow());
      liveVoices.delete(note);
    },
  };
}
