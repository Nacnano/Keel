import { describe, expect, it } from 'vitest';
import type { Key } from '@/core';
import { chordSymbol } from './chordName';
import { ALL_KEYS, isDiatonic } from './keys';
import { modulationHints } from './modulation';
import { keyName } from './notes';

const C: Key = { tonic: 0, mode: 'major' };
const Am: Key = { tonic: 9, mode: 'minor' };
const inKey = (c: Parameters<typeof isDiatonic>[0], k: Key) =>
  isDiatonic(c, k) || (k.mode === 'minor' && isDiatonic(c, k, 'harmonic'));

describe('modulationHints', () => {
  it('C major: G major via C (I / IV), A minor via Dm (ii / iv)', () => {
    const hints = modulationHints(C, 2);
    expect(hints.map((h) => keyName(h.to))).toEqual([
      'G major',
      'A minor',
      'F major',
      'C minor',
      'D major',
    ]);
    const g = hints[0];
    expect(chordSymbol(g.pivot, C)).toBe('C');
    expect([g.pivotNumeralFrom, g.pivotNumeralTo]).toEqual(['I', 'IV']);
    expect(g.reason).toBe('Up a fifth: C is I here and IV in G major; then D7 → G');
    const a = hints[1];
    expect(chordSymbol(a.pivot, C)).toBe('Dm');
    expect([a.pivotNumeralFrom, a.pivotNumeralTo]).toEqual(['ii', 'iv']);
    expect(hints[3].pivotNumeralTo).toBe('V');
    expect(hints[4].pivotNumeralFrom).toBe('iii');
  });

  it('level 1 gives four hints with triads; level 3 uses sevenths and a chromatic mediant', () => {
    const l1 = modulationHints(C, 1);
    expect(l1).toHaveLength(4);
    expect(l1.every((h) => ['maj', 'min', 'dim'].includes(h.pivot.quality))).toBe(true);
    const l3 = modulationHints(C, 3);
    expect(l3).toHaveLength(5);
    expect(chordSymbol(l3[0].pivot, C)).toBe('Cmaj7');
    const mediant = l3[4];
    expect(keyName(mediant.to)).toBe('A major');
    expect(mediant.direct).toBe(true);
    expect(chordSymbol(mediant.pivot, C)).toBe('E7');
    expect([mediant.pivotNumeralFrom, mediant.pivotNumeralTo]).toEqual(['V7/vi', 'V7']);
  });

  it('A minor: relative C major, parallel A major via E', () => {
    const hints = modulationHints(Am, 2);
    expect(hints.map((h) => keyName(h.to))).toContain('C major');
    const par = hints.find((h) => keyName(h.to) === 'A major')!;
    expect(chordSymbol(par.pivot, Am)).toBe('E');
  });

  it('every common-chord pivot is diatonic to both keys, for every key and level', () => {
    for (const key of ALL_KEYS) {
      for (const level of [1, 2, 3] as const) {
        const hints = modulationHints(key, level);
        expect(hints.length).toBeGreaterThanOrEqual(3);
        expect(hints.length).toBeLessThanOrEqual(5);
        for (const h of hints) {
          if (h.direct) {
            expect((h.pivot.root - h.to.tonic + 12) % 12).toBe(7);
          } else {
            expect(inKey(h.pivot, key), `${keyName(key)} -> ${keyName(h.to)}`).toBe(true);
            expect(inKey(h.pivot, h.to), `${keyName(key)} -> ${keyName(h.to)}`).toBe(true);
          }
          expect(h.pivot.root === h.to.tonic && !h.direct).toBe(false);
        }
      }
    }
  });

  it('honours max and ignores KeyEstimate extras', () => {
    expect(modulationHints(C, 2, 3)).toHaveLength(3);
    const est = { ...C, confidence: 0.9, relative: Am, alternatives: [] };
    expect(modulationHints(est, 2)[0].to).toEqual({ tonic: 7, mode: 'major' });
  });
});
