import { describe, expect, it } from 'vitest';
import { createTuningTracker } from './tuning';

describe.each([44100, 48000])('guitar tuning at %i Hz', (sr) => {
  const hop = 2048 / sr;
  it.each([-40, -35, 35, 40])('learns persistent %i-cent offsets', (cents) => {
    const tracker = createTuningTracker();
    let correction = 0;
    for (let i = 0; i < 40; i++) correction = tracker.update(i * hop, cents + Math.sin(i), 0.8);
    expect(correction).toBe(cents);
    expect(tracker.update(10, cents, 0.8)).toBe(0);
  });
  it('does not follow transient bends, scattered pitches or weak evidence', () => {
    for (const scenario of ['brief', 'scatter', 'weak', 'in-tune', 'hum']) {
      const tracker = createTuningTracker();
      for (let i = 0; i < 80; i++) {
        const cents =
          scenario === 'in-tune' ? 20 : scenario === 'scatter' ? (i % 2 ? -35 : 35) : 25;
        const confidence = scenario === 'weak' || (scenario === 'brief' && i > 5) ? 0.2 : 0.8;
        expect(tracker.update(i * hop, cents, confidence, scenario === 'hum')).toBe(0);
      }
    }
  });
  it('leaves configured tuning when the phrase start is inconclusive', () => {
    const tracker = createTuningTracker();
    for (let i = 0; i < 100; i++)
      expect(tracker.update(i * hop, 35, i * hop > 2 ? 0.9 : 0.2)).toBe(0);
  });
  it('freezes tuning within a phrase and resets explicitly', () => {
    const tracker = createTuningTracker();
    for (let i = 0; i < 40; i++) tracker.update(i * hop, 35, 0.8);
    let correction = 35;
    for (let i = 40; i < 150; i++) correction = tracker.update(i * hop, 0, 0.8);
    expect(correction).toBe(35);
    tracker.reset();
    expect(tracker.update(0, 25, 0.8)).toBe(0);
  });
});
