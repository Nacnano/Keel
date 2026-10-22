/**
 * Modulation hints: related keys to move to from the current key, each with a pivot chord that
 * is diatonic to both keys (or, when none fits, the new key's V7 as a direct route).
 */
import type { Chord, Key, VocabLevel } from '@/core';
import { chordSymbol } from './chordName';
import { diatonicChords, isDiatonic, mod12 } from './keys';
import { keyName } from './notes';
import { romanNumeral } from './numerals';
import { isDiminishedQuality } from './vocab';

export interface ModulationHint {
  to: Key;
  pivot: Chord;
  /** Numeral of the pivot in the current key ("I"). */
  pivotNumeralFrom: string;
  /** Numeral of the pivot in the destination key ("IV"). */
  pivotNumeralTo: string;
  /** One line, e.g. "Up a fifth: C is I here and IV in G major; then D7 → G". */
  reason: string;
  /** True when no common chord exists and the pivot is the new key's dominant. */
  direct: boolean;
}

export type ModulationKind =
  'dominant' | 'subdominant' | 'relative' | 'parallel' | 'upStep' | 'downMinorThird';

interface Destination {
  kind: ModulationKind;
  /** Semitones from the current tonic. */
  offset: number;
  label: string;
}

const DEST: Readonly<Record<ModulationKind, Destination>> = {
  dominant: { kind: 'dominant', offset: 7, label: 'Up a fifth' },
  subdominant: { kind: 'subdominant', offset: 5, label: 'Up a fourth' },
  relative: { kind: 'relative', offset: 0, label: 'Relative' },
  parallel: { kind: 'parallel', offset: 0, label: 'Parallel' },
  upStep: { kind: 'upStep', offset: 2, label: 'Up a step' },
  downMinorThird: { kind: 'downMinorThird', offset: 9, label: 'Down a minor third' },
};

/** Destinations shown per level, most common first. */
const BY_LEVEL: Readonly<Record<VocabLevel, readonly ModulationKind[]>> = {
  1: ['dominant', 'relative', 'subdominant', 'parallel'],
  2: ['dominant', 'relative', 'subdominant', 'parallel', 'upStep'],
  3: ['dominant', 'relative', 'subdominant', 'parallel', 'downMinorThird'],
};

function destination(from: Key, d: Destination): Key {
  if (d.kind === 'relative') {
    return from.mode === 'major'
      ? { tonic: mod12(from.tonic + 9), mode: 'minor' }
      : { tonic: mod12(from.tonic + 3), mode: 'major' };
  }
  if (d.kind === 'parallel') {
    return { tonic: from.tonic, mode: from.mode === 'major' ? 'minor' : 'major' };
  }
  return { tonic: mod12(from.tonic + d.offset), mode: from.mode };
}

/** How good a chord on this degree is as the pivot's role in the destination (predominant best). */
const NEW_ROLE: Readonly<Record<Key['mode'], Partial<Record<number, number>>>> = {
  major: { 2: 1, 5: 0.95, 9: 0.75, 7: 0.6, 4: 0.4, 11: 0.1 },
  minor: { 5: 1, 2: 0.9, 8: 0.8, 7: 0.6, 3: 0.4, 10: 0.35 },
};
/** How natural the chord is in the current key (stable chords best). */
const OLD_ROLE: Readonly<Record<Key['mode'], Partial<Record<number, number>>>> = {
  major: { 0: 1, 5: 0.9, 9: 0.85, 2: 0.8, 4: 0.6, 7: 0.5, 11: 0.2 },
  minor: { 0: 1, 5: 0.9, 8: 0.85, 3: 0.8, 10: 0.6, 2: 0.6, 7: 0.5 },
};

/** Diatonic chords of a key; minor adds the harmonic-minor V (and V7). */
function keyChords(key: Key, level: VocabLevel): Chord[] {
  const seventh = level >= 3 ? 2 : 1;
  const out = diatonicChords(key, seventh);
  if (key.mode === 'minor') {
    const v = mod12(key.tonic + 7);
    const i = out.findIndex((c) => c.root === v);
    if (i >= 0) out[i] = { root: v, quality: level >= 3 ? '7' : 'maj' };
  }
  return out;
}

function inKey(chord: Chord, key: Key): boolean {
  return isDiatonic(chord, key) || (key.mode === 'minor' && isDiatonic(chord, key, 'harmonic'));
}

function bestPivot(from: Key, to: Key, level: VocabLevel): Chord | null {
  let best: Chord | null = null;
  let bestScore = 0;
  for (const c of keyChords(from, level)) {
    if (c.root === to.tonic || !inKey(c, to)) continue;
    const n = NEW_ROLE[to.mode][mod12(c.root - to.tonic)] ?? 0;
    const o = OLD_ROLE[from.mode][mod12(c.root - from.tonic)] ?? 0;
    const score = n * o * (isDiminishedQuality(c.quality) ? 0.6 : 1);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Up to `max` (default: 4 at level 1, else 5) destination keys from `key`: dominant, relative,
 * subdominant, parallel, then up a step (level 2) or down a minor third (level 3). The pivot is
 * the chord diatonic to both keys that is most stable in the current key and most
 * predominant-like in the new one (triads below level 3, sevenths at 3); without a common chord
 * it is the new key's V7 (V at level 1).
 */
export function modulationHints(key: Key, level: VocabLevel, max?: number): ModulationHint[] {
  const from: Key = { tonic: key.tonic, mode: key.mode };
  const kinds = BY_LEVEL[level];
  const hints: ModulationHint[] = [];
  for (const kind of kinds.slice(0, max ?? kinds.length)) {
    const d = DEST[kind];
    const to = destination(from, d);
    const common = bestPivot(from, to, level);
    const dominant: Chord = { root: mod12(to.tonic + 7), quality: level >= 2 ? '7' : 'maj' };
    const pivot = common ?? dominant;
    const toName = keyName(to);
    const tonic = chordSymbol({ root: to.tonic, quality: to.mode === 'major' ? 'maj' : 'min' }, to);
    const pivotName = chordSymbol(pivot, from);
    const from_ = romanNumeral(pivot, from);
    const to_ = romanNumeral(pivot, to);
    const then =
      pivot.root !== dominant.root
        ? `then ${chordSymbol(dominant, to)} → ${tonic}`
        : pivot.quality === dominant.quality ||
            (pivot.quality === '7' && dominant.quality === 'maj')
          ? `resolve it to ${tonic}`
          : `turn it into ${chordSymbol(dominant, to)} → ${tonic}`;
    const reason = common
      ? `${d.label}: ${pivotName} is ${from_} here and ${to_} in ${toName}; ${then}`
      : `${d.label}: no shared chord, so ${chordSymbol(dominant, to)} (${to_} of ${toName}) leads straight in`;
    hints.push({
      to,
      pivot,
      pivotNumeralFrom: from_,
      pivotNumeralTo: to_,
      reason,
      direct: !common,
    });
  }
  return hints;
}
