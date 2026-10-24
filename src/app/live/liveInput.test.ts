import { resetDb } from '@/data/testing/setup';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AnalysisEvent, ChromaFrame, PitchClass } from '@/core';
import { jamStore, initialJamData } from '@/state/jamStore';
import { clock } from '@/core/clock';
import { db } from '@/data/db';
import { startSession as recordSession } from '@/data/sessionRecorder';
import type { SessionMeta } from '@/data/sessionRecorder';
import { AudioInputError } from '@/audio';
import { C_MAJOR_KEY } from '@/core/mocks';
import { settingsStore } from '@/state/settingsStore';

const mocks = vi.hoisted(() => ({
  mic: {
    start: vi.fn(),
    stop: vi.fn(),
    configure: vi.fn(),
    isRunning: vi.fn(),
    listDevices: vi.fn(),
    onFrame: vi.fn(() => () => {}),
    onError: vi.fn(() => () => {}),
    getStream: vi.fn(),
    getContext: vi.fn(),
  },
  midi: {
    isSupported: vi.fn(() => false),
    listDevices: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    onDevicesChange: vi.fn(),
    onFrame: vi.fn(),
    onEvent: vi.fn(),
  },
  engine: {
    configure: vi.fn(),
    reset: vi.fn(),
    subscribe: vi.fn((_cb: (e: AnalysisEvent) => void) => () => {}),
    push: vi.fn(),
  },
  engineFactory: vi.fn(),
  startSession: vi.fn(),
}));
vi.mock('@/audio', () => ({
  createMicInput: () => mocks.mic,
  AudioInputError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));
vi.mock('@/midi', () => ({ createMidiInput: () => mocks.midi }));
vi.mock('@/analysis', () => ({
  createAnalysisEngine: () => mocks.engineFactory() ?? mocks.engine,
}));
vi.mock('@/data', () => ({
  startSession: mocks.startSession,
  isAudioRecordingSupported: () => false,
  createAudioRecorder: vi.fn(),
}));
vi.mock('@/sync/signals', () => ({ notifySessionSaved: vi.fn() }));
vi.mock('@/ui/components/toastStore', () => ({ toast: vi.fn() }));
import { toast } from '@/ui/components/toastStore';
import { createLiveInput } from './liveInput';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.engineFactory.mockReset();
  settingsStore.getState().resetSettings();
  jamStore.setState(initialJamData());
  mocks.midi.isSupported.mockReturnValue(false);
  mocks.midi.listDevices.mockResolvedValue([]);
  mocks.mic.start.mockResolvedValue(undefined);
  mocks.mic.stop.mockResolvedValue(undefined);
  mocks.mic.listDevices.mockResolvedValue([]);
  mocks.mic.isRunning.mockReturnValue(true);
  mocks.startSession.mockImplementation(() => ({
    stop: vi.fn().mockResolvedValue({ id: 'saved', name: 'Idea', durationSec: 5 }),
    onAnalysisEvent: vi.fn(),
    onMidiEvent: vi.fn(),
    addMarker: vi.fn(),
  }));
});

describe('live input lifecycle', () => {
  it('starts with the microphone without prompting for MIDI', async () => {
    mocks.midi.isSupported.mockReturnValue(true);
    const input = createLiveInput();
    const started = input.start();
    expect(mocks.mic.start).toHaveBeenCalledOnce();
    expect(mocks.midi.listDevices).not.toHaveBeenCalled();
    await started;
    expect(mocks.midi.listDevices).not.toHaveBeenCalled();
    await input.stop();
  });

  it('reports a saved result only after successful persistence', async () => {
    const input = createLiveInput();
    const onSaved = vi.fn();
    const onSaveError = vi.fn();
    await input.start();
    await input.stop({ onSaved, onSaveError });
    expect(onSaved).toHaveBeenCalledWith({ id: 'saved', name: 'Idea' });
    expect(onSaveError).not.toHaveBeenCalled();
  });

  it('reports save failures without claiming a saved result', async () => {
    const input = createLiveInput();
    const onSaved = vi.fn();
    const onSaveError = vi.fn();
    await input.start();
    mocks.startSession.mock.results.at(-1)!.value.stop.mockRejectedValue(new Error('Storage full'));
    await input.stop({ onSaved, onSaveError });
    expect(onSaved).not.toHaveBeenCalled();
    expect(onSaveError).toHaveBeenCalledWith(expect.stringContaining('Storage full'));
  });

  it('applies sensitivity on start and immediately when it changes', async () => {
    settingsStore.getState().update({ sensitivity: 0.8 });
    const input = createLiveInput();
    await input.start();
    expect(mocks.mic.start).toHaveBeenCalledWith(expect.objectContaining({ sensitivity: 0.8 }));
    settingsStore.getState().update({ sensitivity: 0.3 });
    expect(mocks.mic.configure).toHaveBeenCalledWith(expect.objectContaining({ sensitivity: 0.3 }));
    await input.stop();
  });

  it('cancels startup if stopped while microphone permission is pending', async () => {
    const permission = deferred();
    mocks.mic.start.mockReturnValueOnce(permission.promise);
    const input = createLiveInput();
    const start = input.start();
    await vi.waitFor(() => expect(mocks.mic.start).toHaveBeenCalled());
    const stop = input.stop();
    // Neither cancellation nor the returned startup promise waits for native permission.
    await Promise.all([start, stop]);
    permission.resolve();
    await Promise.resolve();
    expect(mocks.startSession).not.toHaveBeenCalled();
    expect(mocks.mic.stop).toHaveBeenCalledOnce();
    expect(input.isRunning()).toBe(false);
    expect(jamStore.getState().status).toBe('idle');
  });

  it('retries before a cancelled native start settles and ignores its late completion', async () => {
    const oldPermission = deferred();
    const newPermission = deferred();
    mocks.mic.start
      .mockReturnValueOnce(oldPermission.promise)
      .mockReturnValueOnce(newPermission.promise);
    mocks.mic.isRunning.mockReturnValue(false);
    const input = createLiveInput();
    const oldStart = input.start();
    const oldError = (
      mocks.mic.onError.mock.calls.at(-1) as unknown as [(error: Error) => void]
    )[0];
    await input.stop();
    await oldStart;
    expect(mocks.mic.stop).toHaveBeenCalledOnce();

    const retry = input.start();
    oldError(new AudioInputError('worklet', 'old attempt failure'));
    expect(jamStore.getState().inputIssue).toBeNull();
    oldPermission.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.startSession).not.toHaveBeenCalled();
    expect(input.start()).toBe(retry);
    expect(mocks.mic.start).toHaveBeenCalledTimes(2);
    newPermission.resolve();
    await retry;
    expect(mocks.startSession).toHaveBeenCalledOnce();
    expect(jamStore.getState().status).toBe('listening');
    await input.stop();
  });

  it('finishes saving the old session before starting another', async () => {
    const shutdown = deferred();
    mocks.mic.stop.mockReturnValueOnce(shutdown.promise);
    const input = createLiveInput();
    await input.start();
    const oldSession = mocks.startSession.mock.results[0].value;
    const stop = input.stop();
    const restart = input.start();
    expect(mocks.startSession).toHaveBeenCalledOnce();
    shutdown.resolve();
    await Promise.all([stop, restart]);
    expect(oldSession.stop).toHaveBeenCalledOnce();
    expect(mocks.startSession).toHaveBeenCalledTimes(2);
    expect(input.isRunning()).toBe(true);
    await input.stop();
  });

  it('says nothing was saved when the session was discarded as silent', async () => {
    const input = createLiveInput();
    const onSaved = vi.fn();
    await input.start();
    mocks.startSession.mock.results.at(-1)!.value.stop.mockResolvedValue(null);
    await input.stop({ onSaved });
    expect(onSaved).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('drops Record audio when the take cannot be recorded, so the header stays honest', async () => {
    jamStore.getState().setRecordAudio(true);
    const input = createLiveInput();
    await input.start();
    expect(jamStore.getState().recordAudio).toBe(false);
    await input.stop();
  });

  it('keeps chords out of the timeline and the session while it cannot hear much', async () => {
    let emit: (e: AnalysisEvent) => void = () => {};
    mocks.engine.subscribe.mockImplementationOnce((cb: (e: AnalysisEvent) => void) => {
      emit = cb;
      return () => {};
    });
    const input = createLiveInput();
    await input.start();
    const session = mocks.startSession.mock.results[0].value as { onAnalysisEvent: Mock };
    const t0 = jamStore.getState().sessionStart ?? 0;
    const level = (t: number, energy: number) => emit({ type: 'level', t: t0 + t, energy });
    const chord = (t: number, root: PitchClass): AnalysisEvent => ({
      type: 'chord',
      t: t0 + t,
      chord: { root, quality: 'maj' },
      confidence: 0.9,
      source: 'mic',
    });
    level(0, 0.3);
    emit(chord(0.5, 0));
    // quiet for 4 s: "Can't hear much"
    level(1, 0.01);
    level(5.1, 0.01);
    expect(jamStore.getState().quiet).toBe(true);
    emit(chord(6, 7));
    emit(chord(7, 9));
    expect(jamStore.getState().timeline.map((r) => r.chord?.root)).toEqual([0]);
    expect(session.onAnalysisEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ t: t0 + 6 }),
    );
    // two seconds of sound: the chord playing now comes back, once
    level(8, 0.3);
    expect(jamStore.getState().quiet).toBe(true);
    level(10.1, 0.3);
    expect(jamStore.getState().quiet).toBe(false);
    expect(jamStore.getState().timeline.map((r) => r.chord?.root)).toEqual([0, 9]);
    expect(jamStore.getState().timeline[1].t).toBeCloseTo(10.1);
    await input.stop();
  });

  it('New song resets the key when the engine supports it', async () => {
    const input = createLiveInput();
    await input.start();
    jamStore.setState({
      key: {
        tonic: 0,
        mode: 'major',
        confidence: 1,
        relative: { tonic: 9, mode: 'minor' },
        alternatives: [],
      },
    });
    input.newSong(); // no resetKey on this engine: the key stays
    expect(jamStore.getState().key).not.toBeNull();
    const resetKey = vi.fn();
    Object.assign(mocks.engine, { resetKey });
    try {
      input.newSong();
      expect(resetKey).toHaveBeenCalledOnce();
      expect(jamStore.getState().key).toBeNull();
    } finally {
      delete (mocks.engine as { resetKey?: unknown }).resetKey;
    }
    await input.stop();
  });

  it('does not toast "Saved" when the caller shows its own confirmation', async () => {
    const input = createLiveInput();
    await input.start();
    await input.stop({ onSaved: vi.fn() });
    expect(toast).not.toHaveBeenCalled();
    await input.start();
    await input.stop();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Saved'), expect.anything());
  });

  it('keeps the screen awake while listening and lets it sleep after', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release, addEventListener: vi.fn() });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    try {
      const input = createLiveInput();
      await input.start();
      await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
      // the browser drops the lock when the page is hidden; it comes back when visible
      document.dispatchEvent(new Event('visibilitychange'));
      await input.stop();
      expect(release).toHaveBeenCalledOnce();
      request.mockClear();
      document.dispatchEvent(new Event('visibilitychange'));
      expect(request).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, 'wakeLock');
    }
  });

  it('keeps listening when the wake lock is refused', async () => {
    const request = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    try {
      const input = createLiveInput();
      await input.start();
      await vi.waitFor(() => expect(request).toHaveBeenCalled());
      expect(input.isRunning()).toBe(true);
      expect(jamStore.getState().status).toBe('listening');
      await input.stop();
    } finally {
      Reflect.deleteProperty(navigator, 'wakeLock');
    }
  });
});

describe('provisional result routing', () => {
  it('shows previews without sending them to session persistence', async () => {
    let emit: (e: AnalysisEvent) => void = () => {};
    mocks.engine.subscribe.mockImplementationOnce((cb) => {
      emit = cb;
      return () => {};
    });
    const input = createLiveInput();
    await input.start();
    const session = mocks.startSession.mock.results.at(-1)!.value;
    emit({ type: 'preview', t: 1, chord: { root: 0, quality: 'maj' }, confidence: 0.6, key: null });
    expect(jamStore.getState().previewChord?.root).toBe(0);
    expect(session.onAnalysisEvent).not.toHaveBeenCalled();
    settingsStore.getState().update({ mode: 'room' });
    expect(jamStore.getState().previewChord).toBeNull();
    await input.stop();
  });
});

describe('source transition readout', () => {
  it('keeps the accepted microphone source after an engine clear carrying the old source', async () => {
    let emit: (e: AnalysisEvent) => void = () => {};
    mocks.engine.subscribe.mockImplementationOnce((cb) => {
      emit = cb;
      return () => {};
    });
    const input = createLiveInput();
    await input.start();
    const frame = (mocks.mic.onFrame.mock.calls.at(-1) as unknown as [(f: unknown) => void])[0];
    mocks.engine.push.mockImplementationOnce(() => {
      emit({ type: 'chord', t: 1, chord: null, confidence: 0, source: 'midi' });
    });
    frame({ t: 1, exact: false, energy: 0, chroma: new Float32Array(12) });
    expect(jamStore.getState().source).toBe('mic');
    emit({ type: 'level', t: 2, energy: 0 });
    emit({ type: 'level', t: 7, energy: 0 });
    expect(jamStore.getState().quiet).toBe(true);
    await input.stop();
  });
});

function runtimeFrame(t: number, exact = false, midiNotes: number[] = [60]): ChromaFrame {
  const chroma = new Float32Array(12);
  for (const note of midiNotes) chroma[note % 12] = 1 / midiNotes.length;
  return {
    t,
    exact,
    chroma,
    midiNotes,
    energy: midiNotes.length ? 0.3 : 0,
    bass: null,
    onset: false,
  };
}

function runtimeCallbacks() {
  return {
    micFrame: (mocks.mic.onFrame.mock.calls.at(-1) as unknown as [(frame: ChromaFrame) => void])[0],
    error: (mocks.mic.onError.mock.calls.at(-1) as unknown as [(error: Error) => void])[0],
  };
}

describe('persistent capture interruption', () => {
  it.each(['no-device', 'worklet'] as const)(
    'keeps history, rejects queued mic frames, and allows finish/restart after %s',
    async (code) => {
      const input = createLiveInput();
      await input.start();
      const { micFrame, error } = runtimeCallbacks();
      micFrame(runtimeFrame(1));
      const s = jamStore.getState();
      s.applyEvent({
        type: 'chord',
        t: 1,
        chord: { root: 0, quality: 'maj' },
        confidence: 0.9,
        source: 'mic',
      });
      s.applyEvent({ type: 'key', t: 1, key: C_MAJOR_KEY });
      s.applyEvent({
        type: 'notes',
        t: 1,
        pitchClasses: [0],
        midiNotes: [60],
        tentativeMidiNotes: [64],
      });
      s.addMarker('verse', 'Verse', 1);
      s.setQuiet(true);
      const before = jamStore.getState();
      error(new AudioInputError(code, 'capture unavailable'));
      const issue = jamStore.getState().inputIssue;
      expect(issue).toContain('Finish & save, then start again.');
      expect(jamStore.getState()).toMatchObject({
        status: 'listening',
        quiet: false,
        currentChord: null,
        key: null,
        activeMidiNotes: [],
        tentativeMidiNotes: [],
        timeline: before.timeline,
        keyHistory: before.keyHistory,
        markers: before.markers,
        sessionId: before.sessionId,
      });
      const pushes = mocks.engine.push.mock.calls.length;
      micFrame(runtimeFrame(10));
      expect(mocks.engine.push).toHaveBeenCalledTimes(pushes);
      error(new AudioInputError('worklet', 'duplicate failure'));
      expect(jamStore.getState().inputIssue).toBe(issue);
      expect(mocks.mic.stop).not.toHaveBeenCalled();
      const session = mocks.startSession.mock.results.at(-1)!.value;
      await input.stop({ onSaved: vi.fn() });
      expect(session.stop).toHaveBeenCalledOnce();
      expect(jamStore.getState().inputIssue).toBeNull();
      await input.start();
      const afterRestart = mocks.engine.push.mock.calls.length;
      runtimeCallbacks().micFrame(runtimeFrame(20));
      expect(mocks.engine.push).toHaveBeenCalledTimes(afterRestart + 1);
      expect(jamStore.getState().inputIssue).toBeNull();
      await input.stop({ onSaved: vi.fn() });
    },
  );

  it('accepts following microphone frames after a recoverable DSP warning', async () => {
    const input = createLiveInput();
    await input.start();
    const { micFrame, error } = runtimeCallbacks();
    error(new Error('one malformed hop'));
    expect(jamStore.getState().inputIssue).toBeNull();
    expect(toast).toHaveBeenCalledWith('Audio processing warning: one malformed hop', {
      tone: 'error',
    });
    const pushes = mocks.engine.push.mock.calls.length;
    micFrame(runtimeFrame(1));
    expect(mocks.engine.push).toHaveBeenCalledTimes(pushes + 1);
    await input.stop({ onSaved: vi.fn() });
  });

  it('keeps active MIDI readout and subsequent exact input when the microphone fails', async () => {
    settingsStore.getState().update({ midiDeviceId: 'keyboard' });
    mocks.midi.isSupported.mockReturnValue(true);
    mocks.midi.connect.mockResolvedValue(undefined);
    mocks.midi.onFrame.mockReturnValue(() => {});
    mocks.midi.onEvent.mockReturnValue(() => {});
    const input = createLiveInput();
    await input.start();
    const midiFrame = mocks.midi.onFrame.mock.calls.at(-1)![0] as (frame: ChromaFrame) => void;
    midiFrame(runtimeFrame(1, true, [60, 64, 67]));
    jamStore
      .getState()
      .applyEvent({ type: 'notes', t: 1, pitchClasses: [0, 4, 7], midiNotes: [60, 64, 67] });
    jamStore.getState().applyEvent({
      type: 'chord',
      t: 1,
      chord: { root: 0, quality: 'maj' },
      confidence: 1,
      source: 'midi',
    });
    const { error, micFrame } = runtimeCallbacks();
    const resets = mocks.engine.reset.mock.calls.length;
    const session = mocks.startSession.mock.results.at(-1)!.value;
    const recordedEvents = session.onAnalysisEvent.mock.calls.length;
    error(new AudioInputError('no-device', 'track ended'));
    expect(mocks.engine.reset).toHaveBeenCalledTimes(resets);
    expect(session.onAnalysisEvent).toHaveBeenCalledTimes(recordedEvents);
    expect(jamStore.getState()).toMatchObject({
      source: 'midi',
      activeMidiNotes: [60, 64, 67],
      currentChord: { root: 0, quality: 'maj' },
      quiet: false,
    });
    expect(jamStore.getState().inputIssue).toContain('Microphone stopped');
    const pushes = mocks.engine.push.mock.calls.length;
    micFrame(runtimeFrame(10)); // Beyond the normal MIDI priority timeout: still rejected.
    expect(mocks.engine.push).toHaveBeenCalledTimes(pushes);
    const next = runtimeFrame(11, true, [62, 65, 69]);
    midiFrame(next);
    expect(mocks.engine.push).toHaveBeenLastCalledWith(next);
    expect(jamStore.getState().source).toBe('midi');
    expect(mocks.mic.stop).not.toHaveBeenCalled();
    await input.stop({ onSaved: vi.fn() });
  });
});

it('persists the failure-time no-chord boundary and New song cannot resurrect stale harmony', async () => {
  await resetDb();
  const realAnalysis = await vi.importActual<typeof import('@/analysis')>('@/analysis');
  const engine = realAnalysis.createAnalysisEngine();
  mocks.engineFactory.mockReturnValueOnce(engine);
  mocks.startSession.mockImplementationOnce((meta: SessionMeta) => recordSession(meta));
  const now = vi.spyOn(clock, 'now').mockReturnValue(0);
  const input = createLiveInput();
  try {
    await input.start();
    const session = mocks.startSession.mock.results.at(-1)!.value;
    await session.ready;
    const { micFrame, error } = runtimeCallbacks();
    for (let i = 0; i < 60; i++) micFrame(runtimeFrame(i * 0.04, false, [60, 64, 67]));
    expect(jamStore.getState().currentChord).not.toBeNull();
    now.mockReturnValue(10);
    error(new AudioInputError('no-device', 'track ended'));
    expect(jamStore.getState().currentChord).toBeNull();
    input.newSong();
    expect(jamStore.getState().currentChord).toBeNull();
    now.mockReturnValue(30);
    await input.stop({ onSaved: vi.fn() });
    const saved = await db.sessions.get(session.id);
    const chords = await db.chords.where('sessionId').equals(session.id).sortBy('t');
    expect(saved?.durationSec).toBe(30);
    expect(chords.some((row) => row.chord !== null)).toBe(true);
    expect(chords.at(-1)).toMatchObject({ t: 10, chord: null, source: 'mic' });
    expect(chords.filter((row) => row.t > 10)).toEqual([]);
  } finally {
    await input.stop({ onSaved: vi.fn() });
    now.mockRestore();
    await resetDb();
  }
});

it('observes fatal microphone loss during pending MIDI setup and continues with MIDI only', async () => {
  const connected = deferred();
  settingsStore.getState().update({ midiDeviceId: 'keyboard' });
  mocks.midi.isSupported.mockReturnValue(true);
  mocks.midi.connect.mockReturnValueOnce(connected.promise);
  mocks.midi.onFrame.mockReturnValue(() => {});
  mocks.midi.onEvent.mockReturnValue(() => {});
  const input = createLiveInput();
  const started = input.start();
  await vi.waitFor(() => expect(mocks.midi.connect).toHaveBeenCalled());
  const error = (mocks.mic.onError.mock.calls.at(-1) as unknown as [(error: Error) => void])[0];
  error(new AudioInputError('no-device', 'disconnected during MIDI setup'));
  connected.resolve();
  await started;
  expect(jamStore.getState()).toMatchObject({ status: 'listening', source: 'midi' });
  expect(jamStore.getState().inputIssue).toContain('Microphone stopped');
  expect(mocks.mic.onFrame).not.toHaveBeenCalled();
  expect(mocks.midi.onFrame).toHaveBeenCalledOnce();
  expect(mocks.mic.stop).not.toHaveBeenCalled();
  await input.stop({ onSaved: vi.fn() });
});

it('releases early failed capture when MIDI setup also fails, before exposing retry', async () => {
  const connection = deferred();
  settingsStore.getState().update({ midiDeviceId: 'keyboard' });
  mocks.midi.isSupported.mockReturnValue(true);
  mocks.midi.connect.mockImplementationOnce(async () => {
    await connection.promise;
    throw new Error('MIDI unavailable');
  });
  const unsubscribe = vi.fn();
  mocks.mic.onError.mockReturnValueOnce(unsubscribe);
  const input = createLiveInput();
  const started = input.start();
  await vi.waitFor(() => expect(mocks.midi.connect).toHaveBeenCalled());
  const error = (mocks.mic.onError.mock.calls.at(-1) as unknown as [(error: Error) => void])[0];
  error(new AudioInputError('no-device', 'disconnected during MIDI setup'));
  connection.resolve();
  await started;
  expect(mocks.mic.stop).toHaveBeenCalledOnce();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(mocks.startSession).not.toHaveBeenCalled();
  expect(jamStore.getState().status).toBe('error');
  expect(input.isRunning()).toBe(false);
  const issue = jamStore.getState().inputIssue;
  error(new AudioInputError('worklet', 'stale callback'));
  expect(jamStore.getState().inputIssue).toBe(issue);
});
