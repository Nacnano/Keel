import { describe, expect, it } from 'vitest';
import { mix, noteNumber, synthChord, synthProgression } from '@/core/testing/synth';
import { analyseSamples } from './fileInput';
import { createRoomProcessor } from './room';

/** A sung A4 with vibrato (±depthCents at rateHz) and a few harmonics. */
function vibratoVoice(sr: number, seconds: number, depthCents = 50, rateHz = 5.5): Float32Array {
  const n = Math.round(sr * seconds);
  const out = new Float32Array(n);
  const phase = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f0 = 440 * Math.pow(2, (depthCents * Math.sin(2 * Math.PI * rateHz * t)) / 1200);
    for (let h = 0; h < 3; h++) {
      phase[h] += (2 * Math.PI * f0 * (h + 1)) / sr;
      out[i] += (0.3 / (h + 1)) * Math.sin(phase[h]);
    }
  }
  return out;
}

const meanBin = (frames: { chroma: Float32Array }[], pc: number) =>
  frames.reduce((a, f) => a + f.chroma[pc], 0) / frames.length;

describe('room mode', () => {
  it('de-emphasises a persistently drifting in-band peak and leaves stable ones alone', () => {
    const room = createRoomProcessor();
    const cents = [0, 30, 0, 30];
    let out = [] as ReturnType<typeof room.deemphasize>;
    for (const c of cents) {
      out = room.deemphasize([
        { freq: 440 * Math.pow(2, c / 1200), mag: 1, curvature: -1.4 },
        { freq: 523.25, mag: 1, curvature: -1.4 }, // stable
        { freq: 110, mag: 1, curvature: -0.2 }, // out of band
      ]);
    }
    expect(out[0].mag).toBeLessThan(0.5);
    expect(out[1].mag).toBe(1);
    expect(out[2].mag).toBe(1);
  });

  it('ignores briefly smeared peaks (note attacks) but attenuates sustained smear', () => {
    const room = createRoomProcessor({ minFrames: 3 });
    const smeared = [{ freq: 440, mag: 1, curvature: -0.4 }];
    expect(room.deemphasize(smeared)[0].mag).toBe(1);
    expect(room.deemphasize(smeared)[0].mag).toBe(1);
    expect(room.deemphasize(smeared)[0].mag).toBeLessThan(0.5);
    room.deemphasize([{ freq: 440, mag: 1, curvature: -1.45 }]); // stable again
    expect(room.deemphasize(smeared)[0].mag).toBe(1);
  });

  it('averages two frames and resets on silence', () => {
    const room = createRoomProcessor();
    const a = new Float32Array(12);
    a[0] = 1;
    const b = new Float32Array(12);
    b[7] = 1;
    room.average(a);
    const avg = room.average(b);
    expect(avg[0]).toBeCloseTo(0.5);
    expect(avg[7]).toBeCloseTo(0.5);
    room.average(new Float32Array(12));
    expect(room.average(b)[7]).toBeCloseTo(1);
  });

  it('still tracks a plain progression (attacks are not attenuated)', () => {
    const sr = 48000;
    const roots = [0, 9, 5, 7];
    const voicings = [
      ['C3', 'C4', 'E4', 'G4'],
      ['A2', 'A3', 'C4', 'E4'],
      ['F2', 'F3', 'A3', 'C4'],
      ['G2', 'G3', 'B3', 'D4'],
    ];
    const x = synthProgression(
      voicings.map((v) => ({ notes: v.map(noteNumber), seconds: 1.5 })),
      { sampleRate: sr },
    );
    const solo = analyseSamples(x, sr, { mode: 'solo' });
    const room = analyseSamples(x, sr, { mode: 'room' });
    expect(room).toHaveLength(solo.length);
    roots.forEach((root, i) => {
      const seg = room.filter((f) => f.t >= i * 1.5 + 0.25 && f.t < (i + 1) * 1.5 - 0.05);
      const hits = seg.filter((f) => f.chroma.indexOf(Math.max(...f.chroma)) === root).length;
      expect(hits / seg.length).toBeGreaterThan(0.9);
    });
  });

  it('reduces a vibrato vocal over a C major chord compared to solo mode', () => {
    const sr = 48000;
    const seconds = 2;
    const chord = synthChord({
      notes: ['C3', 'C4', 'E4', 'G4'].map(noteNumber),
      sampleRate: sr,
      seconds,
      decay: 0,
    });
    const x = mix(chord, vibratoVoice(sr, seconds));
    const solo = analyseSamples(x, sr, { mode: 'solo' }).slice(8);
    const room = analyseSamples(x, sr, { mode: 'room' }).slice(8);
    const aSolo = meanBin(solo, 9);
    const aRoom = meanBin(room, 9);
    expect(aRoom).toBeLessThan(aSolo * 0.75);
    const chordMass = (fs: typeof room) =>
      fs.reduce((a, f) => a + f.chroma[0] + f.chroma[4] + f.chroma[7], 0) / fs.length;
    expect(chordMass(room)).toBeGreaterThan(chordMass(solo));
  });
});
