/**
 * Exact chord identification from a set of sounding pitch classes (MIDI input).
 */
import type { Chord, ChordQuality, PitchClass, VocabLevel } from '@/core';
import { mod12 } from './keys';
import { CHORD_TEMPLATES, QUALITY_ORDER, qualitiesForLevel } from './vocab';

export interface ChordCandidate {
  chord: Chord;
  /** 1 for an exact pitch-class-set match, lower for partial matches (0..1). */
  score: number;
}

/** Candidates scoring below this are dropped. */
export const MIN_IDENTIFY_SCORE = 0.45;
/** Penalty per missing template tone, scaled by 0.5 + tone weight / 2 (a missing fifth costs least). */
const MISSING_PENALTY = 0.6;
/** Penalty per sounding pitch class that is not a chord tone. */
const EXTRA_PENALTY = 0.8;

interface Ranked extends ChordCandidate {
  bassIsRoot: boolean;
  level: number;
  tones: number;
  order: number;
}

/**
 * Rank chords for a set of pitch classes. `bass` (lowest sounding note) is added to the set
 * if missing. Rules:
 * - exact set match scores 1; each missing tone and each extra tone is penalised;
 * - ties prefer: chord rooted on the bass (C6 vs Am7), lower vocabulary level, fewer tones,
 *   earlier quality in `QUALITY_ORDER`, lower root;
 * - a bass that is a chord tone but not the root makes a slash chord (C/E);
 * - a single note, or a dyad other than a perfect fifth / fourth, gives `[]`;
 *   a perfect-fifth dyad gives only the power chord ('5'), at level 3 (where '5' is in the
 *   vocabulary; below it a bare fifth names no chord).
 */
export function identifyChord(
  pcs: readonly PitchClass[],
  bass: PitchClass | null,
  level: VocabLevel,
): ChordCandidate[] {
  const present = new Array<boolean>(12).fill(false);
  for (const p of pcs) present[mod12(p)] = true;
  if (bass !== null) present[bass] = true;
  const set: PitchClass[] = [];
  for (let p = 0; p < 12; p++) if (present[p]) set.push(p as PitchClass);
  const count = set.length;
  if (count < 2) return [];

  if (count === 2) {
    const [a, b] = set;
    const up = mod12(b - a);
    if ((up !== 7 && up !== 5) || CHORD_TEMPLATES['5'].level > level) return [];
    const root = up === 7 ? a : b;
    const chord: Chord = { root, quality: '5' };
    if (bass !== null && bass !== root) chord.bass = bass;
    return [{ chord, score: 1 }];
  }

  const out: Ranked[] = [];
  for (const q of qualitiesForLevel(level)) {
    if (q === '5') continue;
    const t = CHORD_TEMPLATES[q];
    const size = t.intervals.length;
    for (let r = 0; r < 12; r++) {
      const root = r as PitchClass;
      let matched = 0;
      let missingCost = 0;
      t.intervals.forEach((iv, k) => {
        if (present[(root + iv) % 12]) matched++;
        else missingCost += MISSING_PENALTY * (0.5 + t.weights[k] / 2);
      });
      if (matched < 2) continue;
      const extra = count - matched;
      const raw = (matched - missingCost - EXTRA_PENALTY * extra) / Math.max(size, count);
      const score = Math.round(Math.min(1, raw) * 1e6) / 1e6;
      if (score < MIN_IDENTIFY_SCORE) continue;
      const chord: Chord = { root, quality: q };
      if (bass !== null && bass !== root && present[bass] && isTone(root, q, bass)) {
        chord.bass = bass;
      }
      out.push({
        chord,
        score,
        bassIsRoot: bass === null || bass === root,
        level: t.level,
        tones: size,
        order: QUALITY_ORDER.indexOf(q),
      });
    }
  }
  out.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.bassIsRoot) - Number(a.bassIsRoot) ||
      a.level - b.level ||
      a.tones - b.tones ||
      a.order - b.order ||
      a.chord.root - b.chord.root,
  );
  return out.map(({ chord, score }) => ({ chord, score }));
}

function isTone(root: PitchClass, q: ChordQuality, p: PitchClass): boolean {
  return CHORD_TEMPLATES[q].intervals.some((iv) => (root + iv) % 12 === p);
}

/** Best chord for a pitch-class set, or null when nothing scores well enough. */
export function bestChord(
  pcs: readonly PitchClass[],
  bass: PitchClass | null,
  level: VocabLevel,
): Chord | null {
  return identifyChord(pcs, bass, level)[0]?.chord ?? null;
}
