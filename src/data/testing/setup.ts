/**
 * Test helper for src/data. Import it FIRST in every data test file:
 *
 *   import { resetDb } from '@/data/testing/setup';
 *
 * Installs fake-indexeddb globals before Dexie is loaded, so app code never
 * needs to know about it.
 */
import 'fake-indexeddb/auto';
import { db } from '../db';

/** Clear every table (keeps the open connection and schema). */
export async function resetDb(): Promise<void> {
  if (!db.isOpen()) await db.open();
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
