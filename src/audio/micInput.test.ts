import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clock } from '@/core/clock';
import { createMicInput, MIC_START_TIMEOUT_MS } from './micInput';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function mediaStream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  return {
    track,
    stream: { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream,
  };
}

const getUserMedia = vi.fn();
const addModule = vi.fn();
const closeContext = vi.fn();
const contexts: Array<{ close: typeof closeContext; onstatechange?: unknown }> = [];

beforeEach(() => {
  vi.useFakeTimers();
  getUserMedia.mockReset().mockResolvedValue(mediaStream().stream);
  addModule.mockReset().mockResolvedValue(undefined);
  closeContext.mockReset().mockResolvedValue(undefined);
  contexts.length = 0;
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running';
      sampleRate = 48000;
      currentTime = 0;
      destination = {};
      audioWorklet = { addModule };
      close = closeContext;
      constructor() {
        contexts.push(this);
      }
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect: vi.fn() };
      }
      createGain() {
        return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
      }
    },
  );
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = { postMessage: vi.fn(), onmessage: null };
      connect = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal(
    'Worker',
    class {
      postMessage = vi.fn();
      terminate = vi.fn();
    },
  );
});

afterEach(() => {
  clock.attachAudioContext(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('microphone startup recovery', () => {
  it('times out a hanging worklet, releases granted tracks, and allows retry', async () => {
    const module = deferred<void>();
    const first = mediaStream();
    addModule.mockReturnValueOnce(module.promise);
    getUserMedia.mockResolvedValueOnce(first.stream);
    const input = createMicInput();
    const start = input.start();
    const failed = expect(start).rejects.toThrow('Microphone setup timed out. Try again.');
    await vi.advanceTimersByTimeAsync(MIC_START_TIMEOUT_MS);
    await failed;
    expect(first.track.stop).toHaveBeenCalledOnce();
    expect(input.getContext()).toBeNull();
    expect(closeContext).toHaveBeenCalledOnce();

    await input.start();
    expect(input.isRunning()).toBe(true);
    // Native loading can settle after retry; its old catch must not tear down the new context.
    module.reject(new Error('late module failure'));
    await vi.advanceTimersByTimeAsync(0);
    expect(input.isRunning()).toBe(true);
    expect(input.getContext()).toBe(contexts[1]);
    await input.stop();
  });

  it('cancels pending permission immediately and stops a late grant without harming retry', async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(permission.promise);
    const input = createMicInput();
    const start = input.start();
    const cancelled = expect(start).rejects.toMatchObject({ name: 'AbortError' });
    await input.stop();
    await cancelled;
    expect(input.getContext()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    const retry = mediaStream();
    getUserMedia.mockResolvedValueOnce(retry.stream);
    await input.start();
    const late = mediaStream();
    permission.resolve(late.stream);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.track.stop).toHaveBeenCalledOnce();
    expect(retry.track.stop).not.toHaveBeenCalled();
    expect(input.getStream()).toBe(retry.stream);
    expect(input.isRunning()).toBe(true);
    await input.stop();
  });

  it('times out unanswered permission and cleans up a subsequent grant', async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(permission.promise);
    const input = createMicInput();
    const failed = expect(input.start()).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(MIC_START_TIMEOUT_MS);
    await failed;
    const late = mediaStream();
    permission.resolve(late.stream);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.track.stop).toHaveBeenCalledOnce();
    expect(input.isRunning()).toBe(false);
    expect(input.getStream()).toBeNull();
  });

  it('stops a late grant when worklet loading failed before permission settled', async () => {
    const permission = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(permission.promise);
    addModule.mockRejectedValueOnce(new Error('module failed'));
    const input = createMicInput();
    await expect(input.start()).rejects.toThrow('Could not load the audio capture worklet');
    const late = mediaStream();
    permission.resolve(late.stream);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.track.stop).toHaveBeenCalledOnce();
    expect(input.getStream()).toBeNull();
  });

  it('detaches the previous context state callback before starting another context', async () => {
    const input = createMicInput();
    await input.start();
    expect(contexts[0].onstatechange).toBeTypeOf('function');
    await input.stop();
    expect(contexts[0].onstatechange).toBeNull();
    await input.start();
    expect(input.getContext()).toBe(contexts[1]);
    expect(contexts[1].onstatechange).toBeTypeOf('function');
    await input.stop();
  });

  it('does not wait for native context close when cancelling a hanging module', async () => {
    addModule.mockReturnValueOnce(new Promise(() => {}));
    closeContext.mockReturnValueOnce(new Promise(() => {}));
    const input = createMicInput();
    const cancelled = expect(input.start()).rejects.toMatchObject({ name: 'AbortError' });
    await input.stop();
    await cancelled;
    expect(input.getContext()).toBeNull();
    await input.start();
    expect(input.isRunning()).toBe(true);
    await input.stop();
  });
});
