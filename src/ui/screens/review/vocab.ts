import type { ChordQuality, VocabLevel } from '@/core';

/** Chord qualities introduced at each vocabulary level (see `ChordQuality` in core/types). */
const BY_LEVEL: Record<VocabLevel, readonly ChordQuality[]> = {
  1: ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4', '5'],
  2: ['maj7', 'min7', '7', 'dim7', 'm7b5', 'mMaj7', '6', 'm6', 'add9', 'madd9'],
  3: [
    '9',
    'maj9',
    'min9',
    '11',
    'min11',
    '13',
    'maj13',
    'min13',
    '7b9',
    '7#9',
    '7#11',
    '7b13',
    '7alt',
    'maj7#11',
    '6/9',
    '7sus4',
    '9sus4',
  ],
};

const LEVELS: readonly VocabLevel[] = [1, 2, 3];

/** Every quality available at `level` (levels are cumulative). */
export function qualitiesForLevel(level: VocabLevel): ChordQuality[] {
  return LEVELS.filter((l) => l <= level).flatMap((l) => BY_LEVEL[l]);
}

/** Lowest level that contains `quality`. */
export function levelOf(quality: ChordQuality): VocabLevel {
  return LEVELS.find((l) => BY_LEVEL[l].includes(quality)) ?? 3;
}
