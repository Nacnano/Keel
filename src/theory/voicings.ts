/**
 * Piano voicings for a chord. Every voicing is an ascending list of MIDI notes, read as two
 * hands split at middle C (`splitHands`): the left hand sits in roughly A1–B3, the right hand
 * in C4–C6.
 *
 * Low-register rule: below C3 neighbouring notes are at least a minor third apart (a voicing
 * that would put a second down there moves the upper note up an octave).
 */
import type { Chord, ChordQuality, MidiNote, PitchClass } from '@/core';
import { mod12 } from './keys';
import { CHORD_TEMPLATES } from './vocab';
import type { ToneRole } from './vocab';

export type VoicingStyle =
  'pop' | 'close' | 'spread' | 'shell' | 'drop2' | 'rootlessA' | 'rootlessB';

/** Display order: pop / rock shapes first, jazz shapes last. */
export const VOICING_STYLES: readonly VoicingStyle[] = [
  'pop',
  'close',
  'spread',
  'shell',
  'drop2',
  'rootlessA',
  'rootlessB',
];

export type VoicingRegister = 'low' | 'mid' | 'high';

export const VOICING_REGISTERS: readonly VoicingRegister[] = ['low', 'mid', 'high'];

/** Approximate centre of the right-hand part per register. */
export const REGISTER_CENTRE: Readonly<Record<VoicingRegister, MidiNote>> = {
  low: 60,
  mid: 67,
  high: 74,
};

export interface VoicingOptions {
  style: VoicingStyle;
  /** Where the right hand sits: a named register or a MIDI centre note. Default `'mid'` (G4). */
  register?: VoicingRegister | MidiNote;
}

export const DEFAULT_REGISTER = REGISTER_CENTRE.mid;
/** Middle C: notes below it are left hand, from it up right hand. */
export const HAND_SPLIT: MidiNote = 60;

const BASS_LOW = 36; // C2: left-hand bass in C2–B2
const LH_FLOOR = 28; // E1: shells may drop this far to stay below middle C
const RH_LOW = HAND_SPLIT; // C4
const RH_HIGH = 84; // C6
const COMP_LOW = 48; // C3: lowest note of a left-hand rootless comping shape
const LOW_REGISTER = 48; // C3: below this, no interval smaller than a minor third
const MIN_LOW_INTERVAL = 3;

const LABELS: Record<VoicingStyle, string> = {
  pop: 'Pop',
  close: 'Close',
  spread: 'Spread',
  shell: 'Shell',
  drop2: 'Drop 2',
  rootlessA: 'Rootless A',
  rootlessB: 'Rootless B',
};

const DESCRIPTIONS: Record<VoicingStyle, string> = {
  pop: 'Right-hand triad over the root in octaves',
  close: 'Bass note, right hand in close position',
  spread: 'Left-hand root and fifth, right-hand upper structure',
  shell: 'Left-hand 1-3-7 and 1-7-3 guide tones',
  drop2: 'Second voice from the top dropped an octave',
  rootlessA: 'From the 3rd, no root (let the bass take it)',
  rootlessB: 'From the 7th, no root (let the bass take it)',
};

/** Short tab label: 'Pop', 'Drop 2', 'Rootless A'. */
export function voicingLabel(style: VoicingStyle): string {
  return LABELS[style];
}

/** One-line description of a style for tooltips. */
export function voicingDescription(style: VoicingStyle): string {
  return DESCRIPTIONS[style];
}

/** Split a voicing into hands: below `splitAt` (default middle C) left, the rest right. */
export function splitHands(
  notes: readonly MidiNote[],
  splitAt: MidiNote = HAND_SPLIT,
): { left: MidiNote[]; right: MidiNote[] } {
  const sorted = [...notes].sort((a, b) => a - b);
  return { left: sorted.filter((n) => n < splitAt), right: sorted.filter((n) => n >= splitAt) };
}

interface Tone {
  pc: PitchClass;
  interval: number;
  role: ToneRole;
  /** Index in the template (later extensions define the chord: the 13 of a 13 chord). */
  k: number;
}

function tonesOf(chord: Chord): Tone[] {
  const t = CHORD_TEMPLATES[chord.quality];
  return t.intervals
    .map((interval, k) => ({ pc: mod12(chord.root + interval), interval, role: t.roles[k], k }))
    .filter((t) => !(chord.quality === '11' && t.interval === 4));
}

const isSlash = (chord: Chord) => chord.bass !== undefined && chord.bass !== chord.root;

/** Tones a voicing may leave out: the perfect fifth, and the clashing major third of an 11 chord. */
export function omittableTones(chord: Chord): PitchClass[] {
  const out: PitchClass[] = [];
  const t = CHORD_TEMPLATES[chord.quality];
  if (t.intervals.includes(7)) out.push(mod12(chord.root + 7));
  if (chord.quality === '11') out.push(mod12(chord.root + 4));
  return out;
}

const RANK: Record<ToneRole, number> = {
  third: 0,
  sus: 0,
  seventh: 1,
  extension: 2,
  fifth: 3,
  root: 4,
};

/** Priority order: guide tones, extensions (defining one first), fifth, root (first over a slash bass). */
function byPriority(chord: Chord, tones: Tone[]): Tone[] {
  const rank = (t: Tone) => (t.role === 'root' && isSlash(chord) ? -1 : RANK[t.role]);
  return [...tones].sort((a, b) => rank(a) - rank(b) || b.k - a.k);
}

/**
 * Up to `max` chord tones by priority, leaving out `exclude` (tones the left hand already has);
 * excluded tones come back, by priority, when fewer than `min` remain.
 */
function pickTones(
  chord: Chord,
  { max, min = 1, exclude = [] }: { max: number; min?: number; exclude?: PitchClass[] },
): PitchClass[] {
  const all = byPriority(chord, tonesOf(chord));
  const picked = all.filter((t) => !exclude.includes(t.pc)).slice(0, max);
  for (const t of all) {
    if (picked.length >= Math.min(min, max)) break;
    if (!picked.includes(t)) picked.push(t);
  }
  return picked.map((t) => t.pc);
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
  // sus chords: a 9 over sus4, a 4 over sus2 (quartal colour)
  if (quality === 'sus4') return [2];
  if (quality === 'sus2') return [5];
  return has(2) ? [] : [2];
}

/** Next note with pitch class `p` strictly above `n`. */
const above = (p: PitchClass, n: MidiNote): MidiNote => n + (mod12(p - n) || 12);

/** Stack pitch classes upwards from `start`, each note the next occurrence above the last. */
function stack(pcs: readonly PitchClass[], start: MidiNote): MidiNote[] {
  const out: MidiNote[] = [];
  let prev = start - 1;
  for (const p of pcs) {
    prev = above(p, prev);
    out.push(prev);
  }
  return out;
}

/** Octave shift putting the mean closest to `centre` while staying within [low, high]. */
function placementShift(notes: readonly MidiNote[], centre: number, low: number, high: number) {
  const mean = notes.reduce((a, b) => a + b, 0) / notes.length;
  const lo = Math.min(...notes);
  const hi = Math.max(...notes);
  let shift = Math.round((centre - mean) / 12) * 12;
  while (lo + shift < low) shift += 12;
  while (hi + shift > high && lo + shift - 12 >= low) shift -= 12;
  return shift;
}

function place(notes: MidiNote[], centre: number, low = RH_LOW, high = RH_HIGH): MidiNote[] {
  const shift = placementShift(notes, centre, low, high);
  return notes.map((n) => n + shift);
}

/** Close-position rotations of a pitch-class set (ordered by interval above the root). */
function rotations(chord: Chord, pcs: readonly PitchClass[]): PitchClass[][] {
  const sorted = [...new Set(pcs)].sort((a, b) => mod12(a - chord.root) - mod12(b - chord.root));
  return sorted.map((_, r) => [...sorted.slice(r), ...sorted.slice(0, r)]);
}

/** Left-hand bass (slash bass or root) in C2–B2. */
function bassNote(chord: Chord): MidiNote {
  return BASS_LOW + (chord.bass ?? chord.root);
}

/** Right-hand close shapes (every rotation) of `pcs`, placed around `centre`. */
function rightHand(chord: Chord, pcs: PitchClass[], centre: number): MidiNote[][] {
  return rotations(chord, pcs).map((rot) => place(stack(rot, RH_LOW), centre));
}

function closeVoicings(chord: Chord, centre: number): MidiNote[][] {
  const bass = bassNote(chord);
  return rightHand(chord, pickTones(chord, { max: 4 }), centre).map((rh) => [bass, ...rh]);
}

function popVoicings(chord: Chord, centre: number): MidiNote[][] {
  const bass = bassNote(chord);
  const rh = pickTones(chord, { max: 3, min: 3, exclude: [chord.bass ?? chord.root] });
  return rightHand(chord, rh, centre).map((r) => [bass, bass + 12, ...r]);
}

function drop2Voicings(chord: Chord, centre: number): MidiNote[][] {
  const bass = bassNote(chord);
  return rotations(chord, pickTones(chord, { max: 4 })).map((rot) => {
    const close = stack(rot, RH_LOW);
    // dyads have no "second from the top" to drop: leave them in close position
    if (close.length < 3) return [bass, ...place(close, centre)];
    const dropped = close[close.length - 2];
    const rest = close.filter((n) => n !== dropped);
    // the upper voices stay in the right hand; the dropped voice may fall into the left
    const shift = placementShift(rest, centre, RH_LOW, RH_HIGH);
    return [bass, dropped - 12 + shift, ...rest.map((n) => n + shift)];
  });
}

function spreadVoicings(chord: Chord, centre: number): MidiNote[][] {
  const bass = bassNote(chord);
  if (isSlash(chord)) {
    // slash chord: the bass alone in the left hand, every other tone in the right
    const rh = pickTones(chord, { max: 4, min: 3, exclude: [bass % 12] });
    return rightHand(chord, rh, centre)
      .slice(0, 3)
      .map((r) => [bass, ...r]);
  }
  const perfectFifth = tonesOf(chord).find((t) => t.role === 'fifth' && t.interval === 7);
  // root + fifth in the left hand (root + octave when the fifth is altered or absent)
  const lh = perfectFifth ? [bass, bass + 7] : [bass, bass + 12];
  const exclude = perfectFifth ? [chord.root, perfectFifth.pc] : [chord.root];
  const rh = pickTones(chord, { max: 4, min: 3, exclude });
  return rightHand(chord, rh, centre)
    .slice(0, 3)
    .map((r) => [...lh, ...r]);
}

function shellVoicings(chord: Chord): MidiNote[][] {
  const tones = tonesOf(chord);
  const lowPc = chord.bass ?? chord.root;
  const low = BASS_LOW + lowPc;
  const find = (...roles: ToneRole[]) => tones.find((t) => roles.includes(t.role))?.pc;
  // the "3": third or sus tone (an 11 chord, with its third left out, uses the 11)
  const third =
    find('third', 'sus') ?? (chord.quality === '11' ? mod12(chord.root + 5) : undefined);
  // the "7": seventh (or sixth), else the added ninth, else the fifth
  const seventh =
    find('seventh') ??
    (chord.quality === 'add9' || chord.quality === 'madd9' ? mod12(chord.root + 2) : find('fifth'));
  // over a slash bass the guide tone sitting in the bass is replaced by the root
  const swap = (p: PitchClass | undefined) => (p === lowPc ? chord.root : p);
  const g3 = swap(third);
  const g7 = swap(seventh);
  const usable = (p: PitchClass | undefined): p is PitchClass => p !== undefined && p !== lowPc;

  const out: MidiNote[][] = [];
  const chain = (...pcs: PitchClass[]) => {
    const v = [low];
    for (const p of pcs) v.push(above(p, v[v.length - 1]));
    out.push(v);
  };
  if (usable(g3) && usable(g7)) {
    chain(g3, g7); // 1-3-7
    chain(g7, g3); // 1-7-3 (the 3 as a tenth)
  } else if (usable(g7) || usable(g3)) {
    const g = (usable(g7) ? g7 : g3) as PitchClass;
    chain(g); // 1-5
    chain(g, lowPc); // 1-5-8
  } else {
    out.push([low, low + 12]);
  }
  // a shell is a left-hand shape: keep it below middle C
  return out.map((shape) => {
    const v = spaceLowRegister(shape);
    return Math.max(...v) >= HAND_SPLIT && low - 12 >= LH_FLOOR ? v.map((n) => n - 12) : v;
  });
}

function rootlessShapes(chord: Chord): { a: PitchClass[]; b: PitchClass[] } | null {
  const tones = tonesOf(chord);
  const intervals = CHORD_TEMPLATES[chord.quality].intervals;
  const core = byPriority(chord, tones).filter((t) => t.role !== 'root');
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
  // a power chord has nothing left once the root goes
  if (pcs.length < 2) return null;

  const third = guides.find((t) => t.role !== 'seventh');
  const seventh = guides.find((t) => t.role === 'seventh');
  const rots = rotations(chord, pcs);
  const startsWith = (p: PitchClass | undefined) => rots.find((r) => r[0] === p);
  // type A starts on the third, type B on the seventh
  const a = startsWith(third?.pc) ?? rots[0];
  // without a seventh, B is the next rotation after A
  const b = startsWith(seventh?.pc) ?? rots[(rots.indexOf(a) + 1) % rots.length];
  return { a, b };
}

function rootlessVoicings(chord: Chord, centre: number, type: 'a' | 'b'): MidiNote[][] {
  const shapes = rootlessShapes(chord);
  if (!shapes) return [];
  // low register: a left-hand comping shape around middle C; otherwise the right hand
  const comp = centre <= REGISTER_CENTRE.low;
  const shape = comp
    ? place(stack(shapes[type], COMP_LOW), centre - 4, COMP_LOW, RH_HIGH)
    : place(stack(shapes[type], RH_LOW), centre);
  if (!isSlash(chord)) return [shape];
  // over a slash bass, the bass goes in the left hand underneath
  const bass = bassNote(chord);
  return [[bass, ...shape.filter((n) => n !== bass)]];
}

/** Below C3, push any note closer than a minor third to the note under it up an octave. */
function spaceLowRegister(v: MidiNote[]): MidiNote[] {
  const out = [...v].sort((a, b) => a - b);
  for (let i = 1; i < out.length; i++) {
    if (out[i - 1] < LOW_REGISTER && out[i] - out[i - 1] < MIN_LOW_INTERVAL) {
      out[i] += 12;
      out.sort((a, b) => a - b);
      i = 0;
    }
  }
  return out;
}

function tidy(vs: MidiNote[][]): MidiNote[][] {
  const seen = new Set<string>();
  return vs
    .map((v) => spaceLowRegister([...new Set(v)]).filter((n) => n >= 21 && n <= 108))
    .filter((v) => {
      const k = v.join(',');
      if (v.length === 0 || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function centreOf(register: VoicingOptions['register']): number {
  if (register === undefined) return DEFAULT_REGISTER;
  return typeof register === 'number' ? register : REGISTER_CENTRE[register];
}

/**
 * Voicings for a chord in one style (several options each, best first):
 * - `pop`: right-hand triad (every inversion) over the root in octaves; on a seventh chord the
 *   triad is the upper three tones (Em over C for Cmaj7);
 * - `close`: left-hand bass + close-position right hand, every inversion;
 * - `spread`: left-hand root + fifth, the rest as a right-hand upper structure;
 * - `shell`: left-hand root (or slash bass) with 3rd and 7th: 1-3-7 and 1-7-3 (Bud Powell);
 * - `drop2`: close voicings with the second note from the top dropped an octave;
 * - `rootlessA` / `rootlessB`: Bill Evans shapes from the 3rd / from the 7th, no root, with a
 *   colour tone (9, 13) added when the chord has none.
 * Chords with more than four tones drop the fifth first (see `omittableTones`). A slash bass is
 * always the lowest note. Styles that do not fit the chord (a rootless power chord) give `[]`.
 */
export function voicings(chord: Chord, opts: VoicingOptions): MidiNote[][] {
  const centre = centreOf(opts.register);
  switch (opts.style) {
    case 'pop':
      return tidy(popVoicings(chord, centre));
    case 'close':
      return tidy(closeVoicings(chord, centre));
    case 'spread':
      return tidy(spreadVoicings(chord, centre));
    case 'shell':
      return tidy(shellVoicings(chord));
    case 'drop2':
      return tidy(drop2Voicings(chord, centre));
    case 'rootlessA':
      return tidy(rootlessVoicings(chord, centre, 'a'));
    case 'rootlessB':
      return tidy(rootlessVoicings(chord, centre, 'b'));
  }
}
