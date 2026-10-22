/** MIDI fixtures for WS-C / WS-D tests. */
import type { ChromaFrame, MidiEvent, MidiNote, PitchClass } from '../types';
import { noteNumber } from './synth';

export function midiChord(names: string[]): MidiNote[] {
  return names.map(noteNumber);
}

/** Build an exact ChromaFrame from held MIDI notes (velocity-weighted). */
export function frameFromNotes(notes: MidiNote[], t = 0, velocities?: number[]): ChromaFrame {
  const chroma = new Float32Array(12);
  notes.forEach((n, i) => {
    chroma[n % 12] += (velocities?.[i] ?? 100) / 127;
  });
  const sum = chroma.reduce((a, b) => a + b, 0);
  if (sum > 0) for (let i = 0; i < 12; i++) chroma[i] /= sum;
  const bass = notes.length ? ((Math.min(...notes) % 12) as PitchClass) : null;
  return { t, chroma, energy: notes.length ? 1 : 0, bass, onset: false, exact: true };
}

/** Note-on/off pairs for a chord held for `seconds` starting at `t0`. */
export function midiChordEvents(
  notes: MidiNote[],
  t0: number,
  seconds: number,
  velocity = 90,
): MidiEvent[] {
  const on: MidiEvent[] = notes.map((note) => ({ t: t0, type: 'on', note, velocity, channel: 0 }));
  const off: MidiEvent[] = notes.map((note) => ({
    t: t0 + seconds,
    type: 'off',
    note,
    velocity: 0,
    channel: 0,
  }));
  return [...on, ...off];
}
