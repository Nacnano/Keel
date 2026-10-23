/**
 * Dexie (IndexedDB) database for Keel. Local-first; one database named
 * `keel`. Row shapes come from the frozen contracts in `@/core/session`.
 *
 * Browsers that used the app before the rename hold their jams in a database
 * with the old name; `KeelDB` copies that data into `keel` the first time it
 * opens and then deletes the old database (see `migrateLegacyDb`).
 *
 * Importing this module never touches IndexedDB: Dexie opens lazily on the
 * first query (or explicitly via `openDb()`). Tests install fake-indexeddb in
 * `src/data/testing/setup.ts` before importing this module.
 *
 * Schema changes: see `src/data/migrations.md`.
 */
import { Dexie, type EntityTable, type IndexableType } from 'dexie';
import type {
  AudioRecording,
  ChordRecord,
  KeyRecord,
  Marker,
  MidiTrack,
  Session,
} from '@/core/session';

export const DB_NAME = 'keel';

/** Database name used before the app was renamed to Keel. Migrated on open. */
export const LEGACY_DB_NAME = 'jamkey';

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

  constructor(name: string = DB_NAME, legacyName: string | null = LEGACY_DB_NAME) {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    if (legacyName && legacyName !== name) {
      // Sticky so it runs on every open; a no-op once the old database is gone.
      this.on('ready', () => migrateLegacyDb(this, legacyName), true);
    }
  }
}

/**
 * Copy every row of the pre-rename database into `target`, then delete it.
 * Rows whose primary key already exists in `target` are left alone, so a
 * browser that already holds new jams never loses them. Runs inside Dexie's
 * `ready` hook, so queued queries wait for it. Any failure leaves the old
 * database in place for the next open.
 */
export async function migrateLegacyDb(target: Dexie, legacyName: string): Promise<boolean> {
  if (!(await Dexie.exists(legacyName))) return false;
  const legacy = new Dexie(legacyName);
  legacy.version(1).stores(SCHEMA_V1);
  try {
    await legacy.open();
    for (const name of Object.keys(SCHEMA_V1)) {
      const rows = await legacy.table(name).toArray();
      if (rows.length === 0) continue;
      const table = target.table(name);
      const pk = table.schema.primKey.keyPath as string;
      const keys = rows.map((r: Record<string, unknown>) => r[pk] as IndexableType);
      const existing = await table.bulkGet(keys);
      const fresh = rows.filter((_, i) => existing[i] === undefined);
      if (fresh.length) await table.bulkAdd(fresh);
    }
  } finally {
    legacy.close();
  }
  await Dexie.delete(legacyName);
  return true;
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
