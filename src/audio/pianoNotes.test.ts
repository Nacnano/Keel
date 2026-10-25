import { describe, expect, it } from 'vitest';
import { noteNumber, synthChord } from '@/core/testing/synth';
import type { Peak } from './peaks';
import { estimatePlayedMidiNotes } from './pianoNotes';
import { createChromaPipeline } from './pipeline';

function series(f0: number, harmonics = 6, rolloff = 1.2): Peak[] {
  return Array.from({ length: harmonics }, (_, i) => {
    const h = i + 1;
    return { freq: f0 * h, mag: 1 / h ** rolloff };
  }).filter((p) => p.freq <= 5000);
}

function midiHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** Sum peaks that land on the same frequency so shared partials are one peak. */
function merge(groups: Peak[][]): Peak[] {
  const peaks: Peak[] = [];
  for (const group of groups) {
    for (const peak of group) {
      const hit = peaks.find((p) => Math.abs(1200 * Math.log2(p.freq / peak.freq)) < 15);
      if (hit) hit.mag += peak.mag;
      else peaks.push({ ...peak });
    }
  }
  peaks.sort((a, b) => a.freq - b.freq);
  return peaks;
}

function steadyMidi(samples: Float32Array, sampleRate: number): Map<number, number> {
  const pipeline = createChromaPipeline({ sampleRate });
  const hop = pipeline.config.hopSize;
  const counts = new Map<number, number>();
  for (let i = 0; i + hop <= samples.length; i += hop) {
    const frame = pipeline.process(samples.subarray(i, i + hop), i / sampleRate);
    if (!frame || i / sampleRate < 0.3) continue;
    for (const note of frame.midiNotes ?? []) counts.set(note, (counts.get(note) ?? 0) + 1);
  }
  return counts;
}

describe('played piano keys', () => {
  it('keeps a harmonic tone on its own key', () => {
    expect(estimatePlayedMidiNotes(series(midiHz(60)))).toEqual([60]);
  });

  it('accepts a weak resolved partial without accepting broad noise peaks', () => {
    const weak: Peak[] = [
      { freq: midiHz(60), mag: 1, curvature: -1.4 },
      { freq: midiHz(60) * 2, mag: 0.02, curvature: -1.4 },
    ];
    expect(estimatePlayedMidiNotes(weak)).toEqual([60]);
    expect(estimatePlayedMidiNotes(weak.map((peak) => ({ ...peak, curvature: -0.5 })))).toEqual([]);
  });

  it.each([44100, 48000])('keeps sparse mellow fundamentals at %i Hz', (sampleRate) => {
    for (const notes of [[60], [60, 64, 67]]) {
      const seen = steadyMidi(
        synthChord({ notes, rolloff: 5, sampleRate, seconds: 2 }),
        sampleRate,
      );
      for (const note of notes) expect(seen.get(note) ?? 0).toBeGreaterThan(20);
      expect([...seen.keys()].filter((note) => !notes.includes(note))).toEqual([]);
    }
  });

  it.each([44100, 48000])(
    'keeps an electric-piano tail after upper partials soften at %i Hz',
    (sampleRate) => {
      const samples = new Float32Array(Math.floor(sampleRate * 2.5));
      for (let i = 0; i < samples.length; i++) {
        const t = i / sampleRate;
        const phase = 2 * Math.PI * midiHz(60) * t;
        samples[i] =
          0.1 *
          Math.min(1, t / 0.005) *
          Math.exp(-t / 3) *
          (Math.sin(phase) + 0.3 * Math.exp(-t / 0.7) * Math.sin(2 * phase));
      }
      const pipeline = createChromaPipeline({ sampleRate });
      const hop = pipeline.config.hopSize;
      let tailFrames = 0;
      for (let i = 0; i + hop <= samples.length; i += hop) {
        const frame = pipeline.process(samples.subarray(i, i + hop), i / sampleRate)!;
        if (i / sampleRate >= 1.5 && i / sampleRate <= 2.2 && frame.midiNotes?.includes(60))
          tailFrames++;
        expect((frame.midiNotes ?? []).filter((note) => note !== 60)).toEqual([]);
      }
      expect(tailFrames).toBeGreaterThan(10);
    },
  );

  it('keeps a close triad and drops harmonic ghosts', () => {
    const peaks = merge([60, 64, 67].map((note) => series(midiHz(note))));
    expect(estimatePlayedMidiNotes(peaks)).toEqual([60, 64, 67]);
  });

  it('keeps a bass note and the right-hand chord tones above its partials', () => {
    const peaks = merge([36, 60, 64, 67].map((note) => series(midiHz(note))));
    expect(estimatePlayedMidiNotes(peaks)).toEqual([36, 60, 64, 67]);
  });

  it('does not light an inharmonic ring or a lone sine', () => {
    expect(
      estimatePlayedMidiNotes([
        { freq: 173, mag: 1 },
        { freq: 640, mag: 0.8 },
        { freq: 2100, mag: 0.5 },
      ]),
    ).toEqual([]);
    expect(estimatePlayedMidiNotes([{ freq: 440, mag: 1 }])).toEqual([]);
  });

  it.each([44100, 48000])('lights only the struck keys at %i Hz', (sampleRate) => {
    const one = steadyMidi(
      synthChord({ notes: [noteNumber('C4')], sampleRate, seconds: 1.2 }),
      sampleRate,
    );
    expect(one.get(60) ?? 0).toBeGreaterThan(8);
    expect([...one.keys()].filter((n) => n !== 60)).toEqual([]);

    const chord = steadyMidi(
      synthChord({
        notes: ['C4', 'E4', 'G4'].map(noteNumber),
        sampleRate,
        seconds: 1.2,
      }),
      sampleRate,
    );
    for (const note of [60, 64, 67]) expect(chord.get(note) ?? 0).toBeGreaterThan(8);
    expect([...chord.keys()].filter((n) => ![60, 64, 67].includes(n))).toEqual([]);
  });
});

describe('per-note spectral support', () => {
  const sharp = (peaks: Peak[]) => peaks.map((peak) => ({ ...peak, curvature: -1.4 }));
  function scored(peaks: Peak[]) {
    const scores: Record<number, number> = {};
    const notes = estimatePlayedMidiNotes(peaks, 440, 8, 0.6, scores);
    expect(notes).toEqual(estimatePlayedMidiNotes(peaks));
    expect(
      Object.keys(scores)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual(notes);
    for (const score of Object.values(scores)) {
      expect(Number.isFinite(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
    return { notes, scores };
  }

  it('ranks strong resolved support above weak, broad or detuned support without changing keys', () => {
    const frequency = midiHz(60);
    const clear = sharp([
      { freq: frequency, mag: 1 },
      { freq: frequency * 2, mag: 0.5 },
    ]);
    const weak = sharp([
      { freq: frequency, mag: 1 },
      { freq: frequency * 2, mag: 0.015 },
    ]);
    const broad = clear.map((peak) => ({ ...peak, curvature: -0.5 }));
    const detuned = clear.map((peak) => ({ ...peak, freq: peak.freq * 2 ** (20 / 1200) }));
    expect(scored(clear).scores[60]).toBeGreaterThan(0.95);
    expect(scored(weak).notes).toEqual([60]);
    expect(scored(weak).scores[60]).toBeLessThan(0.6);
    expect(scored(broad).scores[60]).toBeLessThan(0.7);
    expect(scored(detuned).scores[60]).toBeLessThan(scored(clear).scores[60] - 0.1);
  });

  it('is invariant to global gain and an unrelated louder supported note', () => {
    const peaks = sharp(series(midiHz(60)));
    const original = scored(peaks).scores[60];
    const quiet = peaks.map((peak) => ({ ...peak, mag: peak.mag * 0.01 }));
    expect(scored(quiet).scores[60]).toBeCloseTo(original, 12);
    const chord = [
      ...peaks,
      ...sharp(series(midiHz(66))).map((peak) => ({ ...peak, mag: peak.mag * 2.5 })),
    ].sort((a, b) => a.freq - b.freq);
    expect(scored(chord).notes).toContain(60);
    expect(scored(chord).scores[60]).toBeCloseTo(original, 12);
  });

  it('discounts a candidate fundamental substantially explained by a lower note', () => {
    const frequency = midiHz(60);
    const clear = sharp([
      { freq: frequency, mag: 2 },
      { freq: frequency * 2, mag: 2 },
    ]);
    const ambiguous = sharp([{ freq: frequency / 2, mag: 1 }, ...clear]);
    expect(scored(ambiguous).notes).toContain(60);
    expect(scored(ambiguous).scores[60]).toBeLessThan(scored(clear).scores[60] - 0.15);
  });

  it('keeps unobservable high-register partials uncertain and clears stale output entries', () => {
    const high = scored(sharp([{ freq: midiHz(105), mag: 1 }]));
    expect(high.notes).toEqual([105]);
    expect(high.scores[105]).toBeLessThan(0.8);
    const scores: Record<number, number> = { 60: 1 };
    expect(estimatePlayedMidiNotes([], 440, 8, 0.6, scores)).toEqual([]);
    expect(scores).toEqual({});
    expect(scored([{ freq: 440, mag: 1 }]).scores).toEqual({});
  });

  it.each([44100, 48000])(
    'keeps weaker spectral support lower after sustained audio at %i Hz',
    (sampleRate) => {
      const measure = (rolloff: number) => {
        const pipeline = createChromaPipeline({ sampleRate });
        const audio = synthChord({ notes: [60], sampleRate, seconds: 2, rolloff });
        const scores: number[] = [];
        const hop = pipeline.config.hopSize;
        for (let i = 0; i + hop <= audio.length; i += hop) {
          const frame = pipeline.process(audio.subarray(i, i + hop), i / sampleRate)!;
          expect(
            Object.keys(frame.noteConfidences ?? {})
              .map(Number)
              .sort((a, b) => a - b),
          ).toEqual(frame.midiNotes ?? []);
          if (i / sampleRate > 1 && frame.midiNotes?.includes(60))
            scores.push(frame.noteConfidences![60]);
        }
        expect(scores.length).toBeGreaterThan(10);
        return scores;
      };
      const strong = measure(1.2),
        weak = measure(5);
      expect(Math.min(...strong)).toBeGreaterThan(0.85);
      expect(Math.max(...weak)).toBeLessThan(0.7);
    },
  );
});
