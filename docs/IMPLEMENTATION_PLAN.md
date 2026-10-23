# Keel — technical implementation plan

Status: **executed** (2026-10-22). All waves landed as PRs 2–18; see `PR_LOG.md`. Kept as the record of contracts and ownership. Companion to [`../DESIGN.md`](../DESIGN.md).
This plan is written so that several coding agents can work in parallel. Every
workstream owns a folder, implements against frozen contracts, and lands as its
own pull request with real (non-squashed) commits.

---

## 0. Scope of this build

**In this build (phases 1 + 2 of DESIGN.md):**

- Live chord + key detection from microphone **and** Web MIDI
- Jam screen: huge chord, roman numeral, slash chords, key pair with history,
  chord timeline with repeat compression, chord vocabulary level selector,
  Solo / Room mode, try-next suggestions, on-screen piano
- MIDI performance recording + playback with a piano sound, piano roll
- Opt-in audio recording of the session
- Review screen: synced playback, manual chord fix, structure markers,
  bookmarks, session summary
- Library: saved sessions, search, tags, rename
- Local-first storage (IndexedDB), export text / JSON, import JSON
- Installable PWA, deployed on Vercel

**Next, in order of the user's priority:** Insight (scale helper, voicing
suggestions, modulation hints, reharmonization) → Sync + share (Supabase,
Google login, share links, practice stats) → Extras (file analysis, ear
training, vocal melody, MIDI/MusicXML export, guitar tools).

---

## 1. Architecture

```
            ┌────────────────────────────┐        ┌────────────────────────┐
 mic ─────► │ audio/  (AudioWorklet +    │ Chroma │                        │
            │  DSP Worker → ChromaFrame) │ ─────► │ analysis/              │  AnalysisEvent
            └────────────────────────────┘        │  chord templates + HMM │ ─────────────┐
            ┌────────────────────────────┐ Chroma │  key estimator         │              │
 USB MIDI ► │ midi/  (Web MIDI → notes,  │ ─────► │                        │              ▼
            │  held-note ChromaFrame,    │        └────────────────────────┘      ┌──────────────┐
            │  recorder, piano player)   │ ───────────── MidiNoteEvent ─────────► │ state/       │
            └────────────────────────────┘                                        │ zustand      │
                                                                                  │ stores       │
            ┌────────────────────────────┐                                        └──────┬───────┘
            │ theory/  pure music theory │ ◄──── used by analysis, ui, data              │
            │  spelling, numerals, vocab,│                                               ▼
            │  suggestions, voicings     │                                        ┌──────────────┐
            └────────────────────────────┘                                        │ ui/  screens │
            ┌────────────────────────────┐                                        │  + components│
            │ data/  Dexie (IndexedDB),  │ ◄──── session recorder subscribes ──── └──────────────┘
            │  session recorder, export, │
            │  audio recorder            │
            └────────────────────────────┘
```

**Everything runs in the browser.** No backend in this build. Audio never
leaves the device.

### Folder ownership

| Folder                  | Workstream               | Notes                                                                                                                              |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`             | PR 1 only                | Contracts, constants, mocks, test synth. **Frozen after PR 1.** Changes require a dedicated `core:` PR reviewed by the integrator. |
| `src/theory/`           | WS-A                     | Pure TS, no DOM, no audio.                                                                                                         |
| `src/audio/`            | WS-B                     | Mic capture, worklet, DSP worker, chroma extraction, file decode.                                                                  |
| `src/analysis/`         | WS-C                     | Chord + key estimation engine.                                                                                                     |
| `src/midi/`             | WS-D                     | Web MIDI input, recorder, player.                                                                                                  |
| `src/ui/`, `src/state/` | WS-E                     | Components, screens, stores.                                                                                                       |
| `src/data/`             | WS-F                     | Dexie schema, session recorder, export/import, audio recorder.                                                                     |
| `src/app/`              | PR 1 skeleton, then WS-G | Routes, providers, wiring of real sources into stores.                                                                             |
| `docs/`                 | everyone                 | Each PR appends to `docs/PR_LOG.md`.                                                                                               |

### Stack

| Concern            | Choice                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| Build              | Vite 6, React 19, TypeScript 5 strict, pnpm                              |
| Styling            | Tailwind 4, dark theme first                                             |
| State              | Zustand                                                                  |
| Storage            | Dexie 4 (IndexedDB)                                                      |
| Routing            | react-router 7 (data router, hash-free)                                  |
| Audio              | Web Audio API, AudioWorklet, own FFT in a Worker (no WASM dependency)    |
| MIDI               | Web MIDI API                                                             |
| Piano sound        | `smplr` (SplendidGrandPiano samples, lazy-loaded, cached by PWA)         |
| Sheet / piano roll | Canvas 2D (piano roll); VexFlow later for lead sheets                    |
| Tests              | Vitest (unit, jsdom where needed), Playwright smoke (later)              |
| Lint               | ESLint flat config + typescript-eslint, Prettier                         |
| PWA                | vite-plugin-pwa                                                          |
| Hosting            | Vercel, SPA rewrite, preview deploy per PR                               |
| CI                 | GitHub Actions: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` |

---

## 2. Shared contracts (`src/core/`) — land in PR 1, then frozen

All workstreams code against these. Copied here verbatim so agents can start
before PR 1 merges if needed.

### `src/core/types.ts`

```ts
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11; // 0 = C
export type MidiNote = number; // 0..127
export type Seconds = number; // AudioContext time unless stated

export type VocabLevel = 1 | 2 | 3;

export type ChordQuality =
  // level 1
  | '5'
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | 'sus2'
  | 'sus4'
  // level 2
  | 'maj7'
  | 'min7'
  | '7'
  | 'dim7'
  | 'm7b5'
  | 'mMaj7'
  | '6'
  | 'm6'
  | 'add9'
  | 'madd9'
  // level 3
  | '9'
  | 'maj9'
  | 'min9'
  | '11'
  | 'min11'
  | '13'
  | 'maj13'
  | 'min13'
  | '7b9'
  | '7#9'
  | '7#11'
  | '7b13'
  | '7alt'
  | 'maj7#11'
  | '6/9'
  | '7sus4'
  | '9sus4';

export interface Chord {
  root: PitchClass;
  quality: ChordQuality;
  /** Present only when the bass differs from the root (slash chord). */
  bass?: PitchClass;
}

export type KeyMode = 'major' | 'minor';

export interface Key {
  tonic: PitchClass;
  mode: KeyMode;
}

export interface KeyEstimate extends Key {
  confidence: number; // 0..1
  /** Relative major/minor of the winner, always filled. */
  relative: Key;
  /** Top alternatives, descending. */
  alternatives: Array<Key & { score: number }>;
}

export interface ChromaFrame {
  t: Seconds;
  /** 12 bins, index 0 = C, L1-normalised (sums to 1) or all zeros if silent. */
  chroma: Float32Array;
  /** 0..1 loudness proxy. */
  energy: number;
  bass: PitchClass | null;
  onset: boolean;
  /** true when derived from MIDI (no spectral uncertainty). */
  exact: boolean;
}

export interface MidiNoteEvent {
  t: Seconds;
  type: 'on' | 'off';
  note: MidiNote;
  velocity: number; // 0..127
  channel: number;
}

export interface MidiControlEvent {
  t: Seconds;
  type: 'cc';
  controller: number; // 64 = sustain
  value: number;
  channel: number;
}

export type MidiEvent = MidiNoteEvent | MidiControlEvent;

export type InputSource = 'mic' | 'midi';
export type JamMode = 'solo' | 'room';
export type Instrument = 'piano' | 'guitar';

export type AnalysisEvent =
  | { type: 'chord'; t: Seconds; chord: Chord | null; confidence: number; source: InputSource }
  | { type: 'key'; t: Seconds; key: KeyEstimate }
  | { type: 'notes'; t: Seconds; pitchClasses: PitchClass[]; midiNotes?: MidiNote[] }
  | { type: 'level'; t: Seconds; energy: number };

export interface AnalysisConfig {
  vocabLevel: VocabLevel;
  mode: JamMode;
  instrument: Instrument;
  a4: number; // Hz, default 440
  /** 0 = snappy, 1 = very stable. Default 0.5. */
  stability: number;
  showSlashChords: boolean;
}

export interface AnalysisEngine {
  configure(patch: Partial<AnalysisConfig>): void;
  push(frame: ChromaFrame): void;
  reset(): void;
  subscribe(cb: (e: AnalysisEvent) => void): () => void;
}

export interface AudioInput {
  listDevices(): Promise<MediaDeviceInfo[]>;
  start(opts?: { deviceId?: string; a4?: number; instrument?: Instrument }): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  onFrame(cb: (f: ChromaFrame) => void): () => void;
  /** Raw stream for the audio recorder (WS-F). */
  getStream(): MediaStream | null;
  getContext(): AudioContext | null;
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
}

export interface MidiInput {
  isSupported(): boolean;
  listDevices(): Promise<MidiDeviceInfo[]>;
  connect(deviceId: string): Promise<void>;
  disconnect(): void;
  onEvent(cb: (e: MidiEvent) => void): () => void;
  /** ChromaFrame derived from currently held (incl. sustained) notes. */
  onFrame(cb: (f: ChromaFrame) => void): () => void;
}

export interface MidiPlayer {
  load(): Promise<void>; // fetch piano samples
  play(events: MidiEvent[], opts?: { from?: Seconds; rate?: number }): void;
  seek(t: Seconds): void;
  pause(): void;
  stop(): void;
  onTick(cb: (t: Seconds) => void): () => void;
  noteOn(note: MidiNote, velocity?: number): void; // for "tap to hear" chords
  noteOff(note: MidiNote): void;
}
```

### `src/core/session.ts` (storage shapes, used by WS-F and WS-E)

```ts
export interface Session {
  id: string; // uuid v4
  name: string;
  createdAt: number; // epoch ms
  endedAt: number | null;
  durationSec: number;
  mode: JamMode;
  instrument: Instrument;
  vocabLevel: VocabLevel;
  tags: string[];
  hasAudio: boolean;
  hasMidi: boolean;
  summary: SessionSummary | null;
  updatedAt: number;
  deleted: boolean; // soft delete, sync-ready
}

export interface ChordRecord {
  id: string;
  sessionId: string;
  t: number; // seconds from session start
  chord: Chord | null;
  confidence: number;
  source: InputSource;
  manual: boolean; // true if edited in review
}

export interface KeyRecord {
  id: string;
  sessionId: string;
  t: number;
  key: KeyEstimate;
}

export type MarkerKind =
  'bookmark' | 'intro' | 'verse' | 'pre' | 'chorus' | 'bridge' | 'outro' | 'custom';
export interface Marker {
  id: string;
  sessionId: string;
  t: number;
  kind: MarkerKind;
  label?: string;
}

export interface MidiTrack {
  sessionId: string;
  events: MidiEvent[];
} // one row per session
export interface AudioRecording {
  sessionId: string;
  blob: Blob;
  mimeType: string;
  durationSec: number;
}

export interface SessionSummary {
  keys: Array<{ key: Key; seconds: number }>;
  topProgressions: Array<{ chords: Chord[]; count: number }>;
  chordCount: number;
  bookmarks: number;
}

export interface Settings {
  a4: number;
  vocabLevel: VocabLevel;
  instrument: Instrument;
  mode: JamMode;
  stability: number;
  showSlashChords: boolean;
  spellingFollowsKey: boolean;
  audioDeviceId: string | null;
  midiDeviceId: string | null;
  recordAudioByDefault: boolean;
  theme: 'dark' | 'light' | 'system';
}
```

### Also in `src/core/`

- `constants.ts` — `NOTE_NAMES_SHARP`, `NOTE_NAMES_FLAT`, `DEFAULT_SETTINGS`, DSP constants (`FRAME_SIZE = 8192`, `HOP_SIZE = 2048`).
- `events.ts` — tiny typed emitter used by all `subscribe/onX` methods.
- `mocks.ts` — `createMockAnalysisStream(script)` that emits a scripted sequence of `AnalysisEvent`s on a timer (for WS-E to build UI without audio), plus `mockSession()` fixtures (for WS-F/WS-H).
- `testing/synth.ts` — `synthChord({ notes, sampleRate, seconds, harmonics, decay })` returning `Float32Array`, piano-like partials; `synthProgression(...)`. Used by WS-B and WS-C tests.
- `testing/midi.ts` — `midiChord(...)` fixtures for WS-C/WS-D tests.

---

## 3. Workstreams

Each workstream = one agent, one branch, one PR, several commits. Sizes are
rough (S < ½ day of agent time, M ~ 1 day, L > 1 day).

### PR 1 — `chore/scaffold` (sequential, blocks everything) — size M

Owner: integrator agent.

1. `pnpm create vite` React + TS; add Tailwind 4, ESLint flat config, Prettier, Vitest, vite-plugin-pwa, react-router, zustand, dexie, smplr, uuid.
2. `src/core/*` exactly as in §2, with unit tests for `events.ts` and `testing/synth.ts` (spectral sanity: a synthesised C major has energy at C, E, G).
3. `src/app/` skeleton: `App.tsx`, routes `/` (jam), `/review/:id`, `/library`, `/settings` rendering placeholders; dark layout shell.
4. `docs/ARCHITECTURE.md` (condensed §1–§2), `docs/PR_LOG.md` (table: PR, branch, summary, commits), `CONTRIBUTING.md` (git workflow in §5), `README.md`.
5. GitHub Actions workflow `ci.yml`.
6. `vercel.json` with SPA rewrite.
7. Push `main` to GitHub (remote is empty today), open PR, merge with merge commit.

Acceptance: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green in CI; app loads with placeholder routes; PWA manifest present.

### WS-A — `feat/theory` — size M

Owner: theory agent. Folder: `src/theory/`. Pure functions only.

| Module         | Exports                                                                                                                                                                         | Tests                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `notes.ts`     | `pc(name)`, `spell(pc, key)`, `spellChord(chord, key, {spellingFollowsKey})`, `midiToPc`, `pcToMidi(pc, octave)`                                                                | spelling in Db vs C# contexts, enharmonics                 |
| `vocab.ts`     | `CHORD_TEMPLATES: Record<ChordQuality, {intervals: number[]; weights: number[]; level: VocabLevel; symbol: string}>`, `qualitiesForLevel(level)`                                | every quality has root + distinct intervals, levels nested |
| `chordName.ts` | `chordSymbol(chord, key)` → `"Cmaj7"`, `"G/B"`, `"F#m7b5"`; `chordTones(chord)`                                                                                                 | symbol rendering per quality                               |
| `identify.ts`  | `identifyChord(pcs: PitchClass[], bass: PitchClass \| null, level)` → `{chord, score}[]` exact set matching, inversion → slash                                                  | all L1/L2 chords in all inversions; dyads → `'5'` or null  |
| `keys.ts`      | `KRUMHANSL_MAJOR/MINOR`, `TEMPERLEY_*` profiles, `scaleOf(key)`, `relativeKey(key)`, `parallelKey(key)`, `diatonicChords(key, level)`                                           | diatonic sets for all 24 keys                              |
| `numerals.ts`  | `romanNumeral(chord, key)` → `"IV"`, `"V7/vi"`, `"bVII"`, `"ii°"`, `"♭VI"`; handles borrowed + secondary dominants                                                              | pop + jazz examples                                        |
| `suggest.ts`   | `suggestNext(key, recent: Chord[], level)` → ranked `{chord, reason}[]` using diatonic, circle of fifths, secondary dominants, ii-V, tritone sub (L3), borrowed iv / bVII / bVI | deterministic rankings for I, vi, ii, V contexts           |
| `timeline.ts`  | `compressTimeline(chords: Chord[])` → `Segment[]` where `{chords, repeat}` detects repeating cycles of length 1–8                                                               | `C F G C F G` → `[C F G] ×2`                               |
| `scales.ts`    | `scalesForChord(chord, key)` → modes/scales ranked (for Insight phase; stub ok)                                                                                                 | basic                                                      |
| `voicings.ts`  | `voicings(chord, {style:'rootless'\|'shell'\|'spread'\|'drop2'})` → `MidiNote[][]` (Insight phase; stub ok)                                                                     | basic                                                      |

Acceptance: 100% of exported functions unit-tested; no imports outside `src/core` and `src/theory`.

### WS-B — `feat/audio` — size L

Owner: DSP agent. Folder: `src/audio/`.

1. `micInput.ts` implements `AudioInput`. `getUserMedia` with `echoCancellation:false, noiseSuppression:false, autoGainControl:false`, device selection, AudioContext resume on user gesture, Safari quirks (must create context inside the click handler; sampleRate may be 44100).
2. `worklet/capture.worklet.ts` — AudioWorkletProcessor that fills a ring buffer and posts `Float32Array` blocks of `HOP_SIZE` to the main thread (transferable). Loaded via `new URL('./capture.worklet.ts', import.meta.url)`; verify production build serves it (Vite `worker.format = 'es'`).
3. `worker/dsp.worker.ts` — receives hops, keeps a sliding window of `FRAME_SIZE`, Hann window, radix-2 FFT (`fft.ts`, own implementation, tested against naive DFT), spectral peak picking with parabolic interpolation (`peaks.ts`), HPCP-style chroma (`chroma.ts`): each peak contributes to the pitch class of its frequency and to sub-harmonic candidates with weights `[1, 0.5, 0.33, 0.25]` (harmonic down-weighting), tuned to `a4`. Instrument profile: piano uses 6 harmonics and longer energy decay; guitar 4 harmonics.
4. `bass.ts` — lowest significant interpolated peak in 30–260 Hz → `bass` pitch class, with per-frame confidence; null if none.
5. `gate.ts` — energy gate (silence → zero chroma), onset detector (spectral flux), and a short post-onset hold (ignore 40 ms after attack).
6. `room.ts` — Room mode tweaks: longer window averaging (2 frames), peak weighting that de-emphasises 250–1000 Hz single sustained peaks that drift (vocal/lead) — best-effort, documented limits.
7. `fileInput.ts` — `decodeAudioData` → offline chroma frames using the same worker code (`analyseFile(file) → ChromaFrame[]`). Used by Extras later; cheap to add now since the pipeline is shared.
8. `README.md` in folder: parameter table, latency budget (hop 2048 @ 48 kHz = 43 ms; frame 8192 = 171 ms; expected display lag ≈ 100–250 ms after smoothing).

Tests (Vitest, node): FFT vs DFT; `synthChord` C major → chroma peaks at 0, 4, 7 with > 70% of mass; Fmaj7 with F2 bass → `bass === 5`; silence → zeros + `energy < 0.01`; onset detection on a synthesised attack.

Acceptance: `MicInput` runs in Chrome + Safari (manual), chroma frames at ~23 fps, worker CPU < 15% on an M-series laptop (measure with `performance.now()` per frame, print in dev overlay).

### WS-C — `feat/analysis` — size L

Owner: analysis agent. Folder: `src/analysis/`. Depends on `src/theory/vocab.ts` and `keys.ts` (if WS-A has not merged, copy the template table into a local `templates.ts` and swap to the import in the integration PR).

1. `templates.ts` — build 12 × N chroma templates from `CHORD_TEMPLATES` with per-interval weights, add 0.1 of each chord tone's 5th harmonic smear, normalise.
2. `chordScorer.ts` — cosine similarity of frame chroma against all templates in the active level, plus a `no-chord` state. When `frame.exact` (MIDI) use `theory/identify.ts` directly and skip HMM.
3. `smoother.ts` — fixed-lag Viterbi over the last 32 frames (~0.7 s). Transition matrix: self-transition `p_stay = 0.6 + 0.38 * stability`, others uniform. Emission = softmax(similarity / τ). Emit a `chord` event only when the decoded label changes or confidence crosses a threshold. Confidence = posterior of the decoded state.
4. `bassResolver.ts` — combine frame bass with chord → slash chord when bass is a chord tone ≠ root for ≥ 3 consecutive frames; when `showSlashChords` is false collapse to root.
5. `keyEstimator.ts` — exponentially decaying chroma histogram (half-life 8 s), correlate with Krumhansl-Kessler major/minor profiles for all 24 keys. Switch key only when the new best beats the current by margin ≥ 0.08 for ≥ 2 s (hysteresis). Emit `key` with `relative` and top-3 `alternatives`. Reset on `reset()`.
6. `engine.ts` — `createAnalysisEngine(config): AnalysisEngine` wiring the above; emits `notes` events (pitch classes above threshold) and `level` events.
7. `README.md`: algorithm notes, tunable parameters, known failure modes.

Tests: feed `synthProgression(['C','Am','F','G'])` chroma through WS-B's `chroma.ts` (or pre-computed fixtures checked in as JSON to decouple) → decoded sequence equals input with ≤ 1 spurious frame per change; key = C major by 4 s; MIDI `exact` frames identify all L2 chords and inversions instantly; stability 0 vs 1 changes switch latency monotonically.

Acceptance: engine processes a frame in < 1 ms (L3 vocabulary is 12 × 36 templates); deterministic given same input.

### WS-D — `feat/midi` — size M

Owner: MIDI agent. Folder: `src/midi/`.

1. `midiInput.ts` implements `MidiInput`: `navigator.requestMIDIAccess`, device list + hot-plug (`statechange`), parse note on/off (velocity 0 = off), CC64 sustain. Held-note model: notes remain "held" while key down or sustain pedal down. Emits `onFrame` ChromaFrame (velocity-weighted one-hot, L1-normalised, `bass` = lowest held pc, `exact: true`) on every change, throttled to one per 20 ms. Timestamps converted from `MIDIMessageEvent.timeStamp` to AudioContext seconds via a shared clock (`src/core/clock.ts` if PR 1 did not add one, propose in integration).
2. `recorder.ts` — `MidiRecorder`: start/stop, collects `MidiEvent[]` relative to session start, `toTrack(): MidiTrack`.
3. `player.ts` implements `MidiPlayer` with `smplr` `SplendidGrandPiano`; schedule with look-ahead, honour sustain, `onTick` at 30 Hz, `noteOn/noteOff` for chord audition. Sample loading shows progress; samples cached by the PWA runtime cache (add route pattern to `vite.config` in integration).
4. `chordAudition.ts` — `playChord(chord, {octave, durationMs})` for the try-next row.
5. `README.md`: browser support matrix (Chrome/Edge yes, Safari no), latency notes.

Tests: parser on byte arrays; held-note model with sustain; frame output for C/E voicing has `bass === 4`; recorder round-trip.

Acceptance: manual test with a USB piano: notes light up, chords identified instantly, recorded playback sounds right.

### WS-E — `feat/ui-jam` — size L

Owner: UI agent. Folders: `src/ui/`, `src/state/`. Builds against `src/core/mocks.ts`; must not import `audio/`, `midi/`, `analysis/` (the integrator wires them).

Stores (`src/state/`):

- `settingsStore` — persisted via `localStorage` for now; WS-F may later switch to Dexie `settings` table (keep the API `useSettings()` stable).
- `jamStore` — `status: idle|starting|listening|error`, `source`, `currentChord`, `confidence`, `key`, `keyHistory`, `timeline: ChordRecord[]`, `activePitchClasses`, `activeMidiNotes`, `level`, `sessionStart`, actions `applyEvent(e: AnalysisEvent)`, `reset()`, `addMarker(kind)`.
- `inputStore` — device lists and selection (filled by integrator).

Components (`src/ui/components/`):

- `ChordDisplay` — huge symbol, numeral under it, chord tones + bass small; dash when `chord === null` or confidence < 0.35; fade transitions, no layout shift.
- `KeyBadge` — `G major / E minor` with winner bold, confidence bar, click → alternatives popover.
- `Timeline` — horizontal, newest right, uses `theory/timeline.compressTimeline`, key-change markers (`→ A minor`), structure markers and bookmarks as pins; auto-scroll; tap a chord → audition (callback).
- `Piano` — SVG, 88 or 61 keys (setting), highlights `activePitchClasses` (all octaves, dim) and `activeMidiNotes` (exact, bright); later reused for scale helper.
- `TryNext` — chips from `theory/suggest.suggestNext`, with reason tooltips; tap → audition callback.
- `LevelSelector` (1/2/3), `ModeToggle` (Solo/Room), `SourceIndicator` (mic/MIDI, level meter), `TransportBar` (start/stop, reset, record audio toggle, bookmark, markers menu).
- `Toast`, `Dialog`, `Button`, `Select` primitives.

Screens (`src/ui/screens/`): `JamScreen` (layout in DESIGN.md §3.1, responsive: laptop two-column, iPad single column with piano at bottom), `SettingsScreen` (all `Settings` fields, device selects, A4, theme). Keyboard shortcuts: Space, R, B (bookmark), 1/2/3 (level), K (piano), M (mode).

Dev-only: `?mock=1` query param runs `createMockAnalysisStream` so the screen can be demoed without a mic.

Tests: store reducer tests for `applyEvent`; component smoke tests with Testing Library for `ChordDisplay`, `Timeline` compression rendering, `Piano` highlighting.

Acceptance: usable at 1 m distance on a 13" laptop (chord symbol ≥ 120 px), no jank at 30 events/s, works on iPad Safari in mock mode, Lighthouse a11y ≥ 90.

### WS-F — `feat/data` — size M

Owner: data agent. Folder: `src/data/`.

1. `db.ts` — Dexie database `jamkey` v1 with tables from `src/core/session.ts`: `sessions`, `chords`, `keys`, `markers`, `midiTracks`, `recordings`, `settings`. Indexes: `sessionId+t`, `updatedAt`, `deleted`.
2. `sessionRecorder.ts` — `startSession(meta) → SessionHandle`; subscribes to an `AnalysisEvent` stream and a `MidiEvent` stream, buffers and bulk-writes every 2 s, `addMarker`, `stop()` computes `SessionSummary` (key seconds, top progressions via `theory/timeline`, chord count).
3. `audioRecorder.ts` — `MediaRecorder` on the `AudioInput` stream, opt-in, `audio/webm;codecs=opus` (Chrome) or `audio/mp4` (Safari), chunks stored on stop; duration and size cap (default 30 min, warn at 25).
4. `repo.ts` — CRUD: `listSessions({query, tag})`, `getSessionFull(id)`, `rename`, `setTags`, `softDelete`, `updateChord(id, chord, manual=true)`, `storageEstimate()`.
5. `export.ts` — `toText(session)` (`| G D Em C | ×4` with key header and markers), `toJSON(session)` (full), `fromJSON(json)` import with id remap.
6. `migrations.md` note on how to bump the Dexie version.

Tests: fake-indexeddb in Vitest; recorder round-trip from a mock stream; summary computation; export text snapshot; import/export round-trip.

Acceptance: 1 h session (≈ 5k chord records + 50k MIDI events) writes without blocking the UI (bulk writes in chunks); summary generated < 200 ms.

### WS-G — `feat/integration` — size M (after wave 1 merges)

Owner: integrator agent (same as PR 1). Folder: `src/app/`, plus small fixes anywhere.

1. `src/app/inputs.ts` — instantiate `MicInput`, `MidiInput`, `AnalysisEngine`; route frames from the active source (MIDI preferred when a device is connected and emitting; mic otherwise; both can run, MIDI wins on conflict within 300 ms); feed `jamStore.applyEvent`; feed `sessionRecorder`.
2. Shared clock: map MIDI timestamps and recorder time to session seconds.
3. Replace `?mock=1` default with real inputs; keep mock behind the flag.
4. Settings persistence moved to Dexie `settings` table.
5. PWA: runtime caching for `smplr` sample CDN; verify worklet + worker files are served from the build; iOS "Add to Home Screen" check.
6. Wire try-next and timeline audition to `MidiPlayer.noteOn`.
7. End-to-end manual QA checklist (§7) executed on Chrome laptop, Safari iPad, with USB piano; findings fixed or logged in `docs/KNOWN_ISSUES.md`.
8. Contract adjustments, if any, land here as explicit `core:` commits.

### WS-H — `feat/review-library` — size L (parallel with WS-G; uses mock session fixtures until G lands)

Owner: review-UI agent. Folders: `src/ui/screens/Review*`, `src/ui/components/PianoRoll*`, `src/ui/screens/Library*`.

1. `ReviewScreen` — header (name, key(s), duration, tags), transport (play/pause/seek, speed), synced sources: audio (`<audio>` from blob) and/or MIDI (`MidiPlayer`), master clock = whichever exists (audio preferred).
2. `ChordLane` — full timeline with timestamps and key segments; click → seek; long-press/right-click → edit chord (`ChordPicker` dialog: root, quality by level, bass) → `repo.updateChord` (marks `manual`).
3. `PianoRoll` — Canvas, notes as bars, playhead, zoom/scroll, chord at playhead displayed; 60 fps with 50k events (cull to viewport).
4. `MarkerLane` — add/move/delete structure markers and bookmarks; keyboard `B`.
5. `SummaryCard` — from `SessionSummary`; "Top progressions" rendered with numerals.
6. `LibraryScreen` — list/grid with search, tag filter, sort; rename inline; delete (soft) with undo toast; storage usage; export/import buttons.
7. Route hookup for `/review/:id` and `/library`.

Tests: `PianoRoll` viewport culling; chord edit flow; library search.

Acceptance: 30-minute session with audio + MIDI scrubs smoothly; edits persist; export matches on-screen chords.

### Wave 3 — Insight (user's top priority after this build) — planned, not in this build

- `feat/insight-scales` — `theory/scales.ts` full + `ScaleHelper` panel reusing `Piano`.
- `feat/insight-voicings` — `theory/voicings.ts` full + `VoicingPanel` with audition.
- `feat/insight-reharm` — `theory/reharm.ts` + review-screen "Reharmonize" view + modulation hints on the jam screen.

---

## 4. Dependency graph and waves

```
Wave 0:  PR1 scaffold ─────────────────────────────────────────────┐
                                                                   ▼
Wave 1:  WS-A theory   WS-B audio   WS-C analysis   WS-D midi   WS-E ui-jam   WS-F data
         (6 agents in parallel; C may vendor A's template table temporarily)
                                                                   ▼
Wave 2:  WS-G integration  ‖  WS-H review-library (starts on mocks, rebases on G)
                                                                   ▼
Wave 3:  insight-scales ‖ insight-voicings ‖ insight-reharm
Wave 4:  sync + share  →  Wave 5: extras
```

Merge order inside wave 1 does not matter; conflicts are limited to
`docs/PR_LOG.md` (append-only, trivial) and `package.json` (only if a
workstream adds a dependency — list it in the PR description).

---

## 5. Git and PR conventions

- Branches: `chore/scaffold`, `feat/<workstream>`, `fix/<topic>`, `core/<change>`.
- Commits: Conventional Commits (`feat(audio): hpcp chroma extraction`). Small, meaningful commits; one logical change each. **Do not squash.**
- PR title = branch purpose; body uses the template in `.github/PULL_REQUEST_TEMPLATE.md` (summary, what changed per commit, how verified, screenshots/recordings for UI, contract changes).
- Merge: `gh pr merge --merge --delete-branch=false` (merge commit, history preserved). Never `--squash`, never `--rebase`.
- CI must be green. The integrator reviews contract usage; the author self-reviews with `/code-review` before requesting merge.
- Every PR appends one row to `docs/PR_LOG.md`: `| # | branch | summary | commits (short SHAs) | date |`.
- Attribution lines per repo policy go at the end of commit messages and PR bodies.

---

## 6. Subagent briefing template

```
You are the <WS-X> agent on the Keel repo (branch feat/<x> from main).
Read first: DESIGN.md, docs/IMPLEMENTATION_PLAN.md §2 (contracts) and §3 <WS-X>, docs/ARCHITECTURE.md, src/core/*.
You own ONLY: <folders>. Do not edit src/core (propose changes in your PR description instead) or other workstreams' folders.
Build against the contracts verbatim. Use src/core/mocks.ts and src/core/testing/* for tests and demos.
Deliverables: <module list>, unit tests, folder README.md, a row in docs/PR_LOG.md.
Verify: pnpm lint && pnpm typecheck && pnpm test && pnpm build. <manual checks>.
Commit in small conventional commits as you go. Open a PR with `gh pr create --base main`, fill the template, do NOT merge.
Report back: what landed, what deviated from the plan and why, open questions for the integrator, PR URL.
```

---

## 7. Manual QA checklist (run in WS-G, repeat before each release)

- Chrome laptop, built-in mic, acoustic or speaker piano: play C, F, G, Am triads slowly → correct within 300 ms; key resolves to C major within ~5 s.
- Same with level 3: Cmaj7, Dm7, G7, Em7 → correct; G7/B shows slash when enabled.
- USB piano via MIDI: chords immediate; sustain pedal keeps chord; inversions shown as slash.
- Room mode with a pop song playing from a speaker: key correct, chords mostly right on sustained sections.
- Singing over playing: chord display does not flicker to the vocal note.
- Record audio toggle on → stop → review screen plays audio, timeline follows.
- MIDI recording → review → piano roll scrubs, playback through piano sound in sync with chord lane.
- Edit a wrong chord in review → persists on reload; export text reflects edit.
- iPad Safari: mic works after tap, layout fits portrait and landscape, PWA installs.
- Offline: reload with network off → app loads (samples may be unavailable; show notice).
- Storage: 30-minute session with audio saves; library shows size; delete frees space.

---

## 8. Risks and mitigations

| Risk                                                                        | Mitigation                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chroma from a laptop mic on an acoustic piano is noisy; low bass resolution | Peak interpolation + harmonic weighting; bass from a dedicated low band; stability slider; MIDI path for the digital piano. If quality is insufficient, swap `chroma.ts` for `essentia.js` HPCP behind the same `AudioInput` contract. |
| Relative major/minor ambiguity                                              | Always show the pair; prefer major unless minor profile wins by margin and the tonic minor chord dominates recent chords.                                                                                                              |
| Safari AudioWorklet / sampleRate / autoplay quirks                          | Create AudioContext inside the user gesture; handle 44.1 kHz; test early in WS-B.                                                                                                                                                      |
| Web MIDI missing on Safari                                                  | Feature-detect, show "MIDI needs Chrome" hint; mic fallback.                                                                                                                                                                           |
| Piano samples size (~ tens of MB)                                           | Lazy-load on first playback, PWA cache, progress UI.                                                                                                                                                                                   |
| Worklet/worker files in production build                                    | Use `new URL(..., import.meta.url)` pattern; CI build + Playwright smoke later.                                                                                                                                                        |
| IndexedDB quota on iPad                                                     | `storageEstimate()`, warn, cap recording length, soft-delete + purge.                                                                                                                                                                  |
| Vocals bleed into chord detection                                           | Room mode heuristics are best-effort; document; melody tracking later.                                                                                                                                                                 |
| Parallel agents drift from contracts                                        | `src/core` frozen; CI typecheck; integrator reviews every PR.                                                                                                                                                                          |

---

## 9. Open items for the user

- Confirm `main` as the GitHub default branch (remote currently has no branches; PR 1 will push it).
- Vercel: connect the GitHub repo to a Vercel project so preview deploys appear on PRs (user action).
- Supabase project + Google OAuth are needed only in wave 4.
- App name: "JamKey" was the placeholder; renamed to "Keel" on 2026-10-23 (PR 29). Persisted storage ids (IndexedDB `jamkey`, `jamkey.*` localStorage keys, `jamkey-auth`) keep the old name on purpose.
