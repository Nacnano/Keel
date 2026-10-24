/** Deterministic nuisance sounds. These are simulations, not microphone recordings. */
import { pinkNoise, whiteNoise } from './conditions';

export function roomNoiseTrials(sampleRate: number, seconds = 8, seed = 42) {
  const length = Math.floor(sampleRate * seconds);
  const switchedFan = new Float32Array(length);
  const start = Math.floor(sampleRate * Math.min(2, seconds / 2));
  switchedFan.set(pinkNoise(length - start, 0.03, seed), start);
  const taps = new Float32Array(length);
  for (let start = sampleRate; start < length; start += Math.floor(sampleRate * 0.5)) {
    const burst = whiteNoise(
      Math.min(Math.floor(sampleRate * 0.025), length - start),
      0.1,
      seed + start,
    );
    taps.set(burst, start);
  }
  const hum = (hz: number) => {
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      for (let h = 1; h <= 7; h++)
        out[i] += (0.015 / h) * Math.sin((2 * Math.PI * hz * h * i) / sampleRate);
    }
    return out;
  };
  return [
    { name: 'digital silence', samples: new Float32Array(length) },
    ...[-55, -25].flatMap((db) => [
      { name: `white noise RMS ${db} dBFS`, samples: whiteNoise(length, 10 ** (db / 20), seed) },
      { name: `pink noise RMS ${db} dBFS`, samples: pinkNoise(length, 10 ** (db / 20), seed) },
    ]),
    { name: 'pink noise starting after silence', samples: switchedFan },
    { name: 'typing-like 25 ms noise bursts', samples: taps },
    { name: '50 Hz mains hum with harmonics', samples: hum(50) },
    { name: '60 Hz mains hum with harmonics', samples: hum(60) },
  ];
}
