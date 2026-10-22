import { describe, expect, it } from 'vitest';
import type { Key, VocabLevel } from '@/core';
import { chordSymbol } from './chordName';
import { isDiatonic, sameKey } from './keys';
import { romanNumeral } from './numerals';
import {
  CHORD_QUALITY_POOLS,
  cadenceChords,
  gradeAnswer,
  gradeKey,
  gradeProgression,
  keyPool,
  progressionChoices,
  qualityName,
  randomChordQuestion,
  randomKeyQuestion,
  randomProgressionQuestion,
  seededRng,
  WHITE_TONICS,
} from './train';

const C: Key = { tonic: 0, mode: 'major' };
const Am: Key = { tonic: 9, mode: 'minor' };
const LEVELS: VocabLevel[] = [1, 2, 3];

describe('seededRng', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const xs = Array.from({ length: 200 }, () => a());
    expect(xs).toEqual(Array.from({ length: 200 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seededRng(43)()).not.toBe(xs[0]);
  });
});

describe('randomChordQuestion', () => {
  it('same seed, same questions', () => {
    const run = (seed: number) => {
      const rng = seededRng(seed);
      return Array.from({ length: 20 }, () => randomChordQuestion(2, rng));
    };
    expect(run(7)).toEqual(run(7));
  });

  it('draws the quality from the level pool and the root from all 12', () => {
    for (const level of LEVELS) {
      const rng = seededRng(level);
      const roots = new Set<number>();
      for (let i = 0; i < 300; i++) {
        const q = randomChordQuestion(level, rng);
        expect(q.choices).toBe(CHORD_QUALITY_POOLS[level]);
        expect(q.choices).toContain(q.chord.quality);
        roots.add(q.chord.root);
      }
      expect(roots.size).toBe(12);
    }
  });

  it('names every pooled quality', () => {
    for (const level of LEVELS)
      for (const q of CHORD_QUALITY_POOLS[level]) expect(qualityName(q), q).not.toBe(q);
    expect(qualityName('min7')).toBe('Minor 7');
    expect(qualityName('m7b5')).toBe('Half-diminished');
  });
});

describe('keyPool', () => {
  it('filters tonics and modes', () => {
    expect(keyPool('all', 'both')).toHaveLength(24);
    expect(keyPool('white', 'major').map((k) => k.tonic)).toEqual([...WHITE_TONICS]);
    expect(keyPool('white', 'both')).toHaveLength(14);
  });
});

describe('progressionChoices', () => {
  it('lists the diatonic numerals, tonic first', () => {
    expect(progressionChoices(C, 1).map((c) => c.numeral)).toEqual([
      'I',
      'ii',
      'iii',
      'IV',
      'V',
      'vi',
      'vii°',
    ]);
    expect(progressionChoices(C, 2).map((c) => c.numeral)).toEqual([
      'Imaj7',
      'ii7',
      'iii7',
      'IVmaj7',
      'V7',
      'vi7',
      'viiø7',
    ]);
    expect(progressionChoices(Am, 1).map((c) => c.numeral)).toEqual([
      'i',
      'ii°',
      'bIII',
      'iv',
      'v',
      'bVI',
      'bVII',
      'V',
    ]);
  });
});

describe('randomProgressionQuestion', () => {
  it('is deterministic with a seeded rng', () => {
    const run = () => {
      const rng = seededRng(99);
      return Array.from({ length: 10 }, () => randomProgressionQuestion({ rng, level: 2 }));
    };
    expect(run()).toEqual(run());
  });

  it('gives 4 diatonic chords whose numerals match romanNumeral and the chips', () => {
    const rng = seededRng(1);
    const styles = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const level = LEVELS[i % 3];
      const q = randomProgressionQuestion({ rng, level, length: 4 });
      styles.add(q.style);
      expect(q.chords).toHaveLength(4);
      expect(q.numerals).toEqual(q.chords.map((c) => romanNumeral(c, q.key)));
      const chips = q.choices.map((c) => c.numeral);
      for (const n of q.numerals) expect(chips).toContain(n);
      for (const c of q.chords)
        expect(isDiatonic(c, q.key, 'harmonic') || isDiatonic(c, q.key)).toBe(true);
    }
    expect(styles).toEqual(new Set(['pop', 'jazz', 'random']));
  });

  it('honours a fixed key, the key list, the style and the length', () => {
    const rng = seededRng(5);
    const q = randomProgressionQuestion({ rng, level: 1, key: C, style: 'pop', randomShare: 0 });
    expect(q.key).toEqual(C);
    expect(q.style).toBe('pop');
    const keys = keyPool('white', 'major');
    for (let i = 0; i < 50; i++) {
      const p = randomProgressionQuestion({ rng, level: 1, keys });
      expect(keys.some((k) => sameKey(k, p.key))).toBe(true);
    }
    const long = randomProgressionQuestion({ rng, level: 1, key: C, length: 6 });
    expect(long.chords).toHaveLength(6);
    expect(long.numerals[0]).toBe('I');
  });

  it('jazz in C at level 2 reads like jazz', () => {
    const rng = seededRng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const q = randomProgressionQuestion({ rng, level: 2, key: C, style: 'jazz', randomShare: 0 });
      seen.add(q.chords.map((c) => chordSymbol(c, C)).join(' '));
    }
    expect(seen).toContain('Dm7 G7 Cmaj7 Cmaj7');
  });
});

describe('randomKeyQuestion', () => {
  it('is deterministic with a seeded rng', () => {
    const run = () => {
      const rng = seededRng(11);
      return Array.from({ length: 10 }, () => randomKeyQuestion({ rng }));
    };
    expect(run()).toEqual(run());
  });

  it('gives 4–6 chords ending on an authentic cadence in the key', () => {
    const rng = seededRng(2);
    const keys = keyPool('all', 'both');
    const lengths = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const q = randomKeyQuestion({ rng, keys, level: LEVELS[i % 3] });
      lengths.add(q.chords.length);
      expect(q.chords.length).toBeGreaterThanOrEqual(4);
      expect(q.chords.length).toBeLessThanOrEqual(6);
      const n = q.numerals;
      expect(n[n.length - 1]).toMatch(q.key.mode === 'major' ? /^I(maj7)?$/ : /^i7?$/);
      expect(n[n.length - 2]).toMatch(/^V7?$/);
      expect(n).toEqual(q.chords.map((c) => romanNumeral(c, q.key)));
      for (let k = 1; k < n.length; k++) expect(n[k]).not.toBe(n[k - 1]);
    }
    expect(lengths).toEqual(new Set([4, 5, 6]));
  });

  it('only uses keys from the list', () => {
    const rng = seededRng(8);
    const keys = keyPool('white', 'major');
    for (let i = 0; i < 50; i++) {
      const q = randomKeyQuestion({ rng, keys });
      expect(WHITE_TONICS).toContain(q.key.tonic);
      expect(q.key.mode).toBe('major');
    }
  });
});

describe('grading', () => {
  it('grades a chord quality', () => {
    const q = randomChordQuestion(1, seededRng(1));
    expect(gradeAnswer(q, q.chord.quality).correct).toBe(true);
    const wrong = q.choices.find((c) => c !== q.chord.quality)!;
    expect(gradeAnswer(q, wrong).correct).toBe(false);
  });

  it('grades a progression slot by slot', () => {
    const q = randomProgressionQuestion({ rng: seededRng(4), level: 1, key: C });
    expect(gradeProgression(q, q.numerals)).toEqual({
      correct: true,
      slots: [true, true, true, true],
      score: 1,
    });
    const g = gradeAnswer(q, [q.numerals[0], null, q.numerals[2], 'x']);
    expect(g.correct).toBe(false);
    expect(g.slots).toEqual([true, false, true, false]);
    expect(g.score).toBe(0.5);
  });

  it('grades a key and flags relative / parallel near-misses', () => {
    const q = randomKeyQuestion({ rng: seededRng(1), keys: [C] });
    expect(gradeKey(q, C)).toEqual({ correct: true, relative: false, parallel: false });
    expect(gradeKey(q, Am)).toEqual({ correct: false, relative: true, parallel: false });
    expect(gradeAnswer(q, { tonic: 0, mode: 'minor' })).toEqual({
      correct: false,
      relative: false,
      parallel: true,
    });
    const m = randomKeyQuestion({ rng: seededRng(1), keys: [Am] });
    expect(gradeKey(m, C).relative).toBe(true);
    expect(gradeKey(m, { tonic: 7, mode: 'major' }).relative).toBe(false);
  });
});

describe('cadenceChords', () => {
  it('I IV V I in major, i iv V i in minor', () => {
    expect(cadenceChords(C, 1).map((c) => chordSymbol(c, C))).toEqual(['C', 'F', 'G', 'C']);
    expect(cadenceChords(Am, 2).map((c) => chordSymbol(c, Am))).toEqual([
      'Am7',
      'Dm7',
      'E7',
      'Am7',
    ]);
  });
});
