import { describe, expect, it } from 'vitest';
import { applyBass, createBassResolver } from './bassResolver';

describe('applyBass', () => {
  const C = { root: 0, quality: 'maj' } as const;

  it('adds a slash bass only for non-root chord tones', () => {
    expect(applyBass(C, 4, true)).toEqual({ root: 0, quality: 'maj', bass: 4 });
    expect(applyBass(C, 0, true)).toEqual({ root: 0, quality: 'maj' });
    expect(applyBass(C, 2, true)).toEqual({ root: 0, quality: 'maj' });
    expect(applyBass(C, null, true)).toEqual({ root: 0, quality: 'maj' });
    expect(applyBass(null, 4, true)).toBeNull();
  });

  it('collapses to the root when slash chords are hidden', () => {
    expect(applyBass({ root: 0, quality: 'maj', bass: 4 }, 4, false)).toEqual({
      root: 0,
      quality: 'maj',
    });
  });
});

describe('createBassResolver', () => {
  it('requires 3 consecutive frames of the same bass', () => {
    const r = createBassResolver();
    r.push(4);
    expect(r.stableAt(0)).toBeNull();
    r.push(4);
    expect(r.stableAt(0)).toBeNull();
    r.push(4);
    expect(r.stableAt(0)).toBe(4);
    r.push(7);
    expect(r.stableAt(0)).toBeNull();
    expect(r.stableAt(1)).toBe(4);
  });

  it('counts look-ahead frames after the delayed frame', () => {
    const r = createBassResolver();
    for (const b of [0, 0, 0, 11, 11, 11]) r.push(b as 0 | 11);
    expect(r.stableAt(2)).toBe(11); // first B frame, run continues into the future
    expect(r.stableAt(3)).toBe(0);
  });

  it('null bass breaks the run; reset clears', () => {
    const r = createBassResolver();
    for (const b of [4, null, 4, 4]) r.push(b as 4 | null);
    expect(r.stableAt(0)).toBeNull();
    r.push(4);
    expect(r.stableAt(0)).toBe(4);
    r.reset();
    expect(r.stableAt(0)).toBeNull();
  });
});
