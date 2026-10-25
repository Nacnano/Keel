import { describe, expect, it } from 'vitest';
import { runBenchmarkCase } from './benchmark';
import { buildPianoTimbreCases, PIANO_TIMBRES } from './pianoTimbres';

const cases = buildPianoTimbreCases();

describe('synthetic piano timbre probes through live DSP and analysis', () => {
  it('keeps exact generator keys, finite unclipped signals, both modes and sample rates explicit', () => {
    expect(cases).toHaveLength(60);
    expect(new Set(cases.map((c) => c.sampleRate))).toEqual(new Set([44100, 48000]));
    expect(new Set(cases.map((c) => c.mode))).toEqual(new Set(['solo', 'room']));
    expect(PIANO_TIMBRES).toHaveLength(6);
    for (const c of cases) {
      expect(c.provenance).toBe('synthetic');
      expect(c.samples.every((v) => Number.isFinite(v) && Math.abs(v) < 1)).toBe(true);
      expect(c.truth.at(-1)?.end).toBeCloseTo(c.samples.length / c.sampleRate, 9);
      for (const span of c.truth) {
        if (span.chord !== null) expect(span.midiNotes?.length).toBeGreaterThan(0);
      }
    }
  });

  it.each(cases.filter((c) => c.strictNoise))(
    'rejects all visible highlights/chords/keys: $id',
    (c) => {
      const m = runBenchmarkCase(c, 'piano-timbre-controls').metrics;
      expect(m.falseChordSec).toBe(0);
      expect(m.falseKeyEvents).toBe(0);
      expect(m.exactNotes.confirmed.visibleSec).toBe(0);
      expect(m.exactNotes.tentative.visibleSec).toBe(0);
      expect(m.exactNotes.union.visibleSec).toBe(0);
    },
  );

  it.each(
    cases.filter((c) => c.id.includes('/register-sustain/') && !c.id.includes('/electric-bell/')),
  )('retains the low and high played keys, including decaying single notes: $id', (c) => {
    const m = runBenchmarkCase(c, 'piano-timbre-registers').metrics;
    expect(m.exactNotes.expectedOnsets).toBe(2);
    // Bounded existing capability, not a claim of complete sustain recognition.
    for (const channel of ['confirmed', 'union'] as const) {
      expect(m.exactNotes[channel].missedOnsets).toBe(0);
      expect(m.exactNotes[channel].recall).toBeGreaterThan(0.74);
      expect(m.exactNotes[channel].precision).toBeGreaterThan(0.8);
    }
  });

  it.each(cases.filter((c) => c.id.includes('/major-chord/') && !c.id.includes('/electric-bell/')))(
    'retains decaying harmonic chord notes instead of only the attack: $id',
    (c) => {
      const m = runBenchmarkCase(c, 'piano-timbre-decaying-chords').metrics;
      // FM modulation decays toward a nearly sinusoidal tail; a real upper partial is
      // still required, so this probe has a lower explicit target than additive spectra.
      const minimumRecall = c.id.includes('/electric-fm/') ? 0.75 : 0.9;
      for (const channel of ['confirmed', 'union'] as const) {
        expect(m.exactNotes[channel].recall).toBeGreaterThan(minimumRecall);
        expect(m.exactNotes[channel].precision).toBeGreaterThan(0.9);
        expect(m.exactNotes[channel].missedOnsets).toBe(0);
        expect(m.exactNotes[channel].octaveErrorSec).toBe(0);
        expect(m.exactNotes[channel].releaseSec).toBeLessThan(0.4);
      }
    },
  );

  it.each(cases.filter((c) => c.id.includes('/acoustic-bright/major-chord/')))(
    'preserves bright triad recognition while handling other spectra: $id',
    (c) => {
      const m = runBenchmarkCase(c, 'piano-timbre-bright-chords').metrics;
      expect(m.accuracy).toBeGreaterThan(0.8);
      expect(m.exactNotes.expectedOnsets).toBe(3);
      expect(m.exactNotes.union.recall).toBeGreaterThan(0.9);
      expect(m.exactNotes.union.precision).toBeGreaterThan(0.9);
      expect(m.exactNotes.confirmed.missedOnsets).toBe(0);
    },
  );
});
