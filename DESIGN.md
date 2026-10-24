---
name: Keel
description: A calm listening utility for live chord and key recognition.
colors:
  bg: '#f5f5f7'
  bg-2: '#ffffff'
  bg-3: '#ededf0'
  surface: '#ffffff'
  surface-2: '#f2f2f7'
  label: '#1d1d1f'
  label-2: '#63636b'
  label-3: '#6e6e73'
  accent: '#0059c7'
  action: '#005ecb'
  danger-action: '#bd2821'
  accent-fg: '#ffffff'
  live: '#c92720'
  ok: '#34c759'
  warn: '#ff9500'
  fill-3: 'rgba(120, 120, 128, 0.12)'
  separator: 'rgba(60, 60, 67, 0.18)'
  material: 'rgba(249, 249, 249, 0.78)'
  bg-dark: '#1c1c1e'
  bg-2-dark: '#202022'
  bg-3-dark: '#252527'
  surface-dark: '#2c2c2e'
  surface-2-dark: '#2c2c2e'
  label-dark: '#ffffff'
  label-2-dark: '#aaaab2'
  label-3-dark: '#98989f'
  accent-dark: '#70b1ff'
  accent-fg-dark: '#ffffff'
  live-dark: '#ff6961'
  ok-dark: '#30d158'
  warn-dark: '#ff9f0a'
  fill-3-dark: 'rgba(120, 120, 128, 0.24)'
  separator-dark: 'rgba(154, 154, 160, 0.22)'
  material-dark: 'rgba(28, 28, 30, 0.72)'
typography:
  title-1:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '1.75rem'
    lineHeight: 1.22
    letterSpacing: '-0.015em'
  title-3:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '1.25rem'
    lineHeight: 1.25
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '1.0625rem'
    fontWeight: 600
    lineHeight: 1.3
  title-2:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '1.375rem'
    lineHeight: 1.27
    letterSpacing: '-0.01em'
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '1.0625rem'
    lineHeight: 1.35
  subhead:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '0.9375rem'
    lineHeight: 1.35
  footnote:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '0.8125rem'
    lineHeight: 1.35
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', ui-sans-serif, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: '0.75rem'
    lineHeight: 1.35
rounded:
  control: '10px'
  cell: '12px'
  card: '16px'
  sheet: '20px'
spacing:
  2: '8px'
  3: '12px'
  4: '16px'
  6: '24px'
  8: '32px'
components:
  button-primary:
    backgroundColor: '{colors.action}'
    textColor: '{colors.accent-fg}'
    rounded: '{rounded.control}'
    height: '44px'
    padding: '0 16px'
  button-primary-large:
    backgroundColor: '{colors.action}'
    textColor: '{colors.accent-fg}'
    rounded: '{rounded.control}'
    height: '48px'
    padding: '0 24px'
  button-gray:
    backgroundColor: '{colors.fill-3}'
    textColor: '{colors.label}'
    rounded: '{rounded.control}'
    height: '44px'
    padding: '0 16px'
  grouped-list:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.cell}'
---

# Design System: Keel

## Overview

**Creative North Star: "Apple recording utility"**

Keel follows the user-pinned Voice Memos / GarageBand utility direction: modern, calm and uncomplicated. Native system typography, semantic light/dark surfaces, grouped controls and restrained blue actions support use at a piano bench. These are interface references, with no Apple affiliation implied.

The shipped system uses a persistent window toolbar, readable secondary labels and quiet grouped surfaces. Listening options stays in the toolbar throughout the session; the live chord remains the largest element. A tentative chord is dimmed and an insufficient estimate is withheld. Screenshots and the demo establish interface behavior, not real-instrument accuracy.

**Key Characteristics:**

- Semantic light and dark surfaces.
- One dominant action and an oversized live chord.
- Grouped controls, labeled SVG icons and responsive sheets.
- Compact toolbar titles, restrained rectangular actions and quiet empty states.

Recorded from the shipped 2026-10-24 refinement: `src/index.css`, `src/app/AppShell.tsx`, `src/ui/screens/JamScreen.tsx`, `src/ui/screens/jam/`, `src/ui/kit/`, Tools and Settings. `PRODUCT.md` owns durable product truth. The direction contract is `.context/design-direction.md`. Historical seed `95cde4f4` remains in `.context/design-seed-95cde4f4.txt`; the user-pinned Apple-native direction takes precedence. This refinement has no new roll or approved image comp. Reference captures in `.context/` include `listen-desktop-light.png`, `listen-desktop-dark.png`, `listen-phone-light.png`, `listen-phone-dark.png`, `options-desktop-light.png`, `options-phone-light.png`, `tools-desktop-light.png`, `settings-desktop-light.png`, `library-desktop-light.png` and `review-phone-light.png`. Validation is recorded in `.context/design-validation.md`. No raster asset ships in the interface.

## Colors

A neutral surface system carries a blue action/notation family and semantic status colors. Frontmatter values without a suffix are light-mode values from `:root`; `-dark` values replace their corresponding roles under `.dark`. CSS custom properties remain the runtime source of truth. Action and danger-action inherit unchanged in dark mode.

### Primary

- **Accent blue** (`accent`): notation, active navigation, plain actions and selection tints.
- **Action blue** (`action`): filled controls with white `accent-fg`, including Start listening and Finish & save.

### Neutral

- **Canvas** (`bg`, `bg-2`, `bg-3`): primary page and sidebar grounds.
- **Surface** (`surface`, `surface-2`): grouped rows and raised control materials.
- **Labels** (`label`, `label-2`, `label-3`): main text, readable explanations and quiet supporting labels/icons. Tertiary labels remain legible on both themes.
- **Quiet fill and seam** (`fill-3`, `separator`): control wells and hairline separation.
- **Material** (`material`): translucent navigation, with saturate(180%) blur(20px).

Red `live` denotes live/error/destructive text and `danger-action` supports destructive filled actions. Green `ok` and orange `warn` remain semantic status roles; text communicates the state as well.

**The Action Contrast Rule.** Use action for a filled control with white text; use accent for text, selection and notation. Dark mode changes accent while action retains its light-root value.

## Typography

**Display Font / Body Font:** the native system stack in frontmatter. The system font is intentional for this user-pinned native utility; no external font request is needed. Numerals and session duration use tabular figures where specified.

### Hierarchy

- **Live chord:** `clamp(96px, 13vw, 208px)`, semibold, line-height 1, tracking -0.03em. Fixed row height reserves 1.1 times the base symbol size. Symbols longer than five characters shrink to 0.8 / 0.64 / 0.52 of the base size at the component's length thresholds.
- **Page title:** title-3 (20px / 1.25), semibold with tight tracking, in the persistent toolbar.
- **State heading:** title-1 (28px), semibold; idle and finished Listen states use 1.25 line-height and tight tracking.
- **Headline / body:** 17px with 1.3 / 1.35 line-height; headline weight 600.
- **Subhead:** 15px / 1.35 for control and supporting labels.
- **Footnote / caption:** 13px / 1.35 and 12px / 1.35, respectively.
- **Live numeral:** headline (17px) on phones and title-3 (20px) from 640px, accent blue; chord detail uses 36px / 48px at those widths.

The title-1 and title-3 roles keep utility and state headings compact. The oversized live chord is a functional readout; it is not a precedent for promotional display headings.

**The Bench Hierarchy Rule.** The live chord dominates. Roman numeral and key remain subordinate; long chord symbols scale down without wrapping.

## Layout

At 1024px and wider, the shell uses a 208px sidebar with Listen, Library and Tools, plus Settings pinned at its foot. Below that width, three persistent bottom tabs carry Listen, Library and Tools; Settings is in Tools. A live-session return banner appears on other routes while listening. Screens own their scrolling.

The shared page toolbar stays sticky at the top with a 64px minimum height, a 20px title and 16px horizontal padding growing to 24px at 640px. It can wrap when actions need space. Listen and shared pages use a centered 768px content cap; Listen has 16px horizontal insets. The idle mode selector and start-action column cap at 288px. The live chord region has a 260px minimum height, increasing to 340px at 640px. Shared page content begins 28px below the toolbar, increasing to 36px at 640px. Repeated gaps and padding follow 8, 12, 16, 24 and 32px steps, with smaller utility increments where necessary.

Listening options is a centered dialog from 640px and a bottom sheet below it. The generic automatic sheet placement becomes a 380px side panel at 1024px; narrow screens use bottom sheets capped at 82vh. Centered dialogs cap at 440px and 92vw, with a maximum height of the dynamic viewport minus 32px. Scrollable sheet bodies and bottom bars account for safe-area insets. Listening controls wrap instead of forcing horizontal overflow.

## Elevation & Depth

Ordinary content relies on tonal layering, inset 0.5px hairlines and grouped surfaces. Overlays use the `--jk-shadow` elevated token: light `0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06)`; dark `0 14px 40px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.35)`. Modal sheets use a black 40% scrim and 2px backdrop blur. Segmented selection and slider thumbs have localized small shadows.

**The Surface Depth Rule.** Use tonal surfaces and hairlines for ordinary content; reserve elevated shadows for overlays and selection affordances.

## Shapes

Controls use 10px corners, inset grouped containers 12px, cards 16px and sheets 20px. Main listening actions use the 10px rectangular control shape. Passive status badges and the sheet close button retain their native pill/circular forms. Segmented controls have their own compact track/selection geometry. Borders and hairline seams separate real groups; repeated decorative frames are not part of the system.

## Components

### Buttons

The kit supports filled, tinted, gray and plain variants. Medium controls are 44px high with 16px horizontal padding; large controls are 48px with 24px padding. Both medium and large actions use 10px corners. Small mouse controls are 32px and expand to at least 44px on coarse pointers. Filled buttons brighten on hover and darken on activation; other variants change their fills. Pressed buttons expose `aria-pressed`, loading sets `aria-busy` and disables activation, and disabled controls use 40% opacity. Global focus is a 2px accent outline with a 2px offset. Press feedback changes color or brightness over a 150ms ease-out transition; buttons do not scale.

### Grouped containers and fields

Groups use surface backgrounds, 12px corners and hairline-separated rows, with title-case 13px medium-weight group headings and optional explanatory footers. Rows have a 44px minimum height and 16px side padding. Sliders and segmented selections can stack below labels so explanations remain readable. Native selects keep keyboard and touch behavior; the regular select is 44px high. Error fields use associated validation text rather than color alone.

### Empty states

Empty-state icons are quiet unframed SVGs: 48px glyphs with 1.25px strokes in a 64px slot, using label-3. A 20px semibold title, 15px explanation and a clear action complete the pattern. The Listen idle state uses the same quiet stroke treatment with a 64px waveform above its 28px state heading.

### Navigation and badges

Active sidebar items use a neutral fill-3 background and label text, with only the 18px SVG icon in accent blue; inactive items use label-2. Mobile tabs pair 24px SVG icons with 12px labels and a 56px minimum height. Active routes expose `aria-current`. Badges are 24px-high passive status pills, including the explicit Demo label; they are not touch controls. Use SVG icons with visible labels or accessible names.

### Sheets

Listening options is modal: focus moves into the panel, Tab stays within the active modal, the app root becomes inert, Escape or scrim closes it, and focus returns to the invoker. Stacked modals retain the correct focus owner. Ideas is modeless, preserving access to the live session. The sheet uses the canvas background so grouped surface rows remain distinct, and its header includes a named close button. Motion uses the shared expo easing: fade 180ms, rise 260ms, side slide 280ms, bottom slide 320ms. Reduced-motion preference collapses animation and transition durations.

### Listening flow and permissions

The primary path is Start listening → connecting → play a chord → live chord/key/progression → Finish & save → saved confirmation → Open session. The initial surface requires no setup: quiet waveform icon, compact headline, one line, the Just me · With a band choice (settings `mode`), Start listening, Try a demo and one privacy line. Listening options is a named icon button in the persistent Listen toolbar in idle, live and finished states. The mode selector uses 44px segments; the primary start action is 48px high. Idle, listening and finished share one centred axis; Ideas overlays it and never shifts it. Microphone access starts only on activation; a failure returns a clear error and Try again. The default start asks for microphone access, while MIDI is attempted only after explicit device selection or an existing MIDI grant. Settings provides device discovery and selection. A pending permission response cannot start an abandoned session.

Try a demo runs a labeled example progression without microphone access or persistence. It keeps playing when you visit another screen (the shell shows "Demo in progress · Return to your jam", as it does for live listening). Switching to live stops the example and removes demo mode. Live input shows its source and level, a timer, chord symbol, Roman numeral, key and timeline. The hierarchy is chord, then "Key C major" (title-2 on phones, title-1 wider; tap for alternatives with % scores), then the numeral. At insufficient confidence it asks the musician to play or hold a chord; below the detector threshold the display withholds a guess. A tentative estimate (confidence < 0.6) is shown dimmed; there is no match-strength text. After four quiet seconds below level 0.06, a positioning/sensitivity hint appears for live microphone input.

Listening options holds only how Keel listens and what it shows: Microphone sensitivity (Quieter room … Soft playing), Listen to (Just me / With a band), Record audio, Chord detail (Simple / With 7ths / Everything) and Show keyboard (not offered on phones, where the keyboard is hidden while listening). Record audio is chosen before a live session and locks while starting/listening; demo cannot record. Ideas holds next-chord, scale, voicing and modulation help; it always starts closed (only its tab is remembered), docks at the side from 1440px and is a half-height sheet below that, with the chord, key and Finish kept above it. Mark sits beside Finish & save and opens a small menu: Bookmark · Intro · Verse · Chorus · Bridge · Outro. The new flag in the timeline confirms it; plain toasts never take taps.

Finish & save releases microphone/MIDI resources and saves the chart locally. Saving, success, save failure and empty completion have distinct text, and the finished screen is the only save message (no extra toast); Open session › appears only with a saved session. Sessions are named after the key heard longest ("Jam in C major", or "Jam"); the date is shown next to the name, never in it. The screen stays awake while listening (Screen Wake Lock, re-taken when the page becomes visible). A failure does not claim success. Audio is optional and stays local; configured account sync can sync chord data. The privacy copy must preserve that distinction.

Space starts/finishes, B bookmarks, 1/2/3 changes detail, P toggles keyboard, M changes mode, I opens Ideas, and N/S/V/K selects its tabs. Shortcuts ignore text fields, modifier combinations and modal dialogs.

## Do's and Don'ts

### Do:

- **Do** keep primary actions and navigation at least 44px high; large listening actions are 48px.
- **Do** show a tentative chord by dimming the glyph, never with a changing line of text.
- **Do** use the supplied semantic tokens for both themes and preserve visible keyboard focus.
- **Do** keep the demo explicitly labeled and separate from microphone access and saving.

### Don't:

- **Don't** invent accuracy claims or Apple affiliation.
- **Don't** rely on color alone to communicate chord confidence or recording state.
- **Don't** promote compact legacy control dimensions into the touch target standard.

Not canonized: the unused idle music-note glyph in ChordDisplay is a legacy defect, not an icon-system precedent. Oversized system-font promotional display treatment is not a reusable rule; system typography here is the user-pinned native utility voice, with an oversized chord solely as a musical readout. Compact fine-pointer controls do not lower the 44px touch-target requirement.

<!-- Historical sections 1–6 are retained verbatim below; shipped visual guidance precedes them. Their proposed screen layouts and phase labels are historical, not current UI requirements. -->

# Historical product design and roadmap (2026-10-22)

> Status 2026-10-22: built. All phases below are implemented and merged (PRs 1–19 in
> [`docs/PR_LOG.md`](docs/PR_LOG.md)). Hardware verification and the Supabase project are
> the user's remaining steps; see [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md).

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

| Topic            | Decision                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input            | Mic **and** Web MIDI both in phase 1. MIDI is Chrome/Edge on laptop only; iPad Safari uses mic.                                                             |
| Devices          | Laptop (Chrome) and iPad (Safari). Installable PWA, layout works on both.                                                                                   |
| Chord vocabulary | All three levels implemented; user picks the level in settings and on the jam screen. Default level 2.                                                      |
| Notation         | Roman numerals always shown. Spelling follows the key. Chord tones + bass in small text. Key shown as major/relative-minor pair with the stronger one bold. |
| Timing           | Untimed chord sequence with repeats compressed in MVP. Bar alignment later.                                                                                 |
| Recording        | Session audio recording, opt-in toggle per session, stored locally only.                                                                                    |
| Play-along       | Not in scope for now (no backing looper, drone, metronome).                                                                                                 |
| Live helpers     | Try-next chord suggestions and live scale helper on the jam screen.                                                                                         |
| Extras           | Analyze audio files (mp3 etc.), ear training. Guitar fretboard/tuner/capo deferred.                                                                         |
| Review           | Session summary (keys, repeated progressions, sections), modulation hints, song-structure markers (verse/chorus/bridge).                                    |
| Storage          | Local-first in IndexedDB, plus cloud sync via Supabase with Google login. Chord data syncs; audio does not.                                                 |
| Stack            | Vite + React + TypeScript + Tailwind, static deploy on Vercel.                                                                                              |
| Misc             | English UI, A4 = 440 Hz default, low-confidence shows a dash instead of a guess.                                                                            |

### Decisions, round 2

| Topic        | Decision                                                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setups       | (a) Digital piano over USB with speakers on: MIDI primary, mic available. (b) Acoustic piano: mic only. Input device selector in settings.                                                                                                     |
| Contexts     | Solo; band jam with friends; jamming along to a song playing in the room; singing while playing. Explicit **Solo / Room** mode switch: Room mode uses the mic mix, reports the room key, and down-weights the vocal range for chord detection. |
| Style        | Pop/rock/ballads and jazz/neo-soul/R&B. Default chord level 2; suggestion engine includes ii-V-I, tritone subs, borrowed iv/bVII, and secondary dominants.                                                                                     |
| MIDI capture | Record full MIDI performance with playback through a built-in piano sound; piano roll view with scrub and chord-at-moment; lead sheet rendering (chords + melody from MIDI). MIDI/MusicXML export deferred.                                    |
| Control      | One hand is free during jams. Large touch/click targets, keyboard shortcuts. No pedal, gesture, or voice control.                                                                                                                              |
| Detection    | Show inversions as slash chords (C/E). Key history shown on the timeline at each modulation. On-screen piano with detected notes in the MVP.                                                                                                   |
| Helpers      | Voicing suggestions for the current chord (rootless, shell, spread, drop-2). Reharmonization of captured progressions. Practice stats (time played, keys and progressions used most). Jam prompt deferred.                                     |
| Sharing      | Public read-only share link for a chart via Supabase. PDF/Notion export deferred.                                                                                                                                                              |
| Vocals       | Melody tracking of the voice deferred; for now vocals are filtered out of chord detection in Room/singing mode.                                                                                                                                |

### Revised phases

1. **MVP** (this build): mic + MIDI input, live chord/key with slash chords, on-screen piano, jam screen with timeline and key history, roman numerals, chord level selector, try-next suggestions, Solo/Room mode, local save, text/JSON export.
2. **Capture** (this build, same wave of PRs): MIDI performance recording + playback, piano roll, opt-in audio recording, review screen with synced playback, manual chord fix, structure markers, session summary, library.
3. **Insight** (user's top priority next): live scale helper, voicing suggestions, modulation hints, reharmonization, transpose, lead sheet rendering.
4. **Sync + share**: Supabase sync with Google login, public share links, practice stats.
5. **Extras**: analyze audio files, ear training, vocal melody tracking, MIDI/MusicXML export, guitar tools.

Detailed engineering plan, contracts, and PR breakdown: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).
