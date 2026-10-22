/** Framework-free helpers for ReharmPanel: sequenced audition and clipboard text. */
import type { Chord, Key } from '@/core';
import { chordSymbol, romanNumeral } from '@/theory';

/**
 * Plays `chords` one after another through `audition`, `stepMs` apart. Returns a cancel
 * function; `onDone` runs after the last chord's slot (not when cancelled).
 */
export function playProgression(
  chords: readonly Chord[],
  audition: (chord: Chord) => void,
  stepMs: number,
  onDone?: () => void,
): () => void {
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  chords.forEach((c, i) => {
    if (i === 0) audition(c);
    else timers.push(setTimeout(() => audition(c), i * stepMs));
  });
  timers.push(setTimeout(() => onDone?.(), chords.length * stepMs));
  return () => timers.forEach(clearTimeout);
}

/** "Dm7 Db7 Cmaj7 | ii7 bII7 Imaj7" (ASCII, for the clipboard). */
export function progressionText(
  chords: readonly Chord[],
  key: Key,
  opts: { spellingFollowsKey?: boolean; showSlash?: boolean } = {},
): string {
  const symbols = chords.map((c) => chordSymbol(c, key, opts)).join(' ');
  const numerals = chords.map((c) => romanNumeral({ root: c.root, quality: c.quality }, key));
  return `${symbols} | ${numerals.join(' ')}`;
}
