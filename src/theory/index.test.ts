import { describe, expect, it } from 'vitest';
import * as theory from './index';

const sources = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('theory index', () => {
  it('re-exports the public API of every module', () => {
    const expected = [
      'CHORD_TEMPLATES',
      'qualitiesForLevel',
      'pc',
      'spell',
      'spellChord',
      'midiToPc',
      'pcToMidi',
      'chordSymbol',
      'chordTones',
      'identifyChord',
      'KRUMHANSL_MAJOR',
      'TEMPERLEY_MINOR',
      'scaleOf',
      'relativeKey',
      'parallelKey',
      'diatonicChords',
      'romanNumeral',
      'bassDegree',
      'suggestNext',
      'compressTimeline',
      'scalesForChord',
      'voicings',
    ];
    for (const name of expected) expect(theory, name).toHaveProperty(name);
  });

  it('modules import only from @/core and ./ (pure TS, no DOM or audio)', () => {
    const files = Object.keys(sources);
    expect(files.length).toBeGreaterThanOrEqual(11);
    for (const [file, src] of Object.entries(sources)) {
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1];
        expect(spec === '@/core' || spec.startsWith('./'), `${file}: ${spec}`).toBe(true);
      }
      expect(/\b(window|document|navigator|AudioContext)\b/.test(src), file).toBe(false);
    }
  });
});
