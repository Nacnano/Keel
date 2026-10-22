/**
 * Web MIDI implementation of `MidiInput`.
 *
 * - `isSupported()` feature-detects `navigator.requestMIDIAccess` (Chrome, Edge,
 *   Firefox; not Safari).
 * - MIDI access is requested lazily on the first `listDevices()` / `connect()`.
 * - Hot-plug: `statechange` refreshes the device list and re-attaches the
 *   chosen device when it comes back; unplugging releases all held notes.
 * - `onFrame` fires on every held-note change, throttled to at most one frame
 *   per `throttleMs` (20 ms), trailing edge so the final state always lands.
 */
import { clock as sharedClock, type Clock } from '@/core/clock';
import { createEmitter } from '@/core/events';
import type { ChromaFrame, MidiDeviceInfo, MidiEvent, MidiInput } from '@/core/types';
import { createHeldNotes, type HeldNotes } from './heldNotes';
import { parseMidiMessage } from './parse';

/* Structural subsets of the Web MIDI types, so tests can pass plain stubs. */
export interface MidiMessageLike {
  data: Uint8Array | null;
  timeStamp: number;
}
export interface MidiPortLike {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  type?: 'input' | 'output' | string;
  state?: 'connected' | 'disconnected' | string;
}
export interface MidiInputPortLike extends MidiPortLike {
  addEventListener(type: 'midimessage', listener: (e: MidiMessageLike) => void): void;
  removeEventListener(type: 'midimessage', listener: (e: MidiMessageLike) => void): void;
}
export interface MidiStateEventLike {
  port: MidiPortLike | null;
}
export interface MidiAccessLike {
  inputs: {
    values(): Iterable<MidiInputPortLike>;
    get(id: string): MidiInputPortLike | undefined;
  };
  addEventListener(type: 'statechange', listener: (e: MidiStateEventLike) => void): void;
  removeEventListener(type: 'statechange', listener: (e: MidiStateEventLike) => void): void;
}

export interface MidiInputOptions {
  /** Override access (tests, or a polyfill). Defaults to `navigator.requestMIDIAccess`. */
  requestMIDIAccess?: () => Promise<MidiAccessLike>;
  clock?: Pick<Clock, 'now' | 'fromPerformanceMs'>;
  /** Minimum spacing between frames. Default 20 ms. */
  throttleMs?: number;
}

export interface WebMidiInput extends MidiInput {
  /** Fires with the fresh device list whenever an input is plugged or unplugged. */
  onDevicesChange(cb: (devices: MidiDeviceInfo[]) => void): () => void;
  /** Device id passed to the last successful `connect()`, until `disconnect()`. */
  getDeviceId(): string | null;
  /** True while the chosen device is physically present and listened to. */
  isConnected(): boolean;
  /** Read-only view of the held-note model (for the on-screen keyboard). */
  readonly heldNotes: Pick<HeldNotes, 'held' | 'keysDown' | 'isSustainDown'>;
}

type NavigatorWithMidi = { requestMIDIAccess?: (opts?: { sysex?: boolean }) => Promise<unknown> };

function getNavigator(): NavigatorWithMidi | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator as NavigatorWithMidi);
}

function toDeviceInfo(p: MidiPortLike): MidiDeviceInfo {
  return { id: p.id, name: p.name ?? 'MIDI device', manufacturer: p.manufacturer ?? '' };
}

const perfNowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function createMidiInput(opts: MidiInputOptions = {}): WebMidiInput {
  const clock = opts.clock ?? sharedClock;
  const throttleMs = opts.throttleMs ?? 20;
  const events = createEmitter<MidiEvent>();
  const frames = createEmitter<ChromaFrame>();
  const devices = createEmitter<MidiDeviceInfo[]>();
  const held = createHeldNotes();

  let accessPromise: Promise<MidiAccessLike> | null = null;
  let access: MidiAccessLike | null = null;
  let wantedId: string | null = null;
  let attached: MidiInputPortLike | null = null;

  // Throttle state: leading edge emits immediately, then a cooldown window
  // during which changes only mark the state dirty; the window's end flushes.
  let cooldown: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let lastT = 0;

  const emitFrame = () => {
    dirty = false;
    frames.emit(held.toFrame(lastT));
  };
  const startCooldown = () => {
    cooldown = setTimeout(() => {
      cooldown = null;
      if (dirty) {
        emitFrame();
        startCooldown();
      }
    }, throttleMs);
  };
  const frameChanged = () => {
    if (cooldown) {
      dirty = true;
      return;
    }
    emitFrame();
    startCooldown();
  };
  const flushNow = () => {
    if (cooldown) clearTimeout(cooldown);
    cooldown = null;
    emitFrame();
  };

  const onMessage = (msg: MidiMessageLike) => {
    // Some browsers report 0 for synthetic or early events; fall back to "now".
    const ts = msg.timeStamp > 0 ? msg.timeStamp : perfNowMs();
    const e = parseMidiMessage(msg.data, ts, clock);
    if (!e) return;
    events.emit(e);
    if (held.apply(e)) {
      lastT = e.t;
      frameChanged();
    }
  };

  const listInputs = (a: MidiAccessLike) =>
    Array.from(a.inputs.values())
      .filter((p) => p.state !== 'disconnected')
      .map(toDeviceInfo);

  const attach = (port: MidiInputPortLike) => {
    attached = port;
    port.addEventListener('midimessage', onMessage);
  };
  const detach = () => {
    attached?.removeEventListener('midimessage', onMessage);
    attached = null;
  };
  const releaseAll = () => {
    if (held.reset()) {
      lastT = clock.now();
      flushNow();
    }
  };

  const onStateChange = (e: MidiStateEventLike) => {
    const port = e.port;
    if (!port || (port.type !== undefined && port.type !== 'input') || !access) return;
    devices.emit(listInputs(access));
    if (port.id !== wantedId) return;
    if (port.state === 'disconnected') {
      if (attached) {
        detach();
        releaseAll();
      }
    } else if (!attached) {
      const input = access.inputs.get(port.id);
      if (input) attach(input);
    }
  };

  const getAccess = (): Promise<MidiAccessLike> => {
    if (!accessPromise) {
      const request =
        opts.requestMIDIAccess ??
        (() => {
          const nav = getNavigator();
          if (!nav?.requestMIDIAccess) {
            return Promise.reject(new Error('Web MIDI is not supported in this browser'));
          }
          return nav.requestMIDIAccess({ sysex: false }) as Promise<MidiAccessLike>;
        });
      accessPromise = request().then(
        (a) => {
          access = a;
          a.addEventListener('statechange', onStateChange);
          return a;
        },
        (err: unknown) => {
          accessPromise = null; // allow a retry after the user fixes permissions
          throw err;
        },
      );
    }
    return accessPromise;
  };

  return {
    isSupported() {
      if (opts.requestMIDIAccess) return true;
      return typeof getNavigator()?.requestMIDIAccess === 'function';
    },
    async listDevices() {
      return listInputs(await getAccess());
    },
    async connect(deviceId) {
      const a = await getAccess();
      const input = a.inputs.get(deviceId);
      if (!input || input.state === 'disconnected') {
        throw new Error(`MIDI input not found: ${deviceId}`);
      }
      if (attached === input) return;
      detach();
      releaseAll();
      wantedId = deviceId;
      attach(input);
    },
    disconnect() {
      wantedId = null;
      detach();
      releaseAll();
      if (cooldown) clearTimeout(cooldown);
      cooldown = null;
      dirty = false;
    },
    onEvent(cb) {
      return events.subscribe(cb);
    },
    onFrame(cb) {
      return frames.subscribe(cb);
    },
    onDevicesChange(cb) {
      return devices.subscribe(cb);
    },
    getDeviceId() {
      return wantedId;
    },
    isConnected() {
      return attached !== null;
    },
    heldNotes: held,
  };
}
