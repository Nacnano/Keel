# `src/midi/` — Web MIDI input, recorder, piano player (WS-D)

Exact input path for digital pianos over USB. Produces `MidiEvent`s and
`ChromaFrame`s with `exact: true`, so the analysis engine can skip spectral
guesswork.

| Module             | What it does                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `parse.ts`         | Pure parser: raw bytes + `timeStamp` → `MidiEvent \| null` (note on/off, vel-0 = off, CC).       |
| `heldNotes.ts`     | Pure held-note model: key down OR sustain down; `toFrame(t)` → velocity-weighted exact chroma.   |
| `midiInput.ts`     | `createMidiInput(): WebMidiInput` (`MidiInput` + `onDevicesChange`, `getDeviceId`, `heldNotes`). |
| `recorder.ts`      | `createMidiRecorder()` → events relative to session start, `toTrack(sessionId)`.                 |
| `schedule.ts`      | Pure scheduling: `resolveSustain`, `scheduleWindow`, `soundingAt`.                               |
| `player.ts`        | `createMidiPlayer(ctx?)`: smplr SplendidGrandPiano, look-ahead scheduler, `onTick` 30 Hz.        |
| `chordAudition.ts` | `playChord(player, chord, { octave, durationMs, velocity })` for "tap to hear".                  |

## Usage

```ts
import { clock } from '@/core/clock';
import { createMidiInput, createMidiRecorder, createMidiPlayer, playChord } from '@/midi';

const midi = createMidiInput();
if (midi.isSupported()) {
  const [device] = await midi.listDevices(); // triggers the permission prompt
  await midi.connect(device.id);
  midi.onFrame((f) => engine.push(f)); // exact ChromaFrame, ≤ 1 per 20 ms
}

const rec = createMidiRecorder();
rec.start(clock.now());
midi.onEvent((e) => rec.push(e));
// …
rec.stop(clock.now());
await db.midiTracks.put(rec.toTrack(session.id));

const player = createMidiPlayer(audioContext); // nothing loads until load()
await player.load({ onProgress: (p) => setProgress(p) });
player.play(track.events, { from: 0, rate: 1 });
playChord(player, { root: 7, quality: '7' });
```

## Browser support

| Browser                 | Web MIDI | Notes                                                                       |
| ----------------------- | -------- | --------------------------------------------------------------------------- |
| Chrome / Edge (desktop) | Yes      | Permission prompt on first `requestMIDIAccess`. Requires a secure context.  |
| Chrome (Android)        | Yes      | USB-OTG keyboards work.                                                     |
| Firefox (desktop)       | Yes      | Since v108, behind a site-permission add-on prompt.                         |
| Safari (macOS / iOS)    | **No**   | `isSupported()` returns false; the UI should fall back to the mic pipeline. |

Playback (`player.ts`) only needs Web Audio and works in every modern browser,
including Safari.

## Timestamps and the shared clock

- `MIDIMessageEvent.timeStamp` is a `DOMHighResTimeStamp` on the
  `performance.now()` timeline (ms). `parseMidiMessage` converts it with
  `clock.fromPerformanceMs(ts)` from `@/core/clock`, so MIDI events, audio
  frames and session time all live on one seconds timeline. Once the
  integrator calls `clock.attachAudioContext(ctx)`, that timeline is
  `AudioContext.currentTime`.
- A timestamp of `0` (seen from some drivers / synthetic events) falls back to
  `performance.now()` at handling time.
- The recorder stores `t - t0` where `t0 = clock.now()` at session start, the
  `MidiTrack` convention (seconds from session start).
- The player runs on its own AudioContext clock and only needs relative times.

## Latency

- USB MIDI input to `midimessage` is typically 1–5 ms in Chrome. Frames are
  emitted on the leading edge of the 20 ms throttle, so the first chord change
  reaches the engine immediately; a burst (rolled chord) adds at most 20 ms
  before the final state lands.
- The player schedules 100 ms ahead on a 25 ms timer and starts 50 ms after
  `play()`, so note timing is sample-accurate even with a busy main thread.
  Pause/seek/stop take effect within one timer tick.
- Live audition (`noteOn`) plays at `currentTime`; actual output latency is the
  AudioContext's `outputLatency` (≈10–40 ms depending on OS / Bluetooth).
- Samples (~SplendidGrandPiano, all velocity layers) are fetched lazily in
  `load()`; smplr is dynamically imported, so it is a separate chunk. Sample
  URLs match the PWA runtime cache pattern in `vite.config.ts`.

## Behaviour notes

- Channels are merged; a keyboard is one instrument for chord detection.
- Sustain is CC64 ≥ 64. CC123 (all notes off) and CC120 (all sound off) are honoured.
- Unplugging the connected device releases every held note (a silent frame is
  emitted) and the device is re-attached automatically when it comes back.
- The player applies sustain up front (`resolveSustain`): note-offs under the
  pedal are deferred to the release, re-strikes close the previous voice.
  Seeking into a held chord restarts the notes sounding at that point.

## Tests

`pnpm vitest run src/midi` — node project, no Web Audio or MIDI hardware
needed (fake `navigator.requestMIDIAccess`, fake AudioContext + instrument).
