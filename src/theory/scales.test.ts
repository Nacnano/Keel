import { describe, expect, it } from 'vitest';
import type { Chord, Key, PitchClass } from '@/core';
import { chordTones, parseChord } from './chordName';
import { SCALES, scaleNotesSpelled, scalePitchClasses, scalesForChord } from './scales';
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

const A_MINOR: Key = { tonic: 9, mode: 'minor' };
const C_MINOR: Key = { tonic: 0, mode: 'minor' };
const F: Key = { tonic: 5, mode: 'major' };
const Gb: Key = { tonic: 6, mode: 'major' };

describe('scalesForChord: rank and position-aware reasons', () => {
  it('rank is 1-based and follows the order', () => {
    const out = scalesForChord(ch('G7'), C);
    expect(out.map((s) => s.rank)).toEqual(out.map((_, i) => i + 1));
  });

  it('names the chord position and the parent scale', () => {
    expect(top('Dm7', C).reason).toBe('ii7 in C major: mode 2 of C major; every note in the key');
    expect(top('G7', C).reason).toContain('V7 in C major: mode 5 of C major');
    expect(top('Fmaj7', C).reason).toContain('IVmaj7 in C major: mode 4 of C major');
    const alt = scalesForChord(ch('G7'), C).find((s) => s.id === 'altered');
    expect(alt?.reason).toContain('mode 7 of Ab melodic minor');
  });

  it('V7 in minor -> harmonic minor (mode 5), in any minor key', () => {
    for (const [sym, key, tonic] of [
      ['E7', A_MINOR, 'A'],
      ['G7', C_MINOR, 'C'],
    ] as const) {
      const s = top(sym, key);
      expect(s.id).toBe('phrygianDominant');
      expect(s.reason).toContain(`mode 5 of ${tonic} harmonic minor`);
      expect(s.reason).toContain('every note in the key');
    }
    // same chord in a major key stays mixolydian
    expect(top('G7', C).id).toBe('mixolydian');
  });

  it('pentatonics and blues over maj / min / 7', () => {
    const ids = (s: string, k: Key | null = C) => scalesForChord(ch(s), k).map((x) => x.id);
    expect(ids('C')).toContain('majorPentatonic');
    expect(ids('Am')).toEqual(expect.arrayContaining(['minorPentatonic', 'blues']));
    expect(ids('G7')).toEqual(expect.arrayContaining(['majorPentatonic', 'blues']));
    expect(ids('C9', null)).toContain('majorPentatonic');
    const mp = scalesForChord(ch('G7'), C).find((s) => s.id === 'majorPentatonic');
    expect(mp?.reason).toContain('open colour (skips a chord tone)');
    // major pentatonic misses the major seventh, so it is not offered over maj7
    expect(ids('Cmaj7')).not.toContain('majorPentatonic');
  });

  it('symmetric and melodic-minor choices for altered chords', () => {
    expect(top('Bdim7', A_MINOR).id).toBe('diminishedWholeHalf');
    expect(top('G7b9', C).id).toBe('diminishedHalfWhole');
    expect(top('Gaug', C).id).toBe('wholeTone');
    expect(top('G7#11', C).id).toBe('lydianDominant');
    expect(top('G7alt', C).id).toBe('altered');
  });
});

describe('scaleNotesSpelled', () => {
  const notes = (sym: string, k: Key | null, id?: ScaleId) => {
    const all = scalesForChord(ch(sym), k);
    const s = id ? all.find((x) => x.id === id) : all[0];
    if (!s) throw new Error(`${sym} ${id}`);
    return scaleNotesSpelled(s, k).join(' ');
  };

  it('one letter per degree for seven-note scales', () => {
    expect(notes('Dm7', C)).toBe('D E F G A B C');
    expect(notes('Bbmaj7', F)).toBe('Bb C D E F G A');
    expect(notes('E7', A_MINOR)).toBe('E F G# A B C D');
    expect(notes('G7', C, 'lydianDominant')).toBe('G A B C# D E F');
    expect(notes('Db7', Gb)).toBe('Db Eb F Gb Ab Bb Cb');
  });

  it('falls back to the key spelling for odd enharmonics', () => {
    expect(notes('G7alt', C)).toBe('G Ab Bb B Db Eb F');
  });

  it('pentatonic, blues and symmetric scales use the key spelling', () => {
    expect(notes('Am', C, 'minorPentatonic')).toBe('A C D E G');
    expect(notes('Am', C, 'blues')).toBe('A C D Eb E G');
    expect(notes('Gaug', C)).toBe('G A B Db Eb F');
  });

  it('respects spellingFollowsKey: false and works without a key', () => {
    const s = scalesForChord(ch('Bbmaj7'), F)[0];
    expect(scaleNotesSpelled(s, F, { spellingFollowsKey: false })).toEqual([
      'A#',
      'C',
      'D',
      'E',
      'F',
      'G',
      'A',
    ]);
    expect(notes('Dm7', null)).toBe('D E F G A B C');
  });
});
