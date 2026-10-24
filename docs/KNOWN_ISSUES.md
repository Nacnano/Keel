# Known issues and unverified paths

Updated 2026-10-23 during the listening-first redesign and detection evaluation.

## Browser verification

The listening-first UI was exercised at desktop (1440 and 1720 px), phone (390 px), and iPad portrait (834 px) viewport sizes in Chromium, in light and dark appearances. Demo start/stop, options, modal focus and background inert behavior, tool navigation, clean/noisy sampled-piano file analysis, save, review, and audio playback were checked. Real live-microphone saved-result states are covered by integration tests, not hardware browser checks.

## Not yet verified on hardware

See the first-run checklist in `README.md`.

- Live microphone path end-to-end in Chrome and Safari (unit-tested with synthesised audio only).
- USB MIDI piano: device listing, held-note chords, sustain, recording playback.
- iPad Safari: mic permission flow, layout, PWA install.
- Piano sample download (~ tens of MB on first audition) and its offline cache.

## Known limitations

- [Detection evaluation](ACCURACY.md) uses ten simulated piano sessions, also used during tuning. It is not held-out or real-device validation. Strong harmonic hum mixed with playing remains difficult. Startup noise and transient false chords now have dedicated rejection tests; these use simulated noise, not room recordings. Inharmonic rings and broadband noise are kept off the piano keys. A chord label can still linger for about two seconds after playing stops into loud harmonic noise such as a vacuum.
- Sensitivity controls the adaptive noise gate; it does not amplify the microphone.

- Settings persist in localStorage, not the Dexie `settings` table, so they do not sync between devices.
- Room mode vocal suppression is heuristic; a sustained vocal note can still bias the chord.
- Relative major/minor is shown as a pair; the bold winner may flip in ambiguous passages.
- When both mic and MIDI are active, mic frames are dropped for 2 s after any MIDI note.

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

## Custom domain

Updated 2026-10-24: production is **https://keel.nacnano.dev**, with
**https://keel-nacnano.vercel.app** as its fallback. Cloudflare has a DNS-only CNAME
`keel` → `f207e94ba4b78857.vercel-dns-017.com`; both addresses have working HTTPS.
Vercel project `keel` is linked to `Nacnano/Keel`, production branch `main`.

The former addresses are retained for access to browser-local data. Sessions,
recordings, preferences and installed PWAs do not automatically move between
origins. See [Moving existing sessions](../README.md#moving-existing-sessions).
