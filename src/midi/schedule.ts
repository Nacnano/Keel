/**
 * Pure scheduling helpers for the MIDI player. No Web Audio in here, so the
 * timing logic is unit-testable in node.
 */
import type { MidiEvent, MidiNote, MidiNoteEvent, Seconds } from '@/core/types';
import { CC_ALL_NOTES_OFF, CC_ALL_SOUND_OFF, CC_SUSTAIN, isSustainDown } from './parse';

/**
 * Flatten a performance into note on/off events with the sustain pedal
 * applied: note-offs that happen while CC64 is down are deferred to the pedal
 * release. Re-striking a still-sounding note emits an off just before the new
 * on, so at most one voice per note is ever sounding. Notes still sounding at
 * the end get no off (the player releases them when playback finishes).
 * Input does not need to be sorted; ties keep their input order.
 */
export function resolveSustain(events: readonly MidiEvent[]): MidiNoteEvent[] {
  const sorted = events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
    .map((x) => x.e);
  const out: MidiNoteEvent[] = [];
  const keyDown = new Set<MidiNote>();
  const sounding = new Map<MidiNote, number>(); // note -> channel
  let pedal = false;

  const release = (t: Seconds, onlyUnheld: boolean) => {
    for (const [note, channel] of Array.from(sounding)) {
      if (onlyUnheld && keyDown.has(note)) continue;
      out.push({ t, type: 'off', note, velocity: 0, channel });
      sounding.delete(note);
    }
  };

  for (const e of sorted) {
    if (e.type === 'cc') {
      if (e.controller === CC_SUSTAIN) {
        const down = isSustainDown(e.value);
        if (pedal && !down) release(e.t, true);
        pedal = down;
      } else if (e.controller === CC_ALL_NOTES_OFF || e.controller === CC_ALL_SOUND_OFF) {
        keyDown.clear();
        if (e.controller === CC_ALL_SOUND_OFF) pedal = false;
        if (!pedal) release(e.t, false);
      }
      continue;
    }
    if (e.type === 'on') {
      if (sounding.has(e.note)) {
        out.push({ t: e.t, type: 'off', note: e.note, velocity: 0, channel: e.channel });
      }
      keyDown.add(e.note);
      sounding.set(e.note, e.channel);
      out.push({ ...e });
    } else {
      keyDown.delete(e.note);
      if (!pedal && sounding.has(e.note)) {
        sounding.delete(e.note);
        out.push({ ...e });
      }
    }
  }
  return out;
}

/** Index of the first event with `t >= time` (events sorted by t). */
export function lowerBound(events: readonly { t: Seconds }[], time: Seconds): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].t < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Events with `from <= t < to`, in order. `events` must be sorted by t. */
export function scheduleWindow<T extends { t: Seconds }>(
  events: readonly T[],
  from: Seconds,
  to: Seconds,
): T[] {
  if (to <= from) return [];
  return events.slice(lowerBound(events, from), lowerBound(events, to));
}

/**
 * Notes sounding at `time` that started strictly before it (needed when
 * playback starts or seeks into the middle of a held chord).
 */
export function soundingAt(events: readonly MidiNoteEvent[], time: Seconds): MidiNoteEvent[] {
  const active = new Map<MidiNote, MidiNoteEvent>();
  const end = lowerBound(events, time);
  for (let i = 0; i < end; i++) {
    const e = events[i];
    if (e.type === 'on') active.set(e.note, e);
    else active.delete(e.note);
  }
  return Array.from(active.values());
}

/** Timeline length: time of the last event (0 for an empty performance). */
export function performanceEnd(events: readonly { t: Seconds }[]): Seconds {
  let end = 0;
  for (const e of events) if (e.t > end) end = e.t;
  return end;
}
