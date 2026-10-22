# src/data — local data (WS-F)

IndexedDB storage (Dexie 4), the live session recorder, audio recording, and
text/JSON export and import. Row shapes are the frozen contracts in
`src/core/session.ts`. Import from `@/data`.

| Module               | What it does                                                                |
| -------------------- | --------------------------------------------------------------------------- |
| `db.ts`              | `jamkey` database v1, `db` (lazy, safe to import) and `openDb()`            |
| `sessionRecorder.ts` | `startSession(meta)`: dedupes and buffers events, flushes every 2 s         |
| `summary.ts`         | Pure `computeSummary(chords, keys, markers, durationSec)`                   |
| `audioRecorder.ts`   | `createAudioRecorder(stream, opts)`: MediaRecorder, 30 min cap, 25 min warn |
| `stats.ts`           | Pure `computeStats(sessions, { since, now })`: time, days, streaks, keys    |
| `repo.ts`            | List/search, rename, tags, soft delete, chord/marker edits, settings, stats |
| `export.ts`          | `toText`, `toJSON`, `fromJSON`                                              |
| `cycles.ts`          | Repeat detector (2–8 chords) for summary and text chart (`@/theory`)        |
| `chordSymbol.ts`     | Chord/key names for export (`@/theory`)                                     |
| `migrations.md`      | How to bump the Dexie version safely                                        |

## Tables (v1)

| Table        | Primary key | Indexes                                      |
| ------------ | ----------- | -------------------------------------------- |
| `sessions`   | `id`        | `createdAt`, `updatedAt`, `deleted`, `*tags` |
| `chords`     | `id`        | `[sessionId+t]`                              |
| `keys`       | `id`        | `[sessionId+t]`                              |
| `markers`    | `id`        | `[sessionId+t]`                              |
| `midiTracks` | `sessionId` | (one row per session)                        |
| `recordings` | `sessionId` | (one audio blob per session)                 |
| `settings`   | `key`       | `{ key, value }`                             |

IndexedDB cannot index booleans, so rows never show up in the `deleted` index.
Filter on `deleted` in JS (see migrations.md).

## Recording a jam

```ts
import { clock } from '@/core/clock';
import { createAudioRecorder, startSession } from '@/data';

const session = startSession({
  mode: 'solo',
  instrument: 'piano',
  vocabLevel: 2,
  clock: clock.now,
});
const offA = engine.subscribe(session.onAnalysisEvent);
const offM = midi.onEvent(session.onMidiEvent);
const audio = recordAudio ? createAudioRecorder(input.getStream()!) : null;
audio?.start();

session.addMarker('bookmark'); // "that nice bit"

// on stop
offA();
offM();
if (audio) {
  const take = await audio.stop();
  await session.setAudioBlob(take.blob, take.mimeType, take.durationSec);
}
const saved = await session.stop(); // Session with summary
```

- Times: session `t` = `event.t - t0`. `t0` is `meta.t0`, else `clock()` at
  start when a `clock` is passed, else the first event's `t`. Analysis events
  and MIDI events must share one clock base (WS-G maps MIDI timestamps with
  `clock.fromPerformanceMs`).
- Chord rows are written only when the chord changes (root, quality, bass;
  `null` counts as a change). Key rows only when tonic or mode changes.
  `notes` and `level` events only advance the session clock.
- Writes: buffered, one `bulkAdd` transaction every 2 s, plus on `stop()`. All
  writes go through one serial queue, so `stop()` racing a flush cannot lose or
  duplicate rows. A failed flush keeps its rows for the next attempt.
- MIDI: one `MidiTrack` row, checkpointed every 30 s while new events arrive
  and written in full on `stop()`. Rewriting the whole track every 2 s would be
  O(n²) over a long jam.
- Duration: `stop({ endT })` if given, else the latest of clock time, last
  event time and wall-clock elapsed. Never shorter than the audio take.
- Measured under fake-indexeddb: 5,000 chords + 50,000 MIDI events flush and
  stop in about 150 ms.

## Summary

`computeSummary` gives seconds per key (from key-change segments to
`durationSec`), the top 5 repeating progressions (cycles of 2–8 chords with at
least two consecutive passes, rotations merged, ranked by total passes), the
non-null chord count and the bookmark count. `repo` recomputes it after every
chord or marker edit.

## Export / import

- `toText(full)`: chord chart with header, key, `[section]` prefixes from
  structure markers, `| C G Am F | ×4` repeat compression, `→ A minor at 2:35`
  modulation lines and a bookmarks line. Spelling uses flats in flat keys.
- `toJSON(full)`: `{ version: 1, session, chords, keys, markers, midiTrack }`.
  Audio is never exported.
- `fromJSON(jsonOrObject)`: validates, gives every row a fresh uuid, remaps
  `sessionId`, writes in one transaction, returns the new session id. Unknown
  versions throw `ImportError` with a clear message.

## Tests

`src/data/**/*.test.ts` run in the vitest `dom` project. Import
`./testing/setup` first: it installs `fake-indexeddb/auto` and exports
`resetDb()` and `cloneableBlob()` (jsdom's `Blob` does not survive
fake-indexeddb's structured clone).

## Theory integration

`chordSymbol.ts` and `cycles.ts` re-export `chordSymbol`, `chordKey`, `keyName`,
`findCycles`, `canonicalRotation` and `collapseRuns` from `@/theory`. Text export spells
chords for the key in force (`Bb` in F major, neutral `C# Eb F# Ab Bb` with no key).
