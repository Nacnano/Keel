/**
 * Pure session summary: seconds per key, top repeating progressions, chord
 * count, bookmark count. No IndexedDB access.
 *
 * Progressions compare chords by root + quality: a bass note does not make a
 * different chord (Am7/G is Am7), so bass flicker cannot split a loop.
 */
import type { ChordRecord, KeyRecord, Marker, SessionSummary } from '@/core/session';
import type { Chord, Key } from '@/core/types';
import { canonicalRotation, collapseRuns, findCycles } from './cycles';

export const TOP_PROGRESSIONS = 5;

const byT = <T extends { t: number }>(a: T, b: T) => a.t - b.t;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Seconds spent in each key, from key-change segments. Descending. */
export function keySeconds(
  keys: readonly KeyRecord[],
  durationSec: number,
): Array<{ key: Key; seconds: number }> {
  const sorted = [...keys].sort(byT);
  const totals = new Map<string, { key: Key; seconds: number }>();
  for (let i = 0; i < sorted.length; i++) {
    const { tonic, mode } = sorted[i].key;
    const end = i + 1 < sorted.length ? sorted[i + 1].t : Math.max(durationSec, sorted[i].t);
    const seconds = Math.max(0, end - sorted[i].t);
    const id = `${tonic}:${mode}`;
    const entry = totals.get(id) ?? { key: { tonic, mode }, seconds: 0 };
    entry.seconds += seconds;
    totals.set(id, entry);
  }
  return [...totals.values()]
    .map((e) => ({ key: e.key, seconds: round2(e.seconds) }))
    .filter((e) => e.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
}

/** Root + quality identity ("9:min7"); the bass is ignored. */
export function chordFamilyKey(chord: Chord): string {
  return `${chord.root}:${chord.quality}`;
}

/**
 * The non-null chord sequence in time order, slash basses dropped and consecutive
 * repeats (same root + quality) removed.
 */
export function chordSequence(chords: readonly ChordRecord[]): Chord[] {
  const seq = [...chords]
    .sort(byT)
    .map((c) => c.chord)
    .filter((c): c is Chord => c !== null)
    .map((c): Chord => ({ root: c.root, quality: c.quality }));
  return collapseRuns(seq, chordFamilyKey);
}

/**
 * Repeating cycles (2–8 chords, at least two consecutive passes), merged across
 * the session by rotation, ranked by total passes then length.
 */
export function topProgressions(
  chords: readonly ChordRecord[],
  limit = TOP_PROGRESSIONS,
): Array<{ chords: Chord[]; count: number }> {
  const seq = chordSequence(chords);
  const keys = seq.map(chordFamilyKey);
  const found = new Map<string, { chords: Chord[]; count: number; first: number }>();
  for (const c of findCycles(keys)) {
    const pattern = keys.slice(c.start, c.start + c.period);
    const id = canonicalRotation(pattern);
    const entry = found.get(id);
    if (entry) entry.count += c.repeats;
    else
      found.set(id, {
        chords: seq.slice(c.start, c.start + c.period),
        count: c.repeats,
        first: c.start,
      });
  }
  return [...found.values()]
    .sort((a, b) => b.count - a.count || b.chords.length - a.chords.length || a.first - b.first)
    .slice(0, limit)
    .map(({ chords: cs, count }) => ({ chords: cs, count }));
}

export function computeSummary(
  chords: readonly ChordRecord[],
  keys: readonly KeyRecord[],
  markers: readonly Marker[],
  durationSec: number,
): SessionSummary {
  return {
    keys: keySeconds(keys, durationSec),
    topProgressions: topProgressions(chords),
    chordCount: chords.reduce((n, c) => n + (c.chord ? 1 : 0), 0),
    bookmarks: markers.reduce((n, m) => n + (m.kind === 'bookmark' ? 1 : 0), 0),
  };
}
