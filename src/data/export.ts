/**
 * Export a session as a plain-text chord chart or versioned JSON, and import
 * JSON back with fresh ids.
 */
import { v4 as uuid } from 'uuid';
import type { ChordRecord, KeyRecord, Marker, MidiTrack, Session } from '@/core/session';
import type { Chord, Key } from '@/core/types';
import { db } from './db';
import { chordKey, chordSymbol, keyName } from './chordSymbol';
import { collapseRuns, findCycles } from './cycles';
import { normalizeTags, type SessionFull } from './repo';
import { computeSummary } from './summary';

export const EXPORT_VERSION = 1;

export interface JamKeyExportV1 {
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

function formatDate(epochMs: number): string {
  const d = new Date(epochMs);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const MAX_CHORDS_PER_LINE = 8;

/** Chord lines for one block: repeating cycles become `| … | ×n`. */
function chordLines(chords: Chord[], key: Key | null): string[] {
  const seq = collapseRuns(chords, chordKey);
  const keys = seq.map(chordKey);
  const bar = (cs: Chord[]) => `| ${cs.map((c) => chordSymbol(c, key)).join(' ')} |`;
  const lines: string[] = [];
  const literal = (from: number, to: number) => {
    for (let i = from; i < to; i += MAX_CHORDS_PER_LINE) {
      lines.push(bar(seq.slice(i, Math.min(to, i + MAX_CHORDS_PER_LINE))));
    }
  };
  let i = 0;
  for (const c of findCycles(keys)) {
    literal(i, c.start);
    lines.push(`${bar(seq.slice(c.start, c.start + c.period))} ×${c.repeats}`);
    i = c.start + c.period * c.repeats;
  }
  literal(i, seq.length);
  return lines;
}

type Boundary =
  { t: number; type: 'section'; label: string } | { t: number; type: 'key'; key: Key };

/**
 * Plain-text chord chart:
 *
 *   Evening idea in C — 2026-10-22 — 5:00
 *   Key: C major
 *   [intro] | C G Am F | ×4
 *   [verse] | Dm7 G7 Cmaj7 | ×2
 *   → A minor at 2:35
 *   Bookmarks: 1:00 nice
 */
export function toText(full: SessionFull): string {
  const { session } = full;
  const out = [
    `${session.name} — ${formatDate(session.createdAt)} — ${formatTime(session.durationSec)}`,
  ];

  const keys = [...full.keys].sort((a, b) => a.t - b.t);
  const keyChanges: KeyRecord[] = [];
  for (const k of keys) {
    const prev = keyChanges[keyChanges.length - 1];
    if (!prev || prev.key.tonic !== k.key.tonic || prev.key.mode !== k.key.mode) keyChanges.push(k);
  }
  let currentKey: Key | null = keyChanges[0]?.key ?? null;
  if (currentKey) out.push(`Key: ${keyName(currentKey)}`);

  const markers = [...full.markers].sort((a, b) => a.t - b.t);
  const boundaries: Boundary[] = [
    ...markers
      .filter((m) => m.kind !== 'bookmark')
      .map((m): Boundary => ({ t: m.t, type: 'section', label: m.label ?? m.kind })),
    ...keyChanges.slice(1).map((k): Boundary => ({ t: k.t, type: 'key', key: k.key })),
  ].sort((a, b) => a.t - b.t || (a.type === 'key' ? -1 : 1));

  const chords = [...full.chords].sort((a, b) => a.t - b.t);
  let ci = 0;
  const takeChordsUntil = (t: number): Chord[] => {
    const block: Chord[] = [];
    while (ci < chords.length && chords[ci].t < t) {
      const c = chords[ci++].chord;
      if (c) block.push(c);
    }
    return block;
  };

  let prefix = '';
  const emitBlock = (until: number) => {
    const lines = chordLines(takeChordsUntil(until), currentKey);
    if (lines.length) {
      out.push(prefix ? `${prefix} ${lines[0]}` : lines[0], ...lines.slice(1));
    } else if (prefix) {
      out.push(prefix);
    }
    prefix = '';
  };

  for (const b of boundaries) {
    emitBlock(b.t);
    if (b.type === 'section') {
      prefix = `[${b.label}]`;
    } else {
      currentKey = b.key;
      out.push(`→ ${keyName(b.key)} at ${formatTime(b.t)}`);
    }
  }
  emitBlock(Infinity);

  const bookmarks = markers.filter((m) => m.kind === 'bookmark');
  if (bookmarks.length) {
    out.push(
      `Bookmarks: ${bookmarks.map((m) => (m.label ? `${formatTime(m.t)} ${m.label}` : formatTime(m.t))).join(', ')}`,
    );
  }
  return out.join('\n') + '\n';
}

/** Versioned, self-contained export (audio is never included). */
export function toJSON(full: SessionFull): JamKeyExportV1 {
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

function parseExport(json: unknown): JamKeyExportV1 {
  let data = json;
  if (typeof json === 'string') {
    try {
      data = JSON.parse(json);
    } catch {
      throw new ImportError('Import failed: the file is not valid JSON.');
    }
  }
  if (!isObject(data) || !('version' in data)) {
    throw new ImportError('Import failed: this is not a JamKey session export.');
  }
  if (data.version !== EXPORT_VERSION) {
    throw new ImportError(
      `Import failed: unsupported export version ${JSON.stringify(data.version)} ` +
        `(this version of JamKey reads version ${EXPORT_VERSION}).`,
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
  return data as unknown as JamKeyExportV1;
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
