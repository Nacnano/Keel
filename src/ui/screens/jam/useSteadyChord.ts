import { useEffect, useState } from 'react';
import type { Chord } from '@/core';
import { sameChord } from '@/theory';

/** How long a chord must hold before Ideas follows it. */
export const STEADY_CHORD_MS = 1000;

export interface SteadyChords {
  /** The last chord that held for `holdMs`; it stays through gaps and passing chords. */
  chord: Chord | null;
  /** Up to the last four steady chords, oldest first (ends with `chord`). */
  recent: Chord[];
}

/**
 * Ideas follow the progression, not every frame: a chord counts once it has held for about a
 * second, so the lists stop re-sorting on passing chords. `null` (no chord) never clears it.
 */
export function useSteadyChord(live: Chord | null, holdMs = STEADY_CHORD_MS): SteadyChords {
  const [steady, setSteady] = useState<SteadyChords>({ chord: null, recent: [] });
  const root = live?.root;
  const quality = live?.quality;
  const bass = live?.bass;
  useEffect(() => {
    if (root === undefined || quality === undefined) return;
    const candidate: Chord = bass === undefined ? { root, quality } : { root, quality, bass };
    const timer = setTimeout(() => {
      setSteady((s) =>
        sameChord(s.chord, candidate)
          ? s
          : { chord: candidate, recent: [...s.recent, candidate].slice(-4) },
      );
    }, holdMs);
    return () => clearTimeout(timer);
  }, [root, quality, bass, holdMs]);
  return steady;
}
