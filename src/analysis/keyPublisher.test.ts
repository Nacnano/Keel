import { describe, expect, it } from 'vitest';
import type { KeyEstimate, KeyMode, PitchClass } from '@/core';
import { createKeyPublisher } from './keyPublisher';
import type { KeyPublication, KeySource } from './keyPublisher';

const FPS = 20;

function estimate(tonic: number, mode: KeyMode, confidence = 0.7): KeyEstimate {
  return {
    tonic: tonic as PitchClass,
    mode,
    confidence,
    relative: { tonic: 0, mode: 'major' },
    alternatives: [],
  };
}

/** A scripted estimator: `segments` of [from, key, since, lead, confidence]. */
type Segment = { from: number; key: [number, KeyMode]; since: number; lead: number; conf?: number };

function run(segments: Segment[], until: number) {
  const publisher = createKeyPublisher();
  const out: Array<KeyPublication & { at: number }> = [];
  let prev = '';
  for (let i = 0; i <= until * FPS; i++) {
    const t = i / FPS;
    const seg = [...segments].reverse().find((s) => s.from <= t);
    const est = seg ? estimate(seg.key[0], seg.key[1], seg.conf) : null;
    const source: KeySource = {
      current: () => est,
      since: () => seg?.since ?? null,
      lead: () => seg?.lead ?? 0,
    };
    const id = est ? `${est.tonic}${est.mode}` : '';
    const changed = id !== prev && id !== '';
    prev = id;
    const pub = publisher.update(t, source, changed);
    if (pub) out.push({ ...pub, at: t });
  }
  return { publisher, out };
}

describe('key publisher', () => {
  it('publishes the first key once it has led for 4 s, dated from the first sound', () => {
    const { out } = run([{ from: 1.5, key: [0, 'major'], since: 0.5, lead: 0.2 }], 10);
    expect(out).toHaveLength(1);
    expect(out[0].at).toBeGreaterThanOrEqual(5.4);
    expect(out[0].at).toBeLessThan(5.6);
    expect(out[0]).toMatchObject({ t: 0.5, since: 0.5, id: 1, key: { tonic: 0, mode: 'major' } });
    expect(out[0].supersedes).toBeUndefined();
    expect(out[0].replacesSince).toBeUndefined();
  });

  it('publishes an unmistakable key sooner', () => {
    const { out } = run([{ from: 1.5, key: [0, 'major'], since: 0.5, lead: 0.4, conf: 0.9 }], 10);
    expect(out[0].at).toBeLessThan(2.6);
  });

  it('does not publish a key that loses the lead before 4 s (a song opening on V)', () => {
    const { out } = run(
      [
        { from: 1.5, key: [11, 'major'], since: 0, lead: 0.3 },
        { from: 4.5, key: [11, 'major'], since: 0, lead: -0.1 },
        { from: 7.5, key: [4, 'major'], since: 5, lead: 0.3 },
      ],
      14,
    );
    expect(out).toHaveLength(1);
    expect(out[0].key.tonic).toBe(4);
    // drawn from the start: the opening B chords are numbered in E
    expect(out[0].t).toBe(0);
    expect(out[0].at).toBeGreaterThan(11);
  });

  it('the parallel mode does not restart the confirmation', () => {
    const { out } = run(
      [
        { from: 1.5, key: [0, 'minor'], since: 0, lead: 0.2 },
        { from: 3.5, key: [0, 'major'], since: 0, lead: 0.2 },
      ],
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0].key).toMatchObject({ tonic: 0, mode: 'major' });
    expect(out[0].at).toBeLessThan(5.6);
  });

  it('withdraws a key replaced less than 10 s after its evidence began', () => {
    const { out } = run(
      [
        { from: 1.5, key: [6, 'major'], since: 0, lead: 0.3 },
        { from: 8, key: [8, 'minor'], since: 6, lead: 0.3 },
        { from: 15.5, key: [6, 'major'], since: 13.5, lead: 0.3 },
      ],
      20,
    );
    // G♭ (published 5.5) → G♯m (6 s after G♭'s evidence) → G♭ (7.5 s after G♯m's)
    expect(
      out.map((p) => [p.key.tonic, p.key.mode, p.t, p.since, p.id, p.supersedes, p.replacesSince]),
    ).toEqual([
      [6, 'major', 0, 0, 1, undefined, undefined],
      [8, 'minor', 0, 6, 2, 1, 0],
      [6, 'major', 0, 13.5, 3, 2, 0],
    ]);
  });

  it('a key that held 10 s or more is a key change, dated from the new lead', () => {
    const { out } = run(
      [
        { from: 1.5, key: [0, 'major'], since: 0, lead: 0.3 },
        { from: 30, key: [8, 'major'], since: 27, lead: 0.3 },
      ],
      32,
    );
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ t: 27, since: 27, id: 2, key: { tonic: 8 } });
    expect(out[1].supersedes).toBeUndefined();
  });

  it('never publishes the parallel key as a change; a quick correction replaces it', () => {
    const late = run(
      [
        { from: 1.5, key: [0, 'major'], since: 0, lead: 0.3 },
        { from: 30, key: [0, 'minor'], since: 27, lead: 0.3 },
      ],
      40,
    );
    expect(late.out).toHaveLength(1);
    expect(late.publisher.current()).toMatchObject({ tonic: 0, mode: 'major' });
    const early = run(
      [
        { from: 1.5, key: [0, 'minor'], since: 0, lead: 0.3 },
        { from: 7, key: [0, 'major'], since: 5, lead: 0.3 },
      ],
      10,
    );
    expect(early.out.map((p) => [p.key.mode, p.t, p.supersedes])).toEqual([
      ['minor', 0, undefined],
      ['major', 0, 1],
    ]);
  });

  it('reset() confirms the next key again; ids restart only for a new session', () => {
    const publisher = createKeyPublisher();
    const est = estimate(0, 'major');
    const source: KeySource = { current: () => est, since: () => 0, lead: () => 0.2 };
    const ids: number[] = [];
    const feed = (from: number) => {
      for (let i = 0; i < 6 * FPS; i++) {
        const p = publisher.update(from + i / FPS, source, i === 0);
        if (p) ids.push(p.id);
      }
    };
    feed(0);
    publisher.reset();
    expect(publisher.current()).toBeNull();
    feed(10);
    publisher.reset(true);
    feed(20);
    expect(ids).toEqual([1, 2, 1]);
  });
});
