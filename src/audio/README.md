# `src/audio/`: microphone capture and chroma extraction (WS-B)

```
mic ─ getUserMedia (EC / NS / AGC off)
    └► MediaStreamSource ─► capture.worklet (mono, HOP_SIZE blocks, ctx time)
         └► main thread relay ─► dsp.worker ─► pipeline.ts ─► ChromaFrame ─► onFrame()
file ─ decodeAudioData (OfflineAudioContext) ─► mono ─► pipeline.ts ─► ChromaFrame[]
     └► offline.ts: same pipeline ─► @/analysis engine ─► chord + key events (Analyze screen)
```

The DSP is in pure modules with no DOM. The worker and `analyseSamples` run
exactly the same code, and every test runs it in node.

| Module                       | Role                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `fft.ts`                     | Own radix-2 complex FFT and a real FFT (n/2 complex FFT + twiddle split)           |
| `window.ts`                  | Periodic Hann, amplitude scale (2 / Σw)                                            |
| `peaks.ts`                   | Local maxima, log-parabolic interpolation → `{ freq, mag, curvature }`             |
| `chroma.ts`                  | HPCP-style chroma with 1/h sub-harmonic votes and a harmonic sieve                 |
| `bass.ts`                    | Lowest significant peak in 30–260 Hz → pitch class (+ confidence)                  |
| `gate.ts`                    | Energy gate (hysteresis), relative spectral-flux onset, post-onset hold            |
| `room.ts`                    | Room mode: attenuate unstable 250–1000 Hz peaks, 2-frame chroma average            |
| `profiles.ts`                | Piano / guitar parameters                                                          |
| `pipeline.ts`                | `createChromaPipeline(config).process(hop, t) → ChromaFrame \| null`               |
| `fileInput.ts`               | `analyseSamples(samples, sr, opts)` (sync, node) and `analyseFile(blob)` (browser) |
| `offline.ts`                 | `analyseFileToEvents(file, opts)`: decode, chroma, analysis engine → events        |
| `micInput.ts`                | `createMicInput(): MicInput` (implements `AudioInput` from `src/core/types.ts`)    |
| `worklet/capture.worklet.ts` | AudioWorkletProcessor, posts `{ type: 'hop', samples, t }` (transferable)          |
| `worker/dsp.worker.ts`       | Message loop around the pipeline; posts frames and timing stats                    |
| `messages.ts`                | Message types between worklet, main thread and worker                              |

## Usage

```ts
import { createMicInput } from '@/audio';

const mic = createMicInput();
button.onclick = async () => {
  // Call start() directly from the click/tap handler (Safari user-gesture rule).
  await mic.start({ deviceId, a4: 440, instrument: 'piano' });
};
const off = mic.onFrame((frame) => engine.push(frame));
mic.configure({ mode: 'room' }); // live, no restart
mic.onStats((s) => console.debug(`dsp ${s.meanMs.toFixed(2)} ms/hop, load ${s.load}`));
mic.onError((e) => showToast(e.message));
await mic.stop();
```

`start()` throws `AudioInputError` with a `code` of `unsupported`,
`permission`, `no-device`, `worklet` or `unknown`, and a message you can show
to the user. `listDevices()` returns `audioinput` devices. Their labels stay
empty until mic permission has been granted once. If the saved `deviceId` is
gone, `start()` falls back to the default mic. Calling `start({ deviceId })`
while running switches device and keeps the AudioContext.

## Offline song analysis (`offline.ts`)

```ts
import { analyseFileToEvents } from '@/audio/offline';

const { events, durationSec } = await analyseFileToEvents(file, {
  vocabLevel: 2,
  instrument: 'piano',
  mode: 'room',
  onProgress: (fraction, stage) => setProgress({ fraction, stage }), // 'decoding' | 'analysing'
  signal: abort.signal,
});
// events: chord + key AnalysisEvents, t = seconds from the start of the file
```

`decodeFileToMono` + `analyseSamplesToEvents(samples, sr, opts)` are the two halves (the
Analyze screen keeps the decoded samples so a vocabulary change does not decode again).
`analyseSamplesToEvents` is node-safe and yields to the event loop every `chunkFrames` hops
(default 256, about 12 s of audio). Differences from the live path, all offline-only:

- Event `t` is the centre of the frame's analysis window (frame `t` − (frame/2 − hop)/sr,
  ≈ 46 ms earlier at 44.1 kHz), which is where a chord change registers in the chroma.
- After the last sample, silent hops are pushed until the window is empty and the smoother
  has decided every frame, so the last chord and its end (`null` chord) are reported.
- `dropShortChords`: chords and gaps shorter than `minChordSec` (default 0.2 s) are folded into
  the chord before them. This removes the one-hop transition labels (`C/G` between C and G).
- Only `chord` and `key` events are returned (`notes` / `level` are live-display only).

Test: a synthesised C–G–Am–F progression (2 s per chord, twice) gives exactly that sequence,
each change within 0.3 s, and the key C major.

## ChromaFrame semantics

- `t` is the AudioContext time of the **first sample of the newest hop**. The frame's
  window covers `[t + hop/sr − frame/sr, t + hop/sr]`. Frames arrive every hop
  (≈ 23.4 fps at 48 kHz, ≈ 21.5 fps at 44.1 kHz). `clock` (`src/core/clock.ts`)
  is attached to the same AudioContext, so MIDI and session time line up.
- `chroma` is 12 bins (C = 0), L1-normalised. It is all zeros when the level gate is closed or the spectrum lacks tonal evidence.
- `energy` is the RMS of the newest hop mapped from −60…0 dBFS to 0…1, with a release
  (piano 0.4 s, guitar 0.15 s) so a level meter decays smoothly. Gating uses the
  raw level.
- `bass` is the lowest significant peak in 30–260 Hz, or `null` (silent or no low peak).
- `onset` is true on the hop that contains an attack. During the post-onset hold
  (the onset hop, plus the following hops that fall within `onsetHoldMs`), `chroma`
  and `bass` repeat the pre-attack values, so the attack transient is ignored.
  After silence the held values are zeros.
- `exact` is always `false` (the mic path is spectral).

## Parameters

| Parameter               | Value (default)                   | Where         | Notes                                                 |
| ----------------------- | --------------------------------- | ------------- | ----------------------------------------------------- |
| Frame (window)          | `FRAME_SIZE` = 8192, Hann         | `src/core`    | 171 ms @ 48 kHz, 186 ms @ 44.1 kHz; 5.9 / 5.4 Hz bins |
| Hop                     | `HOP_SIZE` = 2048                 | `src/core`    | 42.7 ms @ 48 kHz, 46.4 ms @ 44.1 kHz                  |
| Sample rate             | hardware (44.1k / 48k)            | `micInput.ts` | Never forced; file decode at 44.1 kHz                 |
| Peak range              | 30–5000 Hz                        | `pipeline.ts` |                                                       |
| Peak threshold          | −50 dB rel. to max, abs 1e-5      | `peaks.ts`    | max 64 peaks                                          |
| Sub-harmonic weights    | 1/h: [1, 0.5, 0.33, 0.25, …]      | `chroma.ts`   | piano H = 6, guitar H = 4                             |
| Harmonic sieve          | on, ±50 cents                     | `chroma.ts`   | f/h only voted when a peak exists near f/h            |
| Semitone spreading      | cos² between 2 nearest semitones  | `chroma.ts`   | tuned to `a4` (default 440)                           |
| Bass band / threshold   | 30–260 Hz, ≥ 0.1 × max peak       | `bass.ts`     | −20 dB, above Hann side lobes (−31 dB)                |
| Energy gate             | open ≥ −50 dBFS, close < −54 dBFS | `gate.ts`     | `gateDb` in config                                    |
| Onset threshold         | rel. flux ≥ 0.30 piano / 0.25 gtr | `profiles.ts` | flux on a 2048-pt Hann spectrum of the newest hop     |
| Onset hold              | 40 ms piano / 60 ms guitar        | `profiles.ts` | at a 43 ms hop: piano = onset hop, guitar = +1 hop    |
| Onset refractory        | 100 ms                            | `gate.ts`     | no double triggers from one attack                    |
| Room band               | 250–1000 Hz                       | `room.ts`     |                                                       |
| Room smear / drift      | curvature > −1.0 / > 12 cents     | `room.ts`     | stationary Hann peak: −1.39…−1.61                     |
| Room persistence / gain | 3 frames / × 0.2 (−14 dB)         | `room.ts`     | protects note attacks                                 |
| Room averaging          | 2 frames                          | `room.ts`     | +1 hop latency                                        |

## Latency budget (48 kHz)

| Stage                                    | Typical                                   |
| ---------------------------------------- | ----------------------------------------- |
| Mic + OS + browser input buffer          | 10–30 ms                                  |
| Worklet accumulation (one hop)           | 0–43 ms (frame emitted on hop completion) |
| Relay main thread → worker (postMessage) | < 2 ms (more if the UI thread is busy)    |
| DSP per hop (node, M-series)             | ≈ 0.3 ms (test asserts < 2 ms)            |
| Window group delay (Hann centre)         | ≈ 85 ms behind the newest sample          |
| A chord fully dominates the window       | ≈ 130–170 ms after it is struck           |
| Room mode averaging                      | +43 ms                                    |
| Analysis smoothing (WS-C, HMM)           | +50–100 ms                                |
| **Expected display lag**                 | **≈ 100–250 ms**                          |

The worker posts `stats` (`meanMs`, `maxMs`, `load` = mean / hop duration)
every 64 hops. `load` ≈ worker CPU share, and the target is < 0.15.

## Room-noise rejection

Before chroma normalisation, at least 55% of power in the 30–5000 Hz analysis band
must lie around prominent spectral peaks. This prevents the few random peaks in
fan noise, hiss or a click from being amplified into a full-strength chord. The
pipeline also rejects isolated 50/60 Hz harmonic buzz when its fundamental is
present and its harmonic series accounts for over 90% of prominent-peak power.
The level meter still reports actual microphone volume.

The analysis engine holds an already confirmed chord across a short pause, but
does not replay a new candidate's evidence during silence. Separate short sounds
do not accumulate the dwell time needed to confirm a chord. No calibration step
or extra user setting is required; microphone speech processing remains disabled.

Run `pnpm exec vitest run src/audio/noiseRejection.test.ts src/analysis/engine.test.ts`
for regression coverage. `eval/controls.ts` measures noise-only false positives
and quiet piano using the same pipeline. These are signal heuristics, not source
separation: sustained speech, singing or music from a TV can still be detected.

## Known limits

- Synthetic tests only. Real pianos on laptop mics have weak fundamentals below
  ~100 Hz, so `bass` may come back `null` or report the 2nd harmonic (same
  pitch class, which is harmless) or the 3rd (a fifth up, which is wrong).
- The harmonic sieve needs the implied fundamental to be present. A note whose
  fundamental is missing contributes only its partials' own pitch classes.
  The 2nd and 4th partials still land on the right pitch class.
- Room mode is best effort (see `room.ts`). It misses a perfectly steady sung
  note, it also attenuates a vibrato lead instrument, and it ignores vocals
  outside 250–1000 Hz.
- Guitar uses the same 8192 window as piano. A shorter window would lose the
  low-E bass resolution.
- Repeated identical chords with little level change may not trigger `onset`.
- `analyseFile` runs on the main thread with yields every 256 hops. Moving it
  into the worker is possible because the pipeline is shared.
