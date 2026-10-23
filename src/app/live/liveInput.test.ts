import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jamStore, initialJamData } from '@/state/jamStore';
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
  engine: { configure: vi.fn(), reset: vi.fn(), subscribe: vi.fn(() => () => {}), push: vi.fn() },
  startSession: vi.fn(),
}));
vi.mock('@/audio', () => ({
  createMicInput: () => mocks.mic,
  AudioInputError: class extends Error {},
}));
vi.mock('@/midi', () => ({ createMidiInput: () => mocks.midi }));
vi.mock('@/analysis', () => ({ createAnalysisEngine: () => mocks.engine }));
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
    permission.resolve();
    await Promise.all([start, stop]);
    expect(mocks.startSession).not.toHaveBeenCalled();
    expect(mocks.mic.stop).toHaveBeenCalledOnce();
    expect(input.isRunning()).toBe(false);
    expect(jamStore.getState().status).toBe('idle');
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
