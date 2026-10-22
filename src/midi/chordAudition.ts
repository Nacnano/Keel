/**
 * "Tap to hear" chord audition for the try-next row.
 */
import type { Chord, ChordQuality, MidiNote, MidiPlayer } from '@/core/types';

// TODO(integration): use @/theory/vocab
/** Semitones above the root. Chord tones close-position, extensions in the next octave. */
const INTERVALS: Record<ChordQuality, readonly number[]> = {
  '5': [0, 7],
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  '7': [0, 4, 7, 10],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  mMaj7: [0, 3, 7, 11],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  '9': [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  min9: [0, 3, 7, 10, 14],
  '11': [0, 7, 10, 14, 17],
  min11: [0, 3, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 21],
  maj13: [0, 4, 7, 11, 14, 21],
  min13: [0, 3, 7, 10, 14, 21],
  '7b9': [0, 4, 7, 10, 13],
  '7#9': [0, 4, 7, 10, 15],
  '7#11': [0, 4, 7, 10, 18],
  '7b13': [0, 4, 7, 10, 20],
  '7alt': [0, 4, 10, 13, 15, 20],
  'maj7#11': [0, 4, 7, 11, 18],
  '6/9': [0, 4, 7, 9, 14],
  '7sus4': [0, 5, 7, 10],
  '9sus4': [0, 5, 7, 10, 14],
};

export interface PlayChordOptions {
  /** Octave of the root (scientific pitch: C4 = 60). Default 4. */
  octave?: number;
  durationMs?: number;
  velocity?: number;
}

/**
 * MIDI notes for a chord: close position from the root in `octave`, plus the
 * slash bass an octave below when `chord.bass` is set.
 */
export function chordToMidiNotes(chord: Chord, octave = 4): MidiNote[] {
  const root = (octave + 1) * 12 + chord.root;
  const notes = INTERVALS[chord.quality].map((i) => root + i);
  if (chord.bass !== undefined && chord.bass !== chord.root) {
    notes.unshift(octave * 12 + chord.bass);
  }
  return notes.filter((n) => n >= 0 && n <= 127);
}

type NotePlayer = Pick<MidiPlayer, 'noteOn' | 'noteOff'>;

/**
 * Sound exact MIDI notes (a voicing) on the player for `durationMs`. Returns a function that
 * releases them early (e.g. when the user taps another voicing); calling it twice is a no-op.
 */
export function playVoicing(
  player: NotePlayer,
  notes: readonly MidiNote[],
  durationMs = 1200,
  velocity = 80,
): () => void {
  const sounding = [...new Set(notes)].filter((n) => n >= 0 && n <= 127);
  for (const n of sounding) player.noteOn(n, velocity);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    for (const n of sounding) player.noteOff(n);
  };
  const timer = setTimeout(release, durationMs);
  return release;
}

/**
 * Sound a chord on the player for `durationMs`. Returns a function that
 * releases it early (e.g. when the user taps another chord).
 */
export function playChord(
  player: NotePlayer,
  chord: Chord,
  { octave = 4, durationMs = 900, velocity = 80 }: PlayChordOptions = {},
): () => void {
  return playVoicing(player, chordToMidiNotes(chord, octave), durationMs, velocity);
}
