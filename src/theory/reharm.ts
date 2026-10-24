/**
 * Reharmonization of a captured progression. Each rule proposes local edits (replace or insert
 * chords around one position); `reharmonize` scores single edits and compatible combinations
 * for a style and returns the best full chord lists. Deterministic: same input, same output.
 */
import type { Chord, ChordQuality, Key, PitchClass } from '@/core';
import { chordKey, chordSymbol } from './chordName';
import { diatonicChords, isDiatonic, mod12, parallelKey, scaleOf } from './keys';
import { keyName } from './notes';
import { romanNumeral } from './numerals';
import { CHORD_TEMPLATES, isDiminishedQuality, isDominantQuality, isMinorQuality } from './vocab';

export type ReharmStyle = 'pop' | 'jazz';

export type ReharmRule =
  | 'tritone'
  | 'iiV'
  | 'secondary'
  | 'diatonicSub'
  | 'borrowed'
  | 'backdoor'
  | 'passingDim'
  | 'chromaticBass';

export const REHARM_RULES: readonly ReharmRule[] = [
  'tritone',
  'iiV',
  'secondary',
  'diatonicSub',
  'borrowed',
  'backdoor',
  'passingDim',
  'chromaticBass',
];

/** Rules each style may use. Pop keeps to diatonic substitutes and borrowed chords. */
export const STYLE_RULES: Readonly<Record<ReharmStyle, readonly ReharmRule[]>> = {
  pop: ['diatonicSub', 'borrowed'],
  jazz: REHARM_RULES,
};

/** How much each style likes a rule (multiplies the edit's own weight). */
const STYLE_WEIGHT: Readonly<Record<ReharmStyle, Partial<Record<ReharmRule, number>>>> = {
  pop: { diatonicSub: 1, borrowed: 0.95 },
  jazz: {
    tritone: 1,
    iiV: 0.95,
    secondary: 0.9,
    backdoor: 0.85,
    passingDim: 0.8,
    chromaticBass: 0.75,
    borrowed: 0.75,
    diatonicSub: 0.7,
  },
};

/** One local change to a progression. */
export interface ReharmEdit {
  rule: ReharmRule;
  /** First original index replaced (or the insertion point). */
  start: number;
  /** Original chords replaced; 0 for a pure insertion before `start`. */
  deleteCount: number;
  insert: Chord[];
  /** Inclusive range of original indices the edit reads or replaces (for combining edits). */
  span: readonly [number, number];
  reason: string;
  /** 0..1, how idiomatic the edit is on its own. */
  weight: number;
  /** The full progression with only this edit applied. */
  chords: Chord[];
}

export interface Reharmonization {
  chords: Chord[];
  numerals: string[];
  /** One line, e.g. "bII7: tritone sub for G7, slides down to Cmaj7". */
  reason: string;
  score: number;
  rules: ReharmRule[];
}

export interface ReharmOptions {
  style?: ReharmStyle;
  /** Default 6. */
  maxResults?: number;
}

export const DEFAULT_REHARM_RESULTS = 6;

const hasSeventh = (q: ChordQuality) => CHORD_TEMPLATES[q].roles.includes('seventh');
const plain = (c: Chord): Chord => ({ root: c.root, quality: c.quality });
const name = (c: Chord, key: Key) => chordSymbol(c, key);
const num = (c: Chord, key: Key) => romanNumeral(plain(c), key);
const off = (c: Chord, key: Key) => mod12(c.root - key.tonic);

/** Diatonic chord on a semitone offset from the tonic (triad, or seventh when `seventh`). */
function diatonicAt(key: Key, offset: number, seventh: boolean): Chord | null {
  const root = mod12(key.tonic + offset);
  if (key.mode === 'minor' && offset === 7) return { root, quality: seventh ? '7' : 'maj' };
  const c = diatonicChords(key, seventh ? 2 : 1).find((d) => d.root === root);
  return c ?? null;
}

/**
 * Scale offset of `c` when it plays its diatonic role (root on the degree and the matching
 * minor / major / diminished family), else null. In minor, a major or dominant V counts.
 */
function diatonicOffset(c: Chord, key: Key): number | null {
  const o = off(c, key);
  // natural-minor v is diatonic too
  if (key.mode === 'minor' && o === 7 && (c.quality === 'min' || c.quality === 'min7')) return o;
  const d = diatonicAt(key, o, false);
  if (!d) return null;
  if (isDiminishedQuality(c.quality) !== isDiminishedQuality(d.quality)) return null;
  if (isMinorQuality(c.quality) !== isMinorQuality(d.quality)) return null;
  if (c.quality === 'aug' || c.quality === '5') return null;
  // a dominant seventh only on V (E7 in C is V7/vi, not iii)
  if (isDominantQuality(c.quality) && o !== 7) return null;
  return o;
}

const isTonic = (c: Chord, key: Key) => diatonicOffset(c, key) === 0;
const isDominantOf = (c: Chord, target: PitchClass) =>
  mod12(c.root - target) === 7 && (isDominantQuality(c.quality) || c.quality === 'maj');

function makeEdit(
  rule: ReharmRule,
  chords: readonly Chord[],
  start: number,
  deleteCount: number,
  insert: Chord[],
  span: readonly [number, number],
  reason: string,
  weight: number,
): ReharmEdit {
  const out = [...chords.slice(0, start), ...insert, ...chords.slice(start + deleteCount)];
  return { rule, start, deleteCount, insert, span, reason, weight, chords: out };
}

type RuleFn = (chords: readonly Chord[], key: Key) => ReharmEdit[];

/** Dominants that resolve down a fifth -> the dominant a tritone away (G7 -> Db7 before C). */
const tritone: RuleFn = (chords, key) => {
  const edits: ReharmEdit[] = [];
  chords.forEach((c, i) => {
    const next = chords[i + 1];
    const resolves = !!next && mod12(next.root - c.root) === 5;
    const dominant = isDominantQuality(c.quality) && !c.quality.includes('sus');
    // a plain V triad counts when it actually resolves (captured pop changes are triads)
    if (!dominant && !(c.quality === 'maj' && resolves && off(c, key) === 7)) return;
    const quality: ChordQuality = c.quality === '9' || c.quality === '13' ? c.quality : '7';
    const sub: Chord = { root: mod12(c.root + 6), quality };
    const where = resolves
      ? `slides down a half step to ${name(next, key)}`
      : `same tritone as ${name(c, key)}`;
    const reason = `${num(sub, key)}: tritone sub for ${name(c, key)}, ${where}`;
    edits.push(makeEdit('tritone', chords, i, 1, [sub], [i, i + 1], reason, resolves ? 0.9 : 0.4));
  });
  return edits;
};

/** ii–V into a diatonic target, or a ii in front of a bare dominant. */
const iiV: RuleFn = (chords, key) => {
  const edits: ReharmEdit[] = [];
  chords.forEach((c, i) => {
    if (i === 0) return;
    const prev = chords[i - 1];
    if (isDominantQuality(c.quality) && !c.quality.includes('sus')) {
      const iiRoot = mod12(c.root + 7);
      if (prev.root === iiRoot && isMinorQuality(prev.quality)) return;
      const ii: Chord = { root: iiRoot, quality: 'min7' };
      const reason = `${num(ii, key)}: ii in front of ${name(c, key)} makes a ii–V`;
      edits.push(makeEdit('iiV', chords, i, 0, [ii], [i - 1, i], reason, 0.7));
      return;
    }
    const o = diatonicOffset(c, key);
    if (o === null || isDiminishedQuality(c.quality) || isDominantQuality(c.quality)) return;
    if (isDominantOf(prev, c.root)) return;
    if (mod12(prev.root - c.root) === 2 && isMinorQuality(prev.quality)) return;
    const minorTarget = isMinorQuality(c.quality);
    const ii: Chord = { root: mod12(c.root + 2), quality: minorTarget ? 'm7b5' : 'min7' };
    const v: Chord = { root: mod12(c.root + 7), quality: '7' };
    const reason = `${num(ii, key)}–${num(v, key)}: ii–V into ${name(c, key)}`;
    edits.push(makeEdit('iiV', chords, i, 0, [ii, v], [i - 1, i], reason, o === 0 ? 0.85 : 0.7));
  });
  return edits;
};

/** Replace the chord before a diatonic (non-tonic) target with its secondary dominant. */
const secondary: RuleFn = (chords, key) => {
  const edits: ReharmEdit[] = [];
  chords.forEach((c, i) => {
    if (i === 0) return;
    const o = diatonicOffset(c, key);
    if (o === null || o === 0 || isDiminishedQuality(c.quality)) return;
    const prev = chords[i - 1];
    if (isDominantOf(prev, c.root) || prev.root === c.root) return;
    const v: Chord = { root: mod12(c.root + 7), quality: '7' };
    if (isDiatonic(v, key)) return; // V7 of a diatonic chord that is already in the key
    const of = num(diatonicAt(key, o, false)!, key);
    const reason = `V7/${of}: secondary dominant ${name(v, key)} pulls into ${name(c, key)}`;
    const w = prev.root === v.root ? 0.85 : i - 1 === 0 ? 0.45 : 0.65;
    edits.push(makeEdit('secondary', chords, i - 1, 1, [v], [i - 1, i], reason, w));
  });
  return edits;
};

/** Function groups for diatonic substitution, as [offset, [substitute offset, weight][]]. */
const SUBS: Readonly<
  Record<Key['mode'], ReadonlyArray<readonly [number, ReadonlyArray<readonly [number, number]>]>>
> = {
  major: [
    [
      0,
      [
        [9, 0.75],
        [4, 0.55],
      ],
    ], // I -> vi, iii
    [
      9,
      [
        [0, 0.6],
        [4, 0.55],
      ],
    ], // vi -> I, iii
    [
      4,
      [
        [0, 0.6],
        [9, 0.6],
      ],
    ], // iii -> I, vi
    [5, [[2, 0.75]]], // IV -> ii
    [2, [[5, 0.7]]], // ii -> IV
  ],
  minor: [
    [
      0,
      [
        [3, 0.6],
        [8, 0.5],
      ],
    ], // i -> bIII, bVI
    [3, [[0, 0.6]]], // bIII -> i
    [
      5,
      [
        [2, 0.6],
        [8, 0.55],
      ],
    ], // iv -> ii°, bVI
    [2, [[5, 0.65]]], // ii° -> iv
    [8, [[5, 0.55]]], // bVI -> iv
  ],
};

const SUB_ROLE: Readonly<Record<string, string>> = {
  major0: 'tonic',
  major4: 'tonic',
  major9: 'tonic',
  major2: 'predominant',
  major5: 'predominant',
  minor0: 'tonic',
  minor3: 'tonic',
  minor8: 'predominant',
  minor2: 'predominant',
  minor5: 'predominant',
};

/** I <-> vi <-> iii and IV <-> ii (i <-> bIII, iv <-> ii° <-> bVI in minor). */
const diatonicSub: RuleFn = (chords, key) => {
  const edits: ReharmEdit[] = [];
  chords.forEach((c, i) => {
    const o = diatonicOffset(c, key);
    if (o === null) return;
    const group = SUBS[key.mode].find(([from]) => from === o);
    if (!group) return;
    const edge = o === 0 && (i === 0 || i === chords.length - 1);
    for (const [to, w] of group[1]) {
      const s = diatonicAt(key, to, hasSeventh(c.quality))!;
      const sub: Chord = c.bass === undefined ? s : { ...s, bass: c.bass };
      const tones = new Set(CHORD_TEMPLATES[sub.quality].intervals.map((x) => mod12(sub.root + x)));
      if (sub.bass !== undefined && !tones.has(sub.bass)) delete sub.bass;
      const role = SUB_ROLE[`${key.mode}${o}`] ?? 'same';
      const reason = `${num(sub, key)} for ${num(c, key)}: same ${role} function, shared tones`;
      edits.push(makeEdit('diatonicSub', chords, i, 1, [sub], [i, i], reason, edge ? w * 0.6 : w));
    }
  });
  return edits;
};

/** Borrowed iv / bVII / bVI / bII (major keys), dorian IV and Picardy I (minor keys). */
const borrowed: RuleFn = (chords, key) => {
  const edits: ReharmEdit[] = [];
  const minor = keyName(parallelKey(key));
  const at = (o: number) => mod12(key.tonic + o);
  chords.forEach((c, i) => {
    const o = diatonicOffset(c, key);
    const seventh = hasSeventh(c.quality);
    const next = chords[i + 1];
    // `reach`: the edit also depends on the next chord (so no other edit may change it)
    const push = (
      start: number,
      del: number,
      insert: Chord[],
      reason: string,
      w: number,
      reach = 0,
    ) => edits.push(makeEdit('borrowed', chords, start, del, insert, [i, i + reach], reason, w));
    if (key.mode === 'major') {
      if (o === 5) {
        const iv: Chord = { root: c.root, quality: seventh ? 'min7' : 'min' };
        push(i, 1, [iv], `${num(iv, key)}: borrowed from ${minor}, bittersweet`, 0.75);
        if (next && isTonic(next, key)) {
          push(i + 1, 0, [iv], `IV–${num(iv, key)}–I: minor plagal cadence`, 0.8, 1);
        }
      }
      if (o === 7 && (!next || isTonic(next, key))) {
        const bVII: Chord = { root: at(10), quality: seventh ? '7' : 'maj' };
        push(i, 1, [bVII], `${num(bVII, key)}–I: mixolydian cadence instead of V`, 0.6, 1);
      }
      if (o === 9) {
        const bVI: Chord = { root: at(8), quality: seventh ? 'maj7' : 'maj' };
        push(i, 1, [bVI], `${num(bVI, key)}: borrowed from ${minor}, epic lift`, 0.55);
      }
      if ((o === 2 || o === 5) && next && diatonicOffset(next, key) === 7) {
        const bII: Chord = { root: at(1), quality: seventh ? 'maj7' : 'maj' };
        push(
          i,
          1,
          [bII],
          `${num(bII, key)}: Neapolitan predominant before ${name(next, key)}`,
          0.45,
          1,
        );
      }
    } else {
      if (o === 5) {
        const IV: Chord = { root: c.root, quality: seventh ? '7' : 'maj' };
        push(i, 1, [IV], `${num(IV, key)}: major IV borrowed from dorian`, 0.6);
      }
      if ((o === 2 || o === 5) && next && diatonicOffset(next, key) === 7) {
        const bII: Chord = { root: at(1), quality: seventh ? 'maj7' : 'maj' };
        push(
          i,
          1,
          [bII],
          `${num(bII, key)}: Neapolitan predominant before ${name(next, key)}`,
          0.55,
          1,
        );
      }
      if (o === 0 && i === chords.length - 1 && chords.length > 1) {
        const I: Chord = { root: c.root, quality: seventh ? 'maj7' : 'maj' };
        // the major tonic of a minor key numbers as V/iv elsewhere; at the end it is the I
        push(i, 1, [I], `${seventh ? 'Imaj7' : 'I'}: Picardy third, end on major`, 0.5);
      }
    }
  });
  return edits;
};

/** Backdoor ii–V: iv7–bVII7 into I instead of ii–V (major keys). */
const backdoor: RuleFn = (chords, key) => {
  if (key.mode !== 'major') return [];
  const edits: ReharmEdit[] = [];
  const iv: Chord = { root: mod12(key.tonic + 5), quality: 'min7' };
  const bVII: Chord = { root: mod12(key.tonic + 10), quality: '7' };
  const reason = `${num(iv, key)}–${num(bVII, key)}: backdoor ii–V, slips into ${name(
    { root: key.tonic, quality: 'maj' },
    key,
  )} from below`;
  chords.forEach((c, i) => {
    if (i === 0 || !isTonic(c, key)) return;
    const v = chords[i - 1];
    if (!isDominantOf(v, key.tonic)) return;
    const ii = chords[i - 2];
    if (ii && diatonicOffset(ii, key) === 2) {
      edits.push(makeEdit('backdoor', chords, i - 2, 2, [iv, bVII], [i - 2, i], reason, 0.85));
    } else {
      edits.push(makeEdit('backdoor', chords, i - 1, 1, [iv, bVII], [i - 1, i], reason, 0.75));
    }
  });
  return edits;
};

/** A diminished seventh on the chromatic step between roots a whole step apart. */
const passingDim: RuleFn = (chords, key) => {
  const edits: ReharmEdit[] = [];
  for (let i = 0; i + 1 < chords.length; i++) {
    const a = chords[i];
    const b = chords[i + 1];
    const step = mod12(b.root - a.root);
    if (step !== 2 && step !== 10) continue;
    if (diatonicOffset(a, key) === null || diatonicOffset(b, key) === null) continue;
    const dim: Chord = { root: mod12(a.root + (step === 2 ? 1 : -1)), quality: 'dim7' };
    const dir = step === 2 ? 'up' : 'down';
    const reason = `${num(dim, key)}: passing diminished, the bass walks ${dir} ${name(a, key)} → ${name(dim, key)} → ${name(b, key)}`;
    edits.push(
      makeEdit('passingDim', chords, i + 1, 0, [dim], [i, i + 1], reason, step === 2 ? 0.65 : 0.55),
    );
  }
  return edits;
};

/** Fill a falling third in the bass with a stepwise slash chord (C C/B Am, Am Am/G F). */
const chromaticBass: RuleFn = (chords, key) => {
  const edits: ReharmEdit[] = [];
  const scale = scaleOf(key);
  for (let i = 0; i + 1 < chords.length; i++) {
    const a = chords[i];
    const b = chords[i + 1];
    const fromBass = a.bass ?? a.root;
    const toBass = b.bass ?? b.root;
    const drop = mod12(fromBass - toBass);
    if (drop !== 3 && drop !== 4) continue;
    const passing = [1, 2].map((s) => mod12(fromBass - s)).find((p) => scale.includes(p));
    if (passing === undefined) continue;
    const slash: Chord = { root: a.root, quality: a.quality, bass: passing };
    const reason = `${name(slash, key)}: stepwise bass line ${name(a, key)} → ${name(slash, key)} → ${name(b, key)}`;
    edits.push(makeEdit('chromaticBass', chords, i + 1, 0, [slash], [i, i + 1], reason, 0.6));
  }
  return edits;
};

const RULES: Readonly<Record<ReharmRule, RuleFn>> = {
  tritone,
  iiV,
  secondary,
  diatonicSub,
  borrowed,
  backdoor,
  passingDim,
  chromaticBass,
};

/**
 * Every single application of `rule` to `chords` in `key`, in progression order. Edits that
 * leave the progression unchanged are dropped.
 */
export function applyRule(rule: ReharmRule, chords: readonly Chord[], key: Key): ReharmEdit[] {
  const input = chords.map((c) => chordKey(c)).join(' ');
  return RULES[rule](chords, key).filter((e) => e.chords.map(chordKey).join(' ') !== input);
}

/** Apply several edits (non-overlapping spans) to the original progression. */
export function applyEdits(chords: readonly Chord[], edits: readonly ReharmEdit[]): Chord[] {
  const out = [...chords];
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    out.splice(e.start, e.deleteCount, ...e.insert);
  }
  return out;
}

const overlaps = (a: ReharmEdit, b: ReharmEdit) => a.span[0] <= b.span[1] && b.span[0] <= a.span[1];

interface Candidate {
  chords: Chord[];
  edits: ReharmEdit[];
  score: number;
  seq: number;
}

/** Results scoring below this (after the repetition penalty) are not offered. */
export const MIN_REHARM_SCORE = 0.2;

/** Edits from the strongest singles considered for combinations. */
const COMBO_POOL = 12;

/**
 * Alternative harmonisations of `chords` in `key`, best first. Pop uses diatonic substitutes
 * and borrowed chords only (one or two edits); jazz uses every rule (up to three edits, and
 * likes denser changes). Score = mean style-weighted edit weight, adjusted per extra edit
 * (+0.03 jazz, -0.05 pop), minus 0.08 for each better result built from the same rules.
 */
export function reharmonize(
  chords: readonly Chord[],
  key: Key,
  opts: ReharmOptions = {},
): Reharmonization[] {
  const style = opts.style ?? 'pop';
  const max = opts.maxResults ?? DEFAULT_REHARM_RESULTS;
  if (chords.length === 0 || max <= 0) return [];
  const input = chords.map((c) => ({ ...c }));
  const weightOf = (e: ReharmEdit) => e.weight * (STYLE_WEIGHT[style][e.rule] ?? 0);

  const singles = STYLE_RULES[style]
    .flatMap((r) => applyRule(r, input, key))
    .map((e, seq) => ({ e, w: weightOf(e), seq }))
    .sort((a, b) => b.w - a.w || a.seq - b.seq);

  const maxEdits = style === 'jazz' ? 3 : 2;
  const perExtra = style === 'jazz' ? 0.03 : -0.05;
  const pool = singles.slice(0, COMBO_POOL).map((s) => s.e);
  const original = input.map(chordKey).join(' ');
  const found = new Map<string, Candidate>();
  let seq = 0;
  const consider = (edits: ReharmEdit[]) => {
    const out = applyEdits(input, edits);
    const id = out.map(chordKey).join(' ');
    if (id === original) return;
    const mean = edits.reduce((n, e) => n + weightOf(e), 0) / edits.length;
    const score = mean + perExtra * (edits.length - 1);
    const prev = found.get(id);
    if (!prev || score > prev.score) {
      found.set(id, { chords: out, edits, score, seq: prev?.seq ?? seq++ });
    }
  };

  const grow = (chosen: ReharmEdit[], from: number) => {
    if (chosen.length) consider(chosen);
    if (chosen.length >= maxEdits) return;
    for (let k = from; k < pool.length; k++) {
      const e = pool[k];
      if (chosen.some((c) => c.rule === e.rule || overlaps(c, e))) continue;
      grow([...chosen, e], k + 1);
    }
  };
  for (const s of singles) consider([s.e]);
  grow([], 0);

  // greedy pick with a penalty for repeating the same rule combination
  const remaining = [...found.values()];
  const picked: Reharmonization[] = [];
  const used = new Map<string, number>();
  const signature = (c: Candidate) => [...new Set(c.edits.map((e) => e.rule))].sort().join('+');
  const adjusted = (c: Candidate) => c.score - 0.08 * (used.get(signature(c)) ?? 0);
  while (picked.length < max && remaining.length) {
    if (remaining.every((c) => adjusted(c) < MIN_REHARM_SCORE)) break;
    let best = 0;
    for (let k = 1; k < remaining.length; k++) {
      const a = adjusted(remaining[k]);
      const b = adjusted(remaining[best]);
      if (a > b + 1e-9 || (Math.abs(a - b) <= 1e-9 && remaining[k].seq < remaining[best].seq)) {
        best = k;
      }
    }
    const c = remaining.splice(best, 1)[0];
    const sig = signature(c);
    const edits = [...c.edits].sort((a, b) => a.start - b.start);
    picked.push({
      chords: c.chords,
      numerals: c.chords.map((ch) => num(ch, key)),
      reason: edits.map((e) => e.reason).join('; '),
      score: Math.round(adjusted(c) * 1000) / 1000,
      rules: edits.map((e) => e.rule),
    });
    used.set(sig, (used.get(sig) ?? 0) + 1);
  }
  return picked;
}
