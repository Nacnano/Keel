import type { Chord, PitchClass } from '@/core/types';
import type { BenchmarkMetrics, DisplayFrame, TruthSpan } from './benchmarkTypes';
import { quantile } from './util';

export const chordId = (c: Chord | null) => (c ? `${c.root}:${c.quality}` : '-');
const matches = (a: Chord | null, b: Chord | null | 'unknown') =>
  b !== 'unknown' && chordId(a) === chordId(b);

/** Score arrival times, never the decoder's backdated event timestamps. */
export function scoreBenchmark(
  truth: TruthSpan[],
  frames: DisplayFrame[],
  duration: number,
  keyEvents: number,
): BenchmarkMetrics {
  if (!(duration > 0) || !frames.length) throw new Error('Empty benchmark run');
  let end = 0;
  for (const span of truth) {
    if (span.start < end - 1e-6 || span.end <= span.start || span.end > duration + 1e-6)
      throw new Error('Invalid or overlapping ground truth');
    end = span.end;
  }
  const at = (t: number) => truth.find((s) => t >= s.start && t < s.end);
  const music = truth.filter((s) => s.chord && s.chord !== 'unknown');
  const noise = truth.filter((s) => s.chord === null);
  const musicSec = music.reduce((s, g) => s + g.end - g.start, 0);
  const noiseSec = noise.reduce((s, g) => s + g.end - g.start, 0);
  let correct = 0,
    steady = 0,
    steadyCorrect = 0,
    visible = 0;
  let noteVisible = 0;
  let falseChordSec = 0,
    falseNoteSec = 0;
  // Intersect exact state and label intervals, including initial blank display.
  const states: DisplayFrame[] = [{ wall: 0, chord: null, notes: [] }, ...frames];
  for (let i = 0; i < states.length; i++) {
    const f = states[i];
    const next = Math.min(duration, states[i + 1]?.wall ?? duration);
    if (f.chord) visible += next - f.wall;
    if (f.notes.length) noteVisible += next - f.wall;
    for (const g of truth) {
      const from = Math.max(f.wall, g.start),
        to = Math.min(next, g.end);
      if (to <= from || g.chord === 'unknown') continue;
      if (g.chord === null) {
        if (f.chord) falseChordSec += to - from;
        if (f.notes.length) falseNoteSec += to - from;
      } else {
        const settled = Math.max(0, to - Math.max(from, g.start + 0.5));
        steady += settled;
        if (matches(f.chord, g.chord)) {
          correct += to - from;
          steadyCorrect += settled;
        }
      }
    }
  }
  const changes = frames.filter(
    (f, i) => i === 0 || chordId(f.chord) !== chordId(frames[i - 1].chord),
  );
  let wrongChanges = 0,
    chordFlickers = 0,
    noteChanges = 0,
    noteFlashes = 0;
  const noteStart = new Map<number, number>();
  let prevNotes: PitchClass[] = [];
  for (const f of frames) {
    if (f.notes.join(',') !== prevNotes.join(',')) noteChanges++;
    for (const pc of f.notes) if (!prevNotes.includes(pc)) noteStart.set(pc, f.wall);
    for (const pc of prevNotes) {
      if (f.notes.includes(pc)) continue;
      const start = noteStart.get(pc)!;
      // Ignore genuine note changes near a labeled harmonic boundary.
      if (f.wall - start < 0.25 && !truth.some((g) => g.start > start && g.start <= f.wall))
        noteFlashes++;
      noteStart.delete(pc);
    }
    prevNotes = f.notes;
  }
  for (let i = 0; i < changes.length; i++) {
    const f = changes[i],
      g = at(f.wall);
    if (f.chord && g && g.chord !== 'unknown' && !matches(f.chord, g.chord)) wrongChanges++;
    if (i < 2) continue;
    const a = changes[i - 2],
      b = changes[i - 1];
    if (
      chordId(a.chord) === chordId(f.chord) &&
      f.wall - b.wall <= 1 &&
      !truth.some((s) => s.start > b.wall && s.start <= f.wall)
    )
      chordFlickers++;
  }
  const latencies: number[] = [];
  let missedChanges = 0;
  for (const g of music) {
    const previous = [...frames].reverse().find((f) => f.wall <= g.start);
    if (previous && matches(previous.chord, g.chord)) {
      latencies.push(0);
      continue;
    }
    const hit = frames.find(
      (f) => f.wall >= g.start && f.wall < g.end && matches(f.chord, g.chord),
    );
    if (hit) latencies.push(hit.wall - g.start);
    else missedChanges++;
  }
  const releases: number[] = [];
  for (const g of noise) {
    if (!music.some((s) => Math.abs(s.end - g.start) < 1e-6)) continue;
    const previous = [...frames].reverse().find((f) => f.wall <= g.start);
    if (!previous?.chord) {
      releases.push(0);
      continue;
    }
    const clear = frames.find((f) => f.wall >= g.start && f.wall < g.end && !f.chord);
    releases.push(clear ? clear.wall - g.start : g.end - g.start);
  }
  return {
    durationSec: duration,
    musicSec,
    noiseSec,
    annotatedFraction: (musicSec + noiseSec) / duration,
    accuracy: musicSec ? correct / musicSec : null,
    steadyAccuracy: steady ? steadyCorrect / steady : null,
    coverage: visible / duration,
    noteCoverage: noteVisible / duration,
    missedChanges,
    expectedChanges: music.length,
    latencyP90Sec: latencies.length ? quantile(latencies, 0.9) : null,
    wrongChanges,
    chordFlickers,
    noteChanges,
    noteFlashes,
    falseChordSec,
    falseNoteSec,
    falseKeyEvents: musicSec === 0 && noiseSec > duration - 0.1 ? keyEvents : 0,
    releaseSec: releases.length ? Math.max(...releases) : null,
  };
}
