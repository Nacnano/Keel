/**
 * Sound for the ear-training drills: clips (timed chord steps) built from `@/theory`
 * voicings, sequenced on the shared sampled piano from `@/app/live/audition`.
 *
 * Every `play()` cancels the previous clip, so tapping Replay / Next never stacks sound.
 * If the piano samples cannot load, the clip falls back to a soft oscillator so the drill
 * still works offline.
 */
import type { Chord, Key, MidiEvent, MidiNote, VocabLevel } from '@/core';
import { chordToMidiNotes } from '@/midi';
import { cadenceChords, voicings } from '@/theory';
import { ensurePianoLoaded, getPianoPlayer } from '@/app/live/audition';

export interface Step {
  /** Notes struck together at the start of the step (empty = rest). */
  notes: MidiNote[];
  /** Length of the step in beats. */
  beats: number;
  /** How long the notes ring, in beats. Default `beats`. */
  hold?: number;
  velocity?: number;
}

export interface Clip {
  steps: Step[];
  bpm: number;
}

export interface PlayHandle {
  /** Resolves when the clip ends or is cancelled. */
  done: Promise<void>;
  cancel(): void;
}

export interface PlayOptions {
  /** Called when sound actually starts (after the samples have loaded). */
  onStart?(): void;
}

export interface Playback {
  play(clip: Clip, opts?: PlayOptions): PlayHandle;
  stop(): void;
}

export type Tempo = 'slow' | 'medium' | 'fast';

export const TEMPO_BPM: Readonly<Record<Tempo, number>> = { slow: 60, medium: 84, fast: 112 };

const QUESTION_VELOCITY = 84;
const CADENCE_VELOCITY = 62;

// ---------------------------------------------------------------------------
// Clip builders (pure)

export function clipDuration(clip: Clip): number {
  const spb = 60 / clip.bpm;
  let t = 0;
  let end = 0;
  for (const s of clip.steps) {
    if (s.notes.length) end = Math.max(end, t + (s.hold ?? s.beats) * spb);
    t += s.beats * spb;
  }
  return Math.max(t, end);
}

/** Note on / off events for the MIDI player (seconds from the clip start). */
export function clipEvents(clip: Clip): MidiEvent[] {
  const spb = 60 / clip.bpm;
  const out: MidiEvent[] = [];
  let t = 0;
  for (const s of clip.steps) {
    const off = t + (s.hold ?? s.beats) * spb * 0.97;
    for (const note of s.notes) {
      const velocity = s.velocity ?? QUESTION_VELOCITY;
      out.push({ t, type: 'on', note, velocity, channel: 0 });
      out.push({ t: off, type: 'off', note, velocity: 0, channel: 0 });
    }
    t += s.beats * spb;
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Root-position chord around middle C with the root doubled an octave below. */
export function qualityNotes(chord: Chord): MidiNote[] {
  const octave = chord.root >= 6 ? 3 : 4;
  const upper = chordToMidiNotes({ root: chord.root, quality: chord.quality }, octave);
  return [upper[0] - 12, ...upper];
}

/** Chord-quality clip: block chord, broken upwards, block again. */
export function qualityClip(chord: Chord, bpm: number): Clip {
  const notes = qualityNotes(chord);
  const upper = notes.slice(1);
  const arpeggio: Step[] = upper.map((n, i) => ({
    notes: [n],
    beats: 0.5,
    hold: (upper.length - i) * 0.5 + 0.5,
  }));
  return {
    bpm,
    steps: [
      { notes, beats: 2 },
      { notes: [], beats: 0.5 },
      ...arpeggio,
      { notes: [], beats: 0.5 },
      { notes, beats: 2 },
    ],
  };
}

function rightHand(v: readonly MidiNote[]): MidiNote[] {
  return v.slice(1);
}

function movement(from: readonly MidiNote[], to: readonly MidiNote[]): number {
  const near = (n: number, set: readonly MidiNote[]) =>
    Math.min(...set.map((m) => Math.abs(m - n)));
  let cost = 0;
  for (const n of to) cost += near(n, from);
  for (const n of from) cost += near(n, to);
  return cost;
}

/**
 * Close voicings (left-hand bass + right hand) with smooth voice leading: each chord takes
 * the inversion whose right hand moves least from the previous one.
 */
export function voiceLead(chords: readonly Chord[]): MidiNote[][] {
  const out: MidiNote[][] = [];
  for (const chord of chords) {
    const options = voicings(chord, { style: 'close' });
    if (!options.length) {
      out.push(chordToMidiNotes(chord, 4));
      continue;
    }
    const prev = out.length ? rightHand(out[out.length - 1]) : null;
    let best = options[0];
    if (prev?.length) {
      let bestCost = Infinity;
      for (const v of options) {
        const cost = movement(prev, rightHand(v));
        if (cost < bestCost) {
          bestCost = cost;
          best = v;
        }
      }
    }
    out.push(best);
  }
  return out;
}

export interface ChordsClipOptions {
  bpm: number;
  /** Beats per chord. Default 2. */
  beats?: number;
  /** Play I–IV–V–I (i–iv–V–i) first, softer and quicker, then a rest. */
  cadence?: { key: Key; level: VocabLevel };
}

/** A chord sequence (optionally preceded by a cadence that establishes the key). */
export function chordsClip(chords: readonly Chord[], opts: ChordsClipOptions): Clip {
  const steps: Step[] = [];
  if (opts.cadence) {
    for (const notes of voiceLead(cadenceChords(opts.cadence.key, opts.cadence.level))) {
      steps.push({ notes, beats: 1, velocity: CADENCE_VELOCITY });
    }
    steps.push({ notes: [], beats: 1 });
  }
  for (const notes of voiceLead(chords)) steps.push({ notes, beats: opts.beats ?? 2 });
  return { bpm: opts.bpm, steps };
}

// ---------------------------------------------------------------------------
// Players

type OscillatorCtor = new () => AudioContext;
let fallbackCtx: AudioContext | null = null;

/** Soft triangle-wave stand-in when the sampled piano is unavailable. */
function playOscillatorClip(clip: Clip): () => void {
  const Ctor = (globalThis as { AudioContext?: OscillatorCtor }).AudioContext;
  if (!Ctor) return () => {};
  fallbackCtx ??= new Ctor();
  const ctx = fallbackCtx;
  void ctx.resume();
  const master = ctx.createGain();
  master.gain.value = 0.12;
  master.connect(ctx.destination);
  const spb = 60 / clip.bpm;
  const start = ctx.currentTime + 0.05;
  const oscs: OscillatorNode[] = [];
  let t = 0;
  for (const s of clip.steps) {
    const dur = (s.hold ?? s.beats) * spb;
    for (const n of s.notes) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 440 * 2 ** ((n - 69) / 12);
      env.gain.setValueAtTime(0.0001, start + t);
      env.gain.exponentialRampToValueAtTime(1, start + t + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, start + t + dur);
      osc.connect(env).connect(master);
      osc.start(start + t);
      osc.stop(start + t + dur + 0.05);
      oscs.push(osc);
    }
    t += s.beats * spb;
  }
  return () => {
    for (const o of oscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    master.disconnect();
  };
}

/** Playback on the shared sampled piano (`getPianoPlayer`). */
export function createPianoPlayback(): Playback {
  let current: PlayHandle | null = null;

  const play = (clip: Clip, opts: PlayOptions = {}): PlayHandle => {
    current?.cancel();
    let settled = false;
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const cleanups: Array<() => void> = [];
    const finish = () => {
      if (settled) return;
      settled = true;
      for (const f of cleanups.splice(0)) f();
      resolve();
    };
    const after = (seconds: number, f: () => void) => {
      const id = setTimeout(f, seconds * 1000);
      cleanups.push(() => clearTimeout(id));
    };

    void ensurePianoLoaded().then(() => {
      if (settled) return;
      const player = getPianoPlayer();
      const length = clipDuration(clip);
      if (player.isLoaded()) {
        cleanups.push(player.onEnd(finish));
        player.play(clipEvents(clip));
        cleanups.push(() => {
          if (player.isPlaying()) player.stop();
        });
        // backstop in case something else takes over the player mid-clip
        after(length + 1.5, finish);
      } else {
        cleanups.push(playOscillatorClip(clip));
        after(length, finish);
      }
      opts.onStart?.();
    });

    const handle: PlayHandle = { done, cancel: finish };
    current = handle;
    return handle;
  };

  return {
    play,
    stop() {
      current?.cancel();
      current = null;
    },
  };
}
