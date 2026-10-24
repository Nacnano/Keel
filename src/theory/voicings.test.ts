import { describe, expect, it } from 'vitest';
import type { Chord, MidiNote, PitchClass } from '@/core';
import { chordTones, parseChord } from './chordName';
import { CHORD_TEMPLATES, QUALITY_ORDER, qualitiesForLevel } from './vocab';
import {
  HAND_SPLIT,
  VOICING_STYLES,
  omittableTones,
  splitHands,
  voicingDescription,
  voicingLabel,
  voicings,
} from './voicings';
import type { VoicingStyle } from './voicings';

const ch = (s: string): Chord => {
  const c = parseChord(s);
  if (!c) throw new Error(s);
  return c;
};
const pcs = (v: MidiNote[]) => new Set(v.map((n) => n % 12));
const roles = (c: Chord, role: string) =>
  CHORD_TEMPLATES[c.quality].intervals
    .filter((_, k) => CHORD_TEMPLATES[c.quality].roles[k] === role)
    .map((i) => ((c.root + i) % 12) as PitchClass);

/** Ascending, on the keyboard, hands in range, no seconds below C3. */
function wellFormed(v: MidiNote[], label: string) {
  for (let i = 1; i < v.length; i++) expect(v[i], label).toBeGreaterThan(v[i - 1]);
  const { left, right } = splitHands(v);
  for (const n of left) expect(n >= 28 && n < 60, `${label} LH ${n}`).toBe(true);
  for (const n of right) expect(n >= 60 && n <= 84, `${label} RH ${n}`).toBe(true);
  for (let i = 1; i < v.length; i++) {
    if (v[i - 1] < 48) expect(v[i] - v[i - 1], `${label} low interval`).toBeGreaterThanOrEqual(3);
  }
}

const ROOTS: PitchClass[] = [0, 3, 6, 7, 8, 11];
const LEVEL_2 = qualitiesForLevel(2);

/** Tones a style may leave out. */
function optional(c: Chord, style: VoicingStyle): Set<number> {
  const out = new Set<number>(omittableTones(c));
  if (style === 'shell') for (const p of roles(c, 'fifth')) out.add(p);
  if (style === 'rootlessA' || style === 'rootlessB') out.add(c.root);
  return out;
}

describe('voicings: every level 1-2 quality in every style', () => {
  for (const style of VOICING_STYLES) {
    it(style, () => {
      for (const q of LEVEL_2) {
        const rootless = style === 'rootlessA' || style === 'rootlessB';
        for (const root of ROOTS) {
          const c: Chord = { root, quality: q };
          const vs = voicings(c, { style });
          const label = `${q} ${style}`;
          if (rootless && q === '5') {
            expect(vs, label).toEqual([]);
            continue;
          }
          expect(vs.length, label).toBeGreaterThanOrEqual(1);
          const allowed = new Set<number>(chordTones(c));
          const skip = optional(c, style);
          for (const v of vs) {
            wellFormed(v, `${label} ${v}`);
            const set = pcs(v);
            for (const t of chordTones(c)) {
              if (!skip.has(t)) expect(set.has(t), `${label} ${v} needs ${t}`).toBe(true);
            }
            // only rootless voicings add colour tones
            if (!rootless) for (const p of set) expect(allowed.has(p), `${label} ${v}`).toBe(true);
            if (rootless) expect(set.has(root), `${label} ${v}`).toBe(false);
            else expect(v[0] % 12, `${label} ${v}`).toBe(root);
          }
        }
      }
    });
  }

  it('level 3 qualities: well formed, guide tones present', () => {
    for (const style of VOICING_STYLES) {
      for (const q of QUALITY_ORDER) {
        for (const root of ROOTS) {
          const c: Chord = { root, quality: q };
          for (const v of voicings(c, { style })) {
            wellFormed(v, `${q} ${style} ${v}`);
            for (const g of roles(c, 'seventh')) expect(pcs(v).has(g), `${q} ${style}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('voicings: shapes', () => {
  it('pop: right-hand triad over the root in octaves', () => {
    expect(voicings(ch('C'), { style: 'pop' })).toEqual([
      [36, 48, 60, 64, 67],
      [36, 48, 64, 67, 72],
      [36, 48, 67, 72, 76],
    ]);
    // the upper three tones of Cmaj7 make an E minor triad
    expect(pcs(voicings(ch('Cmaj7'), { style: 'pop' })[0].slice(2))).toEqual(new Set([4, 7, 11]));
  });

  it('close gives every inversion of the right hand', () => {
    const vs = voicings(ch('Cmaj7'), { style: 'close' });
    expect(vs).toHaveLength(4);
    expect(vs[0]).toEqual([36, 60, 64, 67, 71]);
    expect(new Set(vs.map((v) => v[1] % 12))).toEqual(new Set([0, 4, 7, 11]));
  });

  it('chords of up to four tones keep every tone (even the fifth) in close position', () => {
    for (const s of ['C', 'Cmaj7', 'G7', 'Dm7', 'Bm7b5', 'Cdim7']) {
      for (const v of voicings(ch(s), { style: 'close' })) {
        expect(pcs(v)).toEqual(new Set(chordTones(ch(s))));
      }
    }
  });

  it('drop2 drops the second voice from the top an octave', () => {
    const [first] = voicings(ch('Cmaj7'), { style: 'drop2' });
    // close C E G B -> G C E B
    expect(first.slice(1).map((n) => n % 12)).toEqual([7, 0, 4, 11]);
    expect(first[4] - first[1]).toBeGreaterThan(12);
    expect(splitHands(first).right).toHaveLength(3);
  });

  it('spread: left-hand root + fifth, upper structure in the right hand', () => {
    const vs = voicings(ch('Cmaj7'), { style: 'spread' });
    expect(vs.length).toBeGreaterThanOrEqual(2);
    for (const v of vs) {
      expect(splitHands(v).left).toEqual([36, 43]);
      expect(pcs(splitHands(v).right)).toEqual(new Set([4, 7, 11]));
    }
    // an altered fifth goes to the right hand, the root doubles in the left
    expect(splitHands(voicings(ch('Cdim7'), { style: 'spread' })[0]).left).toEqual([36, 48]);
  });

  it('shell: root in C2–B2, 1-3-7 and 1-7-3 with the guide tones from C3 up', () => {
    expect(voicings(ch('C7'), { style: 'shell' })).toEqual([
      [36, 52, 58], // 1-3-7: C2 E3 Bb3
      [36, 58, 64], // 1-7-3: C2 Bb3 E4
    ]);
    expect(voicings(ch('Cmaj7'), { style: 'shell' })[0]).toEqual([36, 52, 59]); // C2 E3 B3
    for (const q of QUALITY_ORDER) {
      for (const root of ROOTS) {
        const c: Chord = { root, quality: q };
        const vs = voicings(c, { style: 'shell' });
        expect(vs.length, q).toBeGreaterThanOrEqual(1);
        for (const v of vs) {
          expect(v[0] >= 36 && v[0] < 48, `${q} ${v} root`).toBe(true);
          // never a guide tone below C3, and the lowest one in C3–B3 (where E3 is)
          expect(v[1] >= 48 && v[1] < 60, `${q} ${v} guide`).toBe(true);
        }
      }
    }
  });

  it('shell keeps the guide tones and spaces sus tones in the low register', () => {
    for (const q of QUALITY_ORDER) {
      const c: Chord = { root: 7, quality: q };
      const guides = [...roles(c, 'third'), ...roles(c, 'sus'), ...roles(c, 'seventh')].filter(
        (p) => !omittableTones(c).includes(p),
      );
      for (const v of voicings(c, { style: 'shell' })) {
        for (const g of guides) expect(pcs(v).has(g), `${q} ${v}`).toBe(true);
      }
    }
    expect(voicings(ch('Csus2'), { style: 'shell' })).toEqual([
      [36, 50, 55], // C2 D3 G3
      [36, 55, 62], // C2 G3 D4
    ]);
  });

  it('rootless A starts on the 3rd, B on the 7th (Bill Evans)', () => {
    expect(voicings(ch('C7'), { style: 'rootlessA' })).toEqual([[64, 69, 70, 74]]); // E A Bb D
    expect(voicings(ch('C7'), { style: 'rootlessB' })).toEqual([[70, 74, 76, 81]]); // Bb D E A
    expect(voicings(ch('Dm7'), { style: 'rootlessA' })).toEqual([[65, 69, 72, 76]]); // F A C E
    expect(voicings(ch('Dm7'), { style: 'rootlessB' })).toEqual([[60, 64, 65, 69]]); // C E F A
    for (const q of QUALITY_ORDER) {
      const c: Chord = { root: 5, quality: q };
      const third = [...roles(c, 'third'), ...roles(c, 'sus')].filter(
        (p) => !omittableTones(c).includes(p),
      );
      const seventh = roles(c, 'seventh');
      if (!third.length || !seventh.length) continue;
      expect(voicings(c, { style: 'rootlessA' })[0][0] % 12, q).toBe(third[0]);
      expect(voicings(c, { style: 'rootlessB' })[0][0] % 12, q).toBe(seventh[0]);
    }
  });

  it('rootless in the low register is a left-hand comping shape around middle C', () => {
    const [a] = voicings(ch('C7'), { style: 'rootlessA', register: 'low' });
    expect(a).toEqual([52, 57, 58, 62]);
  });

  it('a power chord has no rootless voicing', () => {
    expect(voicings(ch('C5'), { style: 'rootlessA' })).toEqual([]);
    expect(voicings(ch('C5'), { style: 'rootlessB' })).toEqual([]);
  });
});

describe('voicings: register and slash chords', () => {
  it('register moves the right hand, not the bass', () => {
    const mid = voicings(ch('C'), { style: 'close' })[0];
    const high = voicings(ch('C'), { style: 'close', register: 'high' })[0];
    expect(high[0]).toBe(mid[0]);
    expect(high.slice(1)).toEqual(mid.slice(1).map((n) => n + 12));
    expect(voicings(ch('C'), { style: 'close', register: 67 })).toEqual(
      voicings(ch('C'), { style: 'close', register: 'mid' }),
    );
  });

  it('every register stays in range', () => {
    for (const register of ['low', 'mid', 'high'] as const) {
      for (const style of VOICING_STYLES) {
        for (const q of QUALITY_ORDER) {
          for (const v of voicings({ root: 11, quality: q }, { style, register })) {
            wellFormed(v, `${q} ${style} ${register} ${v}`);
          }
        }
      }
    }
  });

  it('slash chords put the bass lowest and keep the root', () => {
    for (const style of VOICING_STYLES) {
      for (const s of ['C/E', 'C/G', 'G7/B', 'Cmaj7/E', 'Am7/G', 'C9/E']) {
        const c = ch(s);
        const vs = voicings(c, { style });
        expect(vs.length, `${s} ${style}`).toBeGreaterThanOrEqual(1);
        for (const v of vs) {
          wellFormed(v, `${s} ${style} ${v}`);
          expect(v[0] % 12, `${s} ${style} ${v}`).toBe(c.bass);
          expect(splitHands(v).left, `${s} ${style} ${v}`).toContain(v[0]);
          if (!style.startsWith('rootless')) expect(pcs(v).has(c.root), `${s} ${style}`).toBe(true);
        }
      }
    }
    for (const style of ['pop', 'close', 'spread', 'drop2'] as const) {
      for (const v of voicings(ch('C/E'), { style })) {
        expect(pcs(v), style).toEqual(new Set([0, 4, 7]));
      }
    }
  });
});

describe('splitHands and labels', () => {
  it('splits at middle C or a given point', () => {
    expect(splitHands([64, 36, 43, 60])).toEqual({ left: [36, 43], right: [60, 64] });
    expect(splitHands([36, 55, 64], 55)).toEqual({ left: [36], right: [55, 64] });
    expect(HAND_SPLIT).toBe(60);
  });

  it('labels every style', () => {
    expect(voicingLabel('drop2')).toBe('Drop 2');
    expect(voicingLabel('rootlessA')).toBe('Rootless A');
    for (const s of VOICING_STYLES) {
      expect(voicingLabel(s).length).toBeGreaterThan(0);
      expect(voicingDescription(s).length).toBeGreaterThan(0);
    }
  });
});

describe('omittableTones', () => {
  it('lists the fifth and the clashing third of an 11 chord', () => {
    expect(omittableTones(ch('C7'))).toEqual([7]);
    expect(omittableTones(ch('C11'))).toEqual([7, 4]);
    expect(omittableTones(ch('Cdim'))).toEqual([]);
  });
});
