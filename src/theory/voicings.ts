/**
 * Piano voicings for a chord. Every voicing is an ascending list of MIDI notes.
 *
 * Ranges: the left-hand bass sits in C2–B2 (36–47) for close / drop-2 / spread, shells are
 * left-hand only from C2–B2 up to at most Eb4, rootless voicings are left-hand comping shapes centred on middle
 * C, and right-hand parts are centred on `register` (default G4 = 67, i.e. within C4–C6).
 */
import type { Chord, ChordQuality, MidiNote, PitchClass } from '@/core';
import { mod12 } from './keys';
import { CHORD_TEMPLATES } from './vocab';
import type { ToneRole } from './vocab';

export type VoicingStyle = 'close' | 'drop2' | 'spread' | 'shell' | 'rootless';

export const VOICING_STYLES: readonly VoicingStyle[] = [
  'close',
  'drop2',
  'spread',
  'shell',
  'rootless',
];

export interface VoicingOptions {
  style: VoicingStyle;
  /** Approximate centre of the right-hand part (MIDI note). Default 67 (G4). */
  register?: MidiNote;
}

export const DEFAULT_REGISTER = 67;
const LH_BASS_LOW = 36; // C2
const SHELL_LOW = 36; // C2: keeps R-7-10 shells at or below Eb4
const RH_LOWEST = 55; // G3
const ROOTLESS_LOWEST = 48; // C3
const ROOTLESS_OFFSET = -7; // rootless centre relative to register (G4 -> C4)

interface Tone {
  pc: PitchClass;
  interval: number;
  role: ToneRole;
}

function tonesOf(chord: Chord): Tone[] {
  const t = CHORD_TEMPLATES[chord.quality];
  return t.intervals.map((interval, k) => ({
    pc: mod12(chord.root + interval),
    interval,
    role: t.roles[k],
  }));
}

/** Tones a voicing may leave out: the perfect fifth, and the clashing major third of an 11 chord. */
export function omittableTones(chord: Chord): PitchClass[] {
  const out: PitchClass[] = [];
  const t = CHORD_TEMPLATES[chord.quality];
  if (t.intervals.includes(7)) out.push(mod12(chord.root + 7));
  if (chord.quality === '11') out.push(mod12(chord.root + 4));
  return out;
}

/** Pick `max` tones by priority: guide tones, extensions, fifth, root. */
function coreTones(chord: Chord, max: number): Tone[] {
  const tones = tonesOf(chord).filter((t) => !(chord.quality === '11' && t.interval === 4));
  const rank: Record<ToneRole, number> = {
    third: 0,
    sus: 0,
    seventh: 1,
    extension: 2,
    fifth: 3,
    root: 4,
  };
  return [...tones].sort((a, b) => rank[a.role] - rank[b.role]).slice(0, max);
}

/** Colour tones added to rootless voicings when the chord itself has none. */
function defaultTensions(quality: ChordQuality, intervals: readonly number[]): number[] {
  const has = (i: number) => intervals.includes(i);
  const t = CHORD_TEMPLATES[quality];
  // chords that already carry two colour tones (11, 13, 7alt, ...) get none
  if (t.roles.filter((r) => r === 'extension').length >= 2) return [];
  const dominant = t.roles.includes('seventh') && has(10) && (has(4) || has(5));
  if (dominant) {
    const out: number[] = [];
    if (!has(1) && !has(3) && !has(2)) out.push(2);
    if (!has(8) && !has(9)) out.push(9);
    return out;
  }
  if (quality === 'm7b5') return [5];
  if (quality === 'dim7' || quality === 'dim' || quality === 'aug' || quality === '5') return [];
  if (quality === 'sus2' || quality === 'sus4') return [];
  return has(2) ? [] : [2];
}

/** Stack pitch classes upwards from `start`, each note the next occurrence above the last. */
function stack(pcs: readonly PitchClass[], start: MidiNote): MidiNote[] {
  const out: MidiNote[] = [];
  let prev = start - 1;
  for (const p of pcs) {
    let n = prev + 1;
    while (mod12(n) !== p) n++;
    out.push(n);
    prev = n;
  }
  return out;
}

/** Transpose by octaves so the mean is closest to `centre`, keeping the lowest note >= `low`. */
function place(notes: MidiNote[], centre: number, low: number): MidiNote[] {
  const mean = notes.reduce((a, b) => a + b, 0) / notes.length;
  let shift = Math.round((centre - mean) / 12) * 12;
  while (Math.min(...notes) + shift < low) shift += 12;
  while (Math.max(...notes) + shift > 108 && Math.min(...notes) + shift - 12 >= 21) shift -= 12;
  return notes.map((n) => n + shift);
}

/** Close-position rotations of a pitch-class set (ordered by interval above the root). */
function rotations(chord: Chord, pcs: readonly PitchClass[]): PitchClass[][] {
  const sorted = [...new Set(pcs)].sort((a, b) => mod12(a - chord.root) - mod12(b - chord.root));
  return sorted.map((_, r) => [...sorted.slice(r), ...sorted.slice(0, r)]);
}

function bassNote(chord: Chord): MidiNote {
  return LH_BASS_LOW + (chord.bass ?? chord.root);
}

function upperSet(chord: Chord): PitchClass[] {
  const tones = tonesOf(chord);
  const pcs = tones.length <= 4 ? tones.map((t) => t.pc) : coreTones(chord, 4).map((t) => t.pc);
  return pcs;
}

function closeVoicings(chord: Chord, register: number): MidiNote[][] {
  const bass = bassNote(chord);
  return rotations(chord, upperSet(chord)).map((rot) => [
    bass,
    ...place(stack(rot, 60), register, RH_LOWEST),
  ]);
}

function drop2Voicings(chord: Chord, register: number): MidiNote[][] {
  const bass = bassNote(chord);
  return rotations(chord, upperSet(chord)).map((rot) => {
    const dropped = stack(rot, 60);
    // dyads have no "second from the top" to drop: leave them in close position
    if (dropped.length >= 3) dropped[dropped.length - 2] -= 12;
    return [
      bass,
      ...place(
        dropped.sort((a, b) => a - b),
        register,
        RH_LOWEST,
      ),
    ];
  });
}

function spreadVoicings(chord: Chord, register: number): MidiNote[][] {
  const tones = tonesOf(chord);
  const root = LH_BASS_LOW + chord.root;
  const out: MidiNote[][] = [];
  const rh = (pcs: PitchClass[]) => {
    const list = pcs.length >= 2 ? pcs : [...pcs, chord.root];
    const ordered = [...list].sort((a, b) => mod12(a - chord.root) - mod12(b - chord.root));
    return place(stack(ordered, 60), register, RH_LOWEST);
  };
  const others = (exclude: ToneRole[]) =>
    tones.filter((t) => !exclude.includes(t.role)).map((t) => t.pc);

  if (chord.bass !== undefined && chord.bass !== chord.root) {
    // slash chord: bass alone in the left hand, everything else open in the right
    const b = bassNote(chord);
    const rest = tones.filter((t) => t.pc !== chord.bass).map((t) => t.pc);
    for (const rot of rotations(chord, rest).slice(0, 3)) {
      const close = stack(rot, 60);
      if (close.length >= 3) close[close.length - 2] -= 12;
      out.push([
        b,
        ...place(
          close.sort((x, y) => x - y),
          register,
          RH_LOWEST,
        ),
      ]);
    }
    return out;
  }

  const fifth = tones.find((t) => t.role === 'fifth');
  const seventh = tones.find((t) => t.role === 'seventh');
  const third = tones.find((t) => t.role === 'third' || t.role === 'sus');
  // root + fifth in the left hand
  if (fifth) out.push([root, root + fifth.interval, ...rh(others(['root', 'fifth']))]);
  // root + seventh in the left hand
  if (seventh) out.push([root, root + seventh.interval, ...rh(others(['root', 'seventh']))]);
  // root + tenth in the left hand
  if (third) out.push([root, root + 12 + third.interval, ...rh(others(['root', third.role]))]);
  if (out.length === 0) out.push([root, ...rh(others(['root']))]);
  return out;
}

function shellVoicings(chord: Chord): MidiNote[][] {
  const tones = tonesOf(chord);
  const lowPc = chord.bass ?? chord.root;
  const low = SHELL_LOW + mod12(lowPc - SHELL_LOW);
  const third = tones.find((t) => t.role === 'third' || t.role === 'sus');
  const seventh = tones.find((t) => t.role === 'seventh');
  const fifth = tones.find((t) => t.role === 'fifth');
  // the "7" of the shell: seventh (or sixth), else the fifth for triads; over a slash bass
  // the guide tone sitting in the bass is replaced by the root
  const swap = (p: PitchClass | undefined) => (p === lowPc ? chord.root : p);
  const g7 = swap((seventh ?? fifth)?.pc);
  const g3 = swap(third?.pc);
  /** First note above `low` with pitch class `p`, plus `octaves`. */
  const above = (p: PitchClass, octaves = 0) => low + (mod12(p - low) || 12) + 12 * octaves;
  const usable = (p: PitchClass | undefined): p is PitchClass => p !== undefined && p !== lowPc;
  const out: MidiNote[][] = [];
  if (usable(g7)) out.push([low, above(g7)]); // R-7
  // the third goes up an octave (a tenth); a root swapped in for a bass third stays close
  const o3 = third?.pc === lowPc ? 0 : 1;
  if (usable(g3)) out.push([low, above(g3, o3)]); // R-10
  if (usable(g7) && usable(g3)) {
    out.push([low, above(g7), above(g3, o3)]); // R-7-10
    out.push([low, above(g3), above(g7)]); // R-3-7
  }
  if (out.length === 0) out.push([low, low + 12]);
  return out;
}

function rootlessVoicings(chord: Chord, register: number): MidiNote[][] {
  const tones = tonesOf(chord);
  const intervals = tones.map((t) => t.interval);
  const core = coreTones(chord, 6).filter((t) => t.role !== 'root');
  const guides = core.filter((t) => t.role === 'third' || t.role === 'sus' || t.role === 'seventh');
  const exts = core.filter((t) => t.role === 'extension');
  const fifths = core.filter((t) => t.role === 'fifth');
  const pcs: PitchClass[] = [];
  const push = (p: PitchClass) => {
    if (pcs.length < 4 && !pcs.includes(p)) pcs.push(p);
  };
  for (const t of guides) push(t.pc);
  for (const t of exts) push(t.pc);
  for (const i of defaultTensions(chord.quality, intervals)) push(mod12(chord.root + i));
  for (const t of fifths) push(t.pc);

  const third = guides.find((t) => t.role !== 'seventh');
  const seventh = guides.find((t) => t.role === 'seventh');
  const rots = rotations(chord, pcs);
  const startsWith = (p: PitchClass | undefined) => rots.find((r) => r[0] === p);
  // type A starts on the third, type B on the seventh
  const a = startsWith(third?.pc) ?? rots[0];
  // without a seventh, B is the next rotation after A
  const b = startsWith(seventh?.pc) ?? rots[(rots.indexOf(a) + 1) % rots.length];
  // a power chord has nothing left once the root goes
  if (pcs.length < 2) return [];
  const centre = register + ROOTLESS_OFFSET;
  return [a, b].map((r) => place(stack(r, 48), centre, ROOTLESS_LOWEST));
}

function dedupe(vs: MidiNote[][]): MidiNote[][] {
  const seen = new Set<string>();
  return vs
    .map((v) => [...new Set(v)].filter((n) => n >= 21 && n <= 108).sort((a, b) => a - b))
    .filter((v) => {
      const k = v.join(',');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/**
 * Voicings for a chord in one style, several options each:
 * - `close`: left-hand bass + close-position right hand, every inversion;
 * - `drop2`: close voicings with the second note from the top dropped an octave;
 * - `spread`: open voicings, left hand root + fifth / seventh / tenth, rest in the right hand;
 * - `shell`: left-hand root (or slash bass) with 3rd and / or 7th (Bud Powell shells);
 * - `rootless`: Bill Evans type A (from the 3rd) and type B (from the 7th), no root.
 * Chords with more than four tones drop the fifth first (see `omittableTones`).
 */
export function voicings(chord: Chord, opts: VoicingOptions): MidiNote[][] {
  const register = opts.register ?? DEFAULT_REGISTER;
  switch (opts.style) {
    case 'close':
      return dedupe(closeVoicings(chord, register));
    case 'drop2':
      return dedupe(drop2Voicings(chord, register));
    case 'spread':
      return dedupe(spreadVoicings(chord, register));
    case 'shell':
      return dedupe(shellVoicings(chord));
    case 'rootless':
      return dedupe(rootlessVoicings(chord, register));
  }
}
