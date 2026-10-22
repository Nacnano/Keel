import { describe, expect, it } from 'vitest';
import type { ChordQuality, Key } from '@/core';
import {
  ALL_KEYS,
  HARMONIC_MINOR_SCALE,
  KRUMHANSL_MAJOR,
  KRUMHANSL_MINOR,
  MAJOR_SCALE,
  MELODIC_MINOR_SCALE,
  NATURAL_MINOR_SCALE,
  TEMPERLEY_MAJOR,
  TEMPERLEY_MINOR,
  diatonicChords,
  isDiatonic,
  keyPrefersFlats,
  keySignature,
  mod12,
  parallelKey,
  relativeKey,
  sameKey,
  scaleIntervals,
  scaleOf,
} from './keys';
import { templatePitchClasses } from './vocab';

const C: Key = { tonic: 0, mode: 'major' };
const Am: Key = { tonic: 9, mode: 'minor' };

describe('profiles', () => {
  it('have 12 bins with the tonic strongest', () => {
    for (const p of [KRUMHANSL_MAJOR, KRUMHANSL_MINOR, TEMPERLEY_MAJOR, TEMPERLEY_MINOR]) {
      expect(p.length).toBe(12);
      expect(Math.max(...p)).toBe(p[0]);
    }
    expect(KRUMHANSL_MAJOR[0]).toBe(6.35);
    expect(KRUMHANSL_MINOR[3]).toBe(5.38);
  });
});

describe('ALL_KEYS / sameKey / mod12', () => {
  it('lists 24 distinct keys', () => {
    expect(ALL_KEYS.length).toBe(24);
    expect(new Set(ALL_KEYS.map((k) => `${k.tonic}${k.mode}`)).size).toBe(24);
    expect(sameKey(C, { tonic: 0, mode: 'major' })).toBe(true);
    expect(sameKey(C, Am)).toBe(false);
    expect(sameKey(null, null)).toBe(true);
    expect(sameKey(C, null)).toBe(false);
    expect(mod12(-1)).toBe(11);
    expect(mod12(25)).toBe(1);
  });
});

describe('scales', () => {
  it('scaleOf and scaleIntervals', () => {
    expect(scaleOf(C)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(scaleOf(Am)).toEqual([9, 11, 0, 2, 4, 5, 7]);
    expect(scaleOf(Am, 'harmonic')).toEqual([9, 11, 0, 2, 4, 5, 8]);
    expect(scaleOf(Am, 'melodic')).toEqual([9, 11, 0, 2, 4, 6, 8]);
    expect(scaleIntervals(C, 'harmonic')).toBe(MAJOR_SCALE);
    expect(scaleIntervals(Am)).toBe(NATURAL_MINOR_SCALE);
    expect(scaleIntervals(Am, 'harmonic')).toBe(HARMONIC_MINOR_SCALE);
    expect(scaleIntervals(Am, 'melodic')).toBe(MELODIC_MINOR_SCALE);
  });

  it('relative and parallel keys', () => {
    expect(relativeKey(C)).toEqual(Am);
    expect(relativeKey(Am)).toEqual(C);
    expect(parallelKey(C)).toEqual({ tonic: 0, mode: 'minor' });
    for (const k of ALL_KEYS) {
      expect(relativeKey(relativeKey(k))).toEqual(k);
      expect(parallelKey(parallelKey(k))).toEqual(k);
      expect(new Set(scaleOf(relativeKey(k)))).toEqual(new Set(scaleOf(k)));
    }
  });

  it('key signatures', () => {
    expect(keySignature(C)).toBe(0);
    expect(keySignature(Am)).toBe(0);
    expect(keySignature({ tonic: 7, mode: 'major' })).toBe(1);
    expect(keySignature({ tonic: 5, mode: 'major' })).toBe(-1);
    expect(keySignature({ tonic: 1, mode: 'major' })).toBe(-5); // Db
    expect(keySignature({ tonic: 6, mode: 'major' })).toBe(-6); // Gb
    expect(keySignature({ tonic: 1, mode: 'minor' })).toBe(4); // C#m
    expect(keySignature({ tonic: 3, mode: 'minor' })).toBe(-6); // Ebm
    expect(keySignature({ tonic: 8, mode: 'minor' })).toBe(5); // G#m
    expect(keyPrefersFlats({ tonic: 10, mode: 'major' })).toBe(true);
    expect(keyPrefersFlats({ tonic: 2, mode: 'minor' })).toBe(true);
    expect(keyPrefersFlats({ tonic: 4, mode: 'minor' })).toBe(false);
    expect(keyPrefersFlats(null)).toBe(false);
    // relative keys share a signature
    for (const k of ALL_KEYS) expect(keySignature(relativeKey(k))).toBe(keySignature(k));
  });
});

describe('diatonicChords: all 24 keys', () => {
  const MAJOR_TRIADS: ChordQuality[] = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
  const MINOR_TRIADS: ChordQuality[] = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];
  const MAJOR_7: ChordQuality[] = ['maj7', 'min7', 'min7', 'maj7', '7', 'min7', 'm7b5'];
  const MINOR_7: ChordQuality[] = ['min7', 'm7b5', 'maj7', 'min7', 'min7', 'maj7', '7'];
  const HARMONIC_7: ChordQuality[] = ['mMaj7', 'm7b5', 'aug', 'min7', '7', 'maj7', 'dim7'];

  for (const key of ALL_KEYS) {
    it(`${key.tonic} ${key.mode}`, () => {
      const major = key.mode === 'major';
      const triads = diatonicChords(key, 1);
      const sevenths = diatonicChords(key, 2);
      expect(triads.map((c) => c.root)).toEqual(scaleOf(key));
      expect(triads.map((c) => c.quality)).toEqual(major ? MAJOR_TRIADS : MINOR_TRIADS);
      expect(sevenths.map((c) => c.quality)).toEqual(major ? MAJOR_7 : MINOR_7);
      expect(diatonicChords(key, 3)).toEqual(sevenths);
      const scale = new Set(scaleOf(key));
      for (const c of [...triads, ...sevenths]) {
        expect(isDiatonic(c, key)).toBe(true);
        for (const t of templatePitchClasses(c.root, c.quality)) expect(scale.has(t)).toBe(true);
      }
      if (!major) {
        expect(diatonicChords(key, 2, 'harmonic').map((c) => c.quality)).toEqual(HARMONIC_7);
      }
    });
  }
});

describe('isDiatonic', () => {
  it('checks chord tones and the slash bass', () => {
    expect(isDiatonic({ root: 7, quality: '7' }, C)).toBe(true);
    expect(isDiatonic({ root: 2, quality: '7' }, C)).toBe(false);
    expect(isDiatonic({ root: 0, quality: 'maj', bass: 4 }, C)).toBe(true);
    expect(isDiatonic({ root: 0, quality: 'maj', bass: 10 }, C)).toBe(false);
    expect(isDiatonic({ root: 4, quality: '7' }, Am)).toBe(false);
    expect(isDiatonic({ root: 4, quality: '7' }, Am, 'harmonic')).toBe(true);
  });
});
