import type { Chord, Key, VocabLevel } from '@/core';
import { suggestNext as theorySuggestNext } from '@/theory';
import type { Suggestion } from '@/theory';

export type { Suggestion };

/** `@/theory` `suggestNext`, capped at one row (5) of suggestions by default. */
export function suggestNext(
  key: Key | null,
  recent: readonly Chord[],
  level: VocabLevel,
  max = 5,
): Suggestion[] {
  return theorySuggestNext(key, recent, level, max);
}
