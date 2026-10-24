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
import { NEW_SONG_LABEL } from '@/ui/lib/markers';
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
/**
 * Chords held shorter than this fold into a neighbour in the chart and the text (never in the
 * stored data): a passing chord or a detection wobble, not a change worth writing down.
 */
export const MIN_CHORD_SEC = 1.5;
/** Most chords on one line of a run that does not repeat (a lead sheet's four bars). */
const MAX_CHORDS_PER_LINE = 4;
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

/** A "New song" mark from the Mark menu: it starts the next song of a set. */
export function isNewSongMarker(m: Pick<Marker, 'kind' | 'label'>): boolean {
  return m.kind === 'custom' && m.label?.trim().toLowerCase() === NEW_SONG_LABEL.toLowerCase();
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

/** One printed line: a loop, a run of up to four chords, or a loop with a short tail. */
export type ChartRow = ChartSegment[];

/**
 * A part of the chart: a song heading (only when New song split the session), a section (title
 * from a marker, or none) or a key change inside a song.
 */
export type ChartPart =
  | { type: 'song'; n: number; key: Key | null; t: number }
  | { type: 'section'; title: string | null; t: number; key: Key | null; rows: ChartRow[] }
  | { type: 'key'; key: Key; t: number };

export interface ChartKeySpan {
  key: Key;
  start: number;
  end: number;
}

export interface Chart {
  /** The key that covers the most seconds (the headline key). */
  key: Key | null;
  /**
   * Key spans that last at least `MIN_KEY_SPAN_SEC` (shorter ones folded into a neighbour, the
   * parallel key folded into the same tonic), song by song.
   */
  keys: ChartKeySpan[];
  /** One entry per song with chords (New song marks split them), each with its key by time. */
  songs: Array<{ t: number; key: Key | null }>;
  parts: ChartPart[];
  bookmarks: Marker[];
}

export type ChartInput = Pick<SessionFull, 'chords' | 'keys' | 'markers'> & {
  durationSec?: number;
};

const sameKeyish = (a: Key | null | undefined, b: Key | null | undefined) =>
  !!a && !!b && a.tonic === b.tonic && a.mode === b.mode;

interface KeySpanDraft extends ChartKeySpan {
  /** Seconds heard in each mode of this tonic: the span shows the one heard longest. */
  votes: Array<{ key: Key; sec: number }>;
}

function vote(span: KeySpanDraft, key: Key, sec: number) {
  const v = span.votes.find((x) => sameKeyish(x.key, key));
  if (v) v.sec += sec;
  else span.votes.push({ key, sec });
  span.key = span.votes.reduce((a, b) => (b.sec > a.sec ? b : a)).key;
}

/**
 * Key spans of `[start, end)` with the parallel key (same tonic, other mode: a blue third, not a
 * modulation) folded into one span and wobbles shorter than `MIN_KEY_SPAN_SEC` folded into a
 * neighbour. The key in force at `start` (or the first one after it) covers the start.
 */
function stableKeySpans(keys: readonly KeyRecord[], start: number, end: number): ChartKeySpan[] {
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  let first = 0;
  sorted.forEach((k, i) => {
    if (k.t <= start) first = i;
  });
  const spans: KeySpanDraft[] = [];
  for (let i = first; i < sorted.length && sorted[i].t < end; i++) {
    const key: Key = { tonic: sorted[i].key.tonic, mode: sorted[i].key.mode };
    const s = spans.length ? sorted[i].t : start;
    const e = i + 1 < sorted.length ? Math.min(end, sorted[i + 1].t) : end;
    const span: KeySpanDraft = { key, start: s, end: Math.max(s, e), votes: [] };
    vote(span, key, span.end - span.start);
    spans.push(span);
  }
  const join = () => {
    for (let i = spans.length - 1; i > 0; i--) {
      const [a, b] = [spans[i - 1], spans[i]];
      if (a.key.tonic !== b.key.tonic) continue;
      a.end = b.end;
      for (const v of b.votes) vote(a, v.key, v.sec);
      spans.splice(i, 1);
    }
  };
  for (;;) {
    join();
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
  return spans.map(({ key, start: s, end: e }) => ({ key, start: s, end: e }));
}

/** The key with the most seconds; the earlier one wins a tie. */
function mainKey(spans: readonly ChartKeySpan[]): Key | null {
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

/**
 * Chords held under `MIN_CHORD_SEC` fold into their longer neighbour, the shortest first, so a
 * passing chord or a one-beat wobble does not break a loop; neighbours of one family that then
 * touch become one chord.
 */
function foldShortChords(items: readonly Item[]): Item[] {
  const out = items.map((i) => ({ ...i }));
  const len = (i: Item) => i.end - i.t;
  while (out.length > 1) {
    let s = -1;
    out.forEach((it, i) => {
      if (len(it) < MIN_CHORD_SEC - 1e-6 && (s < 0 || len(it) < len(out[s]))) s = i;
    });
    if (s < 0) break;
    const prev = out[s - 1];
    const next = out[s + 1];
    if (prev && (!next || len(prev) >= len(next))) prev.end = out[s].end;
    else next.t = out[s].t;
    out.splice(s, 1);
    if (s > 0 && s < out.length && sameChordFamily(out[s - 1].chord, out[s].chord)) {
      out[s - 1].end = out[s].end;
      out.splice(s, 1);
    }
  }
  return out;
}

/** Split `n` chords into lines of at most four, as even as possible (9 → 3 + 3 + 3, not 4 + 4 + 1). */
function chunk<T>(xs: readonly T[]): T[][] {
  const lines = Math.max(1, Math.ceil(xs.length / MAX_CHORDS_PER_LINE));
  const base = Math.floor(xs.length / lines);
  const out: T[][] = [];
  for (let l = 0, i = 0; l < lines; l++) {
    const size = base + (l < xs.length % lines ? 1 : 0);
    out.push(xs.slice(i, i + size));
    i += size;
  }
  return out.filter((line) => line.length);
}

/**
 * Rows for one section: loops folded with the Listen timeline's chord-family equality, each
 * loop on its own row, other runs in rows of up to four; a run of one or two chords between
 * loops joins the row before it (or after it, at the start of a section) so no row is a lone
 * chord.
 */
function sectionRows(items: readonly Item[]): ChartRow[] {
  const eq = (a: Item, b: Item) => sameChordFamily(a.chord, b.chord);
  const rows: Array<{ row: ChartRow; leftover: boolean }> = [];
  for (const seg of compressRepeats(items, eq)) {
    const covered = items.slice(seg.start, seg.start + seg.items.length * seg.repeat);
    if (seg.repeat > 1) {
      rows.push({
        row: [{ chords: seg.items.map((i) => i.chord), repeat: seg.repeat, spans: covered }],
        leftover: false,
      });
    } else {
      const leftover = covered.length <= MAX_LEFTOVER;
      for (const part of chunk(covered)) {
        rows.push({
          row: [{ chords: part.map((i) => i.chord), repeat: 1, spans: part }],
          leftover,
        });
      }
    }
  }
  for (let i = rows.length - 1; i >= 0 && rows.length > 1; i--) {
    if (!rows[i].leftover) continue;
    if (i > 0) rows[i - 1].row.push(...rows[i].row);
    else rows[1].row.unshift(...rows[0].row);
    rows.splice(i, 1);
  }
  return rows.map((r) => r.row);
}

/**
 * The folded chord chart every screen draws and the text export prints: songs split by New
 * song marks (each with its key by time), sections from the other markers (Title-case), chords
 * held under 1.5 s folded into a neighbour, loops folded (`[C G Am F] ×4`), one key per stretch
 * of at least ten seconds (the parallel key is never a change), and the headline key by time.
 */
export function buildChart(full: ChartInput): Chart {
  const records = [...full.chords].sort((a, b) => a.t - b.t);
  const lastT = Math.max(records[records.length - 1]?.t ?? 0, ...full.keys.map((k) => k.t), 0);
  const end = Math.max(full.durationSec ?? 0, lastT);

  // Named chords, neighbours of one family merged (a no-chord gap between them does not split).
  const all: Item[] = [];
  records.forEach((rec, i) => {
    const next = i + 1 < records.length ? records[i + 1].t : Math.max(end, rec.t);
    if (!rec.chord) return;
    const last = all[all.length - 1];
    if (last && sameChordFamily(last.chord, rec.chord)) last.end = next;
    else all.push({ chord: rec.chord, t: rec.t, end: next });
  });

  const markers = [...full.markers].sort((a, b) => a.t - b.t);
  const songStarts = [0, ...markers.filter(isNewSongMarker).map((m) => m.t)];
  const ranges = songStarts
    .map((t, i) => ({ t, end: songStarts[i + 1] ?? Infinity }))
    .filter((r) => r.end > r.t)
    .map((r) => {
      const items = foldShortChords(all.filter((it) => it.t >= r.t && it.t < r.end));
      const keys = stableKeySpans(full.keys, r.t, Math.min(end, r.end));
      return { ...r, items, keys, key: mainKey(keys) };
    });
  // A song is the chords played after a New song mark; with no chords at all the session is
  // one song (it can still have a key).
  const played = ranges.filter((s) => s.items.length > 0);
  const songs = played.length ? played : ranges.slice(0, 1);

  const keys = songs.flatMap((s) => s.keys);
  const key = mainKey(keys);
  const parts: ChartPart[] = [];

  songs.forEach((song, n) => {
    if (songs.length > 1) parts.push({ type: 'song', n: n + 1, key: song.key, t: song.t });
    type Bound = { t: number; title?: string | null; key?: Key };
    const bounds: Bound[] = [
      ...markers
        .filter((m) => m.kind !== 'bookmark' && !isNewSongMarker(m))
        .filter((m) => m.t >= song.t && m.t < song.end)
        .map((m): Bound => ({ t: m.t, title: sectionTitle(m) })),
      ...song.keys.map((k): Bound => ({ t: k.start, key: k.key })),
    ].sort((a, b) => a.t - b.t || (a.key ? -1 : 1));

    const { items } = song;
    let shownKey: Key | null = song.key;
    let currentKey: Key | null = song.keys[0]?.key ?? null;
    let title: string | null = null;
    let from = song.t;
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
  });

  return {
    key,
    keys,
    songs: songs.map((s) => ({ t: s.t, key: s.key })),
    parts,
    bookmarks: markers.filter((m) => m.kind === 'bookmark'),
  };
}

/** The songs' keys in order, each once: `[C major, A♭ major]` for a two-song set. */
export function songKeys(chart: Pick<Chart, 'songs'>): Key[] {
  const out: Key[] = [];
  for (const s of chart.songs) {
    if (s.key && !out.some((k) => sameKeyish(k, s.key))) out.push(s.key);
  }
  return out;
}

/** "Song 2 · A♭ major" (or "Song 2" when no key was heard). */
export function songHeading(part: { n: number; key: Key | null }): string {
  return part.key ? `Song ${part.n} · ${prettyAccidentals(keyName(part.key))}` : `Song ${part.n}`;
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

/** A row as two aligned text lines: chords (a loop in brackets with `×N`) and their numerals. */
export function rowText(row: ChartRow, key: Key | null): [chords: string, numerals: string] {
  const top: string[] = [];
  const bottom: string[] = [];
  for (const seg of row) {
    const cells = seg.chords.map((c) => [chartSymbol(c, key), chartNumeral(c, key)] as const);
    const width = (c: readonly [string, string]) => Math.max(c[0].length, c[1].length);
    let t = cells.map((c) => c[0].padEnd(width(c))).join(' ');
    let b = cells.map((c) => c[1].padEnd(width(c))).join(' ');
    if (seg.repeat > 1) {
      t = `[${t.trimEnd()}] ×${seg.repeat}`;
      b = ` ${b}`.padEnd(t.length);
    }
    top.push(t);
    bottom.push(b);
  }
  return [top.join('  ').trimEnd(), bottom.join('  ').trimEnd()];
}

/**
 * Plain-text chord chart, the format shared to a band chat:
 *
 *   Evening idea in C — 5:00
 *   Key: C major
 *
 *   [Intro]
 *   [C G Am F] ×4
 *    I V vi IV
 *
 *   → A minor at 2:35
 *   Am Dm E7 Am
 *   i  iv V7 i
 *
 *   Bookmarks: 1:00 nice
 *
 * A set split by New song has a heading per song ("Song 2 · A♭ major") instead of the Key line.
 */
export function toText(full: SessionFull): string {
  const { session } = full;
  const chart = buildChart({ ...full, durationSec: session.durationSec });
  const out = [`${session.name} — ${formatTime(session.durationSec)}`];
  if (chart.key && chart.songs.length < 2) {
    out.push(`Key: ${prettyAccidentals(keyName(chart.key))}`);
  }

  for (const part of chart.parts) {
    out.push('');
    if (part.type === 'song') {
      out.push(songHeading(part));
      continue;
    }
    if (part.type === 'key') {
      out.push(`→ ${prettyAccidentals(keyName(part.key))} at ${formatTime(part.t)}`);
      continue;
    }
    if (part.title) out.push(`[${part.title}]`);
    for (const row of part.rows) {
      const [chords, numerals] = rowText(row, part.key);
      out.push(chords);
      if (numerals.trim()) out.push(numerals);
    }
  }
  // A song heading or a key line runs straight into the section it starts.
  const lines = out.filter((l, i) => !(l === '' && /^(→ |Song \d)/.test(out[i - 1] ?? '')));

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
