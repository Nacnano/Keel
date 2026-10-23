import { describe, expect, it } from 'vitest';
import { midiChord } from '@/core/testing/midi';
import { identifyExact, scoreChroma } from './chordScorer';
import { buildTemplates } from './templates';
import { chromaFromNotes } from './testing/chromaFromNotes';

function best(out: Float32Array): number {
  let k = 0;
  for (let i = 1; i < out.length; i++) if (out[i] > out[k]) k = i;
  return k;
}

describe('scoreChroma', () => {
  const bank = buildTemplates(2);
  const out = new Float32Array(bank.size + 1);

  it('silence maps to the no-chord state', () => {
    expect(scoreChroma(new Float32Array(12), 0, bank, out)).toBe(true);
    expect(out[bank.size]).toBe(1);
    expect(Math.max(...out.subarray(0, bank.size))).toBe(0);
  });

  it('flat (noise-like) chroma prefers no-chord', () => {
    const flat = new Float32Array(12).fill(1 / 12);
    expect(scoreChroma(flat, 0.5, bank, out)).toBe(false);
    expect(best(out)).toBe(bank.size);
  });

  it('a C major chroma scores Cmaj best', () => {
    const f = chromaFromNotes(midiChord(['C3', 'E3', 'G3']));
    scoreChroma(f.chroma, f.energy, bank, out);
    const k = best(out);
    expect(bank.roots[k]).toBe(0);
    expect(bank.qualities[k]).toBe('maj');
    expect(out[k]).toBeGreaterThan(0.9);
    expect(out[bank.size]).toBeLessThan(out[k]);
  });
});

describe('scoreChroma evidence rules', () => {
  const bank = buildTemplates(2);
  const out = new Float32Array(bank.size + 1);
  const chroma = (bins: Record<number, number>) => {
    const c = new Float32Array(12);
    for (const [pc, v] of Object.entries(bins)) c[Number(pc)] = v;
    const sum = c.reduce((a, b) => a + b, 0);
    return c.map((v) => v / sum);
  };
  const top = (c: Float32Array, bass: number | null = null) => {
    scoreChroma(c, 0.5, bank, out, bass as never);
    const k = best(out);
    return k === bank.size ? 'N' : `${bank.roots[k]}:${bank.qualities[k]}`;
  };

  it('a decaying triad with a doubled root is still a triad, not a power chord', () => {
    expect(top(chroma({ 0: 0.62, 4: 0.18, 7: 0.14, 2: 0.03, 10: 0.03 }))).toBe('0:maj');
  });

  it('a little leakage on the 7th does not make a 7th chord; a sounding 7th does', () => {
    expect(top(chroma({ 0: 0.35, 4: 0.3, 7: 0.25, 11: 0.05 }))).toBe('0:maj');
    expect(top(chroma({ 0: 0.3, 4: 0.25, 7: 0.2, 11: 0.2 }))).toBe('0:maj7');
  });

  it('a quiet left-hand root decides a rootless voicing (Cm7 vs Ebmaj7)', () => {
    // Eb G Bb D (rootless Cm9) with a weak C in the bass.
    const c = chroma({ 3: 0.25, 7: 0.25, 10: 0.22, 2: 0.18, 0: 0.08 });
    expect(top(c)).toBe('3:maj7');
    expect(top(c, 0)).toBe('0:min7');
  });
});

describe('identifyExact', () => {
  it('matches exact sets with score 1', () => {
    expect(identifyExact([0, 4, 7], 0, 1)[0]).toEqual({
      chord: { root: 0, quality: 'maj' },
      score: 1,
    });
    expect(identifyExact([7, 11, 2, 5], 7, 2)[0].chord).toEqual({ root: 7, quality: '7' });
  });

  it('dyads of a fifth are power chords, single notes are nothing', () => {
    expect(identifyExact([0, 7], 0, 3)[0].chord).toEqual({ root: 0, quality: '5' });
    expect(identifyExact([0], 0, 3)).toEqual([]);
    expect(identifyExact([], null, 3)).toEqual([]);
  });

  it('reports inversions as slash chords', () => {
    expect(identifyExact([0, 4, 7], 4, 1)[0].chord).toEqual({ root: 0, quality: 'maj', bass: 4 });
  });

  it('prefers the interpretation rooted on the bass, then the simpler one', () => {
    // C E G A: C6 (bass C) vs Am7 (bass A); C6 is a level-3 name
    expect(identifyExact([0, 4, 7, 9], 0, 3)[0].chord).toEqual({ root: 0, quality: '6' });
    expect(identifyExact([0, 4, 7, 9], 9, 2)[0].chord).toEqual({ root: 9, quality: 'min7' });
    // G7 at level 1 collapses to G (extra F), not Bdim
    expect(identifyExact([7, 11, 2, 5], 7, 1)[0].chord).toEqual({ root: 7, quality: 'maj' });
  });

  it('tolerates one missing tone (G7 without the fifth)', () => {
    expect(identifyExact([7, 11, 5], 7, 2)[0].chord).toEqual({ root: 7, quality: '7' });
  });
});
