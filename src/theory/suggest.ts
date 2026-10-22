/**
 * "Try next" chord suggestions. Deterministic: same input, same ranked output.
 */
import type { Chord, ChordQuality, Key, PitchClass, VocabLevel } from '@/core';
import { chordKey, chordSymbol, chordTones } from './chordName';
import { isDiatonic, mod12, parallelKey } from './keys';
import { keyName } from './notes';
import { romanNumeral } from './numerals';
import { isDominantQuality, isMinorQuality } from './vocab';

export interface Suggestion {
  chord: Chord;
  /** Short human explanation, e.g. "V7/vi: secondary dominant into Am". */
  reason: string;
}

export const MAX_SUGGESTIONS = 8;

interface Degree {
  /** Semitones above the tonic. */
  offset: number;
  triad: ChordQuality;
  seventh: ChordQuality;
  role: string;
}

const MAJOR: readonly Degree[] = [
  { offset: 0, triad: 'maj', seventh: 'maj7', role: 'tonic, back home' },
  { offset: 2, triad: 'min', seventh: 'min7', role: 'predominant, sets up V' },
  { offset: 4, triad: 'min', seventh: 'min7', role: 'mediant, soft tonic colour' },
  { offset: 5, triad: 'maj', seventh: 'maj7', role: 'subdominant lift' },
  { offset: 7, triad: 'maj', seventh: '7', role: 'dominant, pulls home' },
  { offset: 9, triad: 'min', seventh: 'min7', role: 'relative minor' },
  { offset: 11, triad: 'dim', seventh: 'm7b5', role: 'leading-tone chord' },
];

/** Natural minor, with the harmonic-minor V (index 4) as the dominant. */
const MINOR: readonly Degree[] = [
  { offset: 0, triad: 'min', seventh: 'min7', role: 'tonic, back home' },
  { offset: 2, triad: 'dim', seventh: 'm7b5', role: 'predominant, sets up V' },
  { offset: 3, triad: 'maj', seventh: 'maj7', role: 'relative major' },
  { offset: 5, triad: 'min', seventh: 'min7', role: 'subdominant' },
  { offset: 7, triad: 'maj', seventh: '7', role: 'dominant (harmonic minor), pulls home' },
  { offset: 8, triad: 'maj', seventh: 'maj7', role: 'submediant lift' },
  { offset: 10, triad: 'maj', seventh: '7', role: 'subtonic, rock cadence' },
];

/** Typical continuations by scale-degree index: [degree index, weight]. */
const NEXT_MAJOR: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [3, 0.9],
    [4, 0.85],
    [5, 0.8],
    [1, 0.7],
    [2, 0.5],
  ], // I
  [
    [4, 0.95],
    [6, 0.5],
    [3, 0.5],
    [0, 0.4],
  ], // ii
  [
    [5, 0.9],
    [3, 0.7],
    [1, 0.5],
  ], // iii
  [
    [4, 0.9],
    [0, 0.85],
    [1, 0.6],
    [5, 0.5],
  ], // IV
  [
    [0, 0.95],
    [5, 0.8],
    [3, 0.5],
  ], // V
  [
    [3, 0.9],
    [1, 0.85],
    [4, 0.7],
    [2, 0.5],
  ], // vi
  [
    [0, 0.9],
    [2, 0.5],
  ], // vii°
];

const NEXT_MINOR: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [3, 0.9],
    [5, 0.85],
    [6, 0.8],
    [4, 0.75],
    [2, 0.6],
  ], // i
  [
    [4, 0.95],
    [0, 0.5],
  ], // ii°
  [
    [5, 0.85],
    [3, 0.75],
    [6, 0.6],
  ], // III
  [
    [4, 0.9],
    [0, 0.8],
    [6, 0.6],
  ], // iv
  [
    [0, 0.95],
    [5, 0.8],
  ], // V
  [
    [6, 0.85],
    [3, 0.75],
    [2, 0.6],
    [1, 0.5],
  ], // VI
  [
    [2, 0.85],
    [0, 0.8],
    [5, 0.6],
  ], // VII
];

interface Scored extends Suggestion {
  score: number;
  /** Insertion order, the final tie-break. */
  seq: number;
}

/**
 * Ranked next-chord suggestions (at most `max`, default 8) for a key and the chords played
 * so far. Sources: diatonic continuations of the last chord, resolution down a fifth,
 * the secondary dominant (and its ii, level 2+) of the likely next chord, ii–V setups,
 * tritone substitutes (level 3 only) and borrowed iv / bVII / bVI. The current (last)
 * chord is never suggested. Qualities follow the level: triads at 1; triads plus dominant
 * sevenths at 2; seventh chords at 3. Returns [] without a key.
 */
export function suggestNext(
  key: Key | null,
  recent: readonly Chord[],
  level: VocabLevel,
  max = MAX_SUGGESTIONS,
): Suggestion[] {
  if (!key) return [];
  const scale = key.mode === 'major' ? MAJOR : MINOR;
  const nextTable = key.mode === 'major' ? NEXT_MAJOR : NEXT_MINOR;
  const last = recent.length ? recent[recent.length - 1] : null;
  const at = (offset: number) => mod12(key.tonic + offset);
  const name = (c: Chord) => chordSymbol({ root: c.root, quality: c.quality }, key);
  const num = (c: Chord) => romanNumeral({ root: c.root, quality: c.quality }, key);

  const diatonic = (d: Degree): Chord => ({
    root: at(d.offset),
    quality: level >= 3 ? d.seventh : level === 2 && d.seventh === '7' ? '7' : d.triad,
  });
  const dominantQ: ChordQuality = level >= 2 ? '7' : 'maj';

  const found = new Map<string, Scored>();
  let seq = 0;
  const lastTones = last ? new Set<number>(chordTones(last)) : null;
  const add = (chord: Chord, score: number, reason: string) => {
    if (last && lastTones && chord.root === last.root) {
      // never the current chord, nor a same-root subset / superset of it (Dm7 -> Dm),
      // but colour changes on the same root stay (C -> C7, F -> Fm)
      const tones = chordTones(chord);
      const subset = tones.every((t) => lastTones.has(t));
      const superset = [...lastTones].every((t) => tones.includes(t as PitchClass));
      const toDominant = isDominantQuality(chord.quality) && !isDominantQuality(last.quality);
      if (chord.quality === last.quality || subset || (superset && !toDominant)) return;
    }
    const id = chordKey(chord);
    const prev = found.get(id);
    if (!prev) {
      found.set(id, { chord, score, reason, seq: seq++ });
    } else if (score > prev.score) {
      found.set(id, { chord, score: score + 0.02, reason, seq: prev.seq });
    } else {
      prev.score += 0.02;
    }
  };

  // where are we? the scale degree of the last chord, if it plays that degree's role
  // (E7 in C is V7/vi, not iii; Fm in C is borrowed, not IV)
  const rootIdx = last ? scale.findIndex((d) => at(d.offset) === last.root) : 0;
  const fitsDegree =
    !last ||
    (rootIdx >= 0 &&
      isMinorQuality(last.quality) === isMinorQuality(scale[rootIdx].triad) &&
      (!isDominantQuality(last.quality) || scale[rootIdx].seventh === '7'));
  const lastIdx = fitsDegree ? rootIdx : -1;
  const lastIsDiatonicRoot = lastIdx >= 0;

  // 1. diatonic continuations
  const continuations = lastIsDiatonicRoot ? nextTable[lastIdx] : nextTable[0];
  const contWeight = lastIsDiatonicRoot ? 1 : 0.7;
  for (const [i, w] of continuations) {
    const c = diatonic(scale[i]);
    add(c, w * contWeight, `${num(c)}: ${scale[i].role}`);
  }

  if (last) {
    // 2. circle of fifths: resolve down a fifth from the last chord
    const down = mod12(last.root + 5);
    const target = scale.find((d) => at(d.offset) === down);
    if (target) {
      const c = diatonic(target);
      const w = isDominantQuality(last.quality) || last.quality === 'maj' ? 0.75 : 0.6;
      add(c, w, `${num(c)}: down a fifth from ${name(last)} (circle of fifths)`);
    }

    // 3. ii–V: a minor seventh / minor triad moves to the dominant a fourth up
    if (isMinorQuality(last.quality) && last.quality !== 'dim7') {
      const c: Chord = { root: mod12(last.root + 5), quality: dominantQ };
      add(c, 0.7, `${num(c)}: ii–V, ${name(last)} sets up ${name(c)}`);
    }

    if (!lastIsDiatonicRoot) {
      const t = scale.find((d) => at(d.offset) === mod12(last.root + 5));
      if (isDominantQuality(last.quality) && t) {
        // a secondary dominant resolves to its target
        const c = diatonic(t);
        add(c, 0.95, `${num(c)}: resolves ${name(last)}`);
      } else if (!isDominantQuality(last.quality)) {
        // a borrowed / chromatic chord usually heads home
        const home = diatonic(scale[0]);
        add(home, 0.85, `${num(home)}: back home after ${name(last)}`);
      }
    }
  }

  // 4. secondary dominants (and their ii) into the likely next chords
  const targets = continuations
    .map(([i]) => scale[i])
    .filter((d) => d.offset !== 0 && d.triad !== 'dim' && d.seventh !== '7')
    .slice(0, 2);
  for (const t of targets) {
    const tc = diatonic(t);
    const v: Chord = { root: at(t.offset + 7), quality: dominantQ };
    const of = romanNumeral({ root: tc.root, quality: t.triad }, key);
    // a level-1 V of IV is just I: only chromatic dominants count
    if (!isDiatonic(v, key)) {
      add(v, 0.55, `V${level >= 2 ? '7' : ''}/${of}: secondary dominant into ${name(tc)}`);
    }
    if (level >= 2) {
      const ii: Chord = {
        root: at(t.offset + 2),
        quality: isMinorQuality(t.triad) ? 'm7b5' : 'min7',
      };
      add(ii, 0.4, `${num(ii)}: ii–V into ${name(tc)}`);
    }
  }

  // ii–V into the tonic when heading for the dominant
  const headingHome = continuations.some(([i]) => scale[i].offset === 7);
  if (headingHome && level >= 2) {
    const ii = diatonic(scale[1]);
    add(ii, 0.5, `${num(ii)}: ii–V–I setup`);
  }

  // 5. tritone substitute for the dominant (level 3)
  if (level >= 3) {
    const sub: Chord = { root: at(1), quality: '7' };
    const w = last && (isDominantQuality(last.quality) || lastIdx === 1) ? 0.65 : 0.4;
    add(sub, w, `${num(sub)}: tritone sub for V7, slides down to ${name(diatonic(scale[0]))}`);
    if (last && isDominantQuality(last.quality)) {
      const alt: Chord = { root: mod12(last.root + 6), quality: '7' };
      add(alt, 0.45, `${num(alt)}: tritone sub of ${name(last)}`);
    }
  }

  // 6. borrowed chords (major keys borrow from the parallel minor)
  if (key.mode === 'major') {
    const afterIV = last && last.root === at(5);
    const iv: Chord = { root: at(5), quality: level >= 3 ? 'min7' : 'min' };
    const minor = keyName(parallelKey(key));
    add(iv, afterIV ? 0.7 : 0.45, `${num(iv)}: borrowed from ${minor}, bittersweet`);
    const bVII: Chord = { root: at(10), quality: level >= 3 ? '7' : 'maj' };
    const w = afterIV || lastIdx === 0 ? 0.5 : 0.42;
    add(bVII, w, `${num(bVII)}: borrowed from ${minor}, rock / backdoor colour`);
    const bVI: Chord = { root: at(8), quality: level >= 3 ? 'maj7' : 'maj' };
    add(bVI, 0.4, `${num(bVI)}: borrowed, epic lift`);
  } else {
    const IV: Chord = { root: at(5), quality: 'maj' };
    add(IV, 0.35, `${num(IV)}: major IV borrowed from dorian`);
  }

  return [...found.values()]
    .sort((a, b) => b.score - a.score || a.seq - b.seq)
    .slice(0, max)
    .map(({ chord, reason }) => ({ chord, reason }));
}
