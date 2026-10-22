/**
 * Pure practice stats over saved sessions: time played, sessions per day, streaks, keys,
 * progressions and chord qualities. Reads only `createdAt`, `durationSec` and `summary`.
 * No IndexedDB access (see `repo.loadStats`).
 */
import type { Session } from '@/core/session';
import type { Chord, ChordQuality, Key } from '@/core/types';
import { ALL_KEYS, QUALITY_ORDER, canonicalRotation, chordKey, mod12 } from '@/theory';

/** Keys played for less than this many seconds (all time) are nudge candidates. */
export const LEAST_PLAYED_THRESHOLD_SEC = 5 * 60;

export type StatsRange = '7d' | '30d' | 'all';

export interface DayStat {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  seconds: number;
  sessions: number;
}

export interface KeyStat {
  key: Key;
  seconds: number;
  sessions: number;
}

export interface ProgressionStat {
  chords: Chord[];
  /** Total passes across sessions. */
  count: number;
  /** Sessions it was played in. */
  sessions: number;
  /** Home key of the session with the most passes, for numerals; null if unknown. */
  key: Key | null;
}

export interface QualityStat {
  quality: ChordQuality;
  count: number;
}

export interface Stats {
  totalSeconds: number;
  sessionCount: number;
  /** One entry per local day from the range start (or first session) to today, gaps included. */
  perDay: DayStat[];
  /** Consecutive local days with at least one session. Computed over every session passed in. */
  streak: { current: number; longest: number };
  /** Descending by seconds. */
  keys: KeyStat[];
  /** Descending by passes, merged across sessions by rotation (C G Am F = Am F C G). */
  progressions: ProgressionStat[];
  /** Chord qualities in the top progressions, weighted by passes. Descending. */
  chordQualities: QualityStat[];
  /**
   * Keys played under `LEAST_PLAYED_THRESHOLD_SEC` across every session passed in, least played
   * first; ties go to keys closest to the most-played key on the circle of fifths.
   */
  leastPlayedKeys: Key[];
}

export interface StatsOptions {
  /** Only sessions created at or after this epoch ms count (streak and nudges ignore it). */
  since?: number;
  /** "Today" for the per-day strip and the current streak. Default `Date.now()`. */
  now?: number;
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day of an epoch ms timestamp, `YYYY-MM-DD`. */
export function localDay(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfDay(epochMs: number): Date {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Each local day from `from` to `to` inclusive (DST-safe: steps the calendar, not 24 h). */
function daysBetween(from: number, to: number): string[] {
  const out: string[] = [];
  const d = startOfDay(from);
  const end = startOfDay(to).getTime();
  while (d.getTime() <= end) {
    out.push(localDay(d.getTime()));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** Start (epoch ms) of a range: local midnight 6 / 29 days before `now`; undefined for `all`. */
export function rangeStart(range: StatsRange, now = Date.now()): number | undefined {
  if (range === 'all') return undefined;
  const d = startOfDay(now);
  d.setDate(d.getDate() - (range === '7d' ? 6 : 29));
  return d.getTime();
}

const keyId = (k: Key) => `${k.tonic}:${k.mode}`;

function streaks(days: ReadonlySet<string>, now: number): { current: number; longest: number } {
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const day of sorted) {
    const [y, m, d] = day.split('-').map(Number);
    const t = new Date(y, m - 1, d).getTime();
    // Round so a 23 h / 25 h DST day still counts as one step.
    run = prev !== null && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = t;
  }
  // The current streak is alive until today ends: count back from today, or from yesterday.
  const cursor = startOfDay(now);
  if (!days.has(localDay(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (days.has(localDay(cursor.getTime()))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}

/** Position on the circle of fifths of a key's signature (relative keys share one). */
function fifthsPos(k: Key): number {
  const majorTonic = k.mode === 'major' ? k.tonic : mod12(k.tonic + 3);
  return (majorTonic * 7) % 12;
}

/** Circle-of-fifths distance between keys; a mode change costs half a step. */
function keyDistance(a: Key, b: Key): number {
  const d = Math.abs(fifthsPos(a) - fifthsPos(b));
  return Math.min(d, 12 - d) + (a.mode === b.mode ? 0 : 0.5);
}

function keyTotals(sessions: readonly Session[]): KeyStat[] {
  const map = new Map<string, KeyStat>();
  for (const s of sessions) {
    for (const k of s.summary?.keys ?? []) {
      const id = keyId(k.key);
      const e = map.get(id) ?? {
        key: { tonic: k.key.tonic, mode: k.key.mode },
        seconds: 0,
        sessions: 0,
      };
      e.seconds += k.seconds;
      e.sessions++;
      map.set(id, e);
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, seconds: Math.round(e.seconds * 100) / 100 }))
    .sort((a, b) => b.seconds - a.seconds || b.sessions - a.sessions);
}

export function computeStats(sessions: readonly Session[], opts: StatsOptions = {}): Stats {
  const now = opts.now ?? Date.now();
  const all = [...sessions].sort((a, b) => a.createdAt - b.createdAt);
  const inRange = opts.since === undefined ? all : all.filter((s) => s.createdAt >= opts.since!);

  // Per day (whole session on the day it started).
  const byDay = new Map<string, DayStat>();
  let totalSeconds = 0;
  for (const s of inRange) {
    const day = localDay(s.createdAt);
    const e = byDay.get(day) ?? { day, seconds: 0, sessions: 0 };
    e.seconds += s.durationSec;
    e.sessions++;
    byDay.set(day, e);
    totalSeconds += s.durationSec;
  }
  const first = opts.since ?? inRange[0]?.createdAt;
  const last = Math.max(now, inRange.at(-1)?.createdAt ?? now);
  const perDay =
    first === undefined
      ? []
      : daysBetween(first, last).map((day) => byDay.get(day) ?? { day, seconds: 0, sessions: 0 });

  // Progressions, merged by rotation; numerals use the home key of the strongest session.
  const progs = new Map<string, ProgressionStat & { best: number }>();
  for (const s of inRange) {
    const home = s.summary?.keys[0]?.key ?? null;
    for (const p of s.summary?.topProgressions ?? []) {
      if (!p.chords.length) continue;
      const id = canonicalRotation(p.chords.map(chordKey));
      const e = progs.get(id);
      if (!e) {
        progs.set(id, {
          chords: p.chords,
          count: p.count,
          sessions: 1,
          key: home ? { tonic: home.tonic, mode: home.mode } : null,
          best: p.count,
        });
        continue;
      }
      e.count += p.count;
      e.sessions++;
      if (p.count > e.best && home) {
        e.best = p.count;
        e.key = { tonic: home.tonic, mode: home.mode };
      }
    }
  }
  const progressions = [...progs.values()]
    .sort((a, b) => b.count - a.count || b.sessions - a.sessions)
    .map(({ best: _best, ...p }) => p);

  // Chord qualities, weighted by how often each progression was played.
  const qualities = new Map<ChordQuality, number>();
  for (const p of progressions) {
    for (const c of p.chords) qualities.set(c.quality, (qualities.get(c.quality) ?? 0) + p.count);
  }
  const chordQualities = [...qualities.entries()]
    .map(([quality, count]) => ({ quality, count }))
    .sort(
      (a, b) =>
        b.count - a.count || QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality),
    );

  // Nudges come from all-time key time, so they do not change with the range.
  const allKeys = keyTotals(all);
  const secondsByKey = new Map(allKeys.map((k) => [keyId(k.key), k.seconds]));
  const home = allKeys[0]?.key ?? { tonic: 0, mode: 'major' };
  const leastPlayedKeys = ALL_KEYS.map((key) => ({
    key,
    seconds: secondsByKey.get(keyId(key)) ?? 0,
  }))
    .filter((k) => k.seconds < LEAST_PLAYED_THRESHOLD_SEC)
    .sort(
      (a, b) =>
        a.seconds - b.seconds ||
        keyDistance(a.key, home) - keyDistance(b.key, home) ||
        (a.key.mode === b.key.mode ? 0 : a.key.mode === 'major' ? -1 : 1) ||
        a.key.tonic - b.key.tonic,
    )
    .map((k) => ({ tonic: k.key.tonic, mode: k.key.mode }));

  return {
    totalSeconds,
    sessionCount: inRange.length,
    perDay,
    streak: streaks(new Set(all.map((s) => localDay(s.createdAt))), now),
    keys: opts.since === undefined ? allKeys : keyTotals(inRange),
    progressions,
    chordQualities,
    leastPlayedKeys,
  };
}
