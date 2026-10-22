/**
 * Ear-training question generators and graders. Pure and deterministic given an
 * injected random source (`Rng`, a `Math.random`-shaped function); `seededRng` gives a
 * reproducible one for tests and shareable drills.
 */
import type { Chord, ChordQuality, Key, KeyMode, PitchClass, VocabLevel } from '@/core';
import { diatonicChords, mod12, sameKey } from './keys';
import { romanNumeral } from './numerals';

/** Uniform in [0, 1), like `Math.random`. */
export type Rng = () => number;

/** Mulberry32: tiny, fast, good enough for drills. Same seed, same sequence. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: Rng, n: number): number {
  return Math.min(n - 1, Math.floor(rng() * n));
}

function pick<T>(rng: Rng, xs: readonly T[]): T {
  return xs[randInt(rng, xs.length)];
}

// ---------------------------------------------------------------------------
// Chord quality

/** Qualities asked at each level: curated so the answer grid stays tappable. */
export const CHORD_QUALITY_POOLS: Readonly<Record<VocabLevel, readonly ChordQuality[]>> = {
  1: ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4'],
  2: ['maj', 'min', 'maj7', 'min7', '7', 'dim7', 'm7b5', 'mMaj7', '6', 'm6'],
  3: ['maj7', 'min7', '7', 'm7b5', 'dim7', 'mMaj7', '9', 'maj9', 'min9', '13', '7b9', '7#9', '6/9'],
};

const QUALITY_NAMES: Partial<Record<ChordQuality, string>> = {
  '5': 'Power',
  maj: 'Major',
  min: 'Minor',
  dim: 'Diminished',
  aug: 'Augmented',
  sus2: 'Sus2',
  sus4: 'Sus4',
  maj7: 'Major 7',
  min7: 'Minor 7',
  '7': 'Dominant 7',
  dim7: 'Diminished 7',
  m7b5: 'Half-diminished',
  mMaj7: 'Minor-major 7',
  '6': 'Major 6',
  m6: 'Minor 6',
  add9: 'Add 9',
  madd9: 'Minor add 9',
  '9': 'Dominant 9',
  maj9: 'Major 9',
  min9: 'Minor 9',
  '13': 'Dominant 13',
  '7b9': '7 flat 9',
  '7#9': '7 sharp 9',
  '6/9': 'Six-nine',
};

/** Friendly name for a quality ("Minor 7"); falls back to the quality id. */
export function qualityName(q: ChordQuality): string {
  return QUALITY_NAMES[q] ?? q;
}

export interface ChordQuestion {
  kind: 'quality';
  chord: Chord;
  /** Answer choices, in pool order. */
  choices: readonly ChordQuality[];
}

export function randomChordQuestion(level: VocabLevel, rng: Rng): ChordQuestion {
  const choices = CHORD_QUALITY_POOLS[level];
  return {
    kind: 'quality',
    chord: { root: randInt(rng, 12) as PitchClass, quality: pick(rng, choices) },
    choices,
  };
}

// ---------------------------------------------------------------------------
// Keys

export type KeySet = 'white' | 'all';
export type ModeSet = 'major' | 'both';

export const WHITE_TONICS: readonly PitchClass[] = [0, 2, 4, 5, 7, 9, 11];

/** Keys a drill may pick from: white-key or all tonics, major only or major + minor. */
export function keyPool(keys: KeySet = 'all', modes: ModeSet = 'both'): Key[] {
  const tonics: readonly PitchClass[] =
    keys === 'white' ? WHITE_TONICS : (Array.from({ length: 12 }, (_, i) => i) as PitchClass[]);
  const modeList: KeyMode[] = modes === 'major' ? ['major'] : ['major', 'minor'];
  return modeList.flatMap((mode) => tonics.map((tonic) => ({ tonic, mode })));
}

// ---------------------------------------------------------------------------
// Progressions

/**
 * Scale degree 0..6 of the key (natural minor in minor keys); `HV` is the harmonic-minor
 * dominant (V / V7), the usual cadence chord in minor.
 */
const HV = 7;
type Degree = 0 | 1 | 2 | 3 | 4 | 5 | 6 | typeof HV;

export type ProgressionStyle = 'pop' | 'jazz';

const PATTERNS: Record<KeyMode, Record<ProgressionStyle, readonly Degree[][]>> = {
  major: {
    pop: [
      [0, 4, 5, 3], // I V vi IV
      [0, 5, 3, 4], // I vi IV V
      [5, 3, 0, 4], // vi IV I V
      [0, 3, 4, 0], // I IV V I
      [0, 3, 5, 4], // I IV vi V
      [0, 2, 3, 4], // I iii IV V
      [3, 4, 2, 5], // IV V iii vi (royal road)
      [0, 4, 3, 4], // I V IV V
      [3, 0, 4, 5], // IV I V vi
    ],
    jazz: [
      [1, 4, 0, 0], // ii V I I
      [0, 5, 1, 4], // I vi ii V
      [2, 5, 1, 4], // iii vi ii V
      [0, 3, 2, 5], // I IV iii vi
      [1, 4, 2, 5], // ii V iii vi
      [0, 1, 2, 3], // I ii iii IV (stepwise)
    ],
  },
  minor: {
    pop: [
      [0, 5, 2, 6], // i bVI bIII bVII
      [0, 6, 5, 6], // i bVII bVI bVII
      [0, 3, HV, 0], // i iv V i
      [0, 5, 6, 0], // i bVI bVII i
      [0, 3, 6, 2], // i iv bVII bIII
      [5, 6, 0, 0], // bVI bVII i i
      [0, 2, 6, 3], // i bIII bVII iv
    ],
    jazz: [
      [1, HV, 0, 0], // ii° V i i
      [0, 5, 1, HV], // i bVI ii° V
      [0, 3, 1, HV], // i iv ii° V
      [3, 6, 2, 5], // iv bVII bIII bVI (circle of fifths)
    ],
  },
};

/** Degrees a random (non-pattern) progression may use after the opening tonic. */
const RANDOM_DEGREES: Record<KeyMode, readonly Degree[]> = {
  major: [1, 2, 3, 4, 5],
  minor: [2, 3, 5, 6, HV],
};

function chordAt(key: Key, level: VocabLevel, d: Degree): Chord {
  if (d === HV) return { root: mod12(key.tonic + 7), quality: level >= 2 ? '7' : 'maj' };
  return diatonicChords(key, level)[d];
}

function degreesFor(key: Key): Degree[] {
  return key.mode === 'minor' ? [0, 1, 2, 3, 4, 5, 6, HV] : [0, 1, 2, 3, 4, 5, 6];
}

export interface NumeralChoice {
  numeral: string;
  chord: Chord;
}

/**
 * The chips a progression answer is picked from: every diatonic chord of the key at the
 * level (plus the harmonic V in minor), tonic first, labelled with `romanNumeral`.
 */
export function progressionChoices(key: Key, level: VocabLevel): NumeralChoice[] {
  return degreesFor(key).map((d) => {
    const chord = chordAt(key, level, d);
    return { numeral: romanNumeral(chord, key), chord };
  });
}

export interface ProgressionQuestion {
  kind: 'progression';
  key: Key;
  chords: Chord[];
  /** `romanNumeral(chords[i], key)`. */
  numerals: string[];
  choices: NumeralChoice[];
  style: ProgressionStyle | 'random';
}

export interface ProgressionQuestionOptions {
  rng: Rng;
  level: VocabLevel;
  /** Fixed key; otherwise one is drawn from `keys`. */
  key?: Key;
  /** Keys to draw from when `key` is not given. Default every major and minor key. */
  keys?: readonly Key[];
  /** Pattern family. Default: pop at level 1, pop or jazz above. */
  style?: ProgressionStyle;
  /** Number of chords. Default 4 (patterns are four long; other lengths are random walks). */
  length?: number;
  /** Chance of a random diatonic walk instead of a common pattern. Default 0.25. */
  randomShare?: number;
}

function randomWalk(rng: Rng, mode: KeyMode, length: number): Degree[] {
  const out: Degree[] = [0];
  while (out.length < length) {
    const prev = out[out.length - 1];
    const options = RANDOM_DEGREES[mode].filter((d) => d !== prev);
    out.push(pick(rng, options));
  }
  return out;
}

export function randomProgressionQuestion(opts: ProgressionQuestionOptions): ProgressionQuestion {
  const { rng, level } = opts;
  const length = Math.max(1, opts.length ?? 4);
  const key = opts.key ?? pick(rng, opts.keys?.length ? opts.keys : keyPool());
  const styles: ProgressionStyle[] = opts.style
    ? [opts.style]
    : level === 1
      ? ['pop']
      : ['pop', 'jazz'];
  let style: ProgressionQuestion['style'] = pick(rng, styles);
  let degrees: Degree[];
  if (length !== 4 || rng() < (opts.randomShare ?? 0.25)) {
    style = 'random';
    degrees = randomWalk(rng, key.mode, length);
  } else {
    degrees = [...pick(rng, PATTERNS[key.mode][style])];
  }
  const chords = degrees.map((d) => chordAt(key, level, d));
  return {
    kind: 'progression',
    key,
    chords,
    numerals: chords.map((c) => romanNumeral(c, key)),
    choices: progressionChoices(key, level),
    style,
  };
}

// ---------------------------------------------------------------------------
// Key

const CADENCES: Record<KeyMode, readonly Degree[][]> = {
  major: [
    [4, 0], // V I
    [3, 4, 0], // IV V I
    [1, 4, 0], // ii V I
  ],
  minor: [
    [HV, 0], // V i
    [3, HV, 0], // iv V i
    [1, HV, 0], // ii° V i
  ],
};

const PHRASE_DEGREES: Record<KeyMode, readonly Degree[]> = {
  major: [0, 1, 2, 3, 5],
  minor: [0, 2, 3, 5, 6],
};

export interface KeyQuestion {
  kind: 'key';
  key: Key;
  /** 4–6 chords ending on an authentic cadence. */
  chords: Chord[];
  numerals: string[];
}

export interface KeyQuestionOptions {
  rng: Rng;
  /** Keys to draw from. Default every major and minor key. */
  keys?: readonly Key[];
  level?: VocabLevel;
}

export function randomKeyQuestion(opts: KeyQuestionOptions): KeyQuestion {
  const { rng } = opts;
  const level = opts.level ?? 1;
  const key = pick(rng, opts.keys?.length ? opts.keys : keyPool());
  const length = 4 + randInt(rng, 3);
  const cadence = pick(rng, CADENCES[key.mode]);
  const degrees: Degree[] = [];
  while (degrees.length < length - cadence.length) {
    const prev = degrees.length ? degrees[degrees.length - 1] : null;
    const last = degrees.length === length - cadence.length - 1;
    const options = PHRASE_DEGREES[key.mode].filter(
      (d) => d !== prev && !(last && d === cadence[0]),
    );
    degrees.push(pick(rng, options));
  }
  degrees.push(...cadence);
  const chords = degrees.map((d) => chordAt(key, level, d));
  return { kind: 'key', key, chords, numerals: chords.map((c) => romanNumeral(c, key)) };
}

// ---------------------------------------------------------------------------
// Grading

export interface QualityGrade {
  correct: boolean;
}

export function gradeChordQuality(q: ChordQuestion, answer: ChordQuality): QualityGrade {
  return { correct: q.chord.quality === answer };
}

export interface ProgressionGrade {
  correct: boolean;
  /** Per slot. */
  slots: boolean[];
  /** Fraction of slots right, 0..1. */
  score: number;
}

/** `answer[i]` is the numeral picked for slot i (`null` = left blank, counts as wrong). */
export function gradeProgression(
  q: ProgressionQuestion,
  answer: readonly (string | null)[],
): ProgressionGrade {
  const slots = q.numerals.map((n, i) => answer[i] === n);
  const right = slots.filter(Boolean).length;
  return { correct: right === slots.length, slots, score: slots.length ? right / slots.length : 0 };
}

export interface KeyGrade {
  correct: boolean;
  /** Picked the relative major / minor (same key signature). */
  relative: boolean;
  /** Picked the parallel key (right tonic, wrong mode). */
  parallel: boolean;
}

export function gradeKey(q: KeyQuestion, answer: Key): KeyGrade {
  const correct = sameKey(q.key, answer);
  const shift = q.key.mode === 'major' ? 9 : 3;
  return {
    correct,
    relative: !correct && answer.mode !== q.key.mode && answer.tonic === mod12(q.key.tonic + shift),
    parallel: !correct && answer.mode !== q.key.mode && answer.tonic === q.key.tonic,
  };
}

export type TrainQuestion = ChordQuestion | ProgressionQuestion | KeyQuestion;

/** Dispatching grader: `correct` for any question kind. */
export function gradeAnswer(q: ChordQuestion, answer: ChordQuality): QualityGrade;
export function gradeAnswer(
  q: ProgressionQuestion,
  answer: readonly (string | null)[],
): ProgressionGrade;
export function gradeAnswer(q: KeyQuestion, answer: Key): KeyGrade;
export function gradeAnswer(
  q: TrainQuestion,
  answer: ChordQuality | readonly (string | null)[] | Key,
): QualityGrade | ProgressionGrade | KeyGrade {
  switch (q.kind) {
    case 'quality':
      return gradeChordQuality(q, answer as ChordQuality);
    case 'progression':
      return gradeProgression(q, answer as readonly (string | null)[]);
    case 'key':
      return gradeKey(q, answer as Key);
  }
}

/** Chord for a numeral chip in a question's key (for "play yours"). */
export function chordForNumeral(q: ProgressionQuestion, numeral: string): Chord | null {
  return q.choices.find((c) => c.numeral === numeral)?.chord ?? null;
}

/** I–IV–V–I (i–iv–V–i in minor) at the level: the cadence that sets up a key. */
export function cadenceChords(key: Key, level: VocabLevel): Chord[] {
  const five: Degree = key.mode === 'minor' ? HV : 4;
  return ([0, 3, five, 0] as Degree[]).map((d) => chordAt(key, level, d));
}
