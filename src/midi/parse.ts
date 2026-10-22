/**
 * Pure parser: raw MIDI bytes + DOMHighResTimeStamp -> MidiEvent.
 *
 * Handles note on (0x9n), note off (0x8n), note on with velocity 0 (= off)
 * and control change (0xBn, incl. CC64 sustain). Everything else (pitch bend,
 * aftertouch, program change, clock, active sensing, SysEx) returns null.
 * Running status is not supported: Web MIDI always delivers full messages.
 */
import { clock as sharedClock, type Clock } from '@/core/clock';
import type { MidiEvent } from '@/core/types';

export const NOTE_OFF = 0x80;
export const NOTE_ON = 0x90;
export const CONTROL_CHANGE = 0xb0;
export const CC_SUSTAIN = 64;
export const CC_ALL_SOUND_OFF = 120;
export const CC_ALL_NOTES_OFF = 123;

/**
 * @param data raw message bytes (`MIDIMessageEvent.data`)
 * @param timeStampMs `MIDIMessageEvent.timeStamp` (performance.now() based, ms)
 * @param clock clock used to map the timestamp onto the shared timeline
 */
export function parseMidiMessage(
  data: ArrayLike<number> | null | undefined,
  timeStampMs: number,
  clock: Pick<Clock, 'fromPerformanceMs'> = sharedClock,
): MidiEvent | null {
  if (!data || data.length < 3) return null;
  const status = data[0];
  // Data byte first (running status) or a system message: not ours.
  if (status < 0x80 || status >= 0xf0) return null;
  const kind = status & 0xf0;
  const channel = status & 0x0f;
  const d1 = data[1] & 0x7f;
  const d2 = data[2] & 0x7f;

  switch (kind) {
    case NOTE_ON: {
      const t = clock.fromPerformanceMs(timeStampMs);
      return d2 === 0
        ? { t, type: 'off', note: d1, velocity: 0, channel }
        : { t, type: 'on', note: d1, velocity: d2, channel };
    }
    case NOTE_OFF:
      return {
        t: clock.fromPerformanceMs(timeStampMs),
        type: 'off',
        note: d1,
        velocity: d2,
        channel,
      };
    case CONTROL_CHANGE:
      return {
        t: clock.fromPerformanceMs(timeStampMs),
        type: 'cc',
        controller: d1,
        value: d2,
        channel,
      };
    default:
      return null;
  }
}

/** Sustain pedal is "down" for CC64 values >= 64 (MIDI spec half-way point). */
export function isSustainDown(value: number): boolean {
  return value >= 64;
}
