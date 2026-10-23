import './testing/setup';
import { Dexie } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { KeelDB, LEGACY_DB_NAME, SCHEMA_V1, migrateLegacyDb } from './db';

const TARGET = 'keel-mig-target';
const LEGACY = 'keel-mig-legacy';

const session = (id: string, name: string) => ({
  id,
  name,
  createdAt: 1,
  updatedAt: 1,
  deleted: false,
  tags: [] as string[],
});

async function seedLegacy(name: string) {
  const legacy = new Dexie(name);
  legacy.version(1).stores(SCHEMA_V1);
  await legacy.open();
  await legacy.table('sessions').bulkAdd([session('s1', 'Old jam'), session('s2', 'Older jam')]);
  await legacy.table('chords').add({ id: 'c1', sessionId: 's1', t: 0, label: 'C' });
  await legacy.table('settings').put({ key: 'a4', value: 442 });
  legacy.close();
}

afterEach(async () => {
  await Dexie.delete(TARGET);
  await Dexie.delete(LEGACY);
});

describe('legacy database migration', () => {
  it('copies every table into the new database on first open and deletes the old one', async () => {
    await seedLegacy(LEGACY);
    const db = new KeelDB(TARGET, LEGACY);
    await db.open();
    expect(await db.sessions.count()).toBe(2);
    expect(await db.chords.get('c1')).toMatchObject({ sessionId: 's1', label: 'C' });
    expect(await db.settings.get('a4')).toEqual({ key: 'a4', value: 442 });
    expect(await Dexie.exists(LEGACY)).toBe(false);
    db.close();
  });

  it('keeps rows that already exist in the new database', async () => {
    await seedLegacy(LEGACY);
    const target = new KeelDB(TARGET, null);
    await target.table('sessions').add(session('s1', 'New jam'));
    target.close();

    const db = new KeelDB(TARGET, LEGACY);
    await db.open();
    expect((await db.sessions.get('s1'))?.name).toBe('New jam');
    expect((await db.sessions.get('s2'))?.name).toBe('Older jam');
    db.close();
  });

  it('is a no-op when there is no legacy database', async () => {
    const db = new KeelDB(TARGET, LEGACY);
    await db.open();
    expect(await db.sessions.count()).toBe(0);
    expect(await migrateLegacyDb(db, LEGACY)).toBe(false);
    db.close();
  });

  it('the app database migrates from the pre-rename name', () => {
    expect(LEGACY_DB_NAME).toBe('jamkey');
    expect(new KeelDB().name).toBe('keel');
  });
});
