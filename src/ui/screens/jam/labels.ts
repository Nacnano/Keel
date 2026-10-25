import type { Instrument, JamMode, VocabLevel } from '@/core';

/** One vocabulary for the listening mode, wherever it is offered. */
export const MODE_OPTIONS: ReadonlyArray<{ value: JamMode; label: string }> = [
  { value: 'solo', label: 'My instrument' },
  { value: 'room', label: 'Overall harmony' },
];

export const VOCAB_OPTIONS: ReadonlyArray<{ value: VocabLevel; label: string }> = [
  { value: 1, label: 'Simple' },
  { value: 2, label: 'With 7ths' },
  { value: 3, label: 'Everything' },
];

export const INSTRUMENT_OPTIONS: ReadonlyArray<{ value: Instrument; label: string }> = [
  { value: 'piano', label: 'Piano/keyboard' },
  { value: 'guitar', label: 'Guitar' },
];

export const PIANO_DESCRIPTION = 'Acoustic, electric, and digital piano sounds.';
