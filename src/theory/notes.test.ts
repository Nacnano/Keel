import { describe, expect, it } from 'vitest';
import type { Key, PitchClass } from '@/core';
import { ALL_KEYS, scaleOf } from './keys';
import {
  NOTE_NAMES_NEUTRAL,
  keyName,
  midiName,
  midiToPc,
  pc,
  pcToMidi,
  prettyAccidentals,
  spell,
  spellAbove,
  tonicName,
  transpose,
} from './notes';

const key = (tonic: number, mode: Key['mode'] = 'major'): Key => ({
  tonic: tonic as PitchClass,
  mode,
});
const C = key(0);
const Db = key(1);
const CsMinor = key(1, 'minor');

describe('pc', () => {
  it('parses names, accidentals and enharmonics', () => {
    expect(pc('C')).toBe(0);
    expect(pc('c#')).toBe(1);
    expect(pc('Db')).toBe(1);
    expect(pc('E♭')).toBe(3);
    expect(pc('F♯')).toBe(6);
    expect(pc('Cb')).toBe(11);
    expect(pc('B#')).toBe(0);
    expect(pc('E#')).toBe(5);
    expect(pc('Fb')).toBe(4);
    expect(pc('Fx')).toBe(7);
    expect(pc('Ebb')).toBe(2);
    expect(pc(' A ')).toBe(9);
  });

  it('throws on garbage', () => {
    expect(() => pc('H')).toThrow();
    expect(() => pc('C7')).toThrow();
    expect(() => pc('')).toThrow();
  });
});

describe('midi helpers', () => {
  it('converts between MIDI notes and pitch classes', () => {
    expect(midiToPc(60)).toBe(0);
    expect(midiToPc(71)).toBe(11);
    expect(pcToMidi(0, 4)).toBe(60);
    expect(pcToMidi(9, 4)).toBe(69);
    expect(pcToMidi(0, -1)).toBe(0);
    expect(transpose(10, 4)).toBe(2);
    expect(transpose(1, -3)).toBe(10);
  });

  it('midiName uses scientific pitch and the key spelling', () => {
    expect(midiName(60)).toBe('C4');
    expect(midiName(69)).toBe('A4');
    expect(midiName(61, Db)).toBe('Db4');
    expect(midiName(61, CsMinor)).toBe('C#4');
    // Cb4 sounds as B3 but is written in octave 4
    expect(midiName(59, key(6))).toBe('Cb4');
    expect(midiName(21)).toBe('A0');
  });
});

describe('spell', () => {
  it('Db vs C# contexts', () => {
    expect(spell(1, Db)).toBe('Db');
    expect(spell(1, CsMinor)).toBe('C#');
    expect(spell(8, Db)).toBe('Ab');
    expect(spell(8, CsMinor)).toBe('G#');
    expect(spell(6, Db)).toBe('Gb');
    expect(spell(6, CsMinor)).toBe('F#');
    expect(spell(3, key(4))).toBe('D#'); // E major
    expect(spell(3, key(10))).toBe('Eb'); // Bb major
  });

  it('diatonic notes follow the key signature, including Cb in Gb', () => {
    expect(spell(11, key(6))).toBe('Cb');
    expect(spell(10, key(5))).toBe('Bb');
    expect(spell(6, key(7))).toBe('F#');
    expect(spell(8, key(9, 'minor'))).toBe('G#'); // leading tone of A minor
  });

  it('every key spells its scale with seven distinct letters', () => {
    for (const k of ALL_KEYS) {
      const names = scaleOf(k).map((p) => spell(p, k));
      expect(new Set(names.map((n) => n[0])).size, `${k.tonic} ${k.mode}`).toBe(7);
      const sig = names.filter((n) => n.length > 1);
      // only one kind of accidental per key signature
      expect(sig.every((n) => n.endsWith('#')) || sig.every((n) => n.endsWith('b'))).toBe(true);
    }
  });

  it('chromatic notes use the usual chromatic degrees', () => {
    // C major: bII bIII #IV bVI bVII
    expect([1, 3, 6, 8, 10].map((p) => spell(p as PitchClass, C))).toEqual([
      'Db',
      'Eb',
      'F#',
      'Ab',
      'Bb',
    ]);
    expect(spell(10, key(7))).toBe('Bb'); // bIII of G major
    expect(spell(5, key(2))).toBe('F'); // bIII of D major
    expect(spell(7, key(4))).toBe('G'); // bIII of E major
    expect(spell(4, key(0, 'minor'))).toBe('E'); // Picardy third in C minor
    expect(spell(11, key(0, 'minor'))).toBe('B'); // leading tone in C minor
  });

  it('falls back to the key side of the circle instead of odd enharmonics', () => {
    expect(spell(5, key(11))).toBe('F'); // #4 of B would be E#
    expect(spell(4, Db)).toBe('E'); // b3 of Db would be Fb
    expect(spell(7, key(8, 'minor'))).toBe('G'); // raised 7 of G# minor would be F##
    expect(spell(0, CsMinor)).toBe('C'); // raised 7 of C# minor would be B#
  });

  it('spellingFollowsKey false always uses sharps; no key uses neutral names', () => {
    expect(spell(10, key(5), { spellingFollowsKey: false })).toBe('A#');
    expect(spell(1, Db, { spellingFollowsKey: false })).toBe('C#');
    expect(NOTE_NAMES_NEUTRAL.map((_, p) => spell(p as PitchClass))).toEqual([
      'C',
      'C#',
      'D',
      'Eb',
      'E',
      'F',
      'F#',
      'G',
      'Ab',
      'A',
      'Bb',
      'B',
    ]);
    expect(spell(3, null)).toBe('Eb');
  });
});

describe('key names', () => {
  it('tonicName and keyName', () => {
    expect(tonicName(Db)).toBe('Db');
    expect(tonicName(CsMinor)).toBe('C#');
    expect(tonicName(key(3, 'minor'))).toBe('Eb');
    expect(keyName(key(3))).toBe('Eb major');
    expect(keyName(key(6, 'minor'))).toBe('F# minor');
    expect(keyName(key(10), { spellingFollowsKey: false })).toBe('A# major');
  });
});

describe('spellAbove', () => {
  it('spells by letter distance from a reference', () => {
    expect(spellAbove('Db', 2, 5)).toBe('F');
    expect(spellAbove('C#', 2, 5)).toBe('E#');
    expect(spellAbove('B', 6, 9)).toBe('A');
    // C dim7's bb7 would be Bbb: plain enharmonic instead
    expect(spellAbove('C', 6, 9)).toBe('A');
    expect(spellAbove('Eb', 6, 1)).toBe('Db');
  });
});

describe('prettyAccidentals', () => {
  it('replaces ASCII accidentals for display', () => {
    expect(prettyAccidentals('Bbm7b5')).toBe('B♭m7♭5');
    expect(prettyAccidentals('F#7#9')).toBe('F♯7♯9');
    expect(prettyAccidentals('bVII')).toBe('♭VII');
    expect(prettyAccidentals('Cdim')).toBe('Cdim');
  });
});
