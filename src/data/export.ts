/**
 * Export a session as a plain-text chord chart or versioned JSON, and import
 * JSON back with fresh ids.
 */
import { v4 as uuid } from 'uuid';
import type {
  ChordRecord,
  KeyRecord,
  Marker,
  MarkerKind,
  MidiTrack,
  Session,
} from '@/core/session';
import type { Chord, Key } from '@/core/types';
import {
  chordSymbol,
  keyName,
  prettyAccidentals,
  romanNumeral,
  sameChordFamily,
  type ChordSymbolOptions,
} from '@/theory';
import { compressRepeats } from '@/ui/lib/compress';
import { db } from './db';
import { normalizeTags, type SessionFull } from './repo';
import { computeSummary } from './summary';

export const EXPORT_VERSION = 1;

export interface KeelExportV1 {
  version: 1;
  session: Session;
  chords: ChordRecord[];
  keys: KeyRecord[];
  markers: Marker[];
  midiTrack: MidiTrack | null;
}

/** `5:00`, `1:02:03`. */
export function formatTime(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Key spans shorter than this are folded into a neighbour: a wobble, not a key change. */
export const MIN_KEY_SPAN_SEC = 10;
/** Most chords on one line of a run that does not repeat. */
const MAX_CHORDS_PER_LINE = 8;
/** A run this short after (or before) another line joins it instead of standing alone. */
const MAX_LEFTOVER = 2;

const SECTION_TITLE: Record<MarkerKind, string> = {
  bookmark: 'Bookmark',
  intro: 'Intro',
  verse: 'Verse',
  pre: 'Pre-chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  outro: 'Outro',
  custom: 'Section',
};

/** Title-case heading for a section marker: "Chorus", or the user's label capitalized. */
export function sectionTitle(m: Pick<Marker, 'kind' | 'label'>): string {
  const label = m.label?.trim();
  return label ? label[0].toUpperCase() + label.slice(1) : SECTION_TITLE[m.kind];
}

/** One chord as it sounded: start, and the start of whatever came next. */
export interface ChartSpan {
  t: number;
  end: number;
}

/** One pass of a loop played `repeat` times, or a run of chords that does not repeat. */
export interface ChartSegment {
  chords: Chord[];
  repeat: number;
  /** Every chord of every pass in time order (`chords.length * repeat` entries). */
  spans: ChartSpan[];
}

/** One printed line: a loop, a run of up to eight chords, or a loop with a short tail. */
export type ChartRow = ChartSegment[];

/** A part of the chart: a section (title from a marker, or none) or a key change. */
export type ChartPart =
  | { type: 'section'; title: string | null; t: number; key: Key | null; rows: ChartRow[] }
  | { type: 'key'; key: Key; t: number };

export interface Chart {
  /** The key that covers the most seconds (the headline key). */
  key: Key | null;
  /** Key spans that last at least `MIN_KEY_SPAN_SEC` (shorter ones folded into a neighbour). */
  keys: Array<{ key: Key; start: number; end: number }>;
  parts: ChartPart[];
  bookmarks: Marker[];
}

export type ChartInput = Pick<SessionFull, 'chords' | 'keys' | 'markers'> & {
  durationSec?: number;
};

const sameKeyish = (a: Key | null | undefined, b: Key | null | undefined) =>
  !!a && !!b && a.tonic === b.tonic && a.mode === b.mode;

/** Key spans with wobbles shorter than `MIN_KEY_SPAN_SEC` folded into a neighbour. */
function stableKeySpans(keys: readonly KeyRecord[], end: number): Chart['keys'] {
  const spans: Chart['keys'] = [];
  for (const k of [...keys].sort((a, b) => a.t - b.t)) {
    const key: Key = { tonic: k.key.tonic, mode: k.key.mode };
    const last = spans[spans.length - 1];
    if (last && sameKeyish(last.key, key)) continue;
    if (last) last.end = k.t;
    spans.push({ key, start: spans.length ? k.t : 0, end: Math.max(end, k.t) });
  }
  const merge = () => {
    for (let i = spans.length - 1; i > 0; i--) {
      if (sameKeyish(spans[i - 1].key, spans[i].key)) {
        spans[i - 1].end = spans[i].end;
        spans.splice(i, 1);
      }
    }
  };
  for (;;) {
    merge();
    let shortest = -1;
    spans.forEach((s, i) => {
      const len = s.end - s.start;
      if (
        len < MIN_KEY_SPAN_SEC &&
        (shortest < 0 || len < spans[shortest].end - spans[shortest].start)
      )
        shortest = i;
    });
    if (shortest < 0 || spans.length < 2) break;
    // The wobble belongs to the key before it (the one at the start belongs to the next).
    if (shortest > 0) spans[shortest - 1].end = spans[shortest].end;
    else spans[1].start = spans[0].start;
    spans.splice(shortest, 1);
  }
  return spans;
}

/** The key with the most seconds; the earlier one wins a tie. */
function mainKey(spans: Chart['keys']): Key | null {
  const totals: Array<{ key: Key; seconds: number }> = [];
  for (const s of spans) {
    const entry = totals.find((e) => sameKeyish(e.key, s.key));
    if (entry) entry.seconds += s.end - s.start;
    else totals.push({ key: s.key, seconds: s.end - s.start });
  }
  let best: (typeof totals)[number] | null = null;
  for (const e of totals) if (!best || e.seconds > best.seconds) best = e;
  return best?.key ?? null;
}

interface Item {
  chord: Chord;
  t: number;
  end: number;
}

/** Split `n` chords into lines of at most eight, as even as possible (9 → 5 + 4, not 8 + 1). */
function chunk<T>(xs: readonly T[]): T[][] {
  const lines = Math.ceil(xs.length / MAX_CHORDS_PER_LINE);
  const size = Math.ceil(xs.length / Math.max(1, lines));
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

const isLeftover = (row: ChartRow) =>
  row.length === 1 && row[0].repeat === 1 && row[0].chords.length <= MAX_LEFTOVER;

/**
 * Rows for one section: loops folded with the Listen timeline's chord-family equality, each
 * loop on its own row, other runs in rows of up to eight; a short leftover run joins the row
 * before it (or after it, at the start of a section) so no row is a lone chord.
 */
function sectionRows(items: readonly Item[]): ChartRow[] {
  const eq = (a: Item, b: Item) => sameChordFamily(a.chord, b.chord);
  const rows: ChartRow[] = [];
  for (const seg of compressRepeats(items, eq)) {
    const covered = items.slice(seg.start, seg.start + seg.items.length * seg.repeat);
    if (seg.repeat > 1) {
      rows.push([{ chords: seg.items.map((i) => i.chord), repeat: seg.repeat, spans: covered }]);
    } else {
      for (const part of chunk(covered)) {
        rows.push([{ chords: part.map((i) => i.chord), repeat: 1, spans: part }]);
      }
    }
  }
  for (let i = rows.length - 1; i >= 0 && rows.length > 1; i--) {
    if (!isLeftover(rows[i])) continue;
    if (i > 0) rows[i - 1].push(...rows[i]);
    else rows[1].unshift(...rows[0]);
    rows.splice(i, 1);
  }
  return rows;
}

/**
 * The folded chord chart every screen draws and the text export prints: sections from the
 * markers (Title-case), loops folded (`C G Am F ×4`), one key per stretch of at least ten
 * seconds, and the headline key by time.
 */
export function buildChart(full: ChartInput): Chart {
  const records = [...full.chords].sort((a, b) => a.t - b.t);
  const lastT = Math.max(records[records.length - 1]?.t ?? 0, ...full.keys.map((k) => k.t), 0);
  const end = Math.max(full.durationSec ?? 0, lastT);

  // Named chords, neighbours of one family merged (a no-chord gap between them does not split).
  const items: Item[] = [];
  records.forEach((rec, i) => {
    const next = i + 1 < records.length ? records[i + 1].t : Math.max(end, rec.t);
    if (!rec.chord) return;
    const last = items[items.length - 1];
    if (last && sameChordFamily(last.chord, rec.chord)) last.end = next;
    else items.push({ chord: rec.chord, t: rec.t, end: next });
  });

  const keys = stableKeySpans(full.keys, end);
  const key = mainKey(keys);
  const markers = [...full.markers].sort((a, b) => a.t - b.t);

  type Bound = { t: number; title?: string | null; key?: Key };
  const bounds: Bound[] = [
    ...markers
      .filter((m) => m.kind !== 'bookmark')
      .map((m): Bound => ({ t: m.t, title: sectionTitle(m) })),
    ...keys.map((k): Bound => ({ t: k.start, key: k.key })),
  ].sort((a, b) => a.t - b.t || (a.key ? -1 : 1));

  const parts: ChartPart[] = [];
  let shownKey: Key | null = key;
  let currentKey: Key | null = keys[0]?.key ?? null;
  let title: string | null = null;
  let from = 0;
  let ci = 0;
  const flush = (until: number) => {
    const block: Item[] = [];
    while (ci < items.length && items[ci].t < until) block.push(items[ci++]);
    if (block.length) {
      parts.push({ type: 'section', title, t: from, key: currentKey, rows: sectionRows(block) });
    }
  };
  for (const b of bounds) {
    flush(b.t);
    if (b.key) {
      currentKey = b.key;
      if (!sameKeyish(shownKey, b.key)) parts.push({ type: 'key', key: b.key, t: b.t });
      shownKey = b.key;
      // A key change inside a section continues it without repeating the title.
      title = null;
    } else {
      title = b.title ?? null;
    }
    from = b.t;
  }
  flush(Infinity);

  return { key, keys, parts, bookmarks: markers.filter((m) => m.kind === 'bookmark') };
}

/** Chord symbol with ♭/♯ glyphs, spelled for `key`. */
export function chartSymbol(chord: Chord, key: Key | null, opts: ChordSymbolOptions = {}): string {
  return prettyAccidentals(chordSymbol(chord, key, opts));
}

/** Roman numeral with ♭/♯ glyphs, or '' without a key. */
export function chartNumeral(chord: Chord, key: Key | null): string {
  return key ? prettyAccidentals(romanNumeral(chord, key)) : '';
}

/** Every row of every section, in order, with the section's key (for previews). */
export function chartRows(chart: Chart): Array<{ row: ChartRow; key: Key | null }> {
  return chart.parts.flatMap((p) =>
    p.type === 'section' ? p.rows.map((row) => ({ row, key: p.key })) : [],
  );
}

/** A row as two aligned text lines: chords (with `×N`) and their numerals. */
export function rowText(row: ChartRow, key: Key | null): [chords: string, numerals: string] {
  const top: string[] = [];
  const bottom: string[] = [];
  for (const seg of row) {
    const cells = seg.chords.map((c) => [chartSymbol(c, key), chartNumeral(c, key)] as const);
    const width = (c: readonly [string, string]) => Math.max(c[0].length, c[1].length);
    let t = cells.map((c) => c[0].padEnd(width(c))).join(' ');
    let b = cells.map((c) => c[1].padEnd(width(c))).join(' ');
    if (seg.repeat > 1) {
      const times = ` ×${seg.repeat}`;
      t += times;
      b += ' '.repeat(times.length);
    }
    top.push(t);
    bottom.push(b);
  }
  return [top.join('   ').trimEnd(), bottom.join('   ').trimEnd()];
}

/**
 * Plain-text chord chart, the format shared to a band chat:
 *
 *   Evening idea in C — 5:00
 *   Key: C major
 *
 *   [Intro]
 *   C G Am F  ×4
 *   I V vi IV
 *
 *   → A minor at 2:35
 *   Am Dm E7 Am
 *   i  iv V7 i
 *
 *   Bookmarks: 1:00 nice
 */
export function toText(full: SessionFull): string {
  const { session } = full;
  const chart = buildChart({ ...full, durationSec: session.durationSec });
  const out = [`${session.name} — ${formatTime(session.durationSec)}`];
  if (chart.key) out.push(`Key: ${prettyAccidentals(keyName(chart.key))}`);

  for (const part of chart.parts) {
    out.push('');
    if (part.type === 'key') {
      out.push(`→ ${prettyAccidentals(keyName(part.key))} at ${formatTime(part.t)}`);
      continue;
    }
    if (part.title) out.push(`[${part.title}]`);
    for (const row of part.rows) {
      const [chords, numerals] = rowText(row, part.key);
      out.push(chords);
      if (numerals) out.push(numerals);
    }
  }
  // A key line runs straight into the section it starts.
  const lines = out.filter((l, i) => !(l === '' && out[i - 1]?.startsWith('→ ')));

  if (chart.bookmarks.length) {
    lines.push(
      '',
      `Bookmarks: ${chart.bookmarks.map((m) => (m.label ? `${formatTime(m.t)} ${m.label}` : formatTime(m.t))).join(', ')}`,
    );
  }
  return lines.join('\n') + '\n';
}

/** Versioned, self-contained export (audio is never included). */
export function toJSON(full: SessionFull): KeelExportV1 {
  return {
    version: EXPORT_VERSION,
    session: full.session,
    chords: full.chords,
    keys: full.keys,
    markers: full.markers,
    midiTrack: full.midiTrack ?? null,
  };
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function parseExport(json: unknown): KeelExportV1 {
  let data = json;
  if (typeof json === 'string') {
    try {
      data = JSON.parse(json);
    } catch {
      throw new ImportError('Import failed: the file is not valid JSON.');
    }
  }
  if (!isObject(data) || !('version' in data)) {
    throw new ImportError('Import failed: this is not a Keel session export.');
  }
  if (data.version !== EXPORT_VERSION) {
    throw new ImportError(
      `Import failed: unsupported export version ${JSON.stringify(data.version)} ` +
        `(this version of Keel reads version ${EXPORT_VERSION}).`,
    );
  }
  const s = data.session;
  if (!isObject(s) || typeof s.name !== 'string' || typeof s.createdAt !== 'number') {
    throw new ImportError('Import failed: the export has no valid session.');
  }
  for (const field of ['chords', 'keys', 'markers'] as const) {
    if (!Array.isArray(data[field])) {
      throw new ImportError(`Import failed: "${field}" must be an array.`);
    }
  }
  if (
    data.midiTrack != null &&
    !(isObject(data.midiTrack) && Array.isArray(data.midiTrack.events))
  ) {
    throw new ImportError('Import failed: "midiTrack" is malformed.');
  }
  return data as unknown as KeelExportV1;
}

/**
 * Import a `toJSON` export (object or JSON string) as a new session with fresh
 * uuids. Returns the new session id. Throws `ImportError` on bad input.
 */
export async function fromJSON(json: unknown): Promise<string> {
  const data = parseExport(json);
  const sessionId = uuid();
  const remap = <T extends { id: string; sessionId: string }>(rows: T[]): T[] =>
    rows.map((r) => ({ ...r, id: uuid(), sessionId }));
  const chords = remap(data.chords);
  const keys = remap(data.keys);
  const markers = remap(data.markers);
  const midiEvents = data.midiTrack?.events ?? [];
  const session: Session = {
    ...data.session,
    id: sessionId,
    tags: normalizeTags(Array.isArray(data.session.tags) ? data.session.tags : []),
    hasAudio: false,
    hasMidi: midiEvents.length > 0,
    summary:
      data.session.summary ?? computeSummary(chords, keys, markers, data.session.durationSec ?? 0),
    updatedAt: Date.now(),
    deleted: false,
  };
  await db.transaction(
    'rw',
    [db.sessions, db.chords, db.keys, db.markers, db.midiTracks],
    async () => {
      await db.sessions.add(session);
      await db.chords.bulkAdd(chords);
      await db.keys.bulkAdd(keys);
      await db.markers.bulkAdd(markers);
      if (midiEvents.length) await db.midiTracks.add({ sessionId, events: midiEvents });
    },
  );
  return sessionId;
}
