/**
 * Per-drill accuracy and drill preferences, persisted in the IndexedDB `settings` table
 * under `train.stats` / `train.prefs`. `setSetting` is typed to `keyof Settings` (a frozen
 * core contract), so these rows go through `db.settings` directly; `getSettings()` ignores
 * keys it does not know, so they never leak into app settings.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { VocabLevel } from '@/core';
import { db } from '@/data';
import type { KeySet, ModeSet } from '@/theory';
import type { Tempo } from './playback';

export type DrillId = 'quality' | 'progression' | 'key';

export const DRILLS: readonly DrillId[] = ['quality', 'progression', 'key'];

export interface DrillStats {
  attempts: number;
  correct: number;
  bestStreak: number;
}

export type TrainStats = Record<DrillId, DrillStats>;

export const STATS_KEY = 'train.stats';
export const PREFS_KEY = 'train.prefs';

export function emptyStats(): TrainStats {
  return {
    quality: { attempts: 0, correct: 0, bestStreak: 0 },
    progression: { attempts: 0, correct: 0, bestStreak: 0 },
    key: { attempts: 0, correct: 0, bestStreak: 0 },
  };
}

const count = (x: unknown): number =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0;

/** Accepts anything (older or hand-edited rows) and returns well-formed stats. */
export function normalizeStats(raw: unknown): TrainStats {
  const out = emptyStats();
  if (!raw || typeof raw !== 'object') return out;
  for (const id of DRILLS) {
    const d = (raw as Record<string, unknown>)[id];
    if (!d || typeof d !== 'object') continue;
    const r = d as Record<string, unknown>;
    const attempts = count(r.attempts);
    out[id] = {
      attempts,
      correct: Math.min(attempts, count(r.correct)),
      bestStreak: count(r.bestStreak),
    };
  }
  return out;
}

export async function loadStats(): Promise<TrainStats> {
  const row = await db.settings.get(STATS_KEY);
  return normalizeStats(row?.value);
}

export async function saveStats(stats: TrainStats): Promise<void> {
  await db.settings.put({ key: STATS_KEY, value: stats });
}

let writes: Promise<unknown> = Promise.resolve();

/** Add one graded answer to the stored stats (writes are serialized). */
export function recordResult(
  drill: DrillId,
  correct: boolean,
  streak: number,
): Promise<TrainStats> {
  const next = writes.then(async () => {
    const stats = await loadStats();
    const d = stats[drill];
    stats[drill] = {
      attempts: d.attempts + 1,
      correct: d.correct + (correct ? 1 : 0),
      bestStreak: Math.max(d.bestStreak, streak),
    };
    await saveStats(stats);
    return stats;
  });
  writes = next.catch(() => undefined);
  return next;
}

export interface TrainPrefs {
  drill: DrillId;
  level: VocabLevel;
  keySet: KeySet;
  modes: ModeSet;
  tempo: Tempo;
}

export const DEFAULT_PREFS: TrainPrefs = {
  drill: 'quality',
  level: 1,
  keySet: 'white',
  modes: 'major',
  tempo: 'medium',
};

function oneOf<T>(x: unknown, values: readonly T[], fallback: T): T {
  return values.includes(x as T) ? (x as T) : fallback;
}

export function normalizePrefs(raw: unknown): TrainPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    drill: oneOf(r.drill, DRILLS, DEFAULT_PREFS.drill),
    level: oneOf<VocabLevel>(r.level, [1, 2, 3], DEFAULT_PREFS.level),
    keySet: oneOf<KeySet>(r.keySet, ['white', 'all'], DEFAULT_PREFS.keySet),
    modes: oneOf<ModeSet>(r.modes, ['major', 'both'], DEFAULT_PREFS.modes),
    tempo: oneOf<Tempo>(r.tempo, ['slow', 'medium', 'fast'], DEFAULT_PREFS.tempo),
  };
}

export async function loadPrefs(): Promise<TrainPrefs> {
  const row = await db.settings.get(PREFS_KEY);
  return normalizePrefs(row?.value);
}

export async function savePrefs(prefs: TrainPrefs): Promise<void> {
  await db.settings.put({ key: PREFS_KEY, value: prefs });
}

const warn = (what: string) => (err: unknown) => console.warn(`[train] could not ${what}`, err);

/** Stored stats + prefs for the train screen. Storage errors leave the in-memory state usable. */
export function useTrainStorage() {
  const [stats, setStats] = useState<TrainStats>(emptyStats);
  const [prefs, setPrefsState] = useState<TrainPrefs>(DEFAULT_PREFS);
  const touched = useRef(false);
  const prefsRef = useRef(prefs);

  useEffect(() => {
    let alive = true;
    loadStats().then((s) => alive && setStats(s), warn('load stats'));
    loadPrefs().then((p) => {
      if (!alive || touched.current) return;
      prefsRef.current = p;
      setPrefsState(p);
    }, warn('load prefs'));
    return () => {
      alive = false;
    };
  }, []);

  const record = useCallback((drill: DrillId, correct: boolean, streak: number) => {
    // optimistic, then reconciled with what was stored
    setStats((s) => {
      const d = s[drill];
      return {
        ...s,
        [drill]: {
          attempts: d.attempts + 1,
          correct: d.correct + (correct ? 1 : 0),
          bestStreak: Math.max(d.bestStreak, streak),
        },
      };
    });
    recordResult(drill, correct, streak).then(setStats, warn('save stats'));
  }, []);

  const setPrefs = useCallback((patch: Partial<TrainPrefs>) => {
    touched.current = true;
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefsState(next);
    savePrefs(next).catch(warn('save prefs'));
  }, []);

  return { stats, prefs, record, setPrefs };
}
