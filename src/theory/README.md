# `src/theory/` — music theory (WS-A)

Pure TypeScript. No DOM, no audio, no timers; imports only `@/core` and sibling files
(enforced by `index.test.ts`). Everything is deterministic. Import from `@/theory`.

## Modules

| Module         | Main exports                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vocab.ts`     | `CHORD_TEMPLATES: Record<ChordQuality, { intervals, weights, roles, level, symbol }>`, `QUALITY_ORDER`, `qualitiesForLevel(level)`, `TONE_WEIGHTS`, `isMinorQuality` / `isDominantQuality` / `isDiminishedQuality`, `templatePitchClasses` |
| `keys.ts`      | `KRUMHANSL_MAJOR/MINOR`, `TEMPERLEY_MAJOR/MINOR`, `scaleOf(key, variant?)`, `relativeKey`, `parallelKey`, `keySignature`, `keyPrefersFlats`, `isDiatonic`, `diatonicChords(key, level, variant?)`, `ALL_KEYS`, `sameKey`, `mod12`          |
| `notes.ts`     | `pc(name)`, `spell(pc, key?, opts?)`, `keyName(key, opts?)`, `tonicName`, `midiToPc`, `pcToMidi(pc, octave)`, `midiName`, `transpose`, `spellAbove`, `prettyAccidentals`                                                                   |
| `chordName.ts` | `chordSymbol(chord \| null, key?, opts?)`, `chordTones(chord)` / `chordTones(root, quality)`, `chordPitchClasses`, `spellChord(chord, key?, opts?)`, `spellBass`, `chordKey`, `sameChord`, `parseChord(symbol)`                            |
| `identify.ts`  | `identifyChord(pcs, bass, level) → { chord, score }[]`, `bestChord`, `MIN_IDENTIFY_SCORE`                                                                                                                                                  |
| `numerals.ts`  | `romanNumeral(chord, key, opts?)`, `scaleDegree(pc, key)`, `bassDegree(chord, key)`, `inversionFigure(chord)`, `NUMERAL_SUFFIX`                                                                                                            |
| `suggest.ts`   | `suggestNext(key \| null, recent, level, max = 8) → { chord, reason }[]`                                                                                                                                                                   |
| `timeline.ts`  | `compressTimeline(chords, maxCycle = 8) → { chords, repeat }[]`, `compressRepeats(xs, eq, maxCycle?, minCycle?)`, `expandTimeline`, `findCycles`, `collapseRuns`, `canonicalRotation`                                                      |
| `scales.ts`    | `scalesForChord(chord, key?) → { id, name, root, label, pitchClasses, reason, score, rank }[]`, `scaleNotesSpelled(scale, key?, opts?)`, `SCALES`, `scalePitchClasses`                                                                     |
| `voicings.ts`  | `voicings(chord, { style, register? }) → MidiNote[][]`, `VOICING_STYLES`, `omittableTones`                                                                                                                                                 |

## Conventions

**Accidentals** are ASCII everywhere (`Bb`, `F#`, `bVII`, `#iv°`); use `prettyAccidentals` for
display. `°` and `ø` are used in numerals.

**Spelling** (`notes.spell`) follows the key: scale notes take the key signature's letters
(Cb in Gb major), chromatic notes the usual chromatic degrees (b2 b3 #4 b6 b7 in major, so a
borrowed bIII in G major is `Bb`; b2 3 #4 6 7 in minor). When that would need a double
accidental or Cb / Fb / E# / B# outside the scale, the plain name on the key's side of the
circle is used. No key → `C C# D Eb E F F# G Ab A Bb B`. `spellingFollowsKey: false` → sharps.
Chord tones (`spellChord`) are spelled by interval from the root (C#7 = C# E# G# B).
Enharmonic keys: Db, Gb major; C#, F#, G#, Eb minor.

**Numerals.** Case follows the quality (minor / diminished lower case); suffixes: `7`, `maj7`,
`ø7`, `°`, `°7`, `+`, `(maj7)`, extensions verbatim. Minor keys default to the pop convention
(degrees relative to the parallel major: `i ii° bIII iv v bVI bVII`, with harmonic-minor `V`,
`V7`, `vii°` counted as diatonic); `{ minorStyle: 'natural' }` gives `III VI VII`. Secondary
dominants (`V7/vi`, `V/V`) are any non-diatonic dominant-type chord a fifth above a diatonic
major / minor chord other than the tonic; dim7 chords a semitone below one read `vii°7/x`. A
major triad on the tonic of a minor key reads `I` and a major IV in minor reads `IV` (not
`V/bVII`). The slash bass is never part of the numeral: use `bassDegree` ('3' for C/E in C)
or `inversionFigure` ('6', '64', '65', '43', '42').

**Identification** (`identifyChord`) is exact set matching for MIDI. Score =
`(matched − Σmissing·0.6·(0.5 + w/2) − 0.8·extra) / max(size, count)`, capped at 1, dropped
below 0.45. Ties: chord rooted on the bass, lower level, fewer tones, `QUALITY_ORDER`, lower
root. The bass is added to the set; a chord-tone bass other than the root gives a slash chord.
Dyads: perfect fifth / fourth → `'5'`, anything else → `[]`.

**Timeline.** `compressTimeline` merges consecutive duplicates, then finds the
non-overlapping cycles (1–8 chords, ≥ 2 passes) that show the fewest chords (dynamic
programming, not greedy), preferring the earliest cycle on ties. `compressRepeats` is the
generic version (no duplicate merging, returns `start` indices) for `ChordRecord` rows.

**Suggestions** come from: diatonic continuations of the last chord's function, resolution
down a fifth, secondary dominants (and their ii at level 2+) of the two likeliest targets,
ii–V setups, tritone subs (level 3 only), borrowed iv / bVII / bVI (dorian IV in minor).
Qualities: triads at level 1, triads + dominant sevenths at 2, sevenths at 3. The current chord
and same-root subsets / supersets of it (Dm7 → Dm) are never suggested; same-root colour
changes are (C → C7, F → Fm).

**Scales.** `scalesForChord` filters an idiomatic per-quality list to scales that contain every
chord tone (the fifth may be altered; blues / minor pentatonic, and major pentatonic over
dominants, may skip one as colour), then ranks by how many of the scale's other notes sit in
the key (natural minor plus the leading tone in minor keys) blended with the idiomatic order.
So Dm7 in C → D dorian, G7 → mixolydian, Fmaj7 → lydian, E7 in A minor → phrygian dominant
(mode 5 of harmonic minor). Reasons name the numeral and parent scale ("ii7 in C major: mode 2
of C major; every note in the key"). `scaleNotesSpelled` spells seven-note scales one letter
per degree from the root (falling back to the key spelling for odd enharmonics), and other
scales with `spell(pc, key)`.

**Voicings.** Left-hand bass in C2–B2; right hand centred on `register` (default G4 = 67).
Rootless A starts on the 3rd, B on the 7th, centred on middle C (left-hand comping). Chords
with more than four tones drop the fifth first (`omittableTones`); an 11 chord also drops
its major third. A power chord has no rootless voicing.

## Integration notes (replacing the `TODO(integration)` stand-ins)

| Stand-in                                                                                                        | Replace with                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analysis/templates.ts` `CHORD_VOCAB`, `QUALITY_ORDER`, `qualitiesForLevel`, `chordTones(root, q)`, `sameChord` | `CHORD_TEMPLATES` (same intervals and weights, plus `roles` / `symbol`), `QUALITY_ORDER`, `qualitiesForLevel`, `chordTones(root, q)`, `sameChord`                                                                                       |
| `analysis/chordScorer.ts` `identifyExact`                                                                       | `identifyChord` (same signature and output shape; adds the dyad rule and role-weighted missing-tone penalty)                                                                                                                            |
| `analysis/keyEstimator.ts` profiles                                                                             | `KRUMHANSL_MAJOR`, `KRUMHANSL_MINOR` (identical values)                                                                                                                                                                                 |
| `ui/lib/chordLabel.ts`                                                                                          | `spell(pc, key, { spellingFollowsKey })` for `noteName(pc, { key, … })`; `chordSymbol(chord, key, { spellingFollowsKey, showSlash })`; `chordTones`; `sameChord`; `sameKey`; `keyName` for `keyLabel`; `prettyAccidentals` for `pretty` |
| `ui/lib/numeral.ts`                                                                                             | `romanNumeral(chord, key)`                                                                                                                                                                                                              |
| `ui/lib/compress.ts` `compressRepeats`, `Segment<T>`                                                            | `compressRepeats`, `RepeatSegment<T>` (same `{ items, repeat, start }` shape)                                                                                                                                                           |
| `ui/lib/suggest.ts`                                                                                             | `suggestNext(key, recent, level, max?)` (default max is 8, the stand-in's was 5)                                                                                                                                                        |
| `data/chordSymbol.ts`                                                                                           | `chordSymbol(chord, key)` (key instead of a `flats` flag; null → 'N.C.'), `chordKey`, `keyName`, `keyPrefersFlats`                                                                                                                      |
| `data/cycles.ts`                                                                                                | `findCycles`, `canonicalRotation`, `collapseRuns` (same signatures; `findCycles` is optimal rather than greedy, identical on simple cases)                                                                                              |
| `midi/chordAudition.ts` `INTERVALS`                                                                             | `CHORD_TEMPLATES[q].intervals` (all within one octave) or `voicings(chord, { style: 'close' })[0]`                                                                                                                                      |
