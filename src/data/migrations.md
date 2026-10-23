# Dexie schema migrations

The database is `keel` (see `db.ts`). Version 1 is `SCHEMA_V1`. Once a
version has shipped, **never edit it in place**: users already have that
schema on disk, and Dexie only runs upgrade code when the version number goes
up.

## Bumping the version

1. Keep every existing `this.version(n).stores(...)` call. Add a new one with
   `n + 1` below it. Dexie 4 only needs the tables or indexes that change, but
   listing the full schema is clearer:

   ```ts
   this.version(1).stores(SCHEMA_V1);
   this.version(2)
     .stores({ ...SCHEMA_V1, sessions: 'id, createdAt, updatedAt, deleted, *tags, name' })
     .upgrade(async (tx) => {
       // Backfill or reshape rows. Runs once, inside the versionchange transaction.
       await tx
         .table('sessions')
         .toCollection()
         .modify((s) => {
           s.newField ??= defaultValue;
         });
     });
   ```

2. Rules for `upgrade()`:
   - Use only `tx.table(name)`. Do not use the `db.*` table properties or
     import app modules that use `db`; they point at the new schema.
   - Keep it idempotent and tolerant of half-old rows (`??=`, type checks).
   - No network, no `await` on anything but Dexie promises. Any other await
     commits the transaction early and the upgrade fails.
   - Big tables: `modify()` streams rows. Do not `toArray()` 50k MIDI events
     just to rewrite them.
3. Deleting a table: set it to `null` in the new version (`oldTable: null`).
   Renaming a table: create the new one, copy rows in `upgrade()`, then set the
   old one to `null`.
4. Changing a primary key is not supported by IndexedDB. Create a new table,
   copy rows, drop the old one.
5. If a row shape in `src/core/session.ts` changes, that is a contract change.
   It lands as a `core:` PR first. The migration lands here in the same wave.
6. Bump `EXPORT_VERSION` in `export.ts` only if the JSON export shape changes.
   `fromJSON` must keep reading every older export version (convert
   old → new before writing).

## Testing a migration

Write a test that opens a raw `Dexie('keel-mig-test')` at the old version,
seeds rows, closes it, then opens `new KeelDB('keel-mig-test')` and asserts
the upgraded rows. `fake-indexeddb` keeps data between opens in the same test
file. Delete the database at the end (`Dexie.delete(name)`).

## Other tabs

An open tab on the old version blocks the upgrade. Dexie closes the old
connection on `versionchange` by default. The UI should catch
`DatabaseClosedError` and ask the user to reload.

## Known v1 quirk

IndexedDB cannot index booleans, so the `deleted` index on `sessions` stays
empty. Queries filter `deleted` in JS. If sync needs an indexed tombstone,
v2 can store `deleted` as `0 | 1` (a contract change).
