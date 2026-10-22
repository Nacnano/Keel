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
