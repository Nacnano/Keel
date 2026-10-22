import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChromaFrame, MidiEvent } from '@/core/types';
import {
  createMidiInput,
  type MidiAccessLike,
  type MidiInputPortLike,
  type MidiMessageLike,
  type MidiStateEventLike,
} from './midiInput';

class FakePort implements MidiInputPortLike {
  type = 'input';
  state: 'connected' | 'disconnected' = 'connected';
  listeners = new Set<(e: MidiMessageLike) => void>();
  id: string;
  name: string;
  manufacturer: string;
  constructor(id: string, name: string, manufacturer = 'Acme') {
    this.id = id;
    this.name = name;
    this.manufacturer = manufacturer;
  }
  addEventListener(_: 'midimessage', l: (e: MidiMessageLike) => void) {
    this.listeners.add(l);
  }
  removeEventListener(_: 'midimessage', l: (e: MidiMessageLike) => void) {
    this.listeners.delete(l);
  }
  send(bytes: number[], timeStamp = 1000) {
    for (const l of this.listeners) l({ data: new Uint8Array(bytes), timeStamp });
  }
}

class FakeAccess implements MidiAccessLike {
  map = new Map<string, FakePort>();
  stateListeners = new Set<(e: MidiStateEventLike) => void>();
  inputs = {
    values: () => this.map.values(),
    get: (id: string) => this.map.get(id),
  };
  addEventListener(_: 'statechange', l: (e: MidiStateEventLike) => void) {
    this.stateListeners.add(l);
  }
  removeEventListener(_: 'statechange', l: (e: MidiStateEventLike) => void) {
    this.stateListeners.delete(l);
  }
  plug(port: FakePort) {
    port.state = 'connected';
    this.map.set(port.id, port);
    for (const l of this.stateListeners) l({ port });
  }
  unplug(id: string) {
    const port = this.map.get(id)!;
    port.state = 'disconnected';
    for (const l of this.stateListeners) l({ port });
  }
}

const clock = { now: () => 99, fromPerformanceMs: (ms: number) => ms / 1000 };

let access: FakeAccess;
let piano: FakePort;

beforeEach(() => {
  access = new FakeAccess();
  piano = new FakePort('in-1', 'Digital Piano', 'Roland');
  access.map.set(piano.id, piano);
  vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn(async () => access) });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createMidiInput', () => {
  it('feature-detects navigator.requestMIDIAccess', () => {
    expect(createMidiInput().isSupported()).toBe(true);
    vi.stubGlobal('navigator', {});
    const input = createMidiInput();
    expect(input.isSupported()).toBe(false);
    return expect(input.listDevices()).rejects.toThrow(/not supported/);
  });

  it('lists devices and requests access only once', async () => {
    const input = createMidiInput({ clock });
    expect(await input.listDevices()).toEqual([
      { id: 'in-1', name: 'Digital Piano', manufacturer: 'Roland' },
    ]);
    await input.listDevices();
    expect(navigator.requestMIDIAccess).toHaveBeenCalledTimes(1);
  });

  it('connects, parses events and emits a frame per change', async () => {
    const input = createMidiInput({ clock });
    const events: MidiEvent[] = [];
    const frames: ChromaFrame[] = [];
    input.onEvent((e) => events.push(e));
    input.onFrame((f) => frames.push(f));
    await input.connect('in-1');
    expect(input.isConnected()).toBe(true);
    expect(input.getDeviceId()).toBe('in-1');

    piano.send([0x90, 52, 100], 1500); // E3
    expect(events).toEqual([{ t: 1.5, type: 'on', note: 52, velocity: 100, channel: 0 }]);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ t: 1.5, bass: 4, onset: true, exact: true, energy: 1 });

    piano.send([0xfe, 0, 0]); // active sensing: ignored entirely
    expect(events).toHaveLength(1);
  });

  it('rejects unknown devices', async () => {
    const input = createMidiInput({ clock });
    await expect(input.connect('nope')).rejects.toThrow(/not found/);
    expect(input.getDeviceId()).toBeNull();
  });

  it('throttles frames to one per 20 ms and always emits the trailing state', async () => {
    vi.useFakeTimers();
    const input = createMidiInput({ clock });
    const frames: ChromaFrame[] = [];
    input.onFrame((f) => frames.push(f));
    await input.connect('in-1');

    piano.send([0x90, 60, 100], 1000); // leading edge: immediate
    piano.send([0x90, 64, 100], 1002);
    piano.send([0x90, 67, 100], 1004);
    expect(frames).toHaveLength(1);

    vi.advanceTimersByTime(19);
    expect(frames).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(frames).toHaveLength(2);
    const last = frames[1];
    expect(last.t).toBeCloseTo(1.004);
    expect(last.onset).toBe(true);
    expect(Array.from(last.chroma).filter((x) => x > 0)).toHaveLength(3);

    // quiet period: no extra frames
    vi.advanceTimersByTime(100);
    expect(frames).toHaveLength(2);

    // pedal down alone is not a held-note change
    piano.send([0xb0, 64, 127], 1200);
    expect(frames).toHaveLength(2);
    // released keys stay held under sustain: no change, no frame
    piano.send([0x80, 60, 0], 1210);
    expect(frames).toHaveLength(2);
    // pedal up releases 60, 64, 67 -> immediate frame (outside cooldown)
    piano.send([0x80, 64, 0], 1220);
    piano.send([0x80, 67, 0], 1221);
    piano.send([0xb0, 64, 0], 1300);
    expect(frames).toHaveLength(3);
    expect(frames[2]).toMatchObject({ energy: 0, bass: null, onset: false });
  });

  it('hot-plug: releases notes on unplug and re-attaches on replug', async () => {
    const input = createMidiInput({ clock });
    const frames: ChromaFrame[] = [];
    const lists: string[][] = [];
    input.onFrame((f) => frames.push(f));
    input.onDevicesChange((d) => lists.push(d.map((x) => x.id)));
    await input.connect('in-1');

    vi.useFakeTimers();
    piano.send([0x90, 60, 100]);
    vi.advanceTimersByTime(50);
    access.unplug('in-1');
    expect(input.isConnected()).toBe(false);
    expect(input.getDeviceId()).toBe('in-1');
    expect(frames.at(-1)).toMatchObject({ energy: 0, t: 99 });
    expect(lists.at(-1)).toEqual([]);

    const other = new FakePort('in-2', 'Pad');
    access.plug(other);
    expect(input.isConnected()).toBe(false);
    expect(lists.at(-1)).toEqual(['in-2']);

    access.plug(piano);
    expect(input.isConnected()).toBe(true);
    expect(piano.listeners.size).toBe(1);
    expect(lists.at(-1)).toEqual(['in-1', 'in-2']);
  });

  it('disconnect detaches the listener and clears held notes', async () => {
    const input = createMidiInput({ clock });
    const frames: ChromaFrame[] = [];
    input.onFrame((f) => frames.push(f));
    await input.connect('in-1');
    vi.useFakeTimers();
    piano.send([0x90, 60, 100]);
    expect(input.heldNotes.held().size).toBe(1);
    input.disconnect();
    expect(piano.listeners.size).toBe(0);
    expect(input.getDeviceId()).toBeNull();
    expect(input.heldNotes.held().size).toBe(0);
    expect(frames.at(-1)?.energy).toBe(0);
    piano.send([0x90, 62, 100]);
    vi.advanceTimersByTime(100);
    expect(frames).toHaveLength(2);
  });

  it('switching devices moves the listener', async () => {
    const pad = new FakePort('in-2', 'Pad');
    access.map.set(pad.id, pad);
    const input = createMidiInput({ clock });
    await input.connect('in-1');
    await input.connect('in-2');
    expect(piano.listeners.size).toBe(0);
    expect(pad.listeners.size).toBe(1);
  });
});
