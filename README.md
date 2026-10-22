# JamKey

Personal web app for jamming and solo piano. It listens to the microphone or a
USB MIDI piano, shows the current **key** and **chord** in real time, keeps a
timeline of the progression, and captures ideas so they are not lost.

- Product design and decisions: [`DESIGN.md`](DESIGN.md)
- Engineering plan and contracts: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)
- Architecture summary: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- PR history: [`docs/PR_LOG.md`](docs/PR_LOG.md)
- What is not yet verified: [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md)

## What it does

| Route         | Feature                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`           | **Jam screen.** Live chord (with slash chords and roman numerals), key pair with history, chord timeline with repeat compression, chord vocabulary level 1/2/3, Solo/Room mode, try-next suggestions, modulation hints, scale helper (`S`), voicing suggestions (`V`), on-screen piano (`K`), bookmarks and section markers (`B`), opt-in audio recording. Mic and Web MIDI both supported. `?mock=1` runs a demo stream without audio. |
| `/review/:id` | **Review.** Synced playback of the recorded audio and/or MIDI, chord lane with manual chord fix, marker lane, canvas piano roll, session summary, reharmonization (pop/jazz) with playback, text/JSON export, share link.                                                                                                                                                                                                               |
| `/library`    | **Library.** Saved sessions with search, tags, sort, rename, undo delete, import/export, storage usage. `?seed=1` adds demo sessions.                                                                                                                                                                                                                                                                                                   |
| `/analyze`    | **Analyze a file.** Drop an mp3/m4a/wav/ogg to get key and chord chart offline, play it with the chart following, save it as a session.                                                                                                                                                                                                                                                                                                 |
| `/train`      | **Ear training.** Chord quality, progression numerals, and key drills on the sampled piano.                                                                                                                                                                                                                                                                                                                                             |
| `/stats`      | **Practice stats.** Time played, streaks, keys and progressions you use most, least-played key nudges.                                                                                                                                                                                                                                                                                                                                  |
| `/settings`   | A4 reference, chord level, instrument, mode, stability, slash chords, spelling, input devices, theme, account and sync.                                                                                                                                                                                                                                                                                                                 |
| `/s/:code`    | **Public share page** for a chart (needs Supabase, see below).                                                                                                                                                                                                                                                                                                                                                                          |

Everything runs in the browser. Sessions live in IndexedDB. Optional cloud
sync and share links use Supabase with Google login; see
[`supabase/README.md`](supabase/README.md) for the one-time setup. Without the
two environment variables the app runs fully local.

## Develop

```sh
pnpm install
pnpm dev          # http://localhost:5173  (add ?mock=1 for a scripted chord stream)
pnpm test         # vitest (644 tests)
pnpm lint         # oxlint + prettier --check
pnpm typecheck    # tsc -b
pnpm build        # production build with PWA service worker
```

Node 22, pnpm 11.

## Deploy

Static site. On Vercel: import the GitHub repo, framework Vite, build
`pnpm build`, output `dist`. `vercel.json` already has the SPA rewrite. Add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only if you set up sync.

## Browser support

| Feature                 | Chrome / Edge (laptop) | Safari (iPad)            |
| ----------------------- | ---------------------- | ------------------------ |
| Mic chord/key detection | yes                    | yes                      |
| Web MIDI                | yes                    | no                       |
| Install as PWA          | yes                    | yes (Add to Home Screen) |

## First-run checklist (hardware)

These were built against synthesised audio and mocked MIDI; please run them
once with real gear and file issues for anything off:

1. Laptop Chrome, built-in mic, play C F G Am slowly: chords appear within ~300 ms, key settles on C major in a few seconds.
2. Switch to level 3 and play Cmaj7 Dm7 G7: correct names; G7/B shows the slash.
3. Plug in the USB piano: Settings shows the device; chords are instant; sustain pedal holds the chord.
4. Toggle "Record audio", play a minute, Stop: the toast offers "Open"; the review screen plays back with the chord lane following.
5. iPad Safari: tap Start, allow the mic, check the single-column layout; Add to Home Screen.
6. First tap on a try-next chip downloads the piano samples (a few MB); later taps are instant.
