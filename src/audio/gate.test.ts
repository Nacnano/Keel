import { describe, expect, it } from 'vitest';
import { createAdaptiveGate, createEnergyGate, sensitivityMarginDb } from './gate';

const HOP = 2048 / 48000;
const feed = (gate: { update(db: number): boolean }, db: number, seconds: number) => {
  let open = false;
  for (let t = 0; t < seconds; t += HOP) open = gate.update(db);
  return open;
};

describe('fixed energy gate', () => {
  it('opens at openDb and closes 4 dB lower', () => {
    const g = createEnergyGate({ openDb: -50 });
    expect(g.update(-51)).toBe(false);
    expect(g.update(-50)).toBe(true);
    expect(g.update(-53.9)).toBe(true);
    expect(g.update(-54.1)).toBe(false);
  });
});

describe('adaptive gate', () => {
  it('maps sensitivity to the opening margin', () => {
    expect(sensitivityMarginDb(0)).toBeCloseTo(14);
    expect(sensitivityMarginDb(0.5)).toBeCloseTo(9);
    expect(sensitivityMarginDb(1)).toBeCloseTo(4);
    expect(sensitivityMarginDb(NaN)).toBeCloseTo(9);
  });

  it('admits an immediate quiet attack before a noise-floor lead-in', () => {
    const g = createAdaptiveGate({ hopSec: HOP });
    expect(g.update(-58)).toBe(true);
    expect(feed(g, -62, 0.3)).toBe(true);
  });

  it('closes after warmup on stationary startup noise', () => {
    const g = createAdaptiveGate({ hopSec: HOP });
    expect(g.update(-55)).toBe(true); // provisional startup floor
    expect(feed(g, -55, 2)).toBe(false);
    expect(g.floorDb()).toBeCloseTo(-55, 0);
  });

  it('learns the noise floor and stays closed on noise alone', () => {
    const g = createAdaptiveGate({ hopSec: HOP });
    expect(feed(g, -62, 3)).toBe(false);
    expect(g.floorDb()).toBeCloseTo(-62, 0);
    expect(g.thresholdDb()).toBeCloseTo(-53, 0);
  });

  it('opens for quiet playing a few dB above a quiet room (the old −50 dBFS gate would not)', () => {
    const g = createAdaptiveGate({ hopSec: HOP });
    feed(g, -75, 1.5);
    expect(g.update(-62)).toBe(true); // 13 dB above the floor, 12 dB below the old fixed gate
  });

  it('follows a decaying chord down to 3 dB above the floor once open', () => {
    const g = createAdaptiveGate({ hopSec: HOP });
    feed(g, -60, 1.5);
    expect(g.update(-45)).toBe(true);
    expect(feed(g, -55, 0.5)).toBe(true);
    expect(feed(g, -58, 0.2)).toBe(false);
  });

  it('higher sensitivity opens closer to the floor', () => {
    const lo = createAdaptiveGate({ hopSec: HOP, sensitivity: 0 });
    const hi = createAdaptiveGate({ hopSec: HOP, sensitivity: 1 });
    feed(lo, -60, 1.5);
    feed(hi, -60, 1.5);
    expect(lo.update(-54)).toBe(false);
    expect(hi.update(-54)).toBe(true);
    lo.setSensitivity(1);
    expect(lo.update(-54)).toBe(true);
  });

  it('does not drag the floor up during long continuous playing', () => {
    const g = createAdaptiveGate({ hopSec: HOP });
    feed(g, -65, 1.5);
    feed(g, -30, 30); // 30 s of loud playing, gate open
    expect(g.floorDb()).toBeLessThan(-62);
  });

  it('rises with a noisier room while closed, and clamps the threshold', () => {
    const g = createAdaptiveGate({ hopSec: HOP });
    feed(g, -70, 1.5);
    feed(g, -64, 6); // fan switched on: within the margin, gate closed
    expect(g.floorDb()).toBeGreaterThan(-65);
    const loud = createAdaptiveGate({ hopSec: HOP });
    feed(loud, -20, 1.5); // started while playing loudly
    expect(loud.thresholdDb()).toBe(-40);
    const silent = createAdaptiveGate({ hopSec: HOP });
    feed(silent, -Infinity, 1.5);
    expect(silent.thresholdDb()).toBe(-78);
  });
});
