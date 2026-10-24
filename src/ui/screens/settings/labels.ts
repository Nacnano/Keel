/**
 * One vocabulary for the listening settings, shared by Settings, Analyze, Train and the chord
 * picker so the same setting never has two names.
 */
import type { VocabLevel } from '@/core';

export { MODE_OPTIONS } from '../jam/labels';

export const LEVEL_OPTIONS: ReadonlyArray<{ value: VocabLevel; label: string }> = [
  { value: 1, label: 'Simple' },
  { value: 2, label: 'With 7ths' },
  { value: 3, label: 'Everything' },
];

export const SENSITIVITY_MIN_LABEL = 'Quieter room';
export const SENSITIVITY_MAX_LABEL = 'Soft playing';
