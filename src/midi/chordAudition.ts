/**
 * "Tap to hear" chord audition for the try-next row.
 */
import type { Chord, ChordQuality, MidiNote, MidiPlayer } from '@/core/types';
import { CHORD_TEMPLATES } from '@/theory';

/**
 * Semitones above the root from the `@/theory` templates: chord tones close-position,
 * extensions (9, 11, 13, altered) in the next octave; an 11 chord drops its major third.
 */
function voicingIntervals(quality: ChordQuality): number[] {
  const { intervals, roles } = CHORD_TEMPLATES[quality];
  const out: number[] = [];
  intervals.forEach((iv, k) => {
    if (quality === '11' && roles[k] === 'third') return;
    out.push(roles[k] === 'extension' ? iv + 12 : iv);
  });
  return out;
}

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
  const notes = voicingIntervals(chord.quality).map((i) => root + i);
  if (chord.bass !== undefined && chord.bass !== chord.root) {
    notes.unshift(octave * 12 + chord.bass);
  }
  return notes.filter((n) => n >= 0 && n <= 127);
}

/**
 * Sound a chord on the player for `durationMs`. Returns a function that
 * releases it early (e.g. when the user taps another chord).
 */
export function playChord(
  player: Pick<MidiPlayer, 'noteOn' | 'noteOff'>,
  chord: Chord,
  { octave = 4, durationMs = 900, velocity = 80 }: PlayChordOptions = {},
): () => void {
  const notes = chordToMidiNotes(chord, octave);
  for (const n of notes) player.noteOn(n, velocity);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    for (const n of notes) player.noteOff(n);
  };
  const timer = setTimeout(release, durationMs);
  return release;
}
