import { useState } from 'react';
import type { Chord } from '@/core';
import { sameChord } from '@/theory';

export interface RecentChords {
  /** The chord on screen; it stays through gaps (`null`), so Ideas never blanks between chords. */
  chord: Chord | null;
  /** Up to the last four chords, oldest first (ends with `chord`). */
  recent: Chord[];
}

/**
 * Ideas follow the chord on screen. The big display is already dwell-filtered, so there is no
 * extra hold here: a hold showed the previous chord's voicings for a second.
 */
export function useRecentChords(live: Chord | null): RecentChords {
  const [state, setState] = useState<RecentChords>({ chord: null, recent: [] });
  // Derived during render (not in an effect), so the panel changes in the same frame as the chord.
  if (live && !sameChord(state.chord, live)) {
    const next = { chord: live, recent: [...state.recent, live].slice(-4) };
    setState(next);
    return next;
  }
  return state;
}
