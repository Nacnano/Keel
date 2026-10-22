import { resetDb } from '@/data/testing/setup';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Session, SessionSummary } from '@/core/session';
import type { Chord, Key } from '@/core/types';
import { mockSession } from '@/core/mocks';
import { db } from './db';
import { loadStats, softDeleteSession } from './repo';
import { computeStats, localDay, rangeStart } from './stats';

// Local noon on 2026-03-10 as "now"; sessions sit at local times relative to it.
const NOW = new Date(2026, 2, 10, 12, 0).getTime();
const at = (daysAgo: number, hour = 18) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

const C: Key = { tonic: 0, mode: 'major' };
const G: Key = { tonic: 7, mode: 'major' };
const Am: Key = { tonic: 9, mode: 'minor' };
const Dm: Key = { tonic: 2, mode: 'minor' };

const ch = (root: number, quality: Chord['quality']): Chord => ({ root, quality }) as Chord;
const POP = [ch(0, 'maj'), ch(7, 'maj'), ch(9, 'min'), ch(5, 'maj')];
const POP_ROTATED = [ch(9, 'min'), ch(5, 'maj'), ch(0, 'maj'), ch(7, 'maj')];
const II_V_I = [ch(2, 'min7'), ch(7, '7'), ch(0, 'maj7')];

const summary = (
  keys: Array<[Key, number]>,
  progressions: Array<[Chord[], number]> = [],
): SessionSummary => ({
  keys: keys.map(([key, seconds]) => ({ key, seconds })),
  topProgressions: progressions.map(([chords, count]) => ({ chords, count })),
  chordCount: 10,
  bookmarks: 0,
});

let n = 0;
const session = (daysAgo: number, durationSec: number, s: SessionSummary | null, hour = 18) =>
  mockSession({ id: `s${++n}`, createdAt: at(daysAgo, hour), durationSec, summary: s });

/**
 * Days ago: 0 (today, two sessions), 1, 2, then a gap at 3, then 4, 5, 6, 7 (four-day run),
 * and an old session 40 days ago.
 */
function fixture(): Session[] {
  n = 0;
  return [
    session(0, 600, summary([[C, 600]], [[POP, 8]]), 9),
    session(0, 300, summary([[C, 300]], [[POP_ROTATED, 4]])),
    // Modulation: G major, then A minor.
    session(
      1,
      900,
      summary(
        [
          [G, 600],
          [Am, 300],
        ],
        [[II_V_I, 5]],
      ),
    ),
    session(2, 120, null),
    session(4, 300, summary([[C, 300]], [[POP, 2]])),
    session(5, 60, summary([[C, 60]])),
    session(6, 60, summary([[Dm, 60]])),
    session(7, 60, summary([[Dm, 60]])),
    session(40, 1200, summary([[G, 1200]], [[II_V_I, 10]])),
  ];
}

describe('computeStats', () => {
  it('totals time and sessions in range, and fills every day of the strip', () => {
    const s = computeStats(fixture(), { since: rangeStart('7d', NOW), now: NOW });
    // 7d = today and the six days before: days 0..6.
    expect(s.sessionCount).toBe(7);
    expect(s.totalSeconds).toBe(600 + 300 + 900 + 120 + 300 + 60 + 60);
    expect(s.perDay.map((d) => d.day)).toEqual([
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
      '2026-03-09',
      '2026-03-10',
    ]);
    expect(s.perDay.at(-1)).toEqual({ day: '2026-03-10', seconds: 900, sessions: 2 });
    expect(s.perDay[3]).toEqual({ day: '2026-03-07', seconds: 0, sessions: 0 });
  });

  it('counts the current and longest streak across a gap', () => {
    const s = computeStats(fixture(), { now: NOW });
    expect(s.streak).toEqual({ current: 3, longest: 4 });
    // Not played yet today: yesterday's streak is still alive.
    const tomorrow = NOW + 86_400_000;
    expect(computeStats(fixture(), { now: tomorrow }).streak.current).toBe(3);
    expect(computeStats(fixture(), { now: tomorrow + 86_400_000 }).streak.current).toBe(0);
    // Streaks ignore the range.
    expect(computeStats(fixture(), { since: rangeStart('7d', NOW), now: NOW }).streak.longest).toBe(
      4,
    );
  });

  it('adds up time per key, including both keys of a modulating session', () => {
    const s = computeStats(fixture(), { since: rangeStart('7d', NOW), now: NOW });
    expect(s.keys).toEqual([
      { key: C, seconds: 1260, sessions: 4 },
      { key: G, seconds: 600, sessions: 1 },
      { key: Am, seconds: 300, sessions: 1 },
      { key: Dm, seconds: 60, sessions: 1 },
    ]);
    const all = computeStats(fixture(), { now: NOW });
    expect(all.keys[0]).toEqual({ key: G, seconds: 1800, sessions: 2 });
  });

  it('merges repeated progressions across sessions by rotation', () => {
    const s = computeStats(fixture(), { since: rangeStart('7d', NOW), now: NOW });
    expect(s.progressions).toEqual([
      { chords: POP, count: 14, sessions: 3, key: C },
      { chords: II_V_I, count: 5, sessions: 1, key: G },
    ]);
    const all = computeStats(fixture(), { now: NOW });
    expect(all.progressions[0]).toMatchObject({ chords: II_V_I, count: 15, sessions: 2 });
  });

  it('weights chord qualities by passes', () => {
    const s = computeStats(fixture(), { since: rangeStart('7d', NOW), now: NOW });
    expect(s.chordQualities).toEqual([
      { quality: 'maj', count: 42 },
      { quality: 'min', count: 14 },
      { quality: 'maj7', count: 5 },
      { quality: 'min7', count: 5 },
      { quality: '7', count: 5 },
    ]);
  });

  it('nudges toward keys played under five minutes, closest to home first', () => {
    const s = computeStats(fixture(), { now: NOW });
    // All time: G 1800 s, C 1260 s, A minor 300 s (exactly 5 min, not a nudge), D minor 120 s.
    const names = s.leastPlayedKeys.map((k) => `${k.tonic}:${k.mode}`);
    expect(names).not.toContain('7:major');
    expect(names).not.toContain('0:major');
    expect(names).not.toContain('9:minor');
    expect(names.at(-1)).toBe('2:minor');
    expect(names).toHaveLength(21);
    // Unplayed keys nearest G major on the circle of fifths: E minor, then D major.
    expect(names.slice(0, 2)).toEqual(['4:minor', '2:major']);
  });

  it('handles no sessions', () => {
    const s = computeStats([], { now: NOW });
    expect(s).toMatchObject({
      totalSeconds: 0,
      sessionCount: 0,
      perDay: [],
      streak: { current: 0, longest: 0 },
      keys: [],
      progressions: [],
      chordQualities: [],
    });
    expect(s.leastPlayedKeys).toHaveLength(24);
    expect(computeStats([], { since: rangeStart('7d', NOW), now: NOW }).perDay).toHaveLength(7);
  });

  it('ranges start at local midnight', () => {
    expect(localDay(rangeStart('7d', NOW)!)).toBe('2026-03-04');
    expect(localDay(rangeStart('30d', NOW)!)).toBe('2026-02-09');
    expect(new Date(rangeStart('30d', NOW)!).getHours()).toBe(0);
    expect(rangeStart('all', NOW)).toBeUndefined();
  });
});

describe('loadStats', () => {
  beforeEach(resetDb);

  it('reads non-deleted sessions for the range', async () => {
    await db.sessions.bulkPut(fixture());
    await softDeleteSession('s1');
    const week = await loadStats('7d', NOW);
    expect(week.sessionCount).toBe(6);
    expect(week.totalSeconds).toBe(300 + 900 + 120 + 300 + 60 + 60);
    const all = await loadStats('all', NOW);
    expect(all.sessionCount).toBe(8);
    expect(all.perDay[0].day).toBe(localDay(at(40)));
  });
});
