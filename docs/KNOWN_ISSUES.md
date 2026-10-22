# Known issues and unverified paths

Updated 2026-10-22 during integration (PR 8).

## Not yet verified on hardware

- Live microphone path end-to-end in Chrome and Safari (unit-tested with synthesised audio only).
- USB MIDI piano: device listing, held-note chords, sustain, recording playback.
- iPad Safari: mic permission flow, layout, PWA install.
- Piano sample download (~ tens of MB on first audition) and its offline cache.

## Known limitations

- Settings persist in localStorage, not the Dexie `settings` table (sync phase will move them).
- Room mode vocal suppression is heuristic; a sustained vocal note can still bias the chord.
- Relative major/minor is shown as a pair; the bold winner may flip in ambiguous passages.
- When both mic and MIDI are active, mic frames are dropped for 2 s after any MIDI note.
- Theory helpers are still the local `TODO(integration)` copies in `src/ui/lib`, `src/analysis/templates.ts`, `src/data/chordSymbol.ts`, `src/data/cycles.ts`, `src/midi/chordAudition.ts` until `feat/theory` merges and the swap PR lands.

## Sync

- **Untested against a real Supabase project.** No project exists yet. The
  engine, share links and UI are tested only against the in-memory fake in
  `src/sync/testing/fakeSupabase.ts` (upsert, filters, paging and the
  `keep_newer` trigger are emulated; RLS, network errors and real latency are
  not). The SQL migration has not been run. Google OAuth redirect and PKCE
  exchange have not been exercised in a browser.
- Last write wins per session, no merge: concurrent edits of the same session
  on two devices keep only the later one. Device clock skew can hide changes.
- Purging a soft-deleted session before it synced leaves the remote copy alive.
- Locally removed child rows (e.g. a deleted marker) stay in Postgres as stale
  rows; they are never read again but not cleaned up.
- `shares` uses a public `select ... using (true)` policy, so the anon key can
  list all shares (code, payload, created time). See `supabase/README.md`,
  "Security notes", for the RPC alternative.
- Share links are snapshots; editing the session does not update them.
- Settings and audio recordings do not sync.
