import { describe, expect, it } from 'vitest';
import { createSmoother, lagForStability, stayProbability } from './smoother';

function sims(n: number, winner: number, margin = 0.3): Float32Array {
  const s = new Float32Array(n).fill(0.5);
  s[winner] = 0.5 + margin;
  return s;
}

describe('smoother', () => {
  it('maps stability to stay probability and lag', () => {
    expect(stayProbability(0)).toBeCloseTo(0.9);
    expect(stayProbability(1)).toBeCloseTo(0.99);
    expect(lagForStability(0)).toBe(4);
    expect(lagForStability(0.5)).toBe(6);
    expect(lagForStability(1)).toBe(8);
  });

  it('decodes with a fixed lag and a confident posterior', () => {
    const s = createSmoother({ numStates: 10, stability: 0.5 });
    const out = [];
    for (let i = 0; i < 20; i++) out.push(s.push(sims(10, i < 10 ? 2 : 5)));
    expect(out.slice(0, s.lag).every((d) => d === null)).toBe(true);
    const decided = out.filter((d) => d !== null);
    expect(decided[0]!.frame).toBe(0);
    expect(decided.map((d) => d!.state)).toEqual([...Array(10).fill(2), ...Array(4).fill(5)]);
    for (const d of decided) {
      expect(d!.confidence).toBeGreaterThan(0.9);
      expect(d!.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('ignores a single-frame blip', () => {
    const s = createSmoother({ numStates: 10, stability: 0.5 });
    const states: number[] = [];
    for (let i = 0; i < 30; i++) {
      const d = s.push(sims(10, i === 12 ? 7 : 1, 0.1));
      if (d) states.push(d.state);
    }
    expect(new Set(states)).toEqual(new Set([1]));
  });

  it('reset restarts the lag', () => {
    const s = createSmoother({ numStates: 4, stability: 0 });
    for (let i = 0; i < 10; i++) s.push(sims(4, 1));
    s.reset();
    expect(s.frames).toBe(0);
    expect(s.push(sims(4, 1))).toBeNull();
  });

  it('reports how long the best path stays in the decided state', () => {
    const s = createSmoother({ numStates: 4, stability: 0.5 });
    const runs: number[] = [];
    for (let t = 0; t < 40; t++) {
      const d = s.push(sims(4, t < 20 ? 0 : 1));
      if (d) runs.push(d.run);
    }
    expect(Math.max(...runs)).toBe(s.lag + 1);
    expect(Math.min(...runs)).toBeLessThanOrEqual(s.lag);
  });
});
