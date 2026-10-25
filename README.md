# Keel

Personal web app for jamming and solo piano. It listens to the microphone or a
USB MIDI piano, shows the current **key** and **chord** in real time, keeps a
timeline of the progression, and captures ideas so they are not lost.

- Product design and decisions: [`DESIGN.md`](DESIGN.md)
- Engineering plan and contracts: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)
- Architecture summary: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- PR history: [`docs/PR_LOG.md`](docs/PR_LOG.md)
- Detection measurements: [`docs/ACCURACY.md`](docs/ACCURACY.md)
- What is not yet verified: [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md)

## Start a jam

Open **Listen**, choose **Start listening**, and allow microphone access. Play a chord
and hold it briefly. Choose **Finish & save**, then **Open session** to review it.
**Try a demo** shows the flow without microphone access.
Use **Piano/keyboard** for acoustic, electric, and digital piano voices; no separate sound preset is needed. **Listening options** holds
sensitivity, optional audio recording, and the keyboard. For a USB piano, use
**Tools → Settings → Find input devices** before starting.

Microphone keys brighten as repeated detections build support and fade during brief dropouts.
Tentative notes have a tinted fill and dashed outline; MIDI keys light fully immediately.
The shading shows detection stability, not a calibrated probability that a note is correct.

## What it does

| Route         | Feature                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`           | **Jam screen.** Live chord (with slash chords and roman numerals), key pair with history, chord timeline with repeat compression, chord vocabulary level 1/2/3, Solo/Room mode, try-next suggestions, modulation hints, scale helper (`S`), voicing suggestions (`V`), optional on-screen piano (`P`), bookmarks (`B`) and section markers, opt-in audio recording. Mic and Web MIDI both supported. `?mock=1` runs a demo stream without audio. |
| `/review/:id` | **Review.** Synced playback of the recorded audio and/or MIDI, chord lane with manual chord fix, marker lane, canvas piano roll, session summary, reharmonization (pop/jazz) with playback, text/JSON export, share link.                                                                                                                                                                                                                        |
| `/library`    | **Library.** Saved sessions with search, tags, sort, rename, undo delete, import/export, storage usage. `?seed=1` adds demo sessions.                                                                                                                                                                                                                                                                                                            |
| `/analyze`    | **Analyze a file.** Drop an mp3/m4a/wav/ogg to get key and chord chart offline, play it with the chart following, save it as a session.                                                                                                                                                                                                                                                                                                          |
| `/train`      | **Ear training.** Chord quality, progression numerals, and key drills on the sampled piano.                                                                                                                                                                                                                                                                                                                                                      |
| `/stats`      | **Practice stats.** Time played, streaks, keys and progressions you use most, least-played key nudges.                                                                                                                                                                                                                                                                                                                                           |
| `/tools`      | **Tools.** Analyze a song, ear training, practice history, and Settings.                                                                                                                                                                                                                                                                                                                                                                         |
| `/settings`   | A4 reference, chord level, instrument, mode, stability, slash chords, spelling, input devices, theme, account and sync.                                                                                                                                                                                                                                                                                                                          |
| `/s/:code`    | **Public share page** for a chart (needs Supabase, see below).                                                                                                                                                                                                                                                                                                                                                                                   |

Everything runs in the browser. Sessions live in IndexedDB. Optional cloud
sync and share links use Supabase with Google login; see
[`supabase/README.md`](supabase/README.md) for the one-time setup. Without the
two environment variables the app runs fully local.

## Develop

```sh
pnpm install
pnpm dev          # http://localhost:5173  (add ?mock=1 for a scripted chord stream)
pnpm test         # unit and integration tests
pnpm lint         # oxlint + prettier --check
pnpm typecheck    # tsc -b
pnpm build        # production build with PWA service worker
```

Node 22, pnpm 11.

Additional keyboard detection checks:

```sh
pnpm eval:piano-timbres # Synthetic mellow/bright, tine, reed, FM and bell stress probes
pnpm eval:real-jams     # Real ensemble piano, tack-piano/synth and synth excerpts
pnpm eval:real-jams --offline # Reuse downloaded audio without network access
```

The real-jam suite needs `ffmpeg` and `unzip` on first use and downloads about 147 MB
into the ignored evaluation cache. It runs six cases from three human ensemble recordings.
These recordings have instrument/activity metadata, not independent chord or note labels,
so the suite measures activity and stability, not transcription accuracy. Audio is never
bundled with the app or committed to the repository. See [`eval/BENCHMARK.md`](eval/BENCHMARK.md)
for sources, noncommercial research licensing, reproducibility and remaining timbre limits.

## Deploy

Production: **https://keel.nacnano.dev**. The Vercel project `keel` is connected to
[**Nacnano/Keel**](https://github.com/Nacnano/Keel), with `main` as its production
branch. **https://keel-nacnano.vercel.app** is the fallback URL (`keel.vercel.app`
is unavailable). Every PR gets a preview deployment; every merge to `main` deploys
to production. GitHub Actions runs the **Keel CI** workflow.

`vercel.json` has the SPA rewrite. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
in the Vercel project settings only if you set up sync.

DNS for the custom domain lives in Cloudflare (the personal account, not the work one):
a DNS-only `CNAME` for `keel` points at `f207e94ba4b78857.vercel-dns-017.com`, the
value Vercel shows for the domain. Vercel issues and renews the TLS certificate.

### Moving existing sessions

The former addresses, `music.nacnano.dev` and `keel-music.vercel.app`, remain
accessible for existing browser-local sessions and recordings. Browser storage
is separate for each domain; it does not move when the deployment gets a new URL.
Export sessions as JSON from the old site's Library and import them into the new
site. JSON exports do not include audio recordings, and preferences must be set
again. Keep using the old site to access its saved audio. The earlier
`jamkey.vercel.app` redirect now points to `keel.nacnano.dev`.

## Browser support

| Feature                 | Chrome / Edge (laptop) | Safari (iPad)            |
| ----------------------- | ---------------------- | ------------------------ |
| Mic chord/key detection | yes                    | yes                      |
| Web MIDI                | yes                    | no                       |
| Install as PWA          | yes                    | yes (Add to Home Screen) |

## First-run checklist (hardware)

These were built against synthesised audio and mocked MIDI; please run them
once with real gear and file issues for anything off:

1. Laptop Chrome, built-in mic: choose Start listening and play C F G Am slowly. Check chord changes, quiet notes, sustained pedal, and time for the key to settle. Simulated median chord latency is ~344 ms; real devices may differ.
2. Switch to level 3 and play Cmaj7 Dm7 G7: correct names; G7/B shows the slash.
3. Plug in the USB piano: Settings shows the device; chords are instant; sustain pedal holds the chord.
4. Before starting, enable Record audio in Listening options. Play a minute, choose Finish & save, then Open session. Check that audio and the chord lane stay aligned.
5. iPad Safari: tap Start, allow the mic, check the single-column layout; Add to Home Screen.
6. First tap on a try-next chip downloads the piano samples (a few MB); later taps are instant.
