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
  AnalysisEvent,
  ChromaFrame,
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
import type { AudioRecorder, SessionHandle } from '@/data';
import { jamStore } from '@/state/jamStore';
import { inputStore } from '@/state/inputStore';
import { settingsStore } from '@/state/settingsStore';
import { toast } from '@/ui/components/toastStore';

export const MIDI_PRIORITY_SEC = 2;

type Unsub = () => void;

export interface LiveInputController {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
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

export function createLiveInput(): LiveInputController {
  const mic = createMicInput();
  const midi = createMidiInput();
  const engine = createAnalysisEngine(analysisConfigFrom(settingsStore.getState()));

  let running = false;
  let session: SessionHandle | null = null;
  let audioRec: AudioRecorder | null = null;
  let subs: Unsub[] = [];
  let lastMidiActivity = -Infinity;
  let midiConnected = false;
  let persistedMarkers = 0;
  let unsubDevices: Unsub | null = null;

  // Keep engine + mic settings live.
  settingsStore.subscribe((s, prev) => {
    const cfg = analysisConfigFrom(s);
    if (JSON.stringify(cfg) !== JSON.stringify(analysisConfigFrom(prev))) {
      engine.configure(cfg);
      if (mic.isRunning()) mic.configure({ a4: s.a4, instrument: s.instrument, mode: s.mode });
    }
  });

  function onEngineEvent(e: AnalysisEvent) {
    jamStore.getState().applyEvent(e);
    session?.onAnalysisEvent(e);
    if (e.type === 'level') inputStore.getState().setMicLevel(e.energy);
  }

  function onMicFrame(f: ChromaFrame) {
    if (midiConnected && f.t - lastMidiActivity < MIDI_PRIORITY_SEC) return;
    engine.push(f);
  }

  function onMidiFrame(f: ChromaFrame) {
    if (f.energy > 0) lastMidiActivity = f.t;
    engine.push(f);
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

  async function refreshDevices() {
    const store = inputStore.getState();
    try {
      const devices = await mic.listDevices();
      store.setAudioDevices(
        devices.map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })),
      );
    } catch {
      /* no permission yet: labels appear after the first start */
    }
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

  async function start() {
    if (running) return;
    running = true;
    const jam = jamStore.getState();
    const settings = settingsStore.getState();
    jam.setStatus('starting');
    engine.configure(analysisConfigFrom(settings));
    engine.reset();
    lastMidiActivity = -Infinity;
    persistedMarkers = 0;

    await refreshDevices();

    let micOk = false;
    let micError: unknown = null;
    try {
      await mic.start({
        deviceId: settings.audioDeviceId ?? undefined,
        a4: settings.a4,
        instrument: settings.instrument,
        mode: settings.mode,
      });
      micOk = true;
      // Device labels become available once permission is granted.
      void refreshDevices();
    } catch (err) {
      micError = err;
    }

    midiConnected = await connectMidi();

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
        toast(`Microphone stopped: ${err.message}`, { tone: 'error' });
      }),
      jamStore.subscribe((s, prev) => {
        if (s.markers !== prev.markers) syncMarkers();
      }),
    ];

    const stream = mic.getStream();
    if (jam.recordAudio && micOk && stream && isAudioRecordingSupported()) {
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
      }
    }

    jam.startSession(t0);
    jam.setSource(midiConnected && !micOk ? 'midi' : 'mic');
    if (!micOk && midiConnected) {
      toast('Microphone unavailable; using MIDI only.', { tone: 'info' });
    }
  }

  async function stop() {
    if (!running) return;
    running = false;
    for (const u of subs) u();
    subs = [];
    const endT = clock.now();
    jamStore.getState().stopSession();

    try {
      if (mic.isRunning()) await mic.stop();
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
      const saved = await handle.stop({ endT });
      if (saved.durationSec >= 2 || saved.summary?.chordCount) {
        toast(`Saved “${saved.name}” to the library`, { tone: 'success', durationMs: 2500 });
      }
    } catch (err) {
      toast(`Could not save the session: ${describeError(err)}`, { tone: 'error' });
    }
  }

  return {
    start,
    stop,
    isRunning: () => running,
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
