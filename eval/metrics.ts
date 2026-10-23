/**
 * Metrics for one (session, condition, config) run, computed from what the jam screen would
 * show at each wall-clock instant (events are applied at their emission time, not at the
 * decoded frame time, so the smoother's look-ahead lag counts as latency).
 *
 * Display model (src/ui/components/ChordDisplay.tsx): the last chord event is shown when its
 * confidence ≥ MIN_DISPLAY_CONFIDENCE, otherwise a dash. A null chord is a dash too.
 */
import { MIN_DISPLAY_CONFIDENCE } from '@/core/constants';
import type { Chord, ChordQuality, Key, VocabLevel } from '@/core/types';
import { CHORD_TEMPLATES } from '@/theory';
import type { GtChord } from './render';

export interface TimedChord {
  /** Wall time the event reached the UI (s from session start). */
  wall: number;
  chord: Chord | null;
  confidence: number;
}

export interface TimedKey {
  wall: number;
  key: Key;
}

export interface RunStats {
  /** Seconds of ground-truth chord time sampled. */
  gtSec: number;
  rqSec: number;
  /** Ground-truth time more than 0.5 s after a downbeat, and the correct part of it. */
  steadySec: number;
  steadyRqSec: number;
  rootSec: number;
  dashSec: number;
  latencies: number[];
  changes: number;
  missed: number;
  spurious: number;
  /** Seconds (whole session) with the exact key / key-or-relative shown. */
  keySec: number;
  keyRelSec: number;
  sessionSec: number;
  /** Seconds from the first chord to the first correct key; null if never. */
  firstKey: number | null;
  /** Seconds per confusion "written → shown" (quality names; "root" when the root is wrong). */
  confusions: Record<string, number>;
}

const LEVEL2_FALLBACK: Partial<Record<ChordQuality, ChordQuality>> = {
  '9': '7',
  '11': '7',
  '13': '7',
  '7b9': '7',
  '7#9': '7',
  '7#11': '7',
  '7b13': '7',
  '7alt': '7',
  '7sus4': '7',
  '9sus4': '7',
  maj9: 'maj7',
  maj13: 'maj7',
  'maj7#11': 'maj7',
  min9: 'min7',
  min11: 'min7',
  min13: 'min7',
  '6/9': 'maj',
  '6': 'maj',
  add9: 'maj',
  m6: 'min',
  madd9: 'min',
  mMaj7: 'min',
  aug: 'maj',
  sus2: 'maj',
  '5': 'maj',
};

const LEVEL1_FALLBACK: Partial<Record<ChordQuality, ChordQuality>> = {
  maj7: 'maj',
  '7': 'maj',
  min7: 'min',
  m7b5: 'dim',
  dim7: 'dim',
  sus4: 'maj',
};

/** The written quality as it can be named at `level` (Gm9 → Gm7 at level 2). */
export function reduceQuality(q: ChordQuality, level: VocabLevel): ChordQuality {
  let out = q;
  if (CHORD_TEMPLATES[out].level > 2 && level <= 2) out = LEVEL2_FALLBACK[out] ?? out;
  if (CHORD_TEMPLATES[out].level > 1 && level <= 1) out = LEVEL1_FALLBACK[out] ?? out;
  return out;
}

const shown = (e: TimedChord | undefined): Chord | null =>
  e && e.chord && e.confidence >= MIN_DISPLAY_CONFIDENCE ? e.chord : null;

const matchRQ = (c: Chord | null, gt: Chord, level: VocabLevel) =>
  !!c && c.root === gt.root && c.quality === reduceQuality(gt.quality, level);

const sameKey = (a: Key | null, b: Key) => !!a && a.tonic === b.tonic && a.mode === b.mode;
const relativeOf = (k: Key): Key =>
  k.mode === 'major'
    ? { tonic: ((k.tonic + 9) % 12) as Key['tonic'], mode: 'minor' }
    : { tonic: ((k.tonic + 3) % 12) as Key['tonic'], mode: 'major' };

export function computeStats(
  gt: GtChord[],
  gtKey: Key,
  chords: TimedChord[],
  keys: TimedKey[],
  level: VocabLevel,
  sessionSec: number,
): RunStats {
  const step = 0.01;
  const stats: RunStats = {
    gtSec: 0,
    rqSec: 0,
    steadySec: 0,
    steadyRqSec: 0,
    rootSec: 0,
    dashSec: 0,
    latencies: [],
    changes: 0,
    missed: 0,
    spurious: 0,
    keySec: 0,
    keyRelSec: 0,
    sessionSec,
    firstKey: null,
    confusions: {},
  };

  // Frame-level chord accuracy over the ground-truth span.
  let ci = -1;
  let gi = 0;
  const start = gt[0].t0;
  const end = gt[gt.length - 1].t1;
  for (let t = start; t < end; t += step) {
    while (ci + 1 < chords.length && chords[ci + 1].wall <= t) ci++;
    while (gi + 1 < gt.length && gt[gi].t1 <= t) gi++;
    const d = shown(chords[ci]);
    const g = gt[gi].chord;
    stats.gtSec += step;
    const steady = t - gt[gi].t0 >= 0.5;
    if (steady) {
      stats.steadySec += step;
      if (matchRQ(d, g, level)) stats.steadyRqSec += step;
    }
    if (!d) stats.dashSec += step;
    else {
      if (d.root === g.root) stats.rootSec += step;
      if (matchRQ(d, g, level)) stats.rqSec += step;
      else {
        const gq = reduceQuality(g.quality, level);
        const k =
          d.root === g.root
            ? `${gq} → ${d.quality}`
            : `${gq} → wrong root (${(d.root - g.root + 12) % 12} st, ${d.quality})`;
        stats.confusions[k] = (stats.confusions[k] ?? 0) + step;
      }
    }
  }

  // Change latency: first wall time the correct label is displayed after the downbeat.
  for (let i = 0; i < gt.length; i++) {
    const g = gt[i];
    stats.changes++;
    let lat: number | null = null;
    // Correct label already on screen at the downbeat only happens when the previous chord had
    // the same reduced label; skip those (not a change at this vocabulary level).
    let before: TimedChord | undefined;
    for (const e of chords) if (e.wall <= g.t0) before = e;
    if (i > 0 && matchRQ(shown(before), g.chord, level)) {
      stats.changes--;
      continue;
    }
    for (const e of chords) {
      if (e.wall < g.t0 - 0.15 || e.wall >= g.t1) continue;
      if (matchRQ(shown(e), g.chord, level)) {
        lat = e.wall - g.t0;
        break;
      }
    }
    if (lat === null) stats.missed++;
    else stats.latencies.push(lat);
  }

  // Spurious: display changes inside the span into a wrong (non-dash) label.
  let prevKey = 'none';
  for (const e of chords) {
    const d = shown(e);
    const sig = d ? `${d.root}:${d.quality}` : 'dash';
    if (sig === prevKey) continue;
    prevKey = sig;
    if (!d || e.wall < start || e.wall >= end) continue;
    const now = gt.find((g) => e.wall >= g.t0 && e.wall < g.t1);
    const soon = gt.find((g) => g.t0 > e.wall && g.t0 - e.wall < 0.15);
    const ok = (now && matchRQ(d, now.chord, level)) || (soon && matchRQ(d, soon.chord, level));
    if (!ok) stats.spurious++;
  }

  // Key accuracy over the whole session (no key shown counts as wrong).
  let ki = -1;
  const rel = relativeOf(gtKey);
  for (let t = 0; t < sessionSec; t += step) {
    while (ki + 1 < keys.length && keys[ki + 1].wall <= t) ki++;
    const k = ki >= 0 ? keys[ki].key : null;
    if (sameKey(k, gtKey)) {
      stats.keySec += step;
      stats.keyRelSec += step;
      if (stats.firstKey === null) stats.firstKey = Math.max(0, t - start);
    } else if (sameKey(k, rel)) stats.keyRelSec += step;
  }
  return stats;
}

export function mergeStats(list: RunStats[]): RunStats {
  const out: RunStats = {
    gtSec: 0,
    rqSec: 0,
    steadySec: 0,
    steadyRqSec: 0,
    rootSec: 0,
    dashSec: 0,
    latencies: [],
    changes: 0,
    missed: 0,
    spurious: 0,
    keySec: 0,
    keyRelSec: 0,
    sessionSec: 0,
    firstKey: null,
    confusions: {},
  };
  const firsts: number[] = [];
  for (const s of list) {
    out.gtSec += s.gtSec;
    out.rqSec += s.rqSec;
    out.steadySec += s.steadySec;
    out.steadyRqSec += s.steadyRqSec;
    out.rootSec += s.rootSec;
    out.dashSec += s.dashSec;
    out.latencies.push(...s.latencies);
    out.changes += s.changes;
    out.missed += s.missed;
    out.spurious += s.spurious;
    out.keySec += s.keySec;
    out.keyRelSec += s.keyRelSec;
    out.sessionSec += s.sessionSec;
    firsts.push(s.firstKey ?? Infinity);
    for (const [k, v] of Object.entries(s.confusions)) {
      out.confusions[k] = (out.confusions[k] ?? 0) + v;
    }
  }
  // Median time to first correct key (Infinity when most sessions never got it).
  firsts.sort((a, b) => a - b);
  out.firstKey = firsts.length ? firsts[Math.floor((firsts.length - 1) / 2)] : null;
  return out;
}
