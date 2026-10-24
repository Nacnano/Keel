# Chord detector regression benchmark

The benchmark protects live chord accuracy **and** display stability. A green regression check means the measured behavior has not deteriorated; it does
not mean that speech, vacuum cleaners or every guitar voicing are already handled correctly.

## Run it

```sh
pnpm eval:benchmark       # PR suite, bundled recordings, no downloads
pnpm eval:benchmark:full  # extended rates, sensitivities, noise seeds and acoustic conditions
```

Both commands exit nonzero on a regression, an invalid fixture, missing labels/baselines, a
changed suite inventory or a pipeline exception. Reports are written to
`eval/.cache/benchmark/results.json` and `summary.md`. Pass `--output=<directory>` to keep
runs separate. The older `pnpm eval` remains available for development sweeps and its
historical report; it is not the CI gate and its online sample fallback is never used here.

## What runs where

Every pull request, main push, merge-queue and scheduled run executes the full **437-case** suite.
The local quick suite contains **86 cases**; both use 22 source fixtures and generated controls. The benchmark
job is a dependency of the existing required **CI** check, so failure blocks that check.
Every Monday at 04:17 UTC, and through **Actions → Keel CI → Run workflow → full**, the
full suite runs. A manual quick `ci` run is also available.

GitHub publishes the per-case summary and retains the JSON, Markdown and console log as the
`keel-audio-benchmark` artifact for 30 days, including failed runs. The benchmark has no
service credentials and makes no external requests. Its audio fixtures are ordinary Git
files, not Git LFS pointers, and are excluded from Vercel deployments.

## Coverage and ground truth

The corpus manifest pins every compressed recording by SHA-256 and records its source,
license, conversion, annotation provenance and original labels where available. See
[fixture attribution](fixtures/ATTRIBUTION.md). The corpus contains:

- Six sampled-piano performances with independently known written progressions: block chords,
  arpeggios, pedal overlap/fast changes, minor-key playing, melody over chords and jazz shells.
  These are **rendered performances using real piano samples**, not recordings of musicians.
- Seven **recorded acoustic-guitar accompaniment performances**, by six GuitarSet players,
  covering rock, singer-songwriter, jazz and bossa nova. The references come from GuitarSet's
  performed-chord track with manual verification, not Keel predictions or the backing chart.
- Two independently annotated **recorded piano-and-voice duets** from the Schubert Winterreise
  Dataset (HU33), testing accompaniment under a singer and historical recording noise. These
  are performed classical excerpts, not contemporary rehearsal captures.
- An actual piano performance by Kimiko Ishizaka. This excerpt is deliberately **unannotated**:
  it tests activity and stability, and is never included in chord-accuracy denominators.
- A **recorded live NINJAM ensemble** excerpt, with separate license and credits. It is
  unannotated and tests stability/activity only, not chord accuracy.
- Recorded speech, typing, clapping, coughing and a vacuum cleaner, plus deterministic silence,
  white/pink noise at two levels, a fan starting after silence, typing-like bursts and 50/60 Hz hum.
- Hybrid scenarios: recorded nuisances mixed with music at 10 dB SNR; bass/drums behind piano
  and recorded guitar in both listening modes; a simulated sung line; brief audio dropouts;
  immediate quiet playing; sharp/flat guitars from three players; and music stopping into continuing white noise,
  recorded speech or a vacuum cleaner.
- Extended conditions: 44.1/48 kHz, sensitivity 0/0.5/1, two noise seeds, reverb, a laptop-like
  response, distant speaker playback, quiet playing and electrical hum.

The generated band mixes are explicitly labeled **hybrid**, not recordings of a live band.
Repeated levels, rates and noise transformations of a clip are correlated examples, not
independent performers. This is a development/regression corpus, not a blind held-out test.
The unannotated live-band excerpt does not establish ensemble accuracy. More field recordings
from actual rehearsal rooms should be added as separate performances,
with musician-reviewed labels, before making claims about real-band accuracy.

GuitarSet labels are projected to root/base quality at vocabulary level 2. Slash bass and
added tones are ignored; ambiguous alterations are explicitly `unknown`. The raw original
labels remain in the manifest. Room-mode references are reduced to the supported triad
vocabulary. No unsupported label is silently turned into a correct answer. Gaps in annotations
are unknown, not silence. Release tests explicitly label the noise after the last chord.

## Metrics

The runner feeds PCM into `createChromaPipeline`, transfers each frame's buffer as the real
worker does, then calls `createAnalysisEngine`. State is sampled at **arrival time**, after
completing the hop. Backdated chord-event timestamps cannot erase detection latency. Each
case starts with fresh pipeline and engine state.

- **Chord accuracy:** correctly displayed root/base quality divided by annotated music time.
  Blank/wrong chords count as wrong. Silence and unknown spans cannot inflate this score.
- **Settled accuracy:** the same score after the first 500 ms of each reference span.
- **Missed changes and p90 latency:** whether and when each written chord became visible.
  Missed chords are counted separately; no successful detections means null latency, not zero.
- **Wrong changes:** entries into an incorrect chord during annotated time, including noise.
- **Chord flicker:** A–B–A reversals within one second without a reference boundary in between.
  For unannotated recordings this is only a stability proxy; a real musical change may qualify.
- **Note changes / flashes:** piano-highlight set changes, and note runs shorter than 250 ms
  away from reference harmonic boundaries. Arpeggios can contain legitimate short notes;
  this is a regression diagnostic, not a note-transcription accuracy claim.
- **False chord / note seconds:** how long a chord or any piano highlight is visible in
  explicitly music-free intervals. False key events are counted on wholly music-free cases.
- **Release:** time until a displayed chord clears after music stops into noise. Chord and
  note coverage also prevent an always-silent or disabled-display implementation passing.
  Explicit no-music intervals are excluded from these activity minima in mixed clips: clearing
  noise must not be penalized as lost musical coverage. Unknown music stays activity-only.

Per-case JSON also retains annotated duration and coverage. No global average can hide a
regression in one recording. Runtime is informational; noisy hosted-runner timing is not a
quality gate. This harness models the analysis events consumed by the UI; browser scheduling,
physical microphone response and the UI's additional quiet-state behavior need browser/device QA.

## Regression gates and quality targets

`benchmark-baseline.json` freezes measured results for the exact corpus. Default tolerances:

- Accuracy, settled accuracy and musical activity coverage may fall by at most **2 percentage
  points**. Activity minima apply to music, not noise: improved noise rejection is welcome.
- p90 latency and release may increase by at most **100 ms**.
- Missed changes, wrong changes, chord reversals, note flashes and false keys may not increase.
- Note-set changes have a **two-event** tolerance; false chord/note time has a **50 ms** tolerance
  for one-hop rounding. Deterministic music-free controls require **exactly zero** false chords,
  highlights and keys regardless of the baseline.
- Missing cases, changed annotation duration, invalid metrics, corrupted audio, or changed
  corpus/generator/scoring-protocol fingerprints fail closed.

Separate quality targets are 80% overall / 90% settled chord accuracy, at most 10% missed
changes, p90 response at most 1.5 s, at most six wrong changes/minute, no short chord reversals,
release within 3 s, and no false chords/keys in noise (at most 100 ms false note activity).
All unmet targets are listed in the report even if regression gates pass. A target met in the
baseline is also a gate: it cannot become a new quality gap within the numerical tolerance.

The initial corpus exposed false chords from the recorded vacuum and highlights from speech
and coughs. The updated detector removes those startup false positives in the bundled tests.
Fast/extended and some detuned guitar performances still score poorly. Music stopping into
recorded noise also exposes display-release delay. These examples are retained. Their frozen measurements prevent deterioration;
the visible targets specify the improvement still needed. Do not interpret the initial
baseline as acceptance of those behaviors for a finished detector.

## Add real jams and room recordings

Use recordings you own or can redistribute, with attribution and license information.
Keep unrelated songs, performers and rooms separate so one recording cannot dominate the
suite. Include quiet starts, pauses with conversation, bass/drums, vocals, inversions,
arpeggios, pedal, soft notes and actual chord changes. Capture both target-only audio and the
room mix when possible. Do not label competing music as ordinary noise: this detector does
not separate the player's instrument from another musical source.

Supply reference spans from a score/performance reviewed independently of Keel. Use `null`
only for genuinely music-free audio and `"unknown"` for ambiguous/unannotated intervals.
Never promote the detector's output into its own ground truth. A label audit and a separate
held-out performer/room set are prerequisites for a credible field-accuracy claim.

Convert to mono PCM16 at 44.1 kHz, then import with a metadata JSON:

```sh
ffmpeg -i my-jam.wav -ac 1 -ar 44100 -c:a pcm_s16le my-jam-mono.wav
pnpm exec tsx --tsconfig eval/tsconfig.json eval/importBenchmarkFixture.ts \
  my-jam-mono.wav my-jam-labels.json
```

```json
{
  "id": "my-guitar-rehearsal-01",
  "group": "guitar",
  "instrument": "guitar",
  "source": "Recording owned by the contributor; rehearsal date and recording setup",
  "license": "CC-BY-4.0",
  "attribution": "Performer and recording credit",
  "annotation": "Timed chord labels reviewed against the performance by the contributor",
  "spans": [
    { "start": 0, "end": 2, "label": null },
    { "start": 2, "end": 6, "label": "C" },
    { "start": 6, "end": 10, "label": "Am" }
  ],
  "tail": "unknown"
}
```

The importer refuses overwrites and invalid labels. For an unannotated performance, supply
an `unknown` span and document that it is a stability-only case. Changing the corpus correctly
invalidates the existing baseline until the new inputs and measurements are reviewed.

## Update baselines deliberately

```sh
pnpm eval:benchmark:full --candidate --output=eval/.cache/candidate
# Inspect summary.md, results.json, source/label changes and every increased error metric.
# After review, explicitly copy the candidate; the command never overwrites the baseline.
cp eval/.cache/candidate/baseline-candidate.json eval/benchmark-baseline.json
pnpm eval:benchmark
pnpm eval:benchmark:full
```

Candidate mode is forbidden when `CI` is set. Keep detector commit, corpus fingerprint,
per-case values and both suite inventories in the baseline. Record why a baseline changes in
the PR; improvements should tighten it. Do not regenerate merely to make a failing PR green.
For a corpus change, evaluate both the base detector and candidate detector on the same new
inputs so changed audio cannot masquerade as a detection improvement.

## Detector update — 2026-10-24

The DSP now combines spectral concentration, narrow peaks and a shared pitch-grid offset.
It admits short attacks, retains musical evidence through brief masking, and rejects
sustained spectra without that evidence. This is amplitude-independent; the existing
sensitivity control still governs the energy gate. Exact MIDI bypasses this audio path.

Guitar tuning is calibrated only when the first two seconds of a phrase supply at least
12 confident observations over 500 ms, a tight offset distribution, and a shared offset
of 30–45 cents relative to configured A4. Mains contamination inhibits calibration. Once
accepted, the correction is frozen until a stream/phrase reset or configuration change.
Small offsets, ambiguous evidence and late voicing changes leave configured tuning alone.
Continuously adapting the tuning estimate failed additional guitar tests and was rejected.

At 48 kHz and default sensitivity, comparing the same inputs against detector `8adce49`:

| Case                                             |        Before | After |
| ------------------------------------------------ | ------------: | ----: |
| Recorded vacuum: false chord / highlight seconds | 2.048 / 4.139 | 0 / 0 |
| Recorded speech: false highlight seconds         |         2.261 |     0 |
| Recorded cough: false highlight seconds          |         0.597 |     0 |
| Rock guitar 00, +25 cents: chord accuracy        |         19.8% | 54.7% |

All 437 cases pass the existing per-case regression tolerances on the expanded corpus.
These are development measurements, not independent field-accuracy estimates. Silence,
quiet starts, fast pedal changes, arpeggios, mixed speech and additional guitar detunings
remain in the gate. The additional player 03 and piano/voice recordings were evaluated
with both the original and candidate detectors before accepting the change.

The mixed-clip coverage metric was corrected to exclude explicitly labeled no-music time;
previously, correctly removing noise highlights could incorrectly fail musical coverage.
The original measurements were converted with the same formula before comparison, and
all accuracy, latency, flicker and false-positive gates remain unchanged.

The acceptance baseline ratchets each metric to the stronger of the original and accepted
measurements. `detectorCommit` identifies the accepted implementation, `ratchetFrom` the
original detector; individual limits can retain stronger original measurements. Neither
per-case tolerances nor quality targets were relaxed. Reports always contain actual
measurements, not these combined acceptance bounds.

Remaining limits: sustained pitched machinery can resemble music; an instrument cannot be
separated from competing music by these heuristics; extended/fast guitar voicings remain
uneven. After music stops into recorded noise, a held chord can take about 2–3.2 seconds to
clear. The unannotated full-band recording remains a stability test, and contemporary
rehearsal-room recordings with musician-reviewed labels are still needed for field claims.

## Piano-key false positives — 2026-10-24

An inharmonic ring — peaked, low pitch-grid concentration, and almost none of its peak power on
a harmonic series — is dropped before chroma normalisation, so it cannot become a chord or a set
of lit keys. Very flat spectra can still reach the chord smoother, but their piano-key vector is
forced off. The cut is strict enough that noisy or quiet guitar keeps its harmonic series and
its previous scores. This does not separate the player from other music or from pitched machinery.

The keyboard lights one MIDI key per sounding fundamental. Harmonic partials are not extra keys,
and a pitch class is not painted in every octave. Pitch-class note metrics in this benchmark stay
on the chord chroma, so a coverage change here is a change in which classes are active, not in
which octaves the keyboard draws.
