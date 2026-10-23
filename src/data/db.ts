/**
 * Dexie (IndexedDB) database for Keel. Local-first; one database named
 * `jamkey` (the pre-rename name, kept so saved jams survive). Row shapes come
 * from the frozen contracts in `@/core/session`.
 *
 * Importing this module never touches IndexedDB: Dexie opens lazily on the
 * first query (or explicitly via `openDb()`). Tests install fake-indexeddb in
 * `src/data/testing/setup.ts` before importing this module.
 *
 * Schema changes: see `src/data/migrations.md`.
 */
import { Dexie, type EntityTable } from 'dexie';
import type {
  AudioRecording,
  ChordRecord,
  KeyRecord,
  Marker,
  MidiTrack,
  Session,
} from '@/core/session';

// Legacy name from before the app was renamed to Keel. Changing it would orphan
// every saved jam in existing browsers, so it stays.
export const DB_NAME = 'jamkey';

/** Key/value row in the `settings` table. Keys are usually `keyof Settings`. */
export interface SettingRow {
  key: string;
  value: unknown;
}

/**
 * Version 1 store definitions. Never edit a shipped version in place; add a
 * new `this.version(n)` block instead (see migrations.md).
 *
 * Note: IndexedDB cannot index booleans, so rows never appear in the
 * `deleted` index. It is declared for forward compatibility (sync may move to
 * 0/1); filter on `deleted` in JS, as `repo.listSessions` does.
 */
export const SCHEMA_V1 = {
  sessions: 'id, createdAt, updatedAt, deleted, *tags',
  chords: 'id, [sessionId+t]',
  keys: 'id, [sessionId+t]',
  markers: 'id, [sessionId+t]',
  midiTracks: 'sessionId',
  recordings: 'sessionId',
  settings: 'key',
} as const;

export class KeelDB extends Dexie {
  sessions!: EntityTable<Session, 'id'>;
  chords!: EntityTable<ChordRecord, 'id'>;
  keys!: EntityTable<KeyRecord, 'id'>;
  markers!: EntityTable<Marker, 'id'>;
  midiTracks!: EntityTable<MidiTrack, 'sessionId'>;
  recordings!: EntityTable<AudioRecording, 'sessionId'>;
  settings!: EntityTable<SettingRow, 'key'>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
  }
}

/** The app-wide database instance. Safe to import anywhere; opens lazily. */
export const db = new KeelDB();

/** Open the database (idempotent). Resolves once the schema is ready. */
export async function openDb(): Promise<KeelDB> {
  if (!db.isOpen()) await db.open();
  return db;
}

/** Bounds covering every `[sessionId+t]` entry of one session. */
export function sessionRange(sessionId: string): [[string, number], [string, number]] {
  return [
    [sessionId, -Infinity],
    [sessionId, Infinity],
  ];
}
