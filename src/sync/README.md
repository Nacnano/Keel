# src/sync — cloud sync and share links

Optional layer on top of the local-first Dexie database. Inert unless the
build has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (setup:
[`supabase/README.md`](../../supabase/README.md)). `@supabase/supabase-js` is
loaded with a dynamic import, so unconfigured builds never download it.

| File         | Role                                                                       |
| ------------ | -------------------------------------------------------------------------- |
| `client.ts`  | `isSyncConfigured()`, `getSupabase()` (lazy singleton, `null` when off)    |
| `auth.ts`    | Google OAuth redirect (PKCE), sign out, auth change subscription           |
| `engine.ts`  | `pushChanges`, `pullChanges`, `syncNow`, `startAutoSync`                   |
| `rows.ts`    | Dexie ⇄ Postgres row mapping                                               |
| `share.ts`   | `createShare`, `fetchShare`, `revokeShare`, `listShares`                   |
| `store.ts`   | zustand store the UI reads: configured, user, status, last sync, error     |
| `signals.ts` | `notifySessionSaved()` so the jam flow can nudge sync without importing it |
| `testing/`   | in-memory Supabase fake used with `vi.mock('@supabase/supabase-js')`       |

## Algorithm

**Unit of sync: the session.** Only `Session` has `updatedAt` in the frozen
contracts, and every repo mutation (rename, tags, chord fix, marker edit,
delete) bumps it. So a session's `updatedAt` versions the session row plus its
chords, keys, markers and MIDI track. When pushed, child rows are stamped with
their session's `updatedAt`.

**Push** (`pushChanges`)

1. Read local sessions with `updatedAt > lastPushedAt`, oldest first.
2. Read the remote `updated_at` of those ids. Skip a session when the remote
   copy is at least as new (last write wins), or when it is a local tombstone
   the server never saw.
3. Per batch of 20 sessions, upsert children first (chords, keys, markers,
   MIDI), then the session rows. If a push dies half-way, the remote session
   still advertises the old version, so pulls never see a version without its
   children.
4. Advance `lastPushedAt` to the newest fully pushed version (ties that
   straddle a failure hold the cursor back).

**Pull** (`pullChanges`)

1. Read remote sessions with `updated_at > lastPulledAt` in pages of 500,
   ordered by `updated_at`.
2. Skip when the local copy is at least as new.
3. A tombstone (`deleted = true`) updates the local row and keeps the local
   children; tombstones for sessions this device never had are ignored.
4. Otherwise fetch the children whose `updated_at >= session.updated_at`
   (older stamps are rows the owner removed since) and, in one Dexie
   transaction, re-check the version, replace the session's children and put
   the session row. The remote `updated_at` is written as the local
   `updatedAt` unchanged, so pulled rows are not pushed back (the next push
   sees remote == local and skips).
5. `hasAudio` is recomputed from this device's recordings table.

**Deletes.** Soft deletes are ordinary updates of `deleted` and propagate both
ways. Nothing is hard-deleted remotely. A server trigger (`keep_newer`) also
refuses any update with an older `updated_at`, so a stale client cannot
clobber a newer row even if it skips the client-side check.

**Cursors** are stored per user in the Dexie `settings` table:
`sync:<userId>:lastPushedAt`, `sync:<userId>:lastPulledAt`, plus
`sync:lastSyncAt`.

**Triggers** (`startAutoSync`, started by `AppShell` when configured): the
initial auth state on load, sign-in, the `online` event, every 5 minutes, and
`notifySessionSaved()` after a jam session stops. Calls while a sync runs
coalesce into one follow-up run. `syncNow()` never throws; failures set status
`error` with a message.

## Known limits

- **No conflict merge.** If two devices edit the same session between syncs,
  the one with the later `updatedAt` wins the whole session (row and all its
  chords and markers); the other device's edits to that session are lost.
- **Client clocks.** `updatedAt` comes from the device clock. A device whose
  clock is far behind can write versions older than another device's pull
  cursor, and those changes are never pulled there (and lose LWW). Keep
  device clocks on automatic time.
- **Purge before sync.** Permanently deleting ("empty trash") a session that
  was soft-deleted but not yet pushed leaves the remote copy undeleted, and
  other devices keep it.
- **Stale child rows** (e.g. a marker deleted locally) stay in Postgres with
  an old stamp. They are never read again but are not cleaned up.
- **Whole-session pushes.** Fixing one chord re-uploads every chord of that
  session. Fine for jam-sized sessions (hundreds to a few thousand rows).
- **Signing into a different account** on the same device pushes the whole
  local library into that account (cursors are per user and start at 0).
- **Settings and audio do not sync.** Settings live in localStorage; audio
  recordings stay in IndexedDB on the device that made them.
- **Untested against a real Supabase project.** Tests run against the
  in-memory fake in `testing/fakeSupabase.ts`, which mimics upsert, filters,
  ranges and the `keep_newer` trigger but not RLS or network failures.

## Share links

`createShare(sessionId)` stores a snapshot `{ version: 1, chart, text,
sharedAt }` under a random 10-character base62 code, where `chart` is the
`toJSON` export without MIDI events (and `hasAudio`/`hasMidi` false) and
`text` is `toText`. The public page `/s/<code>` (`ShareScreen`) reads it
without signing in and offers "Open in JamKey", which imports `chart` with
`fromJSON` (fresh ids). Editing the session later does not update an existing
link; create a new one. `revokeShare(code)` deletes the row.
