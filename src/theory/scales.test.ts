import { describe, expect, it } from 'vitest';
import type { Chord, Key, PitchClass } from '@/core';
import { chordTones, parseChord } from './chordName';
import { SCALES, scalePitchClasses, scalesForChord } from './scales';
import type { ScaleId } from './scales';
import { QUALITY_ORDER } from './vocab';

const C: Key = { tonic: 0, mode: 'major' };
const ch = (s: string): Chord => {
  const c = parseChord(s);
  if (!c) throw new Error(s);
  return c;
};
const top = (s: string, k?: Key | null) => scalesForChord(ch(s), k)[0];

describe('SCALES / scalePitchClasses', () => {
  it('every scale starts on the root with distinct ascending intervals', () => {
    for (const id of Object.keys(SCALES) as ScaleId[]) {
      const iv = SCALES[id].intervals;
      expect(iv[0], id).toBe(0);
      expect(iv.length >= 5 && iv.length <= 8, id).toBe(true);
      for (let i = 1; i < iv.length; i++) expect(iv[i] > iv[i - 1], id).toBe(true);
      expect(iv[iv.length - 1] < 12, id).toBe(true);
    }
  });

  it('modes of major are rotations of ionian', () => {
    const modes: ScaleId[] = [
      'ionian',
      'dorian',
      'phrygian',
      'lydian',
      'mixolydian',
      'aeolian',
      'locrian',
    ];
    const cMajor = new Set(scalePitchClasses(0, 'ionian'));
    [0, 2, 4, 5, 7, 9, 11].forEach((root, i) => {
      expect(new Set(scalePitchClasses(root as PitchClass, modes[i]))).toEqual(cMajor);
    });
    expect(scalePitchClasses(2, 'dorian')).toEqual([2, 4, 5, 7, 9, 11, 0]);
  });
});

describe('scalesForChord: ii–V–I in C', () => {
  it('Dm7 -> D dorian', () => {
    const s = top('Dm7', C);
    expect(s.id).toBe('dorian');
    expect(s.label).toBe('D dorian');
    expect(s.pitchClasses).toEqual([2, 4, 5, 7, 9, 11, 0]);
    expect(s.reason).toContain('C major');
  });

  it('G7 -> G mixolydian, altered ranked lower', () => {
    const all = scalesForChord(ch('G7'), C);
    expect(all[0].id).toBe('mixolydian');
    const ids = all.map((s) => s.id);
    expect(ids).toContain('lydianDominant');
    expect(ids.indexOf('altered')).toBeGreaterThan(ids.indexOf('mixolydian'));
  });

  it('Cmaj7 -> C ionian, then lydian', () => {
    expect(scalesForChord(ch('Cmaj7'), C).map((s) => s.id)).toEqual(['ionian', 'lydian']);
  });
});

describe('scalesForChord: key context and special qualities', () => {
  it('diatonic modes win in context', () => {
    expect(top('Fmaj7', C).id).toBe('lydian');
    expect(top('Em7', C).id).toBe('phrygian');
    expect(top('Bm7b5', C).id).toBe('locrian');
    expect(top('Am', C).id).toBe('aeolian');
    expect(top('E7', { tonic: 9, mode: 'minor' }).id).toBe('phrygianDominant');
    expect(top('Gm7', { tonic: 5, mode: 'major' }).label).toBe('G dorian');
    expect(top('Bbmaj7', { tonic: 5, mode: 'major' }).label).toBe('Bb lydian');
  });

  it('altered, diminished and whole-tone colours', () => {
    expect(top('G7alt', C).id).toBe('altered');
    expect(top('C7b9').id).toBe('diminishedHalfWhole');
    expect(top('Cdim7').id).toBe('diminishedWholeHalf');
    expect(top('Caug').id).toBe('wholeTone');
    expect(top('C7#11').id).toBe('lydianDominant');
    expect(top('CmMaj7').id).toBe('melodicMinor');
    expect(top('C5').id).toBe('minorPentatonic');
  });

  it('every quality gets at least one scale that contains its tones', () => {
    for (const q of QUALITY_ORDER) {
      for (const k of [null, C]) {
        const c: Chord = { root: 2, quality: q };
        const out = scalesForChord(c, k);
        expect(out.length, q).toBeGreaterThan(0);
        const fifth = (c.root + 7) % 12;
        const first = new Set(out[0].pitchClasses);
        for (const t of chordTones(c)) {
          if (t !== fifth) expect(first.has(t), `${q} ${t}`).toBe(true);
        }
        for (let i = 1; i < out.length; i++) {
          expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
        }
        for (const s of out) {
          expect(s.root).toBe(2);
          expect(s.pitchClasses[0]).toBe(2);
          expect(s.reason.length).toBeGreaterThan(5);
        }
      }
    }
  });

  it('colour scales say they skip a chord tone', () => {
    const blues = scalesForChord(ch('G7'), C).find((s) => s.id === 'blues');
    expect(blues?.reason).toContain('skips a chord tone');
  });

  it('is deterministic', () => {
    expect(scalesForChord(ch('Dm7'), C)).toEqual(scalesForChord(ch('Dm7'), C));
  });
});
