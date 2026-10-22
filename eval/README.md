# `eval/`: detection-accuracy harness

Renders simulated piano jam sessions, degrades them (noise, hum, reverb, low level, laptop mic,
speaker in a room, a singer), runs them through the **live** detection path exactly as the app
does (`createChromaPipeline` hop by hop → `createAnalysisEngine`), and scores what the jam
screen would show. Results go to [`docs/ACCURACY.md`](../docs/ACCURACY.md).

Not part of CI or `pnpm test`: the first run downloads about 10 MB of piano samples, and a full
run takes 1–2 minutes. `tsc -b` still typechecks this folder.

```sh
pnpm eval                 # full run → docs/ACCURACY.md (+ eval/.cache/last.json)
pnpm eval --quick         # 3 sessions × 6 conditions, prints only (~10 s once cached)
pnpm eval --core          # all 10 sessions, six headline conditions, no sweep
pnpm eval --no-write      # full run, print only
pnpm eval --save-baseline # also store eval/baseline.json, the "before" column of the report
pnpm eval --synth         # use the additive fallback synth instead of the samples
pnpm exec tsx --tsconfig eval/tsconfig.json eval/controls.ts # startup + noise-only controls

# timeline of one session (displayed chord, confidence, chroma, key) next to the ground truth
pnpm eval:inspect pop-G-broken-72 laptop solo 2 [--wav]   # --wav writes eval/.cache/<id>.wav
```

## Files

| File            | Role                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| `samples.ts`    | Fetches the Splendid Grand Piano Ogg Opus samples smplr uses, decodes, caches            |
| `render.ts`     | Session specs, performance (voicing, rhythm, pedal, humanising), sample playback         |
| `conditions.ts` | Degradations: noise, hum, Schroeder reverb, level, laptop mic, speaker in room, vocal    |
| `metrics.ts`    | Display model and metrics for one run                                                    |
| `run.ts`        | Plan (sessions × conditions × configs), report, baseline comparison                      |
| `inspect.ts`    | Debug view of one run                                                                    |
| `baseline.json` | Summary numbers measured before the detection fixes (commit `a39bf72`), for before/after |

`eval/.cache/` (git-ignored) holds the downloaded samples and the last run's JSON.

## Sessions

Rendered at 48 kHz (and 44.1 kHz for a subset) from the real samples: nearest recorded note in
the velocity layer (PP / MP / MF / FF, like smplr), pitch-shifted by resampling, damper release
of ~90 ms at note off. The mix is normalised to a −12 dBFS peak. Timing is humanised (±10 ms),
velocity varies (±8 plus accents and comping dynamics).

| Id                      | Key | Style                                   | Progression (written)    |
| ----------------------- | --- | --------------------------------------- | ------------------------ |
| `pop-C-block-90`        | C   | block chords, 1 per bar, 90 BPM         | C G Am F                 |
| `pop-G-broken-72`       | G   | arpeggiated under pedal, 72 BPM         | G Em C D                 |
| `pop-Eb-inversions-100` | Eb  | block + late pedal, inversions, 100 BPM | Eb Bb/D Cm Ab Eb/G Ab Bb |
| `pop-F-melody-84`       | F   | LH chords + RH melody, 84 BPM           | F Dm Bb C                |
| `pop-D-pedal-120`       | D   | 2 chords per bar, late pedal, 120 BPM   | D A/C# Bm G              |
| `pop-Ab-ballad-60`      | Ab  | arpeggiated ballad, 60 BPM              | Ab Fm Db Eb              |
| `pop-Am-block-80`       | Am  | block + late pedal, 80 BPM              | Am F C G                 |
| `jazz-Bb-251-120`       | Bb  | LH root + RH shell (3 5 7), comping     | Cm7 F7 Bbmaj7 Gm7        |
| `jazz-F-rootless-100`   | F   | LH root + RH rootless (3 5 7 9)         | Gm9 C9 Fmaj9 Dm9         |
| `jazz-Db-251-90`        | Db  | LH root + RH rootless, 13th             | Ebm9 Ab13 Dbmaj9 Bbm7    |

"Late pedal": the sustain pedal is changed 300–800 ms after the next downbeat, so the previous
chord keeps ringing into the new one, as with real pedalling.

## Conditions

SNRs are relative to the RMS of the whole session.

| Id               | What                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `clean`          | as rendered (peak −12 dBFS)                                                                       |
| `white30/20/10`  | white noise at SNR 30 / 20 / 10 dB                                                                |
| `pink20/10`      | pink noise (Kellet filter) at SNR 20 / 10 dB                                                      |
| `hum50`, `hum60` | mains hum with 7 harmonics (odd ones stronger), 10 dB below the music                             |
| `reverb`         | Schroeder reverb (4 damped combs + 2 allpasses), RT60 0.6 s, 40 % wet                             |
| `low30`, `low40` | peak −30 / −40 dBFS (plus a −96 dBFS converter floor)                                             |
| `laptop`         | peak −24 dBFS, 120 Hz high-pass (4th order), 8 kHz low-pass, soft compressor, −55 dBFS pink floor |
| `speaker`        | 50 % wet reverb, 90 Hz high-pass, pink noise at 15 dB SNR, peak −35 dBFS                          |
| `vocal`          | sung line on scale tones, 200–600 Hz, glides + vibrato, sawtooth with a formant, −3 dB            |

## Configs

- Primary: stability 0.5, vocabulary level 2, sensitivity 0.5, piano, Solo (Room as well for `vocal` and `speaker`).
- Sweep: stability 0.3 / 0.5 / 0.7 × level 2 / 3 × Solo / Room on clean, pink 10 dB, laptop and
  speaker.
- 44.1 kHz: clean, low40 and laptop with the primary config.

## Metrics

Events are applied at the time they would reach the UI (the frame's newest hop is complete),
so the smoother's look-ahead lag is part of every latency number. The display follows
`ChordDisplay`: the last chord event is shown when its confidence is at least
`MIN_DISPLAY_CONFIDENCE` (0.35), otherwise a dash.

- **Chord %**: share of the ground-truth time (10 ms grid) where the displayed root and quality
  equal the written chord, reduced to the vocabulary level (Gm9 → Gm7 and Ab13 → Ab7 at level 2;
  Cmaj7 → C at level 1). Slash bass is ignored. A dash counts as wrong.
- **Chord % after 0.5 s**: chord accuracy excluding the first 500 ms of each written chord.
- **Root %**: same, root only.
- **Dash %**: share of the ground-truth time with no chord shown.
- **Latency**: downbeat → first time the correct label is on screen (median and p90 over all
  chord changes). A label shown up to 150 ms early counts.
- **Missed %**: changes where the correct label never appeared before the next downbeat.
- **Spurious /min**: display changes into a wrong label (not the current chord, nor the next one
  within 150 ms), per minute of playing.
- **Key %**: share of the whole session where the exact key (tonic and mode) is shown. No key yet
  counts as wrong. **Key or rel. %** also accepts the relative major/minor.
- **First key**: seconds from the first downbeat to the first correct key (median over sessions;
  "never" when most sessions never show it).

## Dependencies

Two devDependencies, used only here:

- `ogg-opus-decoder` (WASM, no native build): the Splendid samples are Ogg Opus; node has no
  decoder and `decodeAudioData` is browser-only.
- `tsx`: runs TypeScript with the `@/` path alias in node (the app code is imported unchanged).

## Baseline provenance and limitations

`baseline.json` was regenerated using the current renderer and metric code against the original
`a39bf72` detector source (identical to the detector in `6405134`). This matters: the interrupted
work had changed the broken-chord performance after saving its original baseline. Comparing that
old baseline to the new performance would have changed both the input and detector.

For a fresh comparison, export `a39bf72` to a temporary directory with `git archive`, copy the
current `eval/` directory into it, and link the current `node_modules/` into the temporary root.
Use `node node_modules/tsx/dist/cli.mjs --tsconfig eval/tsconfig.json eval/run.ts --save-baseline`
from the temporary root (pnpm rejects a modules symlink that points outside a temporary project).
Copy the resulting `eval/baseline.json` back, recording `a39bf72` as its detector commit since an
archive has no `.git` metadata. Then run `pnpm eval` from this checkout. Keep both runs on the same
sample/synth setting; the report states which was used.

The ten progressions are the development set used for tuning. These simulations cover only a
sampled piano, and share recordings and seeds across degradations; hundreds of configurations
are not hundreds of independent performances. Nine progressions are major and one minor.
They do not establish real-microphone, guitar, singer or held-out musician accuracy. The report
includes poor conditions, missed changes, startup false positives and key ambiguity, so improved
headline averages must not be read as a field accuracy guarantee.
