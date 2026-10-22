import { describe, expect, it } from 'vitest';
import {
  CHORD_VOCAB,
  QUALITY_ORDER,
  buildTemplates,
  chordTones,
  qualitiesForLevel,
  sameChord,
} from './templates';

describe('CHORD_VOCAB', () => {
  it('every quality starts at the root with distinct intervals and matching weights', () => {
    for (const q of QUALITY_ORDER) {
      const { intervals, weights } = CHORD_VOCAB[q];
      expect(intervals[0], q).toBe(0);
      expect(new Set(intervals).size, q).toBe(intervals.length);
      expect(weights.length, q).toBe(intervals.length);
      expect(weights[0], q).toBe(1);
      for (const i of intervals) expect(i >= 0 && i < 12, q).toBe(true);
    }
  });

  it('QUALITY_ORDER lists every quality once, grouped by level', () => {
    expect([...QUALITY_ORDER].sort()).toEqual(Object.keys(CHORD_VOCAB).sort());
    const levels = QUALITY_ORDER.map((q) => CHORD_VOCAB[q].level);
    expect([...levels].sort()).toEqual(levels);
  });

  it('levels are nested', () => {
    const l1 = qualitiesForLevel(1);
    const l2 = qualitiesForLevel(2);
    const l3 = qualitiesForLevel(3);
    expect(l1).toHaveLength(7);
    expect(l2).toHaveLength(17);
    expect(l3).toHaveLength(QUALITY_ORDER.length);
    for (const q of l1) expect(l2).toContain(q);
    for (const q of l2) expect(l3).toContain(q);
  });

  it('distinct qualities never share a pitch-class set at the same root', () => {
    const seen = new Map<string, string>();
    for (const q of QUALITY_ORDER) {
      const sig = [...chordTones(0, q)].sort((a, b) => a - b).join(',');
      expect(seen.get(sig), `${q} duplicates ${seen.get(sig)}`).toBeUndefined();
      seen.set(sig, q);
    }
  });
});

describe('buildTemplates', () => {
  it('builds 12 x N unit-L2 templates', () => {
    for (const level of [1, 2, 3] as const) {
      const bank = buildTemplates(level);
      expect(bank.size).toBe(qualitiesForLevel(level).length * 12);
      expect(bank.data.length).toBe(bank.size * 12);
      for (let k = 0; k < bank.size; k++) {
        let sq = 0;
        for (let b = 0; b < 12; b++) sq += bank.data[k * 12 + b] ** 2;
        expect(sq).toBeCloseTo(1, 5);
      }
    }
    expect(buildTemplates(3).size).toBe(12 * 34); // 34 qualities in the contract
  });

  it('weights the root highest and smears into the fifth above each tone', () => {
    const bank = buildTemplates(1);
    const k = bank.qualities.findIndex((q, i) => q === 'maj' && bank.roots[i] === 0);
    const row = Array.from(bank.data.subarray(k * 12, k * 12 + 12));
    const max = Math.max(...row);
    expect(row[0]).toBe(max);
    expect(row[4]).toBeGreaterThan(row[7]); // third 0.8 > fifth 0.6 (+ smear from C)
    expect(row[11]).toBeGreaterThan(0); // E's fifth
    expect(row[2]).toBeGreaterThan(0); // G's fifth
    expect(row[1]).toBe(0);
  });
});

describe('sameChord', () => {
  it('compares root, quality and bass', () => {
    expect(sameChord(null, null)).toBe(true);
    expect(sameChord({ root: 0, quality: 'maj' }, null)).toBe(false);
    expect(sameChord({ root: 0, quality: 'maj' }, { root: 0, quality: 'maj' })).toBe(true);
    expect(sameChord({ root: 0, quality: 'maj' }, { root: 0, quality: 'maj', bass: 4 })).toBe(
      false,
    );
  });
});
