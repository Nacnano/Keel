import { resetDb } from '@/data/testing/setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSettings } from '@/data';
import { DEFAULT_SETTINGS } from '@/core';
import {
  DEFAULT_PREFS,
  emptyStats,
  loadPrefs,
  loadStats,
  normalizePrefs,
  normalizeStats,
  recordResult,
  savePrefs,
  STATS_KEY,
} from './stats';

beforeEach(resetDb);

describe('train stats persistence', () => {
  it('starts empty and round-trips recorded results', async () => {
    expect(await loadStats()).toEqual(emptyStats());
    await recordResult('quality', true, 1);
    await recordResult('quality', true, 2);
    await recordResult('quality', false, 0);
    await recordResult('key', true, 1);
    const stats = await loadStats();
    expect(stats.quality).toEqual({ attempts: 3, correct: 2, bestStreak: 2 });
    expect(stats.key).toEqual({ attempts: 1, correct: 1, bestStreak: 1 });
    expect(stats.progression).toEqual({ attempts: 0, correct: 0, bestStreak: 0 });
    expect((await db.settings.get(STATS_KEY))?.value).toEqual(stats);
  });

  it('serializes concurrent writes', async () => {
    await Promise.all([
      recordResult('progression', true, 1),
      recordResult('progression', true, 2),
      recordResult('progression', true, 3),
    ]);
    expect((await loadStats()).progression).toEqual({ attempts: 3, correct: 3, bestStreak: 3 });
  });

  it('does not leak into app settings', async () => {
    await recordResult('quality', true, 1);
    await savePrefs({ ...DEFAULT_PREFS, level: 3 });
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips prefs', async () => {
    expect(await loadPrefs()).toEqual(DEFAULT_PREFS);
    const prefs = { drill: 'key', level: 2, keySet: 'all', modes: 'both', tempo: 'fast' } as const;
    await savePrefs(prefs);
    expect(await loadPrefs()).toEqual(prefs);
  });

  it('normalizes bad rows', () => {
    expect(normalizeStats(null)).toEqual(emptyStats());
    expect(
      normalizeStats({ quality: { attempts: 2, correct: 9, bestStreak: -1 } }).quality,
    ).toEqual({ attempts: 2, correct: 2, bestStreak: 0 });
    expect(normalizePrefs({ level: 7, tempo: 'warp', drill: 'key' })).toEqual({
      ...DEFAULT_PREFS,
      drill: 'key',
    });
  });
});
