import { describe, expect, it } from 'vitest';
import type { Chord, Key } from '@/core';
import { chordSymbol, parseChord } from './chordName';
import { applyEdits, applyRule, reharmonize, REHARM_RULES, STYLE_RULES } from './reharm';

const C: Key = { tonic: 0, mode: 'major' };
const Am: Key = { tonic: 9, mode: 'minor' };
const prog = (s: string): Chord[] => s.split(' ').map((x) => parseChord(x)!);
const text = (cs: readonly Chord[], key: Key = C) => cs.map((c) => chordSymbol(c, key)).join(' ');
const results = (rule: Parameters<typeof applyRule>[0], s: string, key: Key = C) =>
  applyRule(rule, prog(s), key).map((e) => text(e.chords, key));

describe('applyRule', () => {
  it('tritone: substitutes a dominant that resolves down a fifth', () => {
    expect(results('tritone', 'Dm7 G7 Cmaj7')).toEqual(['Dm7 Db7 Cmaj7']);
    const [e] = applyRule('tritone', prog('Dm7 G7 Cmaj7'), C);
    expect(e.reason).toMatch(/^bII7: tritone sub for G7/);
    // a plain V triad only when it actually resolves
    expect(results('tritone', 'C G Am F')).toEqual([]);
    expect(results('tritone', 'F G C')).toEqual(['F Db7 C']);
  });

  it('iiV: inserts a ii–V before a diatonic target, or a ii before a bare dominant', () => {
    expect(results('iiV', 'C Am')).toEqual(['C Bm7b5 E7 Am']);
    expect(results('iiV', 'Am F')).toEqual(['Am Gm7 C7 F']);
    // C already acts as V of F
    expect(results('iiV', 'C F')).toEqual([]);
    expect(results('iiV', 'C G7')).toEqual(['C Dm7 G7']);
    // already a ii–V–I: nothing to add
    expect(results('iiV', 'Dm7 G7 Cmaj7')).toEqual([]);
  });

  it('secondary: replaces the chord before a diatonic target with its V7', () => {
    expect(results('secondary', 'C Am Dm G')).toEqual(['E7 Am Dm G', 'C A7 Dm G', 'C Am D7 G']);
    // never V7/I (that is just V7), never when the dominant is already there
    expect(results('secondary', 'G C')).toEqual([]);
    expect(results('secondary', 'C A7 Dm')).toEqual([]);
  });

  it('diatonicSub: I <-> vi <-> iii and IV <-> ii, keeping sevenths', () => {
    expect(results('diatonicSub', 'C G Am F')).toEqual([
      'Am G Am F',
      'Em G Am F',
      'C G C F',
      'C G Em F',
      'C G Am Dm',
    ]);
    expect(results('diatonicSub', 'Dm7 G7 Cmaj7')).toEqual([
      'Fmaj7 G7 Cmaj7',
      'Dm7 G7 Am7',
      'Dm7 G7 Em7',
    ]);
    // minor: iv -> ii°, i -> bIII
    expect(results('diatonicSub', 'Am Dm', Am)).toContain('Am Bdim');
    expect(results('diatonicSub', 'Am Dm', Am)).toContain('C Dm');
  });

  it('borrowed: iv, IV–iv–I, bVII–I, bVI, Neapolitan bII', () => {
    expect(results('borrowed', 'F C')).toEqual(['Fm C', 'F Fm C']);
    expect(results('borrowed', 'G C')).toEqual(['Bb C']);
    expect(results('borrowed', 'C Am')).toEqual(['C Ab']);
    expect(results('borrowed', 'Dm G C')).toEqual(['Db G C', 'Dm Bb C']);
    expect(results('borrowed', 'Fmaj7 Cmaj7')).toContain('Fm7 Cmaj7');
  });

  it('borrowed in minor: dorian IV, Neapolitan, Picardy third', () => {
    expect(results('borrowed', 'Am Dm Am', Am)).toEqual(['Am D Am', 'Am Dm A']);
    expect(results('borrowed', 'Dm E Am', Am)).toEqual(['D E Am', 'Bb E Am', 'Dm E A']);
  });

  it('backdoor: iv7–bVII7 replaces ii–V (or V) into I, major keys only', () => {
    expect(results('backdoor', 'Dm7 G7 Cmaj7')).toEqual(['Fm7 Bb7 Cmaj7']);
    expect(results('backdoor', 'Am G C')).toEqual(['Am Fm7 Bb7 C']);
    expect(results('backdoor', 'Bm7b5 E7 Am', Am)).toEqual([]);
  });

  it('passingDim: a dim7 between roots a whole step apart', () => {
    expect(results('passingDim', 'C Dm')).toEqual(['C Dbdim7 Dm']);
    expect(results('passingDim', 'F G')).toEqual(['F F#dim7 G']);
    expect(results('passingDim', 'Em Dm')).toEqual(['Em Ebdim7 Dm']);
    expect(results('passingDim', 'C F')).toEqual([]);
  });

  it('chromaticBass: fills a falling third in the bass stepwise', () => {
    expect(results('chromaticBass', 'C Am')).toEqual(['C C/B Am']);
    expect(results('chromaticBass', 'Am F')).toEqual(['Am Am/G F']);
    expect(results('chromaticBass', 'C G')).toEqual([]);
  });

  it('every rule is pure: the input is not mutated', () => {
    const input = prog('C Am Dm G7 C');
    const before = JSON.stringify(input);
    for (const r of REHARM_RULES) applyRule(r, input, C);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('applyEdits', () => {
  it('applies non-overlapping edits right to left', () => {
    const input = prog('C Am Dm G');
    const [sub] = applyRule('borrowed', input, C).filter((e) => e.start === 3);
    const [dim] = applyRule('chromaticBass', input, C);
    expect(text(applyEdits(input, [sub, dim]))).toBe('C C/B Am Dm Bb');
    expect(text(applyEdits(input, [dim, sub]))).toBe('C C/B Am Dm Bb');
  });
});

describe('reharmonize', () => {
  it('jazz: the tritone sub of a ii–V–I ranks first', () => {
    const [best] = reharmonize(prog('Dm7 G7 Cmaj7'), C, { style: 'jazz' });
    expect(text(best.chords)).toBe('Dm7 Db7 Cmaj7');
    expect(best.numerals).toEqual(['ii7', 'bII7', 'Imaj7']);
    expect(best.rules).toEqual(['tritone']);
    expect(best.reason).toMatch(/tritone/);
  });

  it('jazz uses the whole toolbox, combining edits', () => {
    const out = reharmonize(prog('Dm7 G7 Cmaj7'), C, { style: 'jazz' });
    const all = out.map((r) => text(r.chords));
    expect(all).toContain('Fm7 Bb7 Cmaj7');
    expect(out.some((r) => r.rules.length > 1)).toBe(true);
    // combined edits never touch the same chord (no Neapolitan + tritone sub pile-up)
    expect(all).not.toContain('Dbmaj7 Db7 Cmaj7');
  });

  it('pop uses only diatonic substitutes and borrowed chords, never altered dominants', () => {
    const progressions = [
      'C G Am F',
      'Dm7 G7 Cmaj7',
      'C Am Dm G',
      'C F G C',
      'Am F C G',
      'G7 C',
      'Fmaj7 Em7 Dm7 Cmaj7',
    ];
    for (const p of progressions) {
      for (const key of [C, Am]) {
        const out = reharmonize(prog(p), key, { style: 'pop' });
        for (const r of out) {
          expect(
            r.rules.every((x) => STYLE_RULES.pop.includes(x)),
            p,
          ).toBe(true);
          for (const c of r.chords) {
            expect(
              ['7b9', '7#9', '7alt', '7b13', '7#11', 'dim7'],
              `${p}: ${text(r.chords)}`,
            ).not.toContain(c.quality);
          }
        }
      }
    }
  });

  it('pop: C G Am F gets a ii for IV and a borrowed iv', () => {
    const out = reharmonize(prog('C G Am F'), C, { style: 'pop' }).map((r) => text(r.chords));
    expect(out[0]).toBe('C G Am Dm');
    expect(out).toContain('C G Am Fm');
  });

  it('is deterministic, ranked, de-duplicated and honours maxResults', () => {
    const a = reharmonize(prog('C Am Dm G'), C, { style: 'jazz', maxResults: 4 });
    const b = reharmonize(prog('C Am Dm G'), C, { style: 'jazz', maxResults: 4 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(4);
    const ids = a.map((r) => text(r.chords));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('C Am Dm G');
    for (let i = 1; i < a.length; i++) expect(a[i].score).toBeLessThanOrEqual(a[i - 1].score);
    for (const r of a) expect(r.numerals).toHaveLength(r.chords.length);
  });

  it('defaults to pop and handles empty input', () => {
    expect(reharmonize([], C)).toEqual([]);
    const out = reharmonize(prog('C F'), C);
    expect(out.every((r) => r.rules.every((x) => STYLE_RULES.pop.includes(x)))).toBe(true);
    expect(reharmonize(prog('C F'), C, { maxResults: 0 })).toEqual([]);
  });
});
