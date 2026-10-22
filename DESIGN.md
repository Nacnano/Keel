# JamKey — design doc (draft v0)

Personal web app for jamming and solo piano: listen to the microphone, show the
current key and chord progression in real time, and capture ideas so they are
not lost.

Primary instrument: piano. Secondary: guitar.

## 1. Product principles

- **Glanceable from the piano bench.** One screen, huge type, dark background.
  No menus during a jam. Start with one tap or the spacebar.
- **Never interrupts playing.** Everything is hands-free while listening.
  Saving, naming, and editing happen after the jam.
- **Honest about uncertainty.** Chord and key are shown with a confidence
  indicator rather than flickering between guesses.
- **Local-first.** All audio processing in the browser. Nothing is uploaded.
  Sessions are stored in IndexedDB; export as text, JSON, MIDI, or PDF.

## 2. Core feature: real-time key and chord detection

### Signal pipeline (all client side, Web Audio API)

```
mic (getUserMedia, echoCancellation/noiseSuppression/AGC OFF)
  -> AudioWorklet (ring buffer, 48 kHz, hop 1024 ≈ 21 ms)
  -> Worker: STFT (8192 window, Hann) or Constant-Q transform
  -> harmonic-weighted chroma / HPCP (12 pitch classes, A4 configurable)
  -> onset gate + energy gate (ignore silence, ignore the attack transient)
  -> chord template matching (cosine similarity against chord vocabulary)
  -> temporal smoothing (HMM / Viterbi over last ~1 s, transition penalty)
  -> key estimation (Krumhansl-Schmuckler on a 10–20 s decaying chroma
     histogram, with hysteresis so the key only flips on strong evidence)
  -> UI state (chord, key, confidence, bass note, detected pitch classes)
```

Target end-to-end latency: 100–200 ms. Chord updates feel "on the beat".

### Chord vocabulary (configurable)

- Level 1 (pop): maj, min, dim, aug, sus2, sus4
- Level 2 (default): + maj7, min7, dom7, dim7, m7b5, 6, m6, add9
- Level 3 (jazz): + 9, maj9, min9, 11, 13, alt, slash chords with explicit bass

### Instrument profiles

- **Piano**: strong harmonics and long sustain. Harmonic down-weighting in the
  chroma, longer smoothing window, bass note taken from lowest strong partial.
- **Guitar**: shorter sustain, strummed attacks. Shorter window, more
  aggressive onset gating, capo offset applied before display.

### Optional exact input: Web MIDI

If the piano is digital and connected over USB, Web MIDI gives exact note-on /
note-off events. Chord and key detection become essentially perfect and
latency-free. The mic pipeline stays as fallback for acoustic piano and guitar.

## 3. Screens

### 3.1 Jam screen (the only screen during a jam)

```
┌─────────────────────────────────────────────────────────┐
│  ● LISTENING        Key: G major  (vi = Em)   ▮▮▮▮▯ 87% │
│                                                         │
│                       Cmaj7                             │
│                        IV                               │
│                  ▏C  E  G  B ▕   bass: C                │
│                                                         │
│  G    D    Em   C   | G    D    Em   Cmaj7  | ...       │
│  I    V    vi   IV  | I    V    vi   IV                 │
│                                                         │
│  Try next:  D (V)   Am (ii)   Bm (iii)   C/E            │
│  ─────────────────────────────────────────────────────  │
│  [■ stop]   [⟲ reset]   [♩ metronome]   [🎹 keys]       │
└─────────────────────────────────────────────────────────┘
```

- Huge chord name, roman numeral under it, chord tones and bass note.
- Horizontal timeline of recent chords. Grouped into bars when a tempo is
  known (metronome on, or beat tracking on). Repeats are compressed:
  `| G D Em C | ×4`.
- "Try next" suggestions: diatonic chords, circle-of-fifths neighbours,
  secondary dominants, common borrowed chords. Tap one to hear it.
- Optional overlays: on-screen piano keyboard lighting detected notes, or a
  guitar fretboard with the chord shape.
- Keyboard shortcuts: Space start/stop, R reset timeline, M metronome,
  K keyboard overlay, N toggle roman numerals.

### 3.2 Review screen (after the jam)

- Full chord timeline for the session with timestamps.
- Audio playback of the session (if recording was enabled) synced to the
  chord timeline, so "that nice bit at 2:35" can be found and read back.
- Edit chords by hand when detection was wrong (tap a chord to fix it).
- Name the idea, tag it, save it to the library.
- Export: plain text chord chart, ChordPro, MIDI (chords as block voicings),
  PDF chord sheet, JSON.

### 3.3 Library

- Saved ideas and songs, searchable by name, key, tag, date.
- Transpose any chart; capo calculator for guitar.
- Open any saved progression in the backing track player.

### 3.4 Practice / tools

- **Backing track player**: pick a progression, tempo, and style (pad, piano
  comping, bass + drums); loops it with Web Audio synthesis so you can solo
  over it.
- **Drone**: sustained root / fifth of the current key.
- **Metronome** with tap tempo, subdivisions, and count-in.
- **Tuner** (guitar): reuses the pitch pipeline.
- **Scale helper**: for the current chord and key, show which scales and
  modes fit (e.g. Dm7 in C: D dorian). Rendered on piano keys or fretboard.
- **Ear training**: app plays a progression, you name the chords / key.
- **Random progression generator** in a chosen key and style for jam prompts.

### 3.5 Analyze a file

- Drop an audio file (mp3, wav, m4a): run the same pipeline offline and
  produce key + chord chart. Useful for learning a song before jamming on it.

### 3.6 Settings

- Instrument profile, chord vocabulary level, A4 reference (440/442),
  input device, sensitivity / noise gate, notation (sharps vs flats, roman
  numerals vs Nashville numbers), minor-key convention, theme.

## 4. Tech stack (proposed)

- Vite + React + TypeScript, Tailwind for styling.
- Audio: Web Audio API, AudioWorklet for capture, Web Worker for DSP
  (no third-party audio library required; optionally `essentia.js` for a
  proven HPCP + chord detector, or Meyda for feature extraction).
- MIDI: Web MIDI API (Chrome / Edge only; Safari lacks it).
- Storage: IndexedDB via Dexie. No backend, no login.
- Installable PWA so it works full-screen on an iPad or phone on the stand.
- Deployment: static site (Vercel, Netlify, or GitHub Pages).

## 5. Phases

1. **MVP**: mic → live chord + key + timeline, instrument profile, roman
   numerals, chord vocabulary level 2, save/export as text. Dark jam screen.
2. **Capture**: session recording, review screen with sync, manual chord fix,
   library, transpose, PDF/MIDI export.
3. **Play along**: metronome, beat-aligned bars, backing track player,
   drone, "try next" suggestions, scale helper.
4. **Extras**: Web MIDI input, file analysis, tuner, fretboard, ear training.

## 6. Decisions (2026-10-22)

| Topic | Decision |
|---|---|
| Input | Mic **and** Web MIDI both in phase 1. MIDI is Chrome/Edge on laptop only; iPad Safari uses mic. |
| Devices | Laptop (Chrome) and iPad (Safari). Installable PWA, layout works on both. |
| Chord vocabulary | All three levels implemented; user picks the level in settings and on the jam screen. Default level 2. |
| Notation | Roman numerals always shown. Spelling follows the key. Chord tones + bass in small text. Key shown as major/relative-minor pair with the stronger one bold. |
| Timing | Untimed chord sequence with repeats compressed in MVP. Bar alignment later. |
| Recording | Session audio recording, opt-in toggle per session, stored locally only. |
| Play-along | Not in scope for now (no backing looper, drone, metronome). |
| Live helpers | Try-next chord suggestions and live scale helper on the jam screen. |
| Extras | Analyze audio files (mp3 etc.), ear training. Guitar fretboard/tuner/capo deferred. |
| Review | Session summary (keys, repeated progressions, sections), modulation hints, song-structure markers (verse/chorus/bridge). |
| Storage | Local-first in IndexedDB, plus cloud sync via Supabase with Google login. Chord data syncs; audio does not. |
| Stack | Vite + React + TypeScript + Tailwind, static deploy on Vercel. |
| Misc | English UI, A4 = 440 Hz default, low-confidence shows a dash instead of a guess. |


### Decisions, round 2

| Topic | Decision |
|---|---|
| Setups | (a) Digital piano over USB with speakers on: MIDI primary, mic available. (b) Acoustic piano: mic only. Input device selector in settings. |
| Contexts | Solo; band jam with friends; jamming along to a song playing in the room; singing while playing. Explicit **Solo / Room** mode switch: Room mode uses the mic mix, reports the room key, and down-weights the vocal range for chord detection. |
| Style | Pop/rock/ballads and jazz/neo-soul/R&B. Default chord level 2; suggestion engine includes ii-V-I, tritone subs, borrowed iv/bVII, and secondary dominants. |
| MIDI capture | Record full MIDI performance with playback through a built-in piano sound; piano roll view with scrub and chord-at-moment; lead sheet rendering (chords + melody from MIDI). MIDI/MusicXML export deferred. |
| Control | One hand is free during jams. Large touch/click targets, keyboard shortcuts. No pedal, gesture, or voice control. |
| Detection | Show inversions as slash chords (C/E). Key history shown on the timeline at each modulation. On-screen piano with detected notes in the MVP. |
| Helpers | Voicing suggestions for the current chord (rootless, shell, spread, drop-2). Reharmonization of captured progressions. Practice stats (time played, keys and progressions used most). Jam prompt deferred. |
| Sharing | Public read-only share link for a chart via Supabase. PDF/Notion export deferred. |
| Vocals | Melody tracking of the voice deferred; for now vocals are filtered out of chord detection in Room/singing mode. |

### Revised phases

1. **MVP** (this build): mic + MIDI input, live chord/key with slash chords, on-screen piano, jam screen with timeline and key history, roman numerals, chord level selector, try-next suggestions, Solo/Room mode, local save, text/JSON export.
2. **Capture** (this build, same wave of PRs): MIDI performance recording + playback, piano roll, opt-in audio recording, review screen with synced playback, manual chord fix, structure markers, session summary, library.
3. **Insight** (user's top priority next): live scale helper, voicing suggestions, modulation hints, reharmonization, transpose, lead sheet rendering.
4. **Sync + share**: Supabase sync with Google login, public share links, practice stats.
5. **Extras**: analyze audio files, ear training, vocal melody tracking, MIDI/MusicXML export, guitar tools.

Detailed engineering plan, contracts, and PR breakdown: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).
