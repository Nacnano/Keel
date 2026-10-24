/**
 * Live input controller (integration layer).
 *
 * Owns the singletons: microphone input, Web MIDI input, analysis engine,
 * session recorder, audio recorder. Routes frames from the active source into
 * the engine, engine events into the jam store and the session recorder, and
 * MIDI events into the session's MIDI track.
 *
 * Source arbitration: when a MIDI device is connected and has produced a
 * note within the last MIDI_PRIORITY_SEC, microphone frames are dropped so
 * the exact MIDI path wins. Otherwise the microphone drives the engine.
 */
import { clock } from '@/core/clock';
import type {
  AnalysisConfig,
  AnalysisEngine,
  AnalysisEvent,
  ChromaFrame,
  InputSource,
  Marker,
  MidiEvent,
  Settings,
} from '@/core';
import { createMicInput, AudioInputError } from '@/audio';
import type { MicInput } from '@/audio';
import { createMidiInput } from '@/midi';
import type { WebMidiInput } from '@/midi';
import { createAnalysisEngine } from '@/analysis';
import { createAudioRecorder, isAudioRecordingSupported, startSession } from '@/data';
import { notifySessionSaved } from '@/sync/signals';
import type { AudioRecorder, SessionHandle } from '@/data';
import { jamStore } from '@/state/jamStore';
import { inputStore } from '@/state/inputStore';
import { settingsStore } from '@/state/settingsStore';
import { toast } from '@/ui/components/toastStore';

export const MIDI_PRIORITY_SEC = 2;

/** Input below this level counts as "can't hear much". */
export const QUIET_LEVEL = 0.06;
/** Quiet this long before the nudge shows: time to reach the keys. */
export const QUIET_ONSET_SEC = 4;
/** Loud this long before the nudge goes away, so a single note does not make it blink. */
export const QUIET_RELEASE_SEC = 2;

/**
 * "Can't hear much", decided on the engine's level events (clock seconds), so it holds whether
 * or not the Listen screen is mounted. Each crossing restarts the wait; only a state held for
 * the whole wait flips it.
 */
export function createQuietGate() {
  let quiet = false;
  let loud: boolean | null = null;
  let since = 0;
  return {
    get quiet() {
      return quiet;
    },
    reset() {
      quiet = false;
      loud = null;
    },
    /** Feed one level reading; returns whether the input counts as too quiet now. */
    level(t: number, energy: number): boolean {
      const isLoud = energy > QUIET_LEVEL;
      if (isLoud !== loud) {
        loud = isLoud;
        since = t;
      }
      if (quiet && isLoud && t - since >= QUIET_RELEASE_SEC) quiet = false;
      else if (!quiet && !isLoud && t - since >= QUIET_ONSET_SEC) quiet = true;
      return quiet;
    },
  };
}

type Unsub = () => void;

export interface StopOptions {
  /** When set, the "Saved" toast gets an "Open" action that calls this with the session id. */
  openReview?: (sessionId: string) => void;
  /**
   * Called only after the session has been persisted successfully. A caller that handles
   * this shows its own confirmation, so the "Saved" toast is skipped.
   */
  onSaved?: (session: { id: string; name: string }) => void;
  onSaveError?: (message: string) => void;
}

export interface LiveInputController {
  start(): Promise<void>;
  /** Stop listening and save the session. */
  stop(opts?: StopOptions): Promise<void>;
  isRunning(): boolean;
  /**
   * "New song" from the Mark menu: forget the key so it re-locks from what is played next.
   * The marker itself is added by the caller; `from` (session seconds) is where it landed, so
   * the new key labels the song from there.
   */
  newSong(from?: number): void;
  /** Re-read audio + MIDI device lists into the input store. */
  refreshDevices(): Promise<void>;
  /** Exposed for the audition helper (shares the AudioContext). */
  getAudioContext(): AudioContext | null;
  readonly mic: MicInput;
  readonly midi: WebMidiInput;
}

function analysisConfigFrom(s: Settings): AnalysisConfig {
  return {
    vocabLevel: s.vocabLevel,
    mode: s.mode,
    instrument: s.instrument,
    a4: s.a4,
    stability: s.stability,
    showSlashChords: s.showSlashChords,
  };
}

function describeError(err: unknown): string {
  if (err instanceof AudioInputError) {
    switch (err.code) {
      case 'permission':
        return 'Microphone access was denied. Allow it in the browser and try again.';
      case 'unsupported':
        return 'This browser cannot process live audio. Use a current Chrome, Edge or Safari.';
      case 'no-device':
        return 'No microphone found. Plug one in or pick another input in Settings.';
      default:
        return err.message;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Keeps the screen awake while listening (a phone or tablet on the music stand must not
 * sleep mid-song). The browser drops the lock when the page is hidden, so it is taken
 * again when the page becomes visible. Unsupported browsers and refusals are ignored.
 */
function createWakeLock() {
  let wanted = false;
  let sentinel: WakeLockSentinel | null = null;

  async function acquire() {
    if (!wanted || sentinel || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!wanted) {
        void lock.release().catch(() => {});
        return;
      }
      sentinel = lock;
      lock.addEventListener('release', () => {
        if (sentinel === lock) sentinel = null;
      });
    } catch {
      /* not allowed right now (battery saver, hidden page): listening goes on regardless */
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') void acquire();
  };

  return {
    hold() {
      if (wanted) return;
      wanted = true;
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibility);
      }
      void acquire();
    },
    release() {
      if (!wanted) return;
      wanted = false;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      const lock = sentinel;
      sentinel = null;
      void lock?.release().catch(() => {});
    },
  };
}

export function createLiveInput(): LiveInputController {
  const mic = createMicInput();
  const midi = createMidiInput();
  // `resetKey` is optional until every engine build has it.
  const engine: AnalysisEngine & { resetKey?: () => void } = createAnalysisEngine(
    analysisConfigFrom(settingsStore.getState()),
  );

  let running = false;
  let stopping: Promise<void> | null = null;
  let starting: Promise<void> | null = null;
  let cancelPendingStart: (() => void) | null = null;
  let generation = 0;
  let session: SessionHandle | null = null;
  let audioRec: AudioRecorder | null = null;
  let subs: Unsub[] = [];
  let lastMidiActivity = -Infinity;
  let activeSource: InputSource | null = null;
  let lastFrameTime: number | null = null;
  let midiConnected = false;
  let persistedMarkers = 0;
  let unsubDevices: Unsub | null = null;
  const wakeLock = createWakeLock();
  const quietGate = createQuietGate();
  /** The newest chord event held back while too quiet; it is replayed when sound returns. */
  let heldChord: AnalysisEvent | null = null;

  // Keep engine + mic settings live.
  settingsStore.subscribe((s, prev) => {
    if (running && (s.mode !== prev.mode || s.instrument !== prev.instrument || s.a4 !== prev.a4)) {
      jamStore.getState().clearLiveReadout();
      heldChord = null;
    }
    const cfg = analysisConfigFrom(s);
    if (JSON.stringify(cfg) !== JSON.stringify(analysisConfigFrom(prev))) {
      engine.configure(cfg);
    }
    if (
      mic.isRunning() &&
      (s.a4 !== prev.a4 ||
        s.instrument !== prev.instrument ||
        s.mode !== prev.mode ||
        s.sensitivity !== prev.sensitivity)
    ) {
      mic.configure({
        a4: s.a4,
        instrument: s.instrument,
        mode: s.mode,
        sensitivity: s.sensitivity,
      });
    }
  });

  function forward(e: AnalysisEvent) {
    jamStore.getState().applyEvent(e);
    if (e.type !== 'preview') session?.onAnalysisEvent(e);
  }

  /** MIDI is exact: a quiet room says nothing about it. */
  function quietApplies(t: number): boolean {
    return activeSource !== 'midi' && t - lastMidiActivity >= MIDI_PRIORITY_SEC;
  }

  function onEngineEvent(e: AnalysisEvent) {
    if (e.type === 'level') {
      inputStore.getState().setMicLevel(e.energy);
      const quiet = quietGate.level(e.t, e.energy) && quietApplies(e.t);
      const jam = jamStore.getState();
      if (jam.quiet !== quiet) {
        jam.setQuiet(quiet);
        if (quiet)
          jam.applyEvent({ type: 'preview', t: e.t, chord: null, confidence: 0, key: null });
        // Sound is back: the chord the engine settled on meanwhile is what is playing now.
        if (!quiet && heldChord) forward({ ...heldChord, t: e.t });
        heldChord = null;
      }
    }
    // While "Can't hear much" shows, chords are guesses: keep them out of the timeline and
    // the saved session (the last chord before it stays as it was).
    if (e.type === 'chord' && jamStore.getState().quiet) {
      heldChord = e;
      return;
    }
    if (e.type === 'preview' && jamStore.getState().quiet) {
      forward({ ...e, chord: null, confidence: 0, key: null });
      return;
    }
    forward(e);
  }

  function acceptSource(source: InputSource, t: number) {
    const discontinuity = lastFrameTime !== null && (t < lastFrameTime || t - lastFrameTime > 0.5);
    if ((activeSource !== null && activeSource !== source) || discontinuity) {
      jamStore.getState().clearLiveReadout();
      heldChord = null;
      quietGate.reset();
      jamStore.getState().setQuiet(false);
    }
    lastFrameTime = t;
    activeSource = source;
    jamStore.getState().setSource(source);
  }

  function onMicFrame(f: ChromaFrame) {
    if (midiConnected && f.t - lastMidiActivity < MIDI_PRIORITY_SEC) return;
    acceptSource('mic', f.t);
    engine.push(f);
    jamStore.getState().setSource('mic');
  }

  function onMidiFrame(f: ChromaFrame) {
    if (f.energy > 0) lastMidiActivity = f.t;
    acceptSource('midi', f.t);
    engine.push(f);
    jamStore.getState().setSource('midi');
  }

  function onMidiEvent(e: MidiEvent) {
    if (e.type === 'on') lastMidiActivity = e.t;
    session?.onMidiEvent(e);
  }

  /** Persist markers the UI adds to the jam store. */
  function syncMarkers() {
    const markers: Marker[] = jamStore.getState().markers;
    while (persistedMarkers < markers.length) {
      const m = markers[persistedMarkers++];
      session?.addMarker(m.kind, m.label, m.t);
    }
  }

  async function refreshAudioDevices() {
    const store = inputStore.getState();
    try {
      const devices = await mic.listDevices();
      store.setAudioDevices(
        devices.map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })),
      );
    } catch {
      /* no permission yet: labels appear after the first start */
    }
  }

  async function refreshDevices() {
    await refreshAudioDevices();
    const store = inputStore.getState();
    const supported = midi.isSupported();
    store.setMidiSupported(supported);
    if (supported) {
      try {
        store.setMidiDevices(await midi.listDevices());
        unsubDevices ??= midi.onDevicesChange((list) => inputStore.getState().setMidiDevices(list));
      } catch {
        store.setMidiDevices([]);
      }
    }
  }

  async function connectMidi(): Promise<boolean> {
    if (!midi.isSupported()) return false;
    const settings = settingsStore.getState();
    const devices = inputStore.getState().midiDevices;
    const wanted = settings.midiDeviceId ?? devices[0]?.id ?? null;
    if (!wanted) return false;
    try {
      await midi.connect(wanted);
      return true;
    } catch (err) {
      console.warn('[live] MIDI connect failed', err);
      return false;
    }
  }

  async function beginStart(token: number) {
    running = true;
    const jam = jamStore.getState();
    const settings = settingsStore.getState();
    jam.setStatus('starting');
    engine.configure(analysisConfigFrom(settings));
    engine.reset();
    lastMidiActivity = -Infinity;
    activeSource = null;
    lastFrameTime = null;
    jam.clearLiveReadout();
    persistedMarkers = 0;
    quietGate.reset();
    heldChord = null;

    let micOk = false;
    let micError: unknown = null;
    try {
      await mic.start({
        deviceId: settings.audioDeviceId ?? undefined,
        a4: settings.a4,
        instrument: settings.instrument,
        mode: settings.mode,
        sensitivity: settings.sensitivity,
      });
      if (token !== generation) return;
      micOk = true;
      // Device labels become available once permission is granted.
      void refreshAudioDevices();
    } catch (err) {
      micError = err;
    }

    if (token !== generation) return;
    // Listening should ask for one permission. MIDI is opt-in, or reuses an existing grant.
    let midiAllowed = Boolean(settings.midiDeviceId);
    if (!midiAllowed && midi.isSupported()) {
      try {
        midiAllowed =
          (await navigator.permissions.query({ name: 'midi' as PermissionName })).state ===
          'granted';
      } catch {
        /* Browsers without MIDI permission queries wait for explicit device selection. */
      }
    }
    if (token !== generation) return;
    if (midiAllowed) {
      await refreshDevices();
      if (token !== generation) return;
      const connected = await connectMidi();
      if (token !== generation) {
        if (!running) midi.disconnect();
        return;
      }
      midiConnected = connected;
    } else {
      midiConnected = false;
    }
    if (token !== generation) return;

    if (!micOk && !midiConnected) {
      running = false;
      jam.setStatus('error', describeError(micError ?? new Error('No input available.')));
      return;
    }

    const t0 = clock.now();
    session = startSession({
      mode: settings.mode,
      instrument: settings.instrument,
      vocabLevel: settings.vocabLevel,
      t0,
      clock: clock.now,
    });

    subs = [
      engine.subscribe(onEngineEvent),
      micOk ? mic.onFrame(onMicFrame) : () => {},
      midiConnected ? midi.onFrame(onMidiFrame) : () => {},
      midiConnected ? midi.onEvent(onMidiEvent) : () => {},
      mic.onError((err) => {
        if (activeSource !== 'midi') {
          jamStore.getState().clearLiveReadout();
          heldChord = null;
        }
        toast(`Microphone stopped: ${err.message}`, { tone: 'error' });
      }),
      jamStore.subscribe((s, prev) => {
        if (s.markers !== prev.markers) syncMarkers();
      }),
    ];

    const stream = mic.getStream();
    const canRecord = micOk && Boolean(stream) && isAudioRecordingSupported();
    // The header says "Recording" only while audio is really being kept.
    if (jam.recordAudio && !canRecord) jam.setRecordAudio(false);
    if (jam.recordAudio && canRecord && stream) {
      try {
        audioRec = createAudioRecorder(stream, {
          onWarning: ({ remainingSec }) =>
            toast(`Recording stops in ${Math.round(remainingSec / 60)} min`, { tone: 'info' }),
          onLimit: () =>
            toast('Recording limit reached; audio saved up to here.', { tone: 'info' }),
        });
        audioRec.start();
      } catch (err) {
        toast(`Audio recording unavailable: ${describeError(err)}`, { tone: 'error' });
        audioRec = null;
        jam.setRecordAudio(false);
      }
    }

    jam.startSession(t0);
    jam.setSource(midiConnected && !micOk ? 'midi' : 'mic');
    wakeLock.hold();
    if (!micOk && midiConnected) {
      toast('Microphone unavailable; using MIDI only.', { tone: 'info' });
    }
  }

  async function finishStop(opts: StopOptions) {
    if (!running) return;
    running = false;
    for (const u of subs) u();
    subs = [];
    const endT = clock.now();
    jamStore.getState().stopSession();
    wakeLock.release();

    try {
      await mic.stop();
    } catch (err) {
      console.warn('[live] mic stop failed', err);
    }
    if (midiConnected) midi.disconnect();
    midiConnected = false;

    const handle = session;
    session = null;
    if (!handle) return;
    try {
      if (audioRec) {
        const take = await audioRec.stop();
        audioRec = null;
        if (take.blob.size > 0) {
          await handle.setAudioBlob(take.blob, take.mimeType, take.durationSec);
        }
      }
      const saved = await handle.stop({ endT, discardIfEmpty: true });
      if (!saved) return; // nothing was heard: no session to keep
      notifySessionSaved(); // nudge cloud sync (no-op when sync is off)
      opts.onSaved?.({ id: saved.id, name: saved.name });
      if (!opts.onSaved && (saved.durationSec >= 2 || saved.summary?.chordCount)) {
        const { openReview } = opts;
        toast(`Saved “${saved.name}” to the library`, {
          tone: 'success',
          durationMs: openReview ? 6000 : 2500,
          action: openReview ? { label: 'Open', onClick: () => openReview(saved.id) } : undefined,
        });
      }
    } catch (err) {
      const message = `Could not save the session: ${describeError(err)}`;
      opts.onSaveError?.(message);
      toast(message, { tone: 'error' });
    }
  }

  function start(): Promise<void> {
    if (starting) return starting;
    if (running && !stopping) return Promise.resolve();
    const token = ++generation;
    const pendingStop = stopping;
    const cancelled = new Promise<void>((resolve) => {
      cancelPendingStart = resolve;
    });
    const pending = Promise.race([
      (async () => {
        if (pendingStop) await pendingStop;
        if (token !== generation) return;
        await beginStart(token);
      })(),
      cancelled,
    ]).finally(() => {
      if (starting === pending) {
        starting = null;
        cancelPendingStart = null;
      }
    });
    starting = pending;
    return pending;
  }

  function stop(opts: StopOptions = {}): Promise<void> {
    ++generation; // A pending permission request must never start a session after leaving Jam.
    if (stopping) return stopping;
    cancelPendingStart?.();
    cancelPendingStart = null;
    starting = null;
    stopping = finishStop(opts).finally(() => {
      stopping = null;
    });
    return stopping;
  }

  function newSong(from?: number) {
    if (!running || !engine.resetKey) return;
    engine.resetKey();
    jamStore.getState().clearKey(from);
  }

  return {
    start,
    stop,
    isRunning: () => running,
    newSong,
    refreshDevices,
    getAudioContext: () => mic.getContext(),
    mic,
    midi,
  };
}

let singleton: LiveInputController | null = null;

/** App-wide live input (created on first use so tests and SSR stay inert). */
export function liveInput(): LiveInputController {
  singleton ??= createLiveInput();
  return singleton;
}
