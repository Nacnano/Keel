// TODO(integration): replace with @/theory numerals.romanNumeral (secondary dominants, borrowed chords).
import type { Chord, ChordQuality, Key } from '@/core';

/** Degrees relative to the tonic, major-scale convention (so minor reads i, bIII, bVI, bVII). */
const DEGREE = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];

const MINORISH = new Set<ChordQuality>([
  'min',
  'min7',
  'mMaj7',
  'm6',
  'madd9',
  'min9',
  'min11',
  'min13',
  'dim',
  'dim7',
  'm7b5',
]);

const SUFFIX: Partial<Record<ChordQuality, string>> = {
  dim: '°',
  dim7: '°7',
  m7b5: 'ø7',
  aug: '+',
  maj7: 'maj7',
  min7: '7',
  '7': '7',
  mMaj7: '(maj7)',
  '6': '6',
  m6: '6',
  '9': '9',
  maj9: 'maj9',
  min9: '9',
  '11': '11',
  min11: '11',
  '13': '13',
  maj13: 'maj13',
  min13: '13',
  sus2: 'sus2',
  sus4: 'sus4',
  '7sus4': '7sus4',
  '9sus4': '9sus4',
  '7b9': '7b9',
  '7#9': '7#9',
  '7#11': '7#11',
  '7b13': '7b13',
  '7alt': '7alt',
  'maj7#11': 'maj7#11',
  '6/9': '6/9',
  add9: 'add9',
  madd9: 'add9',
};

export function romanNumeral(chord: Chord, key: Key): string {
  const deg = DEGREE[(chord.root - key.tonic + 12) % 12];
  const body = MINORISH.has(chord.quality) ? deg.replace(/[IV]+/, (m) => m.toLowerCase()) : deg;
  return body + (SUFFIX[chord.quality] ?? '');
}
