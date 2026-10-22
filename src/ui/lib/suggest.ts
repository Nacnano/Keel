// TODO(integration): replace with @/theory suggest.suggestNext (circle of fifths, ii-V, tritone subs).
import type { Chord, ChordQuality, Key, PitchClass, VocabLevel } from '@/core';

export interface Suggestion {
  chord: Chord;
  reason: string;
}

interface Degree {
  offset: number;
  triad: ChordQuality;
  seventh: ChordQuality;
  role: string;
}

const MAJOR: Degree[] = [
  { offset: 0, triad: 'maj', seventh: 'maj7', role: 'Tonic, back home' },
  { offset: 2, triad: 'min', seventh: 'min7', role: 'Predominant, sets up V' },
  { offset: 4, triad: 'min', seventh: 'min7', role: 'Mediant, soft tonic colour' },
  { offset: 5, triad: 'maj', seventh: 'maj7', role: 'Subdominant lift' },
  { offset: 7, triad: 'maj', seventh: '7', role: 'Dominant, pulls home' },
  { offset: 9, triad: 'min', seventh: 'min7', role: 'Relative minor' },
  { offset: 11, triad: 'dim', seventh: 'm7b5', role: 'Leading-tone chord' },
];

const MINOR: Degree[] = [
  { offset: 0, triad: 'min', seventh: 'min7', role: 'Tonic, back home' },
  { offset: 2, triad: 'dim', seventh: 'm7b5', role: 'Predominant, sets up V' },
  { offset: 3, triad: 'maj', seventh: 'maj7', role: 'Relative major' },
  { offset: 5, triad: 'min', seventh: 'min7', role: 'Subdominant' },
  { offset: 7, triad: 'maj', seventh: '7', role: 'Dominant (harmonic minor)' },
  { offset: 8, triad: 'maj', seventh: 'maj7', role: 'Submediant lift' },
  { offset: 10, triad: 'maj', seventh: '7', role: 'Subtonic, rock cadence' },
];

/** Typical continuations by scale-degree index. */
const NEXT: number[][] = [
  [3, 4, 5, 1],
  [4, 6, 3],
  [5, 3, 1],
  [4, 0, 1],
  [0, 5, 3],
  [3, 1, 4],
  [0, 2],
];

const pcOf = (n: number) => (((n % 12) + 12) % 12) as PitchClass;
const idOf = (c: Chord) => `${c.root}:${c.quality}`;

export function suggestNext(
  key: Key | null,
  recent: readonly Chord[],
  level: VocabLevel,
  max = 5,
): Suggestion[] {
  if (!key) return [];
  const scale = key.mode === 'major' ? MAJOR : MINOR;
  const chordAt = (d: Degree): Chord => ({
    root: pcOf(key.tonic + d.offset),
    quality: level >= 2 && d.offset === 7 ? '7' : level >= 3 ? d.seventh : d.triad,
  });
  const last = recent[recent.length - 1];
  const lastIdx = last ? scale.findIndex((d) => pcOf(key.tonic + d.offset) === last.root) : 0;
  const order = NEXT[lastIdx >= 0 ? lastIdx : 0];

  const out: Suggestion[] = [];
  const seen = new Set<string>(last ? [idOf(last)] : []);
  const add = (s: Suggestion) => {
    if (seen.has(idOf(s.chord))) return;
    seen.add(idOf(s.chord));
    out.push(s);
  };

  for (const i of order) add({ chord: chordAt(scale[i]), reason: scale[i].role });

  const target = order.map((i) => scale[i]).find((d) => d.offset !== 0 && d.offset !== 7);
  if (target) {
    add({
      chord: { root: pcOf(key.tonic + target.offset + 7), quality: level >= 2 ? '7' : 'maj' },
      reason: 'Secondary dominant into the next chord',
    });
  }
  if (key.mode === 'major') {
    add({ chord: { root: pcOf(key.tonic + 10), quality: 'maj' }, reason: 'Borrowed bVII' });
    add({
      chord: { root: pcOf(key.tonic + 5), quality: 'min' },
      reason: 'Borrowed iv, bittersweet',
    });
  }
  if (level >= 3) {
    add({ chord: { root: pcOf(key.tonic + 1), quality: '7' }, reason: 'Tritone sub for V7' });
  }
  return out.slice(0, max);
}
