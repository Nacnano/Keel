import { resetDb } from './testing/setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, db, openDb } from './db';

describe('db', () => {
  beforeEach(resetDb);

  it('opens the keel database at version 1', async () => {
    const d = await openDb();
    expect(d).toBe(db);
    expect(d.name).toBe(DB_NAME);
    expect(d.verno).toBe(1);
    // idempotent
    await expect(openDb()).resolves.toBe(db);
  });

  it('has every table with the expected primary keys and indexes', async () => {
    await openDb();
    const schema = Object.fromEntries(
      db.tables.map((t) => [
        t.name,
        {
          pk: t.schema.primKey.name,
          indexes: t.schema.indexes.map((i) => (i.multi ? `*${i.name}` : i.name)).sort(),
        },
      ]),
    );
    expect(schema).toEqual({
      sessions: {
        pk: 'id',
        indexes: ['*tags', 'createdAt', 'deleted', 'updatedAt'],
      },
      chords: { pk: 'id', indexes: ['[sessionId+t]'] },
      keys: { pk: 'id', indexes: ['[sessionId+t]'] },
      markers: { pk: 'id', indexes: ['[sessionId+t]'] },
      midiTracks: { pk: 'sessionId', indexes: [] },
      recordings: { pk: 'sessionId', indexes: [] },
      settings: { pk: 'key', indexes: [] },
    });
  });

  it('queries chords by the [sessionId+t] compound index in time order', async () => {
    await db.chords.bulkAdd([
      { id: 'b', sessionId: 's1', t: 2, chord: null, confidence: 1, source: 'mic', manual: false },
      { id: 'a', sessionId: 's1', t: 1, chord: null, confidence: 1, source: 'mic', manual: false },
      { id: 'c', sessionId: 's2', t: 0, chord: null, confidence: 1, source: 'mic', manual: false },
    ]);
    const rows = await db.chords
      .where('[sessionId+t]')
      .between(['s1', -Infinity], ['s1', Infinity])
      .toArray();
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
