import { describe, expect, it } from 'vitest';
import type { Chord, ChordQuality, PitchClass, VocabLevel } from '@/core';
import { chordTones } from './chordName';
import { MIN_IDENTIFY_SCORE, bestChord, identifyChord } from './identify';
import { CHORD_TEMPLATES, qualitiesForLevel } from './vocab';

const sorted = (xs: readonly number[]) => [...new Set(xs)].sort((a, b) => a - b);

/** Qualities whose pitch-class set has another reading in the L1/L2 vocabulary. */
const AMBIGUOUS = new Set<ChordQuality>(['6', 'min7', 'm6', 'm7b5', 'dim7', 'aug', 'sus2', 'sus4']);

describe('identifyChord: all L1/L2 qualities in all inversions', () => {
  for (const level of [1, 2] as VocabLevel[]) {
    for (const q of qualitiesForLevel(level)) {
      it(`level ${level} ${q}`, () => {
        for (let r = 0; r < 12; r++) {
          const root = r as PitchClass;
          const tones = chordTones(root, q);
          for (const bass of tones) {
            const res = identifyChord(tones, bass, level);
            expect(res.length).toBeGreaterThan(0);
            const top = res[0];
            const expected: Chord =
              bass === root ? { root, quality: q } : { root, quality: q, bass };
            // same pitch-class set, exact score
            expect(top.score).toBe(1);
            expect(sorted(chordTones(top.chord))).toEqual(sorted(tones));
            // the played chord is always among the exact candidates
            expect(res.filter((c) => c.score === 1).map((c) => c.chord)).toContainEqual(expected);
            if (!AMBIGUOUS.has(q) || bass === root) {
              expect(top.chord).toEqual(expected);
            } else if (top.chord.bass === undefined) {
              // ambiguous set: the reading rooted on the bass wins
              expect(top.chord.root).toBe(bass);
            } else {
              expect(top.chord.bass).toBe(bass);
            }
          }
        }
      });
    }
  }
});

describe('identifyChord: ambiguity and slash rules', () => {
  const C6 = [0, 4, 7, 9] as PitchClass[];

  it('C6 vs Am7 follows the bass', () => {
    expect(identifyChord(C6, 0, 3)[0].chord).toEqual({ root: 0, quality: '6' });
    expect(identifyChord(C6, 9, 2)[0].chord).toEqual({ root: 9, quality: 'min7' });
    // no bass: lower level and simpler quality order win (min7 before 6)
    expect(identifyChord(C6, null, 3)[0].chord).toEqual({ root: 9, quality: 'min7' });
    // bass on a tone that roots neither reading: slash chord
    const e = identifyChord(C6, 4, 3)[0].chord;
    expect(e.bass).toBe(4);
  });

  it('inversions become slash chords', () => {
    expect(identifyChord([0, 4, 7], 4, 1)[0].chord).toEqual({ root: 0, quality: 'maj', bass: 4 });
    expect(identifyChord([7, 11, 2, 5], 11, 2)[0].chord).toEqual({
      root: 7,
      quality: '7',
      bass: 11,
    });
    expect(identifyChord([0, 4, 7, 11], 11, 2)[0].chord).toEqual({
      root: 0,
      quality: 'maj7',
      bass: 11,
    });
  });

  it('adds the bass to the set when it is missing from pcs', () => {
    expect(identifyChord([4, 7], 0, 1)[0].chord).toEqual({ root: 0, quality: 'maj' });
  });

  it('a bass outside the chord is not reported as a slash', () => {
    // C E G over D -> Cadd9/D (exact) at level 3: the 9 is a chord tone
    expect(identifyChord([0, 4, 7], 2, 3)[0].chord).toEqual({ root: 0, quality: 'add9', bass: 2 });
    // at level 1 the best partial match keeps no bogus slash
    const top = identifyChord([0, 4, 7], 2, 1)[0];
    expect(top.score).toBeLessThan(1);
    if (top.chord.bass !== undefined) expect(chordTones(top.chord)).toContain(top.chord.bass);
  });
});

describe('identifyChord: dyads and single notes', () => {
  it('perfect fifth -> power chord; other dyads and single notes -> empty', () => {
    expect(identifyChord([0, 7], 0, 3)).toEqual([{ chord: { root: 0, quality: '5' }, score: 1 }]);
    // '5' is a level-3 name: below it a bare fifth is no chord
    expect(identifyChord([0, 7], 0, 1)).toEqual([]);
    expect(identifyChord([0, 7], 0, 2)).toEqual([]);
    expect(identifyChord([0, 7], 7, 3)).toEqual([
      { chord: { root: 0, quality: '5', bass: 7 }, score: 1 },
    ]);
    expect(identifyChord([2, 9], null, 3)).toEqual([
      { chord: { root: 2, quality: '5' }, score: 1 },
    ]);
    expect(identifyChord([0, 4], 0, 3)).toEqual([]);
    expect(identifyChord([0, 1], 0, 3)).toEqual([]);
    expect(identifyChord([0, 6], 0, 3)).toEqual([]);
    expect(identifyChord([5], 5, 3)).toEqual([]);
    expect(identifyChord([], null, 3)).toEqual([]);
    // duplicates collapse
    expect(identifyChord([0, 0, 7, 7], 0, 3)[0].chord).toEqual({ root: 0, quality: '5' });
  });
});

describe('identifyChord: partial matches and levels', () => {
  it('penalises missing and extra tones', () => {
    const shell = identifyChord([0, 4, 10], 0, 2)[0];
    expect(shell.chord).toEqual({ root: 0, quality: '7' });
    expect(shell.score).toBeLessThan(1);
    expect(shell.score).toBeGreaterThan(MIN_IDENTIFY_SCORE);
    // a seventh chord at level 1 resolves to its triad with a penalty
    const l1 = identifyChord([0, 4, 7, 11], 0, 1);
    expect(l1[0].chord).toEqual({ root: 0, quality: 'maj' });
    expect(l1[0].score).toBeLessThan(1);
    for (const c of l1) expect(CHORD_TEMPLATES[c.chord.quality].level).toBe(1);
  });

  it('missing a fifth costs less than missing a third', () => {
    const noFifth = identifyChord([0, 4, 11], 0, 2).find((c) => c.chord.quality === 'maj7');
    const noThird = identifyChord([0, 7, 11], 0, 2).find((c) => c.chord.quality === 'maj7');
    expect(noFifth!.score).toBeGreaterThan(noThird!.score);
  });

  it('identifies level-3 chords exactly', () => {
    const cases: Array<[number[], number, Chord]> = [
      [[0, 4, 7, 10, 2], 0, { root: 0, quality: '9' }],
      [[0, 4, 7, 10, 2, 9], 0, { root: 0, quality: '13' }],
      [[7, 11, 5, 10, 3], 7, { root: 7, quality: '7alt' }],
      [[0, 4, 7, 11, 6], 0, { root: 0, quality: 'maj7#11' }],
      [[2, 5, 9, 0, 4], 2, { root: 2, quality: 'min9' }],
      [[7, 0, 2, 5], 7, { root: 7, quality: '7sus4' }],
    ];
    for (const [pcs, bass, chord] of cases) {
      const top = identifyChord(pcs as PitchClass[], bass as PitchClass, 3)[0];
      expect(top.chord).toEqual(chord);
      expect(top.score).toBe(1);
    }
  });

  it('results are sorted by score, deterministic and filtered by level', () => {
    const a = identifyChord([2, 5, 9, 0], 2, 3);
    const b = identifyChord([0, 9, 5, 2], 2, 3);
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i - 1].score).toBeGreaterThanOrEqual(a[i].score);
    for (const c of identifyChord([2, 5, 9, 0, 4], 2, 2)) {
      expect(CHORD_TEMPLATES[c.chord.quality].level).toBeLessThanOrEqual(2);
    }
  });

  it('bestChord returns the top candidate or null', () => {
    expect(bestChord([9, 0, 4], 9, 1)).toEqual({ root: 9, quality: 'min' });
    expect(bestChord([0, 1], 0, 3)).toBeNull();
  });
});
