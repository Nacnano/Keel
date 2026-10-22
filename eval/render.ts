/**
 * Piano jam sessions with ground truth, rendered to mono Float32Array from the real
 * Splendid Grand Piano samples (see `samples.ts`), or from a piano-like additive synth when
 * the samples cannot be fetched.
 *
 * Each session is a progression played in one style:
 *   block   – chords struck on the downbeat (RH sometimes re-strikes on beat 3), no pedal
 *   pedal   – block chords with late pedal changes: the previous chord rings 300–800 ms
 *             into the next one
 *   broken  – arpeggiated in eighths (LH 1-5-8, RH voicing up and down) under the pedal
 *   melody  – LH chord + bass held, RH melody (chord tones on strong beats, passing tones)
 *   jazz    – LH root, RH shell / rootless voicing, comping on beat 1 and the "and" of 2
 *
 * Timing is humanised (±10 ms), velocities vary (±8 plus accents). Ground truth is the
 * written chord from its downbeat to the next chord's downbeat.
 */
import type { Chord, Key, MidiNote } from '@/core/types';
import { CHORD_TEMPLATES, parseChord } from '@/theory';
import { loadPiano, SAMPLE_RATE, type Piano } from './samples';
import { gaussian, normalizePeak, rng } from './util';

export type Style = 'block' | 'pedal' | 'broken' | 'melody' | 'jazz';
export type Voicing = 'close' | 'shell' | 'rootless';

export interface SessionSpec {
  id: string;
  /** 'C' = C major, 'Am' = A minor. */
  key: string;
  bpm: number;
  beatsPerChord: number;
  style: Style;
  voicing: Voicing;
  progression: string[];
  repeats: number;
  /** Mean velocity 1..127. */
  velocity: number;
  seed: number;
}

export interface GtChord {
  t0: number;
  t1: number;
  chord: Chord;
  symbol: string;
}

export interface Session {
  id: string;
  spec: SessionSpec;
  key: Key;
  sampleRate: number;
  samples: Float32Array;
  chords: GtChord[];
  durationSec: number;
  /** True when rendered with the additive fallback synth instead of real samples. */
  synth: boolean;
}

interface NoteEvent {
  midi: MidiNote;
  vel: number;
  on: number;
  off: number;
}

export const SESSIONS: SessionSpec[] = [
  {
    id: 'pop-C-block-90',
    key: 'C',
    bpm: 90,
    beatsPerChord: 4,
    style: 'block',
    voicing: 'close',
    progression: ['C', 'G', 'Am', 'F'],
    repeats: 3,
    velocity: 80,
    seed: 1,
  },
  {
    id: 'pop-G-broken-72',
    key: 'G',
    bpm: 72,
    beatsPerChord: 4,
    style: 'broken',
    voicing: 'close',
    progression: ['G', 'Em', 'C', 'D'],
    repeats: 2,
    velocity: 70,
    seed: 2,
  },
  {
    id: 'pop-Eb-inversions-100',
    key: 'Eb',
    bpm: 100,
    beatsPerChord: 4,
    style: 'pedal',
    voicing: 'close',
    progression: ['Eb', 'Bb/D', 'Cm', 'Ab', 'Eb/G', 'Ab', 'Bb'],
    repeats: 2,
    velocity: 85,
    seed: 3,
  },
  {
    id: 'pop-F-melody-84',
    key: 'F',
    bpm: 84,
    beatsPerChord: 4,
    style: 'melody',
    voicing: 'close',
    progression: ['F', 'Dm', 'Bb', 'C'],
    repeats: 3,
    velocity: 75,
    seed: 4,
  },
  {
    id: 'pop-D-pedal-120',
    key: 'D',
    bpm: 120,
    beatsPerChord: 2,
    style: 'pedal',
    voicing: 'close',
    progression: ['D', 'A/C#', 'Bm', 'G'],
    repeats: 6,
    velocity: 90,
    seed: 5,
  },
  {
    id: 'pop-Ab-ballad-60',
    key: 'Ab',
    bpm: 60,
    beatsPerChord: 4,
    style: 'broken',
    voicing: 'close',
    progression: ['Ab', 'Fm', 'Db', 'Eb'],
    repeats: 2,
    velocity: 60,
    seed: 6,
  },
  {
    id: 'pop-Am-block-80',
    key: 'Am',
    bpm: 80,
    beatsPerChord: 4,
    style: 'pedal',
    voicing: 'close',
    progression: ['Am', 'F', 'C', 'G'],
    repeats: 2,
    velocity: 78,
    seed: 7,
  },
  {
    id: 'jazz-Bb-251-120',
    key: 'Bb',
    bpm: 120,
    beatsPerChord: 4,
    style: 'jazz',
    voicing: 'shell',
    progression: ['Cm7', 'F7', 'Bbmaj7', 'Gm7'],
    repeats: 3,
    velocity: 76,
    seed: 8,
  },
  {
    id: 'jazz-F-rootless-100',
    key: 'F',
    bpm: 100,
    beatsPerChord: 4,
    style: 'jazz',
    voicing: 'rootless',
    progression: ['Gm9', 'C9', 'Fmaj9', 'Dm9'],
    repeats: 3,
    velocity: 72,
    seed: 9,
  },
  {
    id: 'jazz-Db-251-90',
    key: 'Db',
    bpm: 90,
    beatsPerChord: 4,
    style: 'jazz',
    voicing: 'rootless',
    progression: ['Ebm9', 'Ab13', 'Dbmaj9', 'Bbm7'],
    repeats: 2,
    velocity: 74,
    seed: 10,
  },
];

const LEAD_IN_SEC = 0.6;
const TAIL_SEC = 1.2;

export function parseKey(name: string): Key {
  const minor = name.endsWith('m');
  const c = parseChord(name);
  if (!c) throw new Error(`bad key ${name}`);
  return { tonic: c.root, mode: minor ? 'minor' : 'major' };
}

const mod12 = (x: number) => ((x % 12) + 12) % 12;

/** MIDI note with pitch class `pc` in [lo, lo + 11]. */
function placeAt(pc: number, lo: number): number {
  return lo + mod12(pc - lo);
}

/** RH interval sets (semitones above the root, may exceed 12) for each voicing style. */
function rhIntervals(chord: Chord, voicing: Voicing): number[] {
  const q = chord.quality;
  if (voicing === 'rootless') {
    switch (q) {
      case 'min9':
      case 'min7':
        return [3, 7, 10, 14];
      case '9':
        return [4, 7, 10, 14];
      case '13':
        return [10, 14, 16, 21];
      case 'maj9':
      case 'maj7':
        return [4, 7, 11, 14];
      default:
        break;
    }
  }
  if (voicing === 'shell') {
    const t = CHORD_TEMPLATES[q].intervals;
    return t.filter((i) => i !== 0); // 3, 5, 7 (no root)
  }
  return CHORD_TEMPLATES[q].intervals.slice();
}

/** Voice-led placement: choose the rotation whose centre is closest to `prevCentre`. */
function voice(root: number, intervals: number[], lo: number, hi: number, prevCentre: number) {
  const pcs = intervals.map((i) => mod12(root + i));
  let best: number[] = [];
  let bestScore = Infinity;
  for (let r = 0; r < pcs.length; r++) {
    const order = [...pcs.slice(r), ...pcs.slice(0, r)];
    for (const base of [lo, lo + 6]) {
      const notes: number[] = [];
      let prev = base - 1;
      for (const pc of order) {
        const n = placeAt(pc, prev + 1);
        notes.push(n);
        prev = n;
      }
      if (notes[notes.length - 1] > hi) continue;
      const centre = notes.reduce((a, b) => a + b, 0) / notes.length;
      const score = Math.abs(centre - prevCentre) + (notes[notes.length - 1] - notes[0]) * 0.05;
      if (score < bestScore) {
        bestScore = score;
        best = notes;
      }
    }
  }
  return best;
}

function scaleOf(key: Key): number[] {
  const steps = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  return steps.map((s) => mod12(key.tonic + s));
}

/** Note events + ground truth for a session spec. */
export function performSession(spec: SessionSpec): { notes: NoteEvent[]; chords: GtChord[] } {
  const rand = rng(spec.seed * 7919);
  const gauss = gaussian(rand);
  const key = parseKey(spec.key);
  const scale = scaleOf(key);
  const beat = 60 / spec.bpm;
  const span = beat * spec.beatsPerChord;
  const symbols = Array.from({ length: spec.repeats }, () => spec.progression).flat();
  const notes: NoteEvent[] = [];
  const chords: GtChord[] = [];
  const jitter = () => 0.01 * Math.max(-2, Math.min(2, gauss()));
  const vel = (base: number) =>
    Math.max(30, Math.min(120, Math.round(base + 8 * Math.max(-2, Math.min(2, gauss())))));
  let rhCentre = 64;

  symbols.forEach((symbol, i) => {
    const chord = parseChord(symbol);
    if (!chord) throw new Error(`bad chord ${symbol}`);
    const t0 = LEAD_IN_SEC + i * span;
    const t1 = t0 + span;
    chords.push({ t0, t1, chord, symbol });
    const bassPc = chord.bass ?? chord.root;
    const bass = placeAt(bassPc, 36 + 2); // D2..C#3
    // Pedal: hold until the next downbeat plus a sloppy 300–800 ms change.
    const pedalOff = t1 + 0.3 + 0.5 * rand();
    const legatoOff = t1 - 0.04;
    const v0 = spec.velocity;

    switch (spec.style) {
      case 'block':
      case 'pedal': {
        const off = spec.style === 'pedal' ? pedalOff : legatoOff;
        const rh = voice(chord.root, rhIntervals(chord, spec.voicing), 55, 77, rhCentre);
        rhCentre = rh.reduce((a, b) => a + b, 0) / rh.length;
        const on = t0 + jitter();
        notes.push({ midi: bass, vel: vel(v0 + 4), on, off });
        if (spec.beatsPerChord >= 4 && rand() < 0.5) {
          const re = t0 + 2 * beat + jitter();
          for (const n of rh) {
            notes.push({ midi: n, vel: vel(v0), on: on + 0.004 * rand(), off: re - 0.03 });
            notes.push({ midi: n, vel: vel(v0 - 14), on: re, off });
          }
        } else {
          for (const n of rh) notes.push({ midi: n, vel: vel(v0), on: on + 0.004 * rand(), off });
        }
        break;
      }
      case 'broken': {
        const rh = voice(chord.root, rhIntervals(chord, spec.voicing), 55, 74, rhCentre);
        rhCentre = rh.reduce((a, b) => a + b, 0) / rh.length;
        // LH 1-5-8, then the RH voicing up and back down (8 eighths per 4/4 bar).
        const fifth = placeAt(chord.root + 7, bass + 1);
        const pattern = [bass, fifth, bass + 12, ...rh, ...rh.slice(1, -1).reverse()];
        const eighth = beat / 2;
        const steps = Math.round(span / eighth);
        for (let s = 0; s < steps; s++) {
          const n = pattern[s % pattern.length];
          const accent = s % 4 === 0 ? 8 : 0;
          notes.push({
            midi: n,
            vel: vel(v0 + accent - 6),
            on: t0 + s * eighth + jitter(),
            off: pedalOff,
          });
        }
        break;
      }
      case 'melody': {
        const lh = voice(chord.root, rhIntervals(chord, 'close'), 48, 62, 55);
        const on = t0 + jitter();
        notes.push({ midi: bass, vel: vel(v0), on, off: pedalOff });
        for (const n of lh) notes.push({ midi: n, vel: vel(v0 - 10), on, off: pedalOff });
        // RH melody: chord tones on beats, scale tones on the off-beat eighths.
        const tones = CHORD_TEMPLATES[chord.quality].intervals.map((x) => mod12(chord.root + x));
        const eighth = beat / 2;
        const steps = Math.round(span / eighth);
        let prev = 72 + mod12(tones[0] - 72);
        for (let s = 0; s < steps; s++) {
          if (s % 2 === 1 && rand() < 0.35) continue; // rests / longer notes
          const pool = s % 2 === 0 ? tones : scale;
          const candidates = pool
            .flatMap((pc) => [placeAt(pc, 70), placeAt(pc, 70) + 12])
            .filter((m) => m <= 86 && Math.abs(m - prev) <= 7);
          const m = candidates.length
            ? candidates[Math.floor(rand() * candidates.length)]
            : placeAt(pool[0], 72);
          prev = m;
          const on2 = t0 + s * eighth + jitter();
          notes.push({ midi: m, vel: vel(v0 + 14), on: on2, off: on2 + eighth * 0.95 });
        }
        break;
      }
      case 'jazz': {
        const ivs = rhIntervals(chord, spec.voicing);
        const rh = voice(chord.root, ivs, 52, 74, rhCentre);
        rhCentre = rh.reduce((a, b) => a + b, 0) / rh.length;
        const on = t0 + jitter();
        notes.push({ midi: bass, vel: vel(v0 + 2), on, off: t1 - 0.03 });
        // Comp: beat 1 (long), "and" of 2 (short), sometimes beat 4.
        const hits: Array<[number, number, number]> = [
          [0, 1.4, 0],
          [1.5, 0.9, -8],
        ];
        if (rand() < 0.5) hits.push([3, 0.9, -12]);
        for (const [b, len, dv] of hits) {
          const ho = t0 + b * beat + jitter();
          for (const n of rh) {
            notes.push({
              midi: n,
              vel: vel(v0 + dv),
              on: ho + 0.005 * rand(),
              off: ho + len * beat,
            });
          }
        }
        break;
      }
    }
  });
  return { notes, chords };
}

/** Linear-interpolated sample playback with a damper release. */
function renderSampled(piano: Piano, notes: NoteEvent[], out: Float32Array, sr: number): void {
  const releaseTau = 0.09;
  const releaseLen = 0.5;
  for (const ev of notes) {
    const s = piano.sampleFor(ev.midi, ev.vel);
    const ratio = Math.pow(2, (ev.midi - s.midi) / 12) * (SAMPLE_RATE / sr);
    const gain = 0.3 * Math.pow(10, ((ev.vel - piano.layerCentre(ev.vel)) * 0.3) / 20);
    const start = Math.round(ev.on * sr);
    const offIdx = Math.round((ev.off - ev.on) * sr);
    const endIdx = Math.min(
      out.length - start,
      offIdx + Math.round(releaseLen * sr),
      Math.floor((s.data.length - 2) / ratio),
    );
    const relK = Math.exp(-1 / (releaseTau * sr));
    let env = 1;
    for (let i = 0; i < endIdx; i++) {
      const pos = i * ratio;
      const k = Math.floor(pos);
      const f = pos - k;
      const v = s.data[k] * (1 - f) + s.data[k + 1] * f;
      if (i >= offIdx) env *= relK;
      out[start + i] += gain * env * v;
    }
  }
}

/**
 * Fallback: piano-like additive synth (stretched partials B = 4e-4, brighter with velocity,
 * two-stage decay, higher partials decaying faster).
 */
function renderSynth(notes: NoteEvent[], out: Float32Array, sr: number): void {
  for (const ev of notes) {
    const f0 = 440 * Math.pow(2, (ev.midi - 69) / 12);
    const start = Math.round(ev.on * sr);
    const offIdx = Math.round((ev.off - ev.on) * sr);
    const len = Math.min(out.length - start, offIdx + Math.round(0.5 * sr));
    const amp = Math.pow(ev.vel / 127, 1.6) * 0.2;
    const bright = 0.8 + ev.vel / 127;
    for (let k = 1; k <= 12; k++) {
      const fk = k * f0 * Math.sqrt(1 + 4e-4 * k * k);
      if (fk > sr / 2 - 100) break;
      const a = amp / Math.pow(k, 2.2 - bright * 0.6);
      const w = (2 * Math.PI * fk) / sr;
      const fast = 2.5 + 0.6 * k;
      const slow = 0.35 + 0.08 * k + f0 / 2000;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        let env = 0.6 * Math.exp(-fast * t) + 0.4 * Math.exp(-slow * t);
        env *= Math.min(1, t / 0.003);
        if (i >= offIdx) env *= Math.exp(-(i - offIdx) / (0.09 * sr));
        out[start + i] += a * env * Math.sin(w * i);
      }
    }
  }
}

let pianoPromise: Promise<Piano | null> | null = null;

function allNotes(specs: SessionSpec[]): { notes: Set<number>; vels: Set<number> } {
  const notes = new Set<number>();
  const vels = new Set<number>();
  for (const spec of specs) {
    for (const ev of performSession(spec).notes) {
      notes.add(ev.midi);
      vels.add(ev.vel);
    }
  }
  return { notes, vels };
}

export async function renderSession(
  spec: SessionSpec,
  sampleRate: number,
  opts: { forceSynth?: boolean } = {},
): Promise<Session> {
  if (!opts.forceSynth) {
    pianoPromise ??= (() => {
      const { notes, vels } = allNotes(SESSIONS);
      return loadPiano(notes, vels);
    })();
  }
  const piano = opts.forceSynth ? null : await pianoPromise;
  const { notes, chords } = performSession(spec);
  const durationSec = chords[chords.length - 1].t1 + TAIL_SEC;
  const out = new Float32Array(Math.round(durationSec * sampleRate));
  if (piano) renderSampled(piano, notes, out, sampleRate);
  else renderSynth(notes, out, sampleRate);
  normalizePeak(out, -12);
  return {
    id: spec.id,
    spec,
    key: parseKey(spec.key),
    sampleRate,
    samples: out,
    chords,
    durationSec,
    synth: !piano,
  };
}
