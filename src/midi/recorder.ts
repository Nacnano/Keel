/**
 * MIDI performance recorder. Collects `MidiEvent`s stamped on the shared clock
 * and stores them relative to the session start (`t - t0`, seconds), which is
 * the `MidiTrack` storage convention.
 */
import type { MidiTrack } from '@/core/session';
import type { MidiEvent, MidiNote, Seconds } from '@/core/types';
import { CC_SUSTAIN, isSustainDown } from './parse';

export interface MidiRecorder {
  /** Start a fresh take. `t0` is the session start on the shared clock. Clears earlier events. */
  start(t0: Seconds): void;
  /** Record one event (ignored unless recording). */
  push(event: MidiEvent): void;
  /**
   * Stop recording. When `t` (shared clock) is given, note-offs for keys still
   * down and a sustain release are appended at `t` so playback never hangs.
   */
  stop(t?: Seconds): MidiEvent[];
  isRecording(): boolean;
  /** Events so far, relative to t0, in time order. */
  events(): MidiEvent[];
  toTrack(sessionId: string): MidiTrack;
}

const byTime = (a: MidiEvent, b: MidiEvent) => a.t - b.t;

export function createMidiRecorder(): MidiRecorder {
  let recording = false;
  let t0 = 0;
  let list: MidiEvent[] = [];
  const down = new Map<MidiNote, number>(); // note -> channel
  let pedalChannel: number | null = null;

  const snapshot = () => list.slice().sort(byTime);

  return {
    start(start) {
      t0 = start;
      list = [];
      down.clear();
      pedalChannel = null;
      recording = true;
    },
    push(e) {
      if (!recording) return;
      list.push({ ...e, t: Math.max(0, e.t - t0) });
      if (e.type === 'cc') {
        if (e.controller === CC_SUSTAIN) pedalChannel = isSustainDown(e.value) ? e.channel : null;
      } else if (e.type === 'on') {
        down.set(e.note, e.channel);
      } else {
        down.delete(e.note);
      }
    },
    stop(t) {
      if (recording && t !== undefined) {
        const rel = Math.max(0, t - t0);
        for (const [note, channel] of down) {
          list.push({ t: rel, type: 'off', note, velocity: 0, channel });
        }
        if (pedalChannel !== null) {
          list.push({
            t: rel,
            type: 'cc',
            controller: CC_SUSTAIN,
            value: 0,
            channel: pedalChannel,
          });
        }
      }
      down.clear();
      pedalChannel = null;
      recording = false;
      return snapshot();
    },
    isRecording() {
      return recording;
    },
    events: snapshot,
    toTrack(sessionId) {
      return { sessionId, events: snapshot() };
    },
  };
}
