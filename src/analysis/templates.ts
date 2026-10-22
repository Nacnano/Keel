/**
 * 12 x N chroma templates for template matching, built from the `@/theory` vocabulary.
 *
 * Template = weighted chord tones (root 1.0, third 0.8, fifth 0.6, seventh/sixth 0.7,
 * extensions 0.5, sus tones 0.8) plus a small harmonic smear (each chord tone leaks
 * 0.1 x its weight into the pitch class a fifth above, i.e. the 3rd partial), then
 * normalised to unit L2 so a dot product with a unit-L2 chroma is a cosine similarity.
 */
import type { ChordQuality, VocabLevel } from '@/core';
import { CHORD_TEMPLATES, qualitiesForLevel } from '@/theory';
import type { ChordTemplate } from '@/theory';

export { CHORD_TEMPLATES, QUALITY_ORDER, chordTones, qualitiesForLevel, sameChord } from '@/theory';

/** Alias of `CHORD_TEMPLATES` from `@/theory` (kept for existing `@/analysis` imports). */
export const CHORD_VOCAB = CHORD_TEMPLATES;
export type ChordShape = ChordTemplate;

/** Fraction of each chord tone's weight smeared onto the pitch class a fifth above. */
export const HARMONIC_SMEAR = 0.1;

export interface TemplateBank {
  level: VocabLevel;
  /** Number of chord templates (12 roots x qualities). The no-chord state is not included. */
  size: number;
  roots: Uint8Array;
  qualities: ChordQuality[];
  /** Row-major `size x 12`, each row unit L2. */
  data: Float32Array;
}

export function buildTemplates(level: VocabLevel): TemplateBank {
  const qs = qualitiesForLevel(level);
  const size = qs.length * 12;
  const roots = new Uint8Array(size);
  const qualities = new Array<ChordQuality>(size);
  const data = new Float32Array(size * 12);
  let k = 0;
  for (const q of qs) {
    const { intervals, weights } = CHORD_TEMPLATES[q];
    for (let root = 0; root < 12; root++) {
      const row = k * 12;
      for (let i = 0; i < intervals.length; i++) {
        const pc = (root + intervals[i]) % 12;
        data[row + pc] += weights[i];
        data[row + ((pc + 7) % 12)] += HARMONIC_SMEAR * weights[i];
      }
      let norm = 0;
      for (let b = 0; b < 12; b++) norm += data[row + b] * data[row + b];
      norm = Math.sqrt(norm);
      for (let b = 0; b < 12; b++) data[row + b] /= norm;
      roots[k] = root;
      qualities[k] = q;
      k++;
    }
  }
  return { level, size, roots, qualities, data };
}
