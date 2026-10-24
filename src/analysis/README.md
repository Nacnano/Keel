# `src/analysis/` — chord and key estimation (WS-C)

Turns a stream of `ChromaFrame`s (mic via `src/audio`, or exact frames via `src/midi`) into
`AnalysisEvent`s. Pure TypeScript, no DOM, safe to run in a worker.

```ts
import { createAnalysisEngine } from '@/analysis';

const engine = createAnalysisEngine({ vocabLevel: 2, stability: 0.5 });
const off = engine.subscribe((e) => console.log(e));
audio.onFrame((f) => engine.push(f));
engine.configure({ vocabLevel: 3 }); // rebuilds templates, restarts the smoother
engine.reset(); // new jam: clears chord, bass and key state (subscribers stay)
```

## Pipeline

```
mic frame ─► scoreChroma (cosine vs 12×N templates + no-chord)
          ─► smoother (fixed-lag Viterbi, softmax emissions) ─► bassResolver ─► chord event (on change)
MIDI frame ─► identifyExact (pitch-class set matching, no HMM, no lag)       ─► chord event (on change)
any frame ─► keyEstimator (decaying histogram × Krumhansl-Kessler, hysteresis)
          ─► keyPublisher (confirm ~4 s, no parallel change, withdraw short keys) ─► key event
          ─► notes event (on change), level event (every frame)
```

| Module            | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `templates.ts`    | `CHORD_VOCAB` (alias of `@/theory` `CHORD_TEMPLATES`, all 34 `ChordQuality`s, levels 1–3), `QUALITY_ORDER`, `buildTemplates(level)`. Weights: root 1.0, third 0.8, fifth 0.6, seventh / sixth 0.7, extensions 0.5, sus tones 0.8. Each tone also smears 0.1 × its weight onto the pitch class a fifth above (3rd partial). Rows are unit L2.                                                                                                                              |
| `chordScorer.ts`  | `scoreChroma` — cosine of the chroma against every template; the extra no-chord state is the cosine with a flat template × (1 − 0.25 × energy). Frames with energy < 0.01 or an all-zero chroma are silence (no-chord = 1). `identifyExact` — `@/theory` `identifyChord`: score = (matched − Σ 0.6·(0.5 + w/2)·missing − 0.8·extra) / max(size, count), min 0.45; ties prefer bass = root, lower level, fewer tones, `QUALITY_ORDER`. Non-fifth dyads are not chords.     |
| `smoother.ts`     | HMM over `12 × Q + 1` states. `p_stay = 0.6 + 0.38 × stability`, the rest uniform over the other states, which makes Viterbi and forward/backward O(N) per frame. Emission = softmax(sim / τ), τ = 0.08. Back-pointers, emissions and forward messages live in a 32-frame ring; the decision for frame `t − lag` is a backtrack from the current best state, and its confidence is the fixed-lag smoothed posterior (forward × `lag`-step backward).                      |
| `bassResolver.ts` | Slash chord when the frame bass is a chord tone ≠ root for ≥ 3 consecutive frames. The run may extend into the `lag` look-ahead frames so `G/B` appears with the chord, not two frames later. `showSlashChords: false` collapses to the root.                                                                                                                                                                                                                             |
| `keyEstimator.ts` | Histogram of L1 chroma decaying with a half-life of 8 s (using `frame.t` deltas, gaps clamped to 0.25 s; silence decays but adds nothing). Pearson correlation with Krumhansl-Kessler major/minor profiles for all 24 keys. First key after 1.5 s of non-silent input; afterwards a challenger must lead by ≥ 0.08 for ≥ 2 s of non-silent input. Emits `relative` and the top 3 other keys as `alternatives`; `confidence` = correlation of the reported key, clamped.   |
| `keyPublisher.ts` | Which estimates become `key` events. The first key of a song is published once the estimate has led every other key for 4 s (trailing time taken off), or after 1 s when unmistakable (correlation ≥ 0.85, lead ≥ 0.3); it is dated from the song's first sound. The parallel key (same tonic) is never a change. A key replaced < 10 s after its own evidence started is withdrawn: the replacement keeps its start (`t`, `replacesSince`) and names it in `supersedes`. |
| `engine.ts`       | `createAnalysisEngine(config?)` wiring the above. Chords are read in the published key, or in the estimate while it is being confirmed: in-key preference (+0.03 similarity, both modes; ♭3 / ♭7 count as in key once the tonic has sounded as a dominant 7th), dim7 named from the key's leading tone. Room mode: major and minor triads only, an out-of-key triad holds 2 s before it shows.                                                                            |     |
| `testing/`        | `chromaFromNotes` / `progressionFrames`: mic-like noisy chroma from MIDI notes for tests (no dependency on `src/audio`).                                                                                                                                                                                                                                                                                                                                                  |

## Events

- `chord` — emitted only when the label (root, quality, slash bass, or no-chord) changes. Mic: `t`
  is the time of the decoded frame (the actual change), emitted `lag` frames later; `source: 'mic'`.
  MIDI: immediate, `confidence` = match score (1 for an exact set), `source: 'midi'`.
- `key` — when a key is confirmed (see `keyPublisher.ts`): `t` = where it is drawn from, `id`,
  `since` = where its own evidence started; a replacement of a short key adds `supersedes`
  (the withdrawn `id`) and `replacesSince` (its start, equal to `t`).
- `notes` — when the set changes. Mic: bins > 0.10 for 120 ms light up; bins < 0.06 for 240 ms clear.
  This display-only hysteresis ignores brief spikes and dropouts. MIDI: every held
  pitch class. `midiNotes` is not filled (a `ChromaFrame` carries no note numbers).
- `level` — every frame, `energy` passed through.

## Tunable parameters

| Parameter                 | Where             | Default                  | Effect                                                             |
| ------------------------- | ----------------- | ------------------------ | ------------------------------------------------------------------ |
| `stability`               | config            | 0.5                      | `p_stay` 0.6 → 0.98 and decoding lag 4 → 8 frames (6 at 0.5)       |
| `vocabLevel`              | config            | 2                        | 3 / 9 / 34 qualities → 36 / 108 / 408 templates                    |
| `showSlashChords`         | config            | true                     | slash bass on / off for both paths                                 |
| `DEFAULT_TAU`             | `smoother.ts`     | 0.08                     | lower = trust each frame more, flickers more                       |
| `WINDOW`                  | `smoother.ts`     | 32                       | ring size (max lag 31)                                             |
| `HARMONIC_SMEAR`          | `templates.ts`    | 0.1                      | fifth-partial leakage modelled in templates                        |
| `NO_CHORD_ENERGY_PENALTY` | `chordScorer.ts`  | 0.25                     | how strongly loud flat chroma is still allowed to be "no chord"    |
| `SILENCE_ENERGY`          | `chordScorer.ts`  | 0.01                     | energy gate for silence                                            |
| `EXACT_MIN_SCORE`         | `chordScorer.ts`  | 0.45                     | weakest partial MIDI match reported (a lone note is never a chord) |
| `MIN_BASS_FRAMES`         | `bassResolver.ts` | 3                        | frames a bass must hold before a slash chord shows                 |
| `DEFAULT_KEY_OPTIONS`     | `keyEstimator.ts` | 8 s / 0.08 / 2 s / 1.5 s | half-life, switch margin, switch hold, first-key evidence          |
| `NOTE_THRESHOLD`          | `noteTracker.ts`  | 0.10                     | mic note activation threshold                                      |

`mode`, `instrument` and `a4` are accepted but not used here (tuning and instrument profiles live
in `src/audio`).

## Latency and cost

Mic chord display lag = `lag` frames: ~170 / 260 / 340 ms at stability 0 / 0.5 / 1 with 43 ms hops,
on top of the audio frame. The test suite measures ~0.03 ms per frame at level 3 (M-series laptop,
Node 22); the per-frame work is ~5 k multiply-adds for scoring plus O(lag × N) for the posterior.

## Known failure modes

- **Inherently ambiguous sets.** C6 = Am7, Cm6 = Am7b5, dim7 and aug are symmetric, Csus2 = Gsus4,
  C6/9 = D9sus4. The exact path picks the reading rooted on the bass, else the simpler/earlier
  quality (so `C6/E` reads as `Am7/E`); the mic path relies on template weights (root highest).
- **Triads vs. their extensions at level 3.** A thin Cmaj7 voicing can decode as C or Em when the
  7th or root is weak in the chroma; raising the level increases this confusion.
- **Larger vocabularies switch more slowly**: the switch mass is spread over more states, so the
  per-switch log penalty grows with N (ln(408 / 36) ≈ 2.4 nats more at level 3 than level 1).
- **Bass**: depends entirely on `frame.bass`; a wrong or wandering bass from the audio side only
  shows as a slash chord if it is a chord tone and holds 3 frames.
- **Relative major/minor**: the estimate can sit on the relative minor (or the dominant) when the
  progression emphasises it; `relative` and `alternatives` are always reported so the UI can show
  the pair. No explicit major prior is applied yet (risk table §8).
- **Fixed-lag decisions can disagree with later evidence**; we never revise an emitted chord, so a
  rare one-off spurious label is possible at changes (tests allow ≤ 1 per change).
- **Room mode / vocals**: nothing specific here yet; a sustained sung note shifts the cosine like
  any other partial.

## Theory integration

- `templates.ts` builds its banks from `@/theory` `CHORD_TEMPLATES`; `CHORD_VOCAB` is an alias of it,
  and `QUALITY_ORDER`, `qualitiesForLevel`, `chordTones`, `sameChord` are re-exported from `@/theory`.
- `identifyExact` delegates to `@/theory` `identifyChord` (role-weighted missing-tone penalty, dyad rule).
- `KRUMHANSL_*`, `relativeKey` come from `@/theory`.
