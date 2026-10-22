import { describe, expect, it } from 'vitest';
import type { ChordQuality } from '@/core';
import {
  CHORD_TEMPLATES,
  QUALITY_ORDER,
  TONE_WEIGHTS,
  isDiminishedQuality,
  isDominantQuality,
  isMinorQuality,
  qualitiesForLevel,
  templatePitchClasses,
} from './vocab';

/** Every member of the ChordQuality union (compile-time checked by the Record below). */
const ALL: Record<ChordQuality, true> = {
  '5': true,
  maj: true,
  min: true,
  dim: true,
  aug: true,
  sus2: true,
  sus4: true,
  maj7: true,
  min7: true,
  '7': true,
  dim7: true,
  m7b5: true,
  mMaj7: true,
  '6': true,
  m6: true,
  add9: true,
  madd9: true,
  '9': true,
  maj9: true,
  min9: true,
  '11': true,
  min11: true,
  '13': true,
  maj13: true,
  min13: true,
  '7b9': true,
  '7#9': true,
  '7#11': true,
  '7b13': true,
  '7alt': true,
  'maj7#11': true,
  '6/9': true,
  '7sus4': true,
  '9sus4': true,
};

describe('CHORD_TEMPLATES', () => {
  it('covers every ChordQuality, and QUALITY_ORDER lists each once', () => {
    expect(Object.keys(CHORD_TEMPLATES).sort()).toEqual(Object.keys(ALL).sort());
    expect([...QUALITY_ORDER].sort()).toEqual(Object.keys(ALL).sort());
  });

  it('every quality starts at the root with distinct intervals and per-role weights', () => {
    for (const q of QUALITY_ORDER) {
      const t = CHORD_TEMPLATES[q];
      expect(t.intervals[0], q).toBe(0);
      expect(t.roles[0], q).toBe('root');
      expect(new Set(t.intervals).size, q).toBe(t.intervals.length);
      expect(t.weights.length, q).toBe(t.intervals.length);
      expect(t.roles.length, q).toBe(t.intervals.length);
      for (const i of t.intervals) expect(i >= 0 && i < 12, q).toBe(true);
      t.roles.forEach((r, k) => expect(t.weights[k], q).toBe(TONE_WEIGHTS[r]));
      expect(typeof t.symbol, q).toBe('string');
    }
  });

  it('uses the agreed weights', () => {
    expect(TONE_WEIGHTS).toEqual({
      root: 1,
      third: 0.8,
      fifth: 0.6,
      seventh: 0.7,
      extension: 0.5,
      sus: 0.8,
    });
    expect(CHORD_TEMPLATES.maj7.weights).toEqual([1, 0.8, 0.6, 0.7]);
    expect(CHORD_TEMPLATES.sus4.weights).toEqual([1, 0.8, 0.6]);
    expect(CHORD_TEMPLATES['9'].weights).toEqual([1, 0.8, 0.6, 0.7, 0.5]);
  });

  it('symbols are unique except none', () => {
    const symbols = QUALITY_ORDER.map((q) => CHORD_TEMPLATES[q].symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(CHORD_TEMPLATES.maj.symbol).toBe('');
    expect(CHORD_TEMPLATES.min.symbol).toBe('m');
    expect(CHORD_TEMPLATES.m7b5.symbol).toBe('m7b5');
  });
});

describe('qualitiesForLevel', () => {
  it('levels are nested with the DESIGN.md sizes', () => {
    const l1 = qualitiesForLevel(1);
    const l2 = qualitiesForLevel(2);
    const l3 = qualitiesForLevel(3);
    expect(l1).toEqual(['5', 'maj', 'min', 'dim', 'aug', 'sus2', 'sus4']);
    expect(l2.length).toBe(17);
    expect(l3.length).toBe(34);
    for (const q of l1) expect(l2).toContain(q);
    for (const q of l2) expect(l3).toContain(q);
    expect(l2).toContain('m7b5');
    expect(l2).not.toContain('9');
  });
});

describe('quality predicates', () => {
  it('classifies minor, diminished and dominant qualities', () => {
    expect(isMinorQuality('min7')).toBe(true);
    expect(isMinorQuality('m7b5')).toBe(true);
    expect(isMinorQuality('7')).toBe(false);
    expect(isMinorQuality('sus4')).toBe(false);
    expect(isDiminishedQuality('dim7')).toBe(true);
    expect(isDiminishedQuality('min')).toBe(false);
    expect(isDominantQuality('7alt')).toBe(true);
    expect(isDominantQuality('9sus4')).toBe(true);
    expect(isDominantQuality('maj7')).toBe(false);
    // every minor quality has a minor third and no major third
    for (const q of QUALITY_ORDER.filter(isMinorQuality)) {
      expect(CHORD_TEMPLATES[q].intervals, q).toContain(3);
      expect(CHORD_TEMPLATES[q].intervals, q).not.toContain(4);
    }
    for (const q of QUALITY_ORDER.filter(isDominantQuality)) {
      expect(CHORD_TEMPLATES[q].intervals, q).toContain(10);
    }
  });

  it('templatePitchClasses wraps around the octave', () => {
    expect(templatePitchClasses(0, 'maj7')).toEqual([0, 4, 7, 11]);
    expect(templatePitchClasses(9, 'min')).toEqual([9, 0, 4]);
  });
});
