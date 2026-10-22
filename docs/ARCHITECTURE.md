# Architecture (condensed)

Full detail: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

```
mic ──► audio/ (AudioWorklet → DSP worker → ChromaFrame) ─┐
                                                          ├─► analysis/ (templates + HMM, key) ─► AnalysisEvent ─► state/ ─► ui/
USB MIDI ─► midi/ (held notes → exact ChromaFrame) ───────┘                                            │
            midi/ recorder + piano player                                                         data/ (Dexie)
                                                                                                       │ optional
                                                                                         sync/ (Supabase: LWW sync, share links)
theory/  pure music theory used by analysis, ui, data
```

## Contracts

`src/core/types.ts` and `src/core/session.ts` are the only shared surface
between workstreams. They are frozen after PR 1. Highlights:

- `ChromaFrame` — 12-bin chroma + energy + bass + onset + `exact` (MIDI).
- `AnalysisEngine.push(frame)` → emits `AnalysisEvent` (`chord` | `key` | `notes` | `level`).
- `AudioInput`, `MidiInput`, `MidiPlayer` — device-facing interfaces.
- `Session`, `ChordRecord`, `KeyRecord`, `Marker`, `MidiTrack`, `AudioRecording`, `Settings` — IndexedDB rows.

## Helpers in `src/core`

- `events.ts` — `createEmitter<T>()` for every subscribe/onX.
- `clock.ts` — shared seconds clock (AudioContext when attached).
- `mocks.ts` — `createMockAnalysisStream()` and session fixtures; the jam screen uses them under `?mock=1`.
- `testing/synth.ts` — deterministic chord synthesis for DSP tests; `testing/midi.ts` — MIDI fixtures.

## Build

Vite 8 + React 19 + TS 6, Tailwind 4, vite-plugin-pwa, Vitest 4 with two
projects (`node` for core/theory/audio/analysis/midi, `jsdom` for ui/state/data/app/sync).
Workers use ES format; load worklets/workers with `new URL('./x.ts', import.meta.url)`.

## Sync (optional)

`src/sync/` pushes and pulls whole sessions (row + chords, keys, markers, MIDI)
to Supabase by `updatedAt`, last write wins, soft deletes only; audio never
leaves the device. Inert unless `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
are set; `@supabase/supabase-js` is a lazy chunk. Algorithm and limits:
[`src/sync/README.md`](../src/sync/README.md). Setup:
[`supabase/README.md`](../supabase/README.md).
