import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAudioRecorder,
  isAudioRecordingSupported,
  pickMimeType,
  type AudioRecorderOptions,
} from './audioRecorder';

let supported = new Set<string>();
const instances: FakeMediaRecorder[] = [];

class FakeMediaRecorder {
  static isTypeSupported(t: string) {
    return supported.has(t);
  }
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? 'audio/webm';
    instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  emit(bytes: number) {
    this.ondataavailable?.({ data: new Blob(['x'.repeat(bytes)]) });
  }
  stop() {
    this.state = 'inactive';
    this.emit(1);
    this.onstop?.();
  }
}

const stream = {} as MediaStream;

describe('audioRecorder', () => {
  let clock = 0;
  const base: AudioRecorderOptions = { now: () => clock };

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 1_000_000;
    supported = new Set(['audio/webm;codecs=opus', 'audio/mp4']);
    instances.length = 0;
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is import-safe and reports unsupported without MediaRecorder', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    expect(isAudioRecordingSupported()).toBe(false);
    expect(pickMimeType()).toBe('');
    expect(() => createAudioRecorder(stream)).toThrow(/not supported/);
  });

  it('prefers webm/opus, then mp4, then anything supported', () => {
    expect(pickMimeType()).toBe('audio/webm;codecs=opus');
    supported = new Set(['audio/mp4', 'audio/webm']);
    expect(pickMimeType()).toBe('audio/mp4');
    supported = new Set(['audio/ogg;codecs=opus']);
    expect(pickMimeType()).toBe('audio/ogg;codecs=opus');
    supported = new Set();
    expect(pickMimeType()).toBe('');
  });

  it('records chunks and returns one blob with duration', async () => {
    const rec = createAudioRecorder(stream, base);
    expect(rec.state).toBe('idle');
    await expect(rec.stop()).rejects.toThrow(/never started/);
    rec.start();
    expect(rec.state).toBe('recording');
    expect(instances[0].mimeType).toBe('audio/webm;codecs=opus');
    instances[0].emit(10);
    clock += 12_500;
    const take = await rec.stop();
    expect(rec.state).toBe('stopped');
    expect(take.mimeType).toBe('audio/webm;codecs=opus');
    expect(take.blob.size).toBe(11);
    expect(take.durationSec).toBe(12.5);
    await expect(rec.stop()).resolves.toBe(take);
    expect(() => rec.start()).toThrow(/already/);
  });

  it('warns at 25 min and auto-stops at 30 min', async () => {
    const onWarning = vi.fn();
    const onLimit = vi.fn();
    const rec = createAudioRecorder(stream, { ...base, onWarning, onLimit });
    rec.start();
    clock += 25 * 60_000;
    vi.advanceTimersByTime(1000);
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onWarning.mock.calls[0][0]).toMatchObject({ remainingSec: 300 });
    clock += 5 * 60_000;
    vi.advanceTimersByTime(1000);
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onLimit).toHaveBeenCalledWith('duration');
    expect(rec.state).toBe('stopped');
    const take = await rec.stop();
    expect(take.durationSec).toBe(1800);
  });

  it('auto-stops at the size cap', async () => {
    const onLimit = vi.fn();
    const rec = createAudioRecorder(stream, { ...base, maxBytes: 100, onLimit });
    rec.start();
    instances[0].emit(60);
    expect(onLimit).not.toHaveBeenCalled();
    instances[0].emit(60);
    expect(onLimit).toHaveBeenCalledWith('size');
    expect((await rec.stop()).blob.size).toBe(121);
  });
});
