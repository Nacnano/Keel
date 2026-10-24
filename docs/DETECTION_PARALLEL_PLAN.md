# Keel: parallel implementation plan

Status: **implementation authorized by the user; in progress**.
Prepared 2026-10-25 from the user's feature choices and the current repository.
Sol 6.1 agents implement evaluation, acoustics, temporal confirmation and UI in parallel.
The user additionally authorized PRs/merges and four simulated jam improvement rounds.

## 1. Outcome and scope

The first milestone is more trustworthy live chord, key and note detection on laptop and
iPad built-in microphones. The main reported failure is notes appearing from steady room
noise: fans, air conditioning, electrical/computer hum and traffic.

User-selected behavior:

- Support piano/keyboard and guitar.
- Switch between **Overall harmony** and **My instrument**.
- Show tentative detections distinctly, then confirm them as evidence improves.
- The live keyboard shows only notes currently heard, in their detected octaves. It does
  not illuminate every octave of a pitch class or show scale suggestions as heard notes.
- Retain all five feature areas in the longer-term plan: detection, recording safety,
  capture/review, MIDI controls, and developing/practicing ideas.

Instrument mode guides recognition. It does not promise to isolate a player's instrument
from other music through a single microphone. Other musical sources must not be labeled
as ordinary background noise in evaluation.

### Decisions still open

These are design choices, not features the user has already selected:

- Whether to add an explicit **Learn room noise** action. Evaluate automatic approaches
  first; a short, optional quiet calibration is a candidate, not a required startup step.
- Exact tentative-note styling. Proposed default: outlined tentative notes and filled
  confirmed notes, with a text legend and accessible names.
- Which individual recording, review, MIDI and practice features to implement afterward.
  Selecting all five areas does not settle every feature in the 60-item opportunity list.

Implementation can proceed on approved, independent work without settling these optional
choices. Do not ship calibration controls or expand into later features without the user's
selection. No catalog ingestion, source separation, accompaniment engine or new cloud service
is part of the first milestone.

## 2. What already exists

Read these before proposing replacements:

- `src/audio/pipeline.ts`: shared live/offline DSP path, adaptive gate, spectral evidence,
  harmonic/noise rejection, instrument profiles and estimated MIDI note numbers.
- `src/audio/pianoNotes.ts`: fundamental/partial attribution and octave-specific notes.
- `src/analysis/noteTracker.ts`: note attack/release smoothing.
- `src/analysis/engine.ts`: chord smoothing, key estimation/publication and analysis events.
- `src/core/types.ts`: shared contracts, historically frozen after the original build.
- `src/app/live/liveInput.ts`: microphone/MIDI arbitration and event routing.
- `src/state/jamStore.ts`: current readout and session timeline.
- `src/ui/components/Piano.tsx`, `ChordDisplay.tsx`, `KeyBadge.tsx`: live visualizations.
- `src/ui/screens/jam/JamOptions.tsx`: listening options; instrument selection currently
  also exists in Settings.
- `eval/BENCHMARK.md`: existing regression methodology, gates and limitations.

The existing benchmark documents a quick 86-case suite and a full 437-case suite, with
22 source fixtures plus generated controls. It contains recorded guitar, piano/voice,
room nuisances and unannotated piano/band excerpts. It is a development/regression corpus,
not a blind held-out field test. Verify counts at kickoff rather than hard-coding them.

An important gap: benchmark note metrics currently use pitch classes, while the microphone
keyboard displays estimated MIDI note numbers. Extend evaluation to measure what the user
actually sees. Do not infer note-level accuracy from chord labels or coverage alone.

Keep `docs/IMPLEMENTATION_PLAN.md` as the historical executed plan; this document supplements it.

## 3. Team and file ownership

Use one parent/integrator and at most three active subagents at once. Four specialist roles
are defined below, but the UI role starts when a slot becomes available. Do not launch four
workers plus the parent in a four-slot environment.

**Parent — coordinator and integration owner**

Exclusive ownership:

- `src/core/**` contracts, constants, fixture helpers and mocks.
- `src/app/live/**` and its integration tests.
- `src/state/**` and store tests.
- `src/audio/messages.ts`, `src/audio/micInput.ts`, `src/audio/worker/dsp.worker.ts`.
- `src/ui/screens/jam/useJamInput.ts`.
- `package.json`, lockfile, CI configuration, top-level docs and product/design records.
- Reviewed updates to `eval/benchmark-baseline.json`.

Responsibilities: freeze interfaces, manage task dependencies, resolve cross-layer changes,
wire agent outputs together, run integrated validation and report limitations honestly.
Do not become a second DSP or UI author while their owners are working.

**Agent A — evaluation and regression evidence**

Owns `eval/**`, excluding the baseline file reserved for the parent. Owns its metric tests,
fixture metadata, source attribution and evaluation documentation. Does not edit detector,
application UI, shared contracts or CI configuration.

**Agent B — acoustic detection and noise rejection**

Owns `src/audio/**`, excluding the parent's transport files listed above. Relevant files:
`pipeline.ts`, `gate.ts`, `musicalEvidence.ts`, `pianoNotes.ts`, `profiles.ts`, `tonality.ts`
and their tests. Do not edit `eval/**` to make detector changes pass.

**Agent C — temporal confirmation, chords and keys**

Owns `src/analysis/**` and its tests. Does not edit raw audio processing, the UI, stores,
recording code, benchmark thresholds or shared core types.

**Agent D — listening controls and visual states**

Owns these UI surfaces and their directly related tests:

- `src/ui/components/Piano.tsx`, `ChordDisplay.tsx`, `KeyBadge.tsx`.
- `src/ui/screens/JamScreen.tsx`, `SettingsScreen.tsx`.
- `src/ui/screens/jam/JamOptions.tsx`, `labels.ts`.
- `src/ui/components/components.test.tsx`, `src/ui/screens/screens.test.tsx` and any
  narrowly scoped new UI tests for these features.

Shared styles remain with the parent unless explicitly leased to D. Use existing semantic
tokens and the established calm Apple-style utility direction. This is a refinement.

All ownership boundaries include new files in the owned area. If a change needs another
owner's file, send the proposed interface or patch to that owner; do not edit it silently.

## 4. Schedule and dependencies

### Wave 0 — establish evidence and freeze interfaces

Parent:

1. Record the starting commit, branch and worktree state. Preserve existing user edits.
2. Run existing checks and archive the current quick benchmark separately from future runs.
3. Read current contracts and choose the smallest backward-compatible extensions.
4. Publish the contract decision and file ownership in `.context/detection-contract.md`.

Start A on baseline/metric design. B and C may inspect failures and propose changes in
parallel, but must not independently redesign shared contracts.

Contract checkpoint:

- **Mode mapping:** preserve stored `solo`/`room` values unless migration is necessary;
  present the user-facing names My instrument / Overall harmony consistently. Keep the
  existing piano/guitar setting. A label change alone is not source isolation.
- **Note observations:** preserve `ChromaFrame.midiNotes` as octave-specific microphone
  candidates. If per-note evidence is needed, define an additive optional field once;
  do not reinterpret the existing field differently across agents.
- **Note display:** keep confirmed `midiNotes` and add a separate optional
  `tentativeMidiNotes` field to note events. Define empty/missing behavior and ensure
  the sets are disjoint. This does not create recorded MIDI performances from microphone
  estimates. MIDI input remains immediate and bypasses acoustic confirmation.
- **Chord/key previews:** specify an explicitly transient preview path if tentative
  estimates are emitted before normal publication. Preview estimates must not become
  saved chord changes, key-history entries or theory inputs presented as settled facts.
  Audit all event consumers before extending an event union.
- **Confidence:** scores are evidence rankings, not calibrated probabilities. Do not
  invent percentage accuracy from a detector score. Keep UI terminology consistent.
- **Reset behavior:** decide how tentative notes, stale chords and key evidence clear on
  input/source changes, capture interruption, stopping and restarting. Preserve session
  history. A full engine reset must not create duplicate key-publication IDs mid-session.
- **Optional calibration:** if selected, define session-local state, start/cancel/clear
  semantics and worker status messages. Never learn a sustained musical note as noise
  merely because it is steady. Do not persist a profile across microphone/device changes.

Parent owns and lands the shared contract change before workers depend on it. Honor the
repository's dedicated `core:` review convention for shared type changes. Review is not
permission to weaken the contract or skip compatibility checks.

### Wave 1 — parallel core work

Run A, B and C concurrently against the frozen interfaces:

- A extends measurement and prepares independent noise/note regressions.
- B improves acoustic evidence and noise rejection.
- C implements temporal confirmation and tentative/confirmed semantics.

Avoid two mutable targets: first freeze A's metric semantics and comparison inputs, then
judge B/C on them. A may continue preparing the held-out corpus without disclosing it for
threshold tuning. If a held-out test informs tuning, reclassify it as development data and
reserve a fresh test set.

Once A hands off the harness, reuse that slot for D. D works against contract fixtures and
can proceed while B/C finish. No real microphone is needed to implement state rendering.

### Wave 2 — integration and independent verification

Parent wires DSP → worker → analysis → store → UI. Do this after interface producers and
consumers are ready; compiling a UI against a type does not prove live messages arrive.

Compare the unchanged detector, B alone, C alone, and B+C on the same frozen inputs where
feasible. This identifies whether an apparent improvement comes from better evidence or
simply delaying/hiding the display. Run the final held-out check once the candidate is fixed.

Reuse A for integrated benchmark review. D performs the bounded browser layout/state pass.
Parent covers live wiring, lifecycle and actual-device validation. If physical hardware or
new recordings are unavailable, finish automated work and explicitly leave device acceptance
pending; Chromium at an iPad viewport is not Safari hardware validation.

### Wave 3 — decision and handoff

Produce a reviewable change set, before/after results, screenshots, remaining limitations
and any open product choices. PRs and merges to main were explicitly authorized after this plan was drafted.

## 5. Work packages and acceptance checks

### A: measure visible false positives

Tasks:

1. Reuse the existing runner and checksum/provenance rules.
2. Sample exact displayed note numbers at arrival time; measure tentative and confirmed
   highlights separately and their union. A tentative false note is still a visible false
   positive. Historical pitch-class metrics remain explicitly labeled.
3. Add note-level reference annotations where independently available. Measure precision,
   recall, octave errors, onset delay and release. Unknown notes remain unknown, not silence.
4. Include noise before playing, noise during playing, music stopping into noise, a fan
   switching on, quiet immediate attacks, and changing noise levels.
5. Extend recorded fan/AC/hum/traffic coverage where usable recordings are available.
   Keep synthetic, rendered, recorded and hybrid cases distinct. Preserve licenses and
   keep private user recordings out of redistributable fixtures without permission.
6. Separate held-out recordings by performer/room/source, not random windows from one take.

Acceptance:

- The harness catches an implementation that only hides confirmed notes while flashing
  tentative notes, or suppresses everything to achieve zero false positives.
- A single acoustic note does not pass by painting all octaves of its pitch class.
- Music coverage and missed notes are reported alongside false positives and latency.
- Base and candidate are compared on identical inputs and metric definitions. A scoring
  change gets a protocol version and reviewed baseline migration, not an unexplained reset.

Handoff: metric definitions, fixture inventory/provenance, baseline evidence, reproduction
commands, known annotation gaps and a separate held-out evaluation procedure.

### B: reduce noise without erasing music

Tasks:

1. Locate false candidates at each stage: energy gate, peak picking, harmonic attribution,
   chroma normalization, bass and note extraction.
2. Address the smallest demonstrated failure. Compare existing heuristics, stationary-noise
   suppression and optional calibration before considering a different model.
3. Protect low notes near hum frequencies, quiet attacks, arpeggios, pedal sustain, guitar
   decay and detuning. Do not use a blanket frequency cutoff as a substitute for evidence.
4. Test both sample rates and both modes; ensure overall harmony does not accidentally apply
   an instrument range restriction intended only for targeted listening.
5. Keep recorded audio untouched: suppression affects detection, not the saved take.
6. Preserve the shared live/offline pipeline and measure processing cost on representative
   devices. Avoid introducing large models or dependencies without a separate decision.

If calibration is selected, additionally test cancel, clear, re-learn, quiet calibration,
playing accidentally during calibration, microphone change, and music starting immediately
afterward. Do not force every jam through a calibration step.

Acceptance: reproduce a baseline failure, demonstrate its reduction, pass existing noise
controls and music regression checks, and report any quiet-note or latency tradeoff. Stable
pitched machinery can resemble an instrument; report residual failures instead of promising
universal separation.

Handoff: diagnosis, changed assumptions, focused tests, same-input before/after evidence,
performance measurement and proposed transport changes for the parent.

### C: confirmation and harmonic uncertainty

Tasks:

1. Separate note candidates, tentative display and confirmed display; require repeated
   evidence before showing a tentative note. Confirmation needs continuous support.
2. Prevent separate short noises from accumulating into confirmation. Keep release short
   enough that the display represents current sound while tolerating brief dropouts.
3. Preserve immediate exact MIDI note-on/off behavior and clear mic candidates when input
   changes. Never turn microphone estimates into an exact MIDI recording.
4. Audit chord confidence refresh: a held chord must be able to change tentative/confirmed
   presentation without inventing another chord change or timeline entry.
5. Treat key evidence on phrase timescales. Keep relative major/minor ambiguity explicit;
   avoid forcing a single note or chord into a settled key. Noise must not accumulate key
   evidence, and provisional keys must not pollute saved key history.
6. Verify input interruption, time discontinuity, reset/new song, mode change and instrument
   change with deterministic event sequences.

Acceptance: spike → nothing; repeated plausible candidate → tentative; sustained support →
confirmed; lost support → cleared within the specified release behavior. Chord/key preview
changes never create false recorded events. Existing MIDI behavior and regression gates pass.

Handoff: state-transition description, event fixtures for D, regression tests and latency
tradeoffs. Do not choose timing thresholds solely to optimize a single noisy clip.

### D: understandable controls and readout

Tasks:

1. Make the mode switch and piano/guitar choice accessible in Listening options; preserve
   one-tap startup and existing settings. Keep terminology consistent with Settings.
2. Render only observed note numbers on the live keyboard. Leave scale helpers in Ideas.
3. Show tentative notes distinctly without relying only on opacity/color; add accessible
   names and a compact legend. Preserve contrast in both themes.
4. Make tentative chord/key status explicit, while retaining the large chord and calm
   layout. Avoid announcing every audio frame to screen readers.
5. Show input/calibration states only when the underlying implementation supports them.
   Do not add a nonfunctional noise-learning button as a placeholder.
6. Check desktop and iPad portrait/landscape, light/dark, keyboard navigation, touch targets,
   and longer chord symbols. Preserve unaffected phone behavior.

Acceptance: UI fixtures cover empty, tentative, confirmed, released, mixed-note, mode-switch
and interrupted states. The display cannot imply instrument isolation or numerical certainty
that the detector does not provide. Screenshots demonstrate the selected treatment at the
target sizes; component tests verify exact note placement and distinct semantics.

Handoff: changed components, screenshot paths under `.context/`, test results and any copy
or styling choices still needing the user's selection.

## 6. Integration and release checks

Run once on the assembled candidate, then repeat affected checks only after new changes:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm eval:benchmark
pnpm eval:benchmark:full
```

Agents use targeted tests and uniquely named benchmark output directories while iterating;
the parent runs the final full suite. Avoid concurrent processes overwriting
`eval/.cache/benchmark` reports. Use the runner's `--output=<directory>` option.

Preserve existing regression gates: accuracy/coverage tolerance of two percentage points,
p90/release tolerance of 100 ms, no added missed/wrong changes or false keys, and strict zero
visible false detections in deterministic noise controls. These are ceilings on regression,
not the definition of a successful improvement. New exact-note/tentative metrics need their
own reviewed gates; do not compare them numerically to old pitch-class metrics.

Before tuning, agree on a useful improvement target for the reproduced real-noise failures
and a minimum quiet-note recall. If the baseline is already zero on a clip, do not claim a
percentage reduction there. Report per-condition absolute results, not only a global average.

Actual-device checklist:

- Laptop built-in mic in its intended browser; iPad built-in mic in Safari.
- Noise-only startup and noise beginning during a session.
- Quiet piano, sustained pedal, acoustic guitar picking/strumming, music played through speakers.
- Tentative → confirmed → released notes, including simultaneous notes in different states.
- Mode/instrument switching without stuck notes or stale key guesses.
- Backgrounding, device interruption, restart and permission recovery.
- MIDI retains immediate held-note behavior and does not inherit microphone noise learning.
- Existing save/review flows do not persist transient previews as musical facts.

Do not overwrite the baseline to make a regression disappear. The parent reviews candidate
baseline changes with A and records the reason. Any unavoidable tradeoff is presented to the
user as a concrete choice rather than silently weakening tests.

## 7. Operating instructions for every subagent

Copy this preamble into each task:

> You are not alone in this codebase. Read the agreed contract and ownership list first.
> Edit only your assigned files. Do not revert other agents' or the user's changes. Adapt
> to agreed upstream changes; request cross-owner edits from the parent. Do not rename the
> current branch, alter shared contracts, rewrite benchmark baselines, change dependencies,
> merge or deploy. Do not spawn more agents. Keep microphone audio local. Report evidence
> and limitations; do not claim synthetic or regression results prove field accuracy.

Task assignment template:

```text
Role: [A / B / C / D]
Plan: docs/DETECTION_PARALLEL_PLAN.md
Contract: .context/detection-contract.md
Owned files: [copy the exact ownership above]
Work package: [copy the relevant tasks and acceptance checks]
Starting commit: [parent supplies actual commit]
Blocked decisions: [parent lists unresolved user choices]

Before editing, send a short diagnosis and intended change to the parent.
Implement only after the parent starts the implementation wave.
Put handoff notes in .context/detection-[role]-handoff.md.
Return: changed files, behavior, tests/commands and results, before/after evidence,
remaining risks, and any integration work needed outside your ownership.
```

Use one shared checkout with exclusive file ownership, or isolated worktrees with explicit
integration commits. Pick one strategy at kickoff. In the shared checkout, do not let workers
switch branches or run broad `git add`/restore commands. In separate worktrees, the parent
integrates dependent commits in order; do not have each worker merge independently.

If preparing PRs later, use `main` as the base for independent PRs. A dependent PR targets its
actual prerequisite branch until rebased. Keep the intended reviewed branch checked out so
Conductor displays the right PR. None of these publication actions is part of drafting this plan.

## 8. Later parallel feature waves

After the first milestone, ask the user to choose concrete features. These are proposed
packages for that subsequent planning round, not automatic implementation instructions:

- **Recording safety:** preserve intentional audio-only takes, durable recording chunks,
  interrupted-session recovery and audio-inclusive backups. Worker owns `src/data/**`;
  parent owns shared schema/migration decisions, live wiring and Library export integration.
- **Capture/review:** bookmark excerpts, A–B loops and correction history. Worker owns
  dedicated review components/playback modules; parent owns shared ReviewScreen composition
  when another feature also touches it. Excerpts depend on recording/storage contracts.
- **MIDI controls:** connection recovery, recognition zones and optional controller bindings.
  Worker owns `src/midi/**`; parent owns live source arbitration and shared settings. Do not
  commandeer the sustain pedal as a shortcut without the user's choice.
- **Develop/practice:** linked variations, contextual voicings and call-and-response.
  Worker owns chosen theory/training modules. Call-and-response depends on the review loop
  transport; linked takes depend on storage relationships. Do not duplicate those engines.

With three worker slots, recording safety, independent MIDI work and pure review transport
work can start together once contracts are frozen. Excerpt persistence waits for storage;
call-and-response waits for looping. Schedule by these dependencies rather than assigning
the same session schema or screen to several agents at once.

Before each later wave, repeat the contract/ownership checkpoint and user feature selection.
The noise-detection milestone remains independently reviewable and shippable.

## Implementation record — 2026-10-25

The user subsequently authorized implementation, PRs, merges, and four further simulated
jam → feedback → improvement → combined-test rounds. Sol 6.1 workers handled evaluation,
acoustics, temporal confirmation, UI, and independent review; the parent integrated them.

- Shared contracts: PR #47 (merged). Tentative note arrays and display-only previews are
  additive. Previews never enter saved sessions, key history, or confirmed theory.
- Exact-note benchmark: PR #48 (merged). 98 quick / 461 full cases. The schema migration
  preserves all 437 original legacy measurements verbatim; new exact metrics were measured
  from immutable c062e58 sources. No regression gate was weakened.
- Acoustic guard: octave-local flatness catches strongly colored noise without changing
  chord/key chroma. A narrower spectral-slope condition protects noisy guitar attacks.
  B-only quick passed 98/98. Two music→recorded-vacuum controls reduced visible false note
  time by 0.85s and 1.11s. Guitar and band activity can still fall modestly (1.35/1.78pp in two
  unannotated recordings); fewer highlights are not automatically proof of higher accuracy.
- Confirmation: historical 120ms confirmed onset and 240ms release retained. Earlier tentative
  notes require observed note IDs, strong matching harmonic evidence, and a recent onset.
  Never-confirmed tentative notes clear when support disappears. MIDI remains immediate.
- Controls/readout: My instrument / Overall harmony, piano/keyboard and guitar; outlined
  tentative notes, filled confirmed notes, explicit chord/key uncertainty. Live keyboard
  receives observed note numbers only. Stop, source/mode/instrument changes and capture gaps
  clear transient readouts while retaining session history.

Browser simulation uses the existing licensed NINJAM recording and rendered piano fixtures,
including a 32s hybrid with leading/trailing hum. These are simulated performer scenarios,
not human usability studies or field accuracy measurements. The test browser's native
AudioWorklet module load remained pending, even for a minimal standalone module; Chrome
automation was unavailable because another extension UI was open. Browser simulations
therefore replace only capture transport with scheduled PCM hops, exercising the shipped
DSP worker, analysis engine, stores and interface. Native AudioWorklet and physical built-in
microphone acceptance remain pending. Test recordings stay local and outside deployment.

Independent exact-note labels for recorded piano/band performances and laptop/iPad Safari
field tests are still missing. A regression pass does not mean all accuracy targets are met.

Initial integrated validation: lint, application TypeScript, all 946 tests, production build,
and full 461-case benchmark passed. All 198 pre-existing quality-target gaps remain visible
in the full report; passing regression gates is not a claim that they are solved. One new
42.7ms tentative observation at a music→vacuum boundary remains, alongside lower aggregate
visible false-note time. No physical-device or zero-false-positive claim is made.

The browser run verified live processing, quiet clearing, finishing/saving and tablet layout
with the capture substitution above. Saved-session and settings surfaces were also exercised.
Four subsequent rounds will address observed usability problems and verify the combined build.

### Improvement round 1 — recoverable microphone startup

Observed feedback: a native worklet load could leave a pianist stuck on Connecting with no
way to cancel. Added an active Cancel action, a 20-second setup deadline, and safe retry.
Cancellation returns to the start screen without claiming an unsaved jam was saved. Late
permission grants and stale callbacks cannot revive a canceled attempt or tear down a retry.
This follows Apple's progress-indicator guidance to offer cancellation and explain stalls:
https://developer.apple.com/design/human-interface-guidelines/progress-indicators.

Validation: 954 tests across 89 files, lint, TypeScript and production build pass. Browser
verification reproduced the native worklet stall, canceled it, observed timeout with released
tracks, then retried using scheduled PCM capture and saved the resulting session. The native
browser limitation remains; no capture fallback was added to the product.
