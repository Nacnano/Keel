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

/**
 * A Blob that survives fake-indexeddb's structured clone. jsdom's Blob does
 * not (it comes back as a plain object); the platform Blob behind `Response`
 * does, like in real browsers.
 */
export function cloneableBlob(text: string, type = ''): Promise<Blob> {
  return new Response(text, { headers: type ? { 'content-type': type } : {} }).blob();
}
