/**
 * Pure chord-chart model for the Analyze screen: chord rows → key blocks of compressed
 * segments (`| C G Am F | ×4`), plus "where is the playhead" lookups for highlighting.
 */
import type { Chord, ChordRecord, Key, KeyRecord } from '@/core';
import { compressRepeats, sameChord, sameKey } from '@/theory';
import { indexAt } from '../review/timeline';

export interface ChartItem {
  chord: Chord;
  /** Start in seconds. */
  t: number;
  /** Start of the next different chord or of a no-chord gap. */
  end: number;
  /** Index in `Chart.items`. */
  index: number;
}

export interface ChartSegment {
  /** One pass. */
  items: ChartItem[];
  repeat: number;
  /** Index in `Chart.items` of the first item of the first pass. */
  start: number;
}

export interface ChartBlock {
  key: Key | null;
  /** Time the key takes effect (0 for the first block). */
  t: number;
  segments: ChartSegment[];
}

export interface Chart {
  items: ChartItem[];
  blocks: ChartBlock[];
}

export interface ChartPosition {
  block: number;
  segment: number;
  /** Cell within one pass. */
  cell: number;
  /** 1-based pass of a repeated segment. */
  pass: number;
  item: ChartItem;
}

/** Key changes only (consecutive identical keys merged). */
export function keyChanges(keys: readonly KeyRecord[]): KeyRecord[] {
  const out: KeyRecord[] = [];
  for (const k of [...keys].sort((a, b) => a.t - b.t)) {
    if (!out.length || !sameKey(out[out.length - 1].key, k.key)) out.push(k);
  }
  return out;
}

/**
 * Chart items: named chords with consecutive duplicates merged (a short no-chord gap
 * between two identical chords does not split them). Blocks start at each key change.
 */
export function buildChart(
  chords: readonly ChordRecord[],
  keys: readonly KeyRecord[],
  durationSec: number,
): Chart {
  const sorted = [...chords].sort((a, b) => a.t - b.t);
  const items: ChartItem[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rec = sorted[i];
    const end = i + 1 < sorted.length ? sorted[i + 1].t : Math.max(durationSec, rec.t);
    if (!rec.chord) continue;
    const last = items[items.length - 1];
    if (last && sameChord(last.chord, rec.chord)) {
      last.end = end;
    } else {
      items.push({ chord: rec.chord, t: rec.t, end, index: items.length });
    }
  }

  const changes = keyChanges(keys);
  // The first key also covers the chords before it was detected.
  const bounds: Array<{ key: Key | null; t: number }> = changes.length
    ? changes.map((c, i) => ({ key: c.key, t: i === 0 ? 0 : c.t }))
    : [{ key: null, t: 0 }];
  const blocks: ChartBlock[] = [];
  let from = 0;
  bounds.forEach((b, k) => {
    const until = k + 1 < bounds.length ? bounds[k + 1].t : Infinity;
    let to = from;
    while (to < items.length && items[to].t < until) to++;
    const segments = compressRepeats(items.slice(from, to), (x, y) =>
      sameChord(x.chord, y.chord),
    ).map((s) => ({ items: s.items, repeat: s.repeat, start: from + s.start }));
    blocks.push({ key: b.key, t: b.t, segments });
    from = to;
  });
  return { items, blocks };
}

/** The chart cell sounding at `time`, or null in a no-chord gap / before the first chord. */
export function locate(chart: Chart, time: number): ChartPosition | null {
  const i = indexAt(chart.items, time);
  if (i < 0 || time >= chart.items[i].end) return null;
  for (let b = 0; b < chart.blocks.length; b++) {
    const segs = chart.blocks[b].segments;
    for (let s = 0; s < segs.length; s++) {
      const seg = segs[s];
      const len = seg.items.length;
      if (i >= seg.start && i < seg.start + len * seg.repeat) {
        const off = i - seg.start;
        return {
          block: b,
          segment: s,
          cell: off % len,
          pass: Math.floor(off / len) + 1,
          item: chart.items[i],
        };
      }
    }
  }
  return null;
}

/** Start time of `cell` in pass `pass` (1-based) of a segment. */
export function cellTime(chart: Chart, seg: ChartSegment, cell: number, pass = 1): number {
  const p = Math.min(Math.max(1, pass), seg.repeat);
  return chart.items[seg.start + (p - 1) * seg.items.length + cell]?.t ?? seg.items[cell].t;
}

/** Key in force at `time` (the first key also covers the time before it). */
export function keyAt(keys: readonly KeyRecord[], time: number): KeyRecord | null {
  const i = indexAt(keys, time);
  return i >= 0 ? keys[i] : (keys[0] ?? null);
}

/** Seconds spent in each key segment, in order: for the key history strip. */
export function keySpans(
  keys: readonly KeyRecord[],
  durationSec: number,
): Array<{ rec: KeyRecord; start: number; end: number }> {
  const changes = keyChanges(keys);
  return changes.map((rec, i) => ({
    rec,
    start: i === 0 ? 0 : rec.t,
    end: i + 1 < changes.length ? changes[i + 1].t : Math.max(durationSec, rec.t),
  }));
}
