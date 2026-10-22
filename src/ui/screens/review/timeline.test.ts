import { describe, expect, it } from 'vitest';
import type { Key } from '@/core';
import { qualitiesForLevel, levelOf } from './vocab';
import {
  clampViewport,
  clockLabel,
  indexAt,
  keySegments,
  tickStep,
  xToTime,
  zoomAt,
} from './timeline';

describe('time viewport', () => {
  it('clamps scroll to the session and zoom between fit-all and the maximum', () => {
    expect(clampViewport({ start: -5, pxPerSec: 80 }, 800, 60)).toEqual({ start: 0, pxPerSec: 80 });
    // 800 px at 80 px/s shows 10 s, so the last start is 50.
    expect(clampViewport({ start: 55, pxPerSec: 80 }, 800, 60).start).toBe(50);
    // Zooming out stops when the whole session fits.
    expect(clampViewport({ start: 0, pxPerSec: 1 }, 800, 100).pxPerSec).toBe(8);
    expect(clampViewport({ start: 0, pxPerSec: 5000 }, 800, 100).pxPerSec).toBe(600);
    const same = { start: 1, pxPerSec: 80 };
    expect(clampViewport(same, 800, 60)).toBe(same);
  });

  it('zooms around an anchor without moving the time under it', () => {
    const v = { start: 10, pxPerSec: 50 };
    const z = zoomAt(v, 2, 200);
    expect(z.pxPerSec).toBe(100);
    expect(xToTime(z, 200)).toBeCloseTo(xToTime(v, 200));
  });

  it('picks readable ruler steps', () => {
    expect(tickStep(200)).toBe(0.5);
    expect(tickStep(80)).toBe(1);
    expect(tickStep(10)).toBe(10);
  });
});

describe('lookup helpers', () => {
  it('indexAt finds the record in force at a time', () => {
    const xs = [{ t: 0 }, { t: 1.5 }, { t: 3 }];
    expect(indexAt(xs, -1)).toBe(-1);
    expect(indexAt(xs, 0)).toBe(0);
    expect(indexAt(xs, 2.9)).toBe(1);
    expect(indexAt(xs, 99)).toBe(2);
  });

  it('keySegments merges repeated keys and runs to the end', () => {
    const C: Key = { tonic: 0, mode: 'major' };
    const Am: Key = { tonic: 9, mode: 'minor' };
    expect(
      keySegments(
        [
          { t: 0, key: C },
          { t: 10, key: C },
          { t: 20, key: Am },
        ],
        30,
      ),
    ).toEqual([
      { t0: 0, t1: 20, key: C },
      { t0: 20, t1: 30, key: Am },
    ]);
  });

  it('formats clock labels', () => {
    expect(clockLabel(65)).toBe('1:05');
    expect(clockLabel(65.55, true)).toBe('1:05.5');
    expect(clockLabel(3723)).toBe('1:02:03');
  });

  it('vocabulary levels are cumulative', () => {
    expect(qualitiesForLevel(1)).toContain('sus4');
    expect(qualitiesForLevel(1)).not.toContain('maj7');
    expect(qualitiesForLevel(2)).toContain('maj7');
    expect(qualitiesForLevel(3)).toHaveLength(34);
    expect(levelOf('7alt')).toBe(3);
    expect(levelOf('min')).toBe(1);
  });
});
