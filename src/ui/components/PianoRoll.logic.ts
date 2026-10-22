/**
 * Pure piano-roll model: MIDI events -> note bars, and viewport culling. Kept free of React and
 * Canvas so it can be tested and so a 50k-event track costs O(log n + visible) per frame.
 */
import type { MidiEvent, MidiNote } from '@/core';

export interface NoteBar {
  /** Start, seconds from session start. */
  t: number;
  /** End, seconds (>= t). */
  end: number;
  note: MidiNote;
  velocity: number;
}

export interface NoteIndex {
  /** Sorted by start time. */
  notes: NoteBar[];
  /** Longest bar, used to widen the left edge of the binary search. */
  maxDuration: number;
  /** Lowest and highest note present (null when empty). */
  pitchMin: MidiNote | null;
  pitchMax: MidiNote | null;
  /** End of the last note. */
  end: number;
}

export interface NoteViewport {
  t0: number;
  t1: number;
  /** Inclusive pitch window; omit for every pitch. */
  pitchLo?: number;
  pitchHi?: number;
}

/** Minimum drawn length so very short (or zero-length) notes stay visible. */
const MIN_NOTE_SEC = 0.02;

/**
 * Pair note-on/off events into bars. Velocity-0 note-ons count as offs, a re-strike closes the
 * held voice, and notes still held at the end close at the last event time. Sustain pedal is
 * ignored on purpose: the roll shows what the hands did.
 */
export function buildNoteIndex(events: readonly MidiEvent[]): NoteIndex {
  const sorted = isSortedByT(events) ? events : [...events].sort((a, b) => a.t - b.t);
  const open = new Map<number, { t: number; velocity: number; note: MidiNote }>();
  const notes: NoteBar[] = [];
  let lastT = 0;
  const close = (key: number, t: number) => {
    const o = open.get(key);
    if (!o) return;
    open.delete(key);
    notes.push({
      t: o.t,
      end: Math.max(t, o.t + MIN_NOTE_SEC),
      note: o.note,
      velocity: o.velocity,
    });
  };
  for (const e of sorted) {
    lastT = Math.max(lastT, e.t);
    if (e.type === 'cc') continue;
    const key = e.channel * 128 + e.note;
    if (e.type === 'on' && e.velocity > 0) {
      close(key, e.t);
      open.set(key, { t: e.t, velocity: e.velocity, note: e.note });
    } else {
      close(key, e.t);
    }
  }
  for (const key of [...open.keys()]) close(key, lastT);
  notes.sort((a, b) => a.t - b.t || a.note - b.note);

  let maxDuration = 0;
  let pitchMin: number | null = null;
  let pitchMax: number | null = null;
  let end = 0;
  for (const n of notes) {
    maxDuration = Math.max(maxDuration, n.end - n.t);
    pitchMin = pitchMin === null ? n.note : Math.min(pitchMin, n.note);
    pitchMax = pitchMax === null ? n.note : Math.max(pitchMax, n.note);
    end = Math.max(end, n.end);
  }
  return { notes, maxDuration, pitchMin, pitchMax, end };
}

function isSortedByT(events: readonly MidiEvent[]): boolean {
  for (let i = 1; i < events.length; i++) if (events[i].t < events[i - 1].t) return false;
  return true;
}

/** First index whose start is >= t. */
function firstAtOrAfter(notes: readonly NoteBar[], t: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Notes overlapping [t0, t1] (and the pitch window, if given). Binary search from
 * `t0 - maxDuration` so long held notes that started before the window are kept, then a linear
 * scan that stops at the first note starting after `t1`.
 */
export function visibleNotes(index: NoteIndex, viewport: NoteViewport): NoteBar[] {
  const { notes, maxDuration } = index;
  const { t0, t1 } = viewport;
  const lo = viewport.pitchLo ?? -Infinity;
  const hi = viewport.pitchHi ?? Infinity;
  const out: NoteBar[] = [];
  if (!notes.length || t1 < t0) return out;
  for (let i = firstAtOrAfter(notes, t0 - maxDuration); i < notes.length; i++) {
    const n = notes[i];
    if (n.t > t1) break;
    if (n.end < t0 || n.note < lo || n.note > hi) continue;
    out.push(n);
  }
  return out;
}

/** Pitch window to draw: the used range padded by 2 semitones, at least two octaves tall. */
export function pitchWindow(index: NoteIndex, minSpan = 24): { lo: number; hi: number } {
  if (index.pitchMin === null || index.pitchMax === null) return { lo: 48, hi: 72 };
  let lo = index.pitchMin - 2;
  let hi = index.pitchMax + 2;
  const missing = minSpan - (hi - lo);
  if (missing > 0) {
    lo -= Math.floor(missing / 2);
    hi += Math.ceil(missing / 2);
  }
  return { lo: Math.max(0, lo), hi: Math.min(127, hi) };
}

const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlackKey = (note: number) => BLACK.has(((note % 12) + 12) % 12);

/** `C4` = MIDI 60. */
export function noteLabel(note: number): string {
  const names = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  return `${names[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}
