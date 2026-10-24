import type {
  DisplayFrame,
  ExactNoteChannelMetrics,
  ExactNoteMetrics,
  TruthSpan,
} from './benchmarkTypes';
import { quantile } from './util';

const reference = (s: TruthSpan): number[] | undefined =>
  s.midiNotes ?? (s.chord === null ? [] : undefined);
const unique = (notes: number[]) => [...new Set(notes)].sort((a, b) => a - b);
const channels = ['confirmed', 'tentative', 'union'] as const;
type Channel = (typeof channels)[number];
const displayed = (f: DisplayFrame, channel: Channel) =>
  unique(
    channel === 'confirmed'
      ? (f.midiNotes ?? [])
      : channel === 'tentative'
        ? (f.tentativeMidiNotes ?? [])
        : [...(f.midiNotes ?? []), ...(f.tentativeMidiNotes ?? [])],
  );

/** Exact MIDI highlights sampled at arrival. Unknown note references contribute activity only. */
export function scoreExactNotes(
  truth: TruthSpan[],
  frames: DisplayFrame[],
  duration: number,
): ExactNoteMetrics {
  for (const s of truth) {
    if (
      s.midiNotes &&
      (s.midiNotes.some((n) => !Number.isInteger(n) || n < 0 || n > 127) ||
        new Set(s.midiNotes).size !== s.midiNotes.length ||
        (s.chord === null && s.midiNotes.length))
    )
      throw new Error('Invalid exact MIDI annotation');
  }
  const states: DisplayFrame[] = [{ wall: 0, chord: null, notes: [] }, ...frames];
  const known = truth.filter((s) => reference(s) !== undefined);
  const annotatedSec = known.reduce((sum, s) => sum + s.end - s.start, 0);
  const expectedNoteSec = known.reduce(
    (sum, s) => sum + (s.end - s.start) * reference(s)!.length,
    0,
  );
  const noiseSec = truth
    .filter((s) => s.chord === null)
    .reduce((sum, s) => sum + s.end - s.start, 0);
  // Merge adjoining spans per note; chord boundaries are not necessarily note attacks.
  const runs: Array<{ note: number; start: number; end: number }> = [];
  for (const s of known)
    for (const note of reference(s)!) {
      const previous = runs.findLast((r) => r.note === note);
      if (previous && Math.abs(previous.end - s.start) < 1e-6) previous.end = s.end;
      else runs.push({ note, start: s.start, end: s.end });
    }
  const score = (channel: Channel): ExactNoteChannelMetrics => {
    let visibleSec = 0,
      noiseVisibleSec = 0,
      trueNoteSec = 0,
      falseNoteSec = 0,
      missedNoteSec = 0,
      octaveErrorSec = 0,
      falseVisibleSec = 0;
    for (let i = 0; i < states.length; i++) {
      const f = states[i],
        next = Math.min(duration, states[i + 1]?.wall ?? duration),
        notes = displayed(f, channel);
      if (notes.length) visibleSec += Math.max(0, next - f.wall);
      for (const s of truth) {
        const dt = Math.min(next, s.end) - Math.max(f.wall, s.start);
        if (dt <= 0) continue;
        if (s.chord === null && notes.length) noiseVisibleSec += dt;
        const expected = reference(s);
        if (!expected) continue;
        const wrong = notes.filter((n) => !expected.includes(n));
        trueNoteSec += dt * notes.filter((n) => expected.includes(n)).length;
        falseNoteSec += dt * wrong.length;
        missedNoteSec += dt * expected.filter((n) => !notes.includes(n)).length;
        octaveErrorSec += dt * wrong.filter((n) => expected.some((e) => e % 12 === n % 12)).length;
        if (wrong.length) falseVisibleSec += dt;
      }
    }
    const latencies: number[] = [],
      releases: number[] = [];
    let missedOnsets = 0;
    const at = (t: number) => states.findLast((f) => f.wall <= t)!;
    for (const run of runs) {
      const hit = displayed(at(run.start), channel).includes(run.note)
        ? run.start
        : frames.find(
            (f) =>
              f.wall >= run.start && f.wall < run.end && displayed(f, channel).includes(run.note),
          )?.wall;
      if (hit === undefined) missedOnsets++;
      else latencies.push(hit - run.start);
      // Measure only offsets followed by known absence; never invent a release label in unknown music.
      const after = truth.find((s) => s.start <= run.end + 1e-6 && s.end > run.end + 1e-6);
      if (!after || reference(after) === undefined || reference(after)!.includes(run.note))
        continue;
      if (!displayed(at(run.end), channel).includes(run.note)) releases.push(0);
      else {
        const clear = frames.find(
          (f) =>
            f.wall >= run.end && f.wall < after.end && !displayed(f, channel).includes(run.note),
        );
        releases.push((clear?.wall ?? after.end) - run.end);
      }
    }
    return {
      visibleSec,
      activityCoverage:
        noiseSec < duration
          ? (visibleSec - noiseVisibleSec) / (duration - noiseSec)
          : visibleSec / duration,
      trueNoteSec,
      falseNoteSec,
      missedNoteSec,
      octaveErrorSec,
      falseVisibleSec,
      precision: trueNoteSec + falseNoteSec ? trueNoteSec / (trueNoteSec + falseNoteSec) : null,
      recall: expectedNoteSec ? trueNoteSec / expectedNoteSec : null,
      onsetP90Sec: latencies.length ? quantile(latencies, 0.9) : null,
      missedOnsets,
      releaseSec: releases.length ? Math.max(...releases) : null,
    };
  };
  return {
    protocol: 1,
    annotatedSec,
    expectedNoteSec,
    expectedOnsets: runs.length,
    confirmed: score('confirmed'),
    tentative: score('tentative'),
    union: score('union'),
  };
}
