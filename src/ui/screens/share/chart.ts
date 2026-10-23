/**
 * Read-only chart model for the public share page: sections (from section
 * markers), each a list of repeat-compressed chord segments, every chord paired
 * with the key in force at its time (for the Roman numeral).
 */
import type { Chord, Key, Marker } from '@/core';
import type { KeelExportV1 } from '@/data/export';
import { collapseRuns, compressRepeats, sameChord, sameKey } from '@/theory';

export interface ChartChord {
  chord: Chord;
  key: Key | null;
}

export interface ChartSegment {
  items: ChartChord[];
  repeat: number;
}

export interface ChartSection {
  label: string | null;
  t: number;
  segments: ChartSegment[];
}

export interface ShareChartModel {
  /** Key changes in order (consecutive duplicates removed). */
  keys: Array<{ t: number; key: Key }>;
  sections: ChartSection[];
  bookmarks: Marker[];
}

const eq = (a: ChartChord, b: ChartChord) => sameChord(a.chord, b.chord) && sameKey(a.key, b.key);

export function buildShareChart(chart: KeelExportV1): ShareChartModel {
  const keys: ShareChartModel['keys'] = [];
  for (const k of [...chart.keys].sort((a, b) => a.t - b.t)) {
    const key: Key = { tonic: k.key.tonic, mode: k.key.mode };
    if (!sameKey(keys[keys.length - 1]?.key, key)) keys.push({ t: k.t, key });
  }
  const keyAt = (t: number): Key | null => {
    let cur: Key | null = keys[0]?.key ?? null;
    for (const k of keys) if (k.t <= t) cur = k.key;
    return cur;
  };

  const markers = [...chart.markers].sort((a, b) => a.t - b.t);
  const sectionMarkers = markers.filter((m) => m.kind !== 'bookmark');
  const bounds: Array<{ label: string | null; t: number }> = [
    { label: null, t: -Infinity },
    ...sectionMarkers.map((m) => ({ label: m.label?.trim() || m.kind, t: m.t })),
  ];

  const chords = [...chart.chords]
    .filter((c) => c.chord)
    .sort((a, b) => a.t - b.t)
    .map((c) => ({ t: c.t, item: { chord: c.chord as Chord, key: keyAt(c.t) } }));

  const sections: ChartSection[] = [];
  bounds.forEach((b, i) => {
    const end = bounds[i + 1]?.t ?? Infinity;
    const items = collapseRuns(
      chords.filter((c) => c.t >= b.t && c.t < end).map((c) => c.item),
      eq,
    );
    // Drop the implicit leading section when it is empty; keep empty named ones.
    if (!items.length && b.label === null) return;
    sections.push({
      label: b.label,
      t: Number.isFinite(b.t) ? b.t : 0,
      segments: compressRepeats(items, eq).map((s) => ({ items: s.items, repeat: s.repeat })),
    });
  });

  return { keys, sections, bookmarks: markers.filter((m) => m.kind === 'bookmark') };
}
