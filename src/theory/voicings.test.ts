import { describe, expect, it } from 'vitest';
import type { Chord, MidiNote, PitchClass } from '@/core';
import { chordTones, parseChord } from './chordName';
import { CHORD_TEMPLATES, QUALITY_ORDER } from './vocab';
import { DEFAULT_REGISTER, VOICING_STYLES, omittableTones, voicings } from './voicings';

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

function wellFormed(v: MidiNote[]) {
  for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
  for (const n of v) expect(n >= 21 && n <= 108).toBe(true);
}

const ROOTS: PitchClass[] = [0, 3, 6, 7, 11];

describe('voicings: full styles contain every chord tone', () => {
  for (const style of ['close', 'drop2', 'spread'] as const) {
    it(style, () => {
      for (const q of QUALITY_ORDER) {
        for (const root of ROOTS) {
          const c: Chord = { root, quality: q };
          const vs = voicings(c, { style });
          expect(vs.length, `${q} ${style}`).toBeGreaterThanOrEqual(1);
          if (chordTones(c).length >= 3)
            expect(vs.length, `${q} ${style}`).toBeGreaterThanOrEqual(2);
          const allowed = new Set<number>(chordTones(c));
          const optional = new Set<number>(omittableTones(c));
          for (const v of vs) {
            wellFormed(v);
            const set = pcs(v);
            for (const t of chordTones(c)) {
              if (!optional.has(t)) expect(set.has(t), `${q} ${style} ${v}`).toBe(true);
            }
            for (const p of set) expect(allowed.has(p), `${q} ${style} ${v}`).toBe(true);
            // left-hand bass is the root, below C4; the rest sits in the right-hand range
            expect(v[0] % 12).toBe(root);
            expect(v[0]).toBeLessThan(48);
            for (const n of v.slice(2)) expect(n >= 48 && n <= 90, `${q} ${style} ${v}`).toBe(true);
          }
        }
      }
    });
  }

  it('chords of up to four tones keep every tone (even the fifth)', () => {
    for (const s of ['C', 'Cmaj7', 'G7', 'Dm7', 'Bm7b5', 'Cdim7']) {
      for (const v of voicings(ch(s), { style: 'close' })) {
        expect(pcs(v)).toEqual(new Set(chordTones(ch(s))));
      }
    }
  });

  it('close gives every inversion of the right hand', () => {
    const vs = voicings(ch('Cmaj7'), { style: 'close' });
    expect(vs).toHaveLength(4);
    expect(vs[0]).toEqual([36, 60, 64, 67, 71]);
    expect(new Set(vs.map((v) => v[1] % 12))).toEqual(new Set([0, 4, 7, 11]));
  });

  it('drop2 drops the second voice from the top an octave', () => {
    const [first] = voicings(ch('Cmaj7'), { style: 'drop2' });
    // close C E G B -> G C E B
    expect(first.slice(1).map((n) => n % 12)).toEqual([7, 0, 4, 11]);
    expect(first[4] - first[1]).toBeGreaterThan(12);
  });

  it('spread puts two notes in the left hand', () => {
    const vs = voicings(ch('Cmaj7'), { style: 'spread' });
    expect(vs[0].slice(0, 2)).toEqual([36, 43]); // root + fifth
    expect(vs[1].slice(0, 2)).toEqual([36, 47]); // root + seventh
    expect(vs[2].slice(0, 2)).toEqual([36, 52]); // root + tenth
  });

  it('register moves the right hand', () => {
    const mid = voicings(ch('C'), { style: 'close' })[0];
    const high = voicings(ch('C'), { style: 'close', register: DEFAULT_REGISTER + 12 })[0];
    expect(high[0]).toBe(mid[0]);
    expect(high.slice(1)).toEqual(mid.slice(1).map((n) => n + 12));
  });

  it('slash chords put the bass lowest', () => {
    for (const style of VOICING_STYLES.filter((s) => s !== 'rootless')) {
      const vs = voicings(ch('C/E'), { style });
      for (const v of vs) {
        expect(v[0] % 12, style).toBe(4);
        if (style !== 'shell') expect(pcs(v), style).toEqual(new Set([0, 4, 7]));
      }
      // the root takes the place of the third that moved to the bass
      if (style === 'shell') expect(pcs(vs[vs.length - 1])).toEqual(new Set([0, 4, 7]));
      for (const v of voicings(ch('G7/B'), { style })) expect(v[0] % 12, style).toBe(11);
    }
  });
});

describe('voicings: shell', () => {
  it('root (or bass) with guide tones, left hand only', () => {
    for (const q of QUALITY_ORDER) {
      const c: Chord = { root: 7, quality: q };
      const vs = voicings(c, { style: 'shell' });
      expect(vs.length, q).toBeGreaterThanOrEqual(1);
      for (const v of vs) {
        wellFormed(v);
        expect(v[0] % 12).toBe(7);
        expect(v[0]).toBeLessThan(48);
        expect(v[v.length - 1]).toBeLessThanOrEqual(64);
        for (const p of pcs(v)) expect(chordTones(c)).toContain(p);
      }
      const guides = [...roles(c, 'third'), ...roles(c, 'sus'), ...roles(c, 'seventh')];
      // the fullest shell has every guide tone
      const fullest = vs.reduce((a, b) => (b.length > a.length ? b : a));
      for (const g of guides) expect(pcs(fullest).has(g), q).toBe(true);
    }
  });

  it('classic shapes for C7', () => {
    expect(voicings(ch('C7'), { style: 'shell' })).toEqual([
      [36, 46], // R-7
      [36, 52], // R-10
      [36, 46, 52], // R-7-10
      [36, 40, 46], // R-3-7
    ]);
  });
});

describe('voicings: rootless', () => {
  it('Bill Evans A and B shapes', () => {
    expect(voicings(ch('C7'), { style: 'rootless' })).toEqual([
      [52, 57, 58, 62], // E A Bb D: 3 13 b7 9
      [58, 62, 64, 69], // Bb D E A: b7 9 3 13
    ]);
    expect(voicings(ch('Dm7'), { style: 'rootless' })).toEqual([
      [53, 57, 60, 64], // F A C E
      [60, 64, 65, 69], // C E F A
    ]);
    expect(voicings(ch('Cmaj7'), { style: 'rootless' })).toEqual([
      [52, 55, 59, 62], // E G B D
      [59, 62, 64, 67], // B D E G
    ]);
  });

  it('no root, guide tones present, A from the third and B from the seventh', () => {
    for (const q of QUALITY_ORDER) {
      if (q === '5') continue;
      const c: Chord = { root: 5, quality: q };
      const vs = voicings(c, { style: 'rootless' });
      expect(vs.length, q).toBeGreaterThanOrEqual(1);
      const third = [...roles(c, 'third'), ...roles(c, 'sus')].filter(
        (p) => !omittableTones(c).includes(p),
      );
      const seventh = roles(c, 'seventh');
      for (const v of vs) {
        wellFormed(v);
        expect(v.length).toBeLessThanOrEqual(4);
        expect(pcs(v).has(5), `${q} ${v}`).toBe(false);
        for (const g of [...third, ...seventh]) expect(pcs(v).has(g), `${q} ${v}`).toBe(true);
        // comping register around middle C
        expect(v[0] >= 48 && v[v.length - 1] <= 76, `${q} ${v}`).toBe(true);
      }
      if (third.length && seventh.length) {
        expect(vs[0][0] % 12, q).toBe(third[0]);
        expect(vs[1][0] % 12, q).toBe(seventh[0]);
      }
    }
  });

  it('a power chord has no rootless voicing', () => {
    expect(voicings(ch('C5'), { style: 'rootless' })).toEqual([]);
  });
});

describe('omittableTones', () => {
  it('lists the fifth and the clashing third of an 11 chord', () => {
    expect(omittableTones(ch('C7'))).toEqual([7]);
    expect(omittableTones(ch('C11'))).toEqual([7, 4]);
    expect(omittableTones(ch('Cdim'))).toEqual([]);
  });
});
