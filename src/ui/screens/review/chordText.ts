import type { ChordRecord, Key } from '@/core';
import { chordSymbol, pretty } from '../../lib/chordLabel';
import { romanNumeral } from '../../lib/numeral';
import { indexAt } from './timeline';

/** Display symbol and roman numeral for one record in its key context (`—` for no chord). */
export function chordText(
  rec: ChordRecord,
  key: Key | null,
  opts: { spellingFollowsKey?: boolean; showSlash?: boolean } = {},
): { symbol: string; numeral: string } {
  if (!rec.chord) return { symbol: '—', numeral: '' };
  return {
    symbol: pretty(chordSymbol(rec.chord, key, opts)),
    numeral: key ? pretty(romanNumeral(rec.chord, key)) : '',
  };
}

/** Key in force at `t` (the first key also covers anything before it). */
export function keyAtTime(keys: ReadonlyArray<{ t: number; key: Key }>, t: number): Key | null {
  const i = indexAt(keys, t);
  return i >= 0 ? keys[i].key : (keys[0]?.key ?? null);
}
