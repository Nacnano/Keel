/**
 * Signal degradations for the evaluation harness. All deterministic (seeded).
 *
 * SNRs are relative to the RMS of the whole rendered session (continuous playing, so this is
 * close to the RMS while the piano sounds).
 */
import type { Key } from '@/core/types';
import { dbToLin, gaussian, normalizePeak, rms, rng } from './util';

export interface ConditionContext {
  sampleRate: number;
  key: Key;
  seed: number;
}

export interface Condition {
  id: string;
  label: string;
  apply(x: Float32Array, ctx: ConditionContext): Float32Array;
}

// ---------------------------------------------------------------- building blocks

export function whiteNoise(n: number, rmsLin: number, seed: number): Float32Array {
  const g = gaussian(rng(seed));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = g() * rmsLin;
  return out;
}

/** Pink (−3 dB/oct) noise, Paul Kellet's refined filter, scaled to `rmsLin`. */
export function pinkNoise(n: number, rmsLin: number, seed: number): Float32Array {
  const g = gaussian(rng(seed));
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = g();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  const r = rms(out);
  for (let i = 0; i < n; i++) out[i] *= rmsLin / r;
  return out;
}

function add(x: Float32Array, y: Float32Array): Float32Array {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] + y[i];
  return out;
}

type BiquadType = 'lowpass' | 'highpass';

/** RBJ cookbook biquad, Q = 0.707 (Butterworth). Returns a new array. */
export function biquad(x: Float32Array, sr: number, type: BiquadType, f0: number): Float32Array {
  const w0 = (2 * Math.PI * f0) / sr;
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w0);
  const b0 = type === 'lowpass' ? (1 - cos) / 2 : (1 + cos) / 2;
  const b1 = type === 'lowpass' ? 1 - cos : -(1 + cos);
  const b2 = b0;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const out = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

/** Schroeder reverb: 4 damped parallel combs + 2 series allpasses. `wet` 0..1. */
export function schroederReverb(x: Float32Array, sr: number, rt60 = 0.6, wet = 0.35): Float32Array {
  const combMs = [29.7, 37.1, 41.1, 43.7];
  const pre = Math.round(0.012 * sr);
  const sum = new Float32Array(x.length);
  for (const ms of combMs) {
    const d = Math.round((ms / 1000) * sr);
    const g = Math.pow(10, (-3 * (ms / 1000)) / rt60);
    const buf = new Float32Array(d);
    let lp = 0;
    let idx = 0;
    for (let i = 0; i < x.length; i++) {
      const input = i >= pre ? x[i - pre] : 0;
      const y = buf[idx];
      lp = 0.75 * y + 0.25 * lp; // high-frequency damping in the loop
      buf[idx] = input + g * lp;
      idx = (idx + 1) % d;
      sum[i] += y / combMs.length;
    }
  }
  let y = sum;
  for (const [ms, g] of [
    [5.0, 0.7],
    [1.7, 0.7],
  ] as const) {
    const d = Math.round((ms / 1000) * sr);
    const buf = new Float32Array(d);
    const out = new Float32Array(y.length);
    let idx = 0;
    for (let i = 0; i < y.length; i++) {
      const delayed = buf[idx];
      const v = y[i] + g * delayed;
      out[i] = delayed - g * v;
      buf[idx] = v;
      idx = (idx + 1) % d;
    }
    y = out;
  }
  // Equalise the wet level to the dry RMS, then mix.
  const gw = rms(x) / Math.max(1e-12, rms(y));
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (1 - wet) * x[i] + wet * gw * y[i];
  return out;
}

/** Feed-forward peak compressor with a soft knee (attack 5 ms, release 120 ms). */
export function softCompress(
  x: Float32Array,
  sr: number,
  thresholdDb = -36,
  ratio = 3,
  makeupDb = 6,
): Float32Array {
  const att = Math.exp(-1 / (0.005 * sr));
  const rel = Math.exp(-1 / (0.12 * sr));
  const knee = 6;
  const makeup = dbToLin(makeupDb);
  const out = new Float32Array(x.length);
  let env = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a;
    const db = 20 * Math.log10(env + 1e-12);
    const over = db - thresholdDb;
    let gr = 0;
    if (over > knee / 2) gr = over * (1 - 1 / ratio);
    else if (over > -knee / 2) gr = ((1 - 1 / ratio) * (over + knee / 2) ** 2) / (2 * knee);
    out[i] = x[i] * dbToLin(-gr) * makeup;
  }
  return out;
}

/** Hum at `f0` with harmonics (odd ones stronger, like a ground loop buzz). */
export function hum(n: number, sr: number, f0: number, rmsLin: number): Float32Array {
  const amps = [1, 0.45, 0.6, 0.2, 0.35, 0.1, 0.2];
  const out = new Float32Array(n);
  for (let k = 1; k <= amps.length; k++) {
    const w = (2 * Math.PI * f0 * k) / sr;
    const a = amps[k - 1];
    for (let i = 0; i < n; i++) out[i] += a * Math.sin(w * i + k);
  }
  const r = rms(out);
  for (let i = 0; i < n; i++) out[i] *= rmsLin / r;
  return out;
}

/**
 * "Singing over the chords": a gliding melody in 200–600 Hz on scale tones of the session key,
 * 80 ms portamento, 5.5 Hz vibrato (±35 cents, fading in), phrases of 2–4 s with breaths,
 * band-limited sawtooth with a soft formant tilt. Scaled to `rmsLin` while voiced.
 */
export function vocalLine(n: number, sr: number, key: Key, rmsLin: number, seed: number) {
  const rand = rng(seed);
  const steps = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const midis: number[] = [];
  for (let m = 55; m <= 74; m++)
    if (steps.includes((((m - key.tonic) % 12) + 12) % 12)) midis.push(m);
  const freq = new Float32Array(n);
  const amp = new Float32Array(n);
  let i = Math.round(0.8 * sr);
  let cur = midis[Math.floor(rand() * midis.length)];
  while (i < n) {
    const phraseEnd = Math.min(n, i + Math.round((2 + 2 * rand()) * sr));
    while (i < phraseEnd) {
      const idx = midis.indexOf(cur);
      const next =
        midis[Math.max(0, Math.min(midis.length - 1, idx + Math.round((rand() - 0.5) * 6)))];
      const len = Math.round((0.3 + 0.6 * rand()) * sr);
      const glide = Math.round(0.08 * sr);
      for (let k = 0; k < len && i < n; k++, i++) {
        const m = k < glide ? cur + ((next - cur) * k) / glide : next;
        const vib = 0.35 * Math.min(1, k / (0.25 * sr)) * Math.sin((2 * Math.PI * 5.5 * i) / sr);
        freq[i] = 440 * Math.pow(2, (m + vib - 69) / 12);
        amp[i] = 1;
      }
      cur = next;
    }
    i += Math.round((0.4 + 0.4 * rand()) * sr); // breath
  }
  const out = new Float32Array(n);
  let phase = 0;
  let env = 0;
  const envK = Math.exp(-1 / (0.03 * sr));
  for (let j = 0; j < n; j++) {
    env = envK * env + (1 - envK) * amp[j];
    if (freq[j] > 0) phase += (2 * Math.PI * freq[j]) / sr;
    if (env < 1e-4) continue;
    let s = 0;
    for (let k = 1; k <= 10; k++) {
      if (freq[j] * k > 5000) break;
      const formant = 1 / (1 + Math.pow((freq[j] * k - 700) / 900, 2));
      s += (Math.sin(k * phase) / Math.pow(k, 1.2)) * (0.4 + formant);
    }
    out[j] = s * env;
  }
  let sq = 0;
  let cnt = 0;
  for (let j = 0; j < n; j++) {
    if (amp[j] > 0) {
      sq += out[j] * out[j];
      cnt++;
    }
  }
  const r = Math.sqrt(sq / Math.max(1, cnt));
  for (let j = 0; j < n; j++) out[j] *= rmsLin / Math.max(1e-12, r);
  return out;
}

// ---------------------------------------------------------------- conditions

const snr = (x: Float32Array, db: number) => rms(x) * dbToLin(-db);
/** ADC noise floor so "digital" low-level conditions are not perfectly silent. */
const adcFloor = (x: Float32Array, seed: number) =>
  add(x, whiteNoise(x.length, dbToLin(-96), seed));

export const CONDITIONS: Condition[] = [
  { id: 'clean', label: 'Clean (peak −12 dBFS)', apply: (x) => x },
  ...[30, 20, 10].map((db): Condition => ({
    id: `white${db}`,
    label: `White noise, SNR ${db} dB`,
    apply: (x, c) => add(x, whiteNoise(x.length, snr(x, db), c.seed + db)),
  })),
  ...[20, 10].map((db): Condition => ({
    id: `pink${db}`,
    label: `Pink noise, SNR ${db} dB`,
    apply: (x, c) => add(x, pinkNoise(x.length, snr(x, db), c.seed + 100 + db)),
  })),
  ...[50, 60].map((f): Condition => ({
    id: `hum${f}`,
    label: `${f} Hz mains hum + harmonics, −10 dB`,
    apply: (x, c) => add(x, hum(x.length, c.sampleRate, f, snr(x, 10))),
  })),
  {
    id: 'reverb',
    label: 'Room reverb (Schroeder, RT60 0.6 s)',
    apply: (x, c) => normalizePeak(schroederReverb(x, c.sampleRate, 0.6, 0.4), -12),
  },
  {
    id: 'low30',
    label: 'Low level, peak −30 dBFS',
    apply: (x, c) => adcFloor(normalizePeak(Float32Array.from(x), -30), c.seed + 300),
  },
  {
    id: 'low40',
    label: 'Low level, peak −40 dBFS',
    apply: (x, c) => adcFloor(normalizePeak(Float32Array.from(x), -40), c.seed + 400),
  },
  {
    id: 'laptop',
    label: 'Laptop mic (120 Hz–8 kHz, compression, −55 dBFS floor)',
    apply: (x, c) => {
      const sr = c.sampleRate;
      let y = normalizePeak(Float32Array.from(x), -24);
      y = biquad(biquad(y, sr, 'highpass', 120), sr, 'highpass', 120);
      y = biquad(y, sr, 'lowpass', 8000);
      y = softCompress(y, sr);
      return add(y, pinkNoise(y.length, dbToLin(-55), c.seed + 500));
    },
  },
  {
    id: 'speaker',
    label: 'Speaker in room (reverb + pink 15 dB + peak −35 dBFS)',
    apply: (x, c) => {
      const sr = c.sampleRate;
      let y = schroederReverb(x, sr, 0.6, 0.5);
      y = biquad(y, sr, 'highpass', 90);
      y = add(y, pinkNoise(y.length, snr(y, 15), c.seed + 600));
      return adcFloor(normalizePeak(y, -35), c.seed + 601);
    },
  },
  {
    id: 'vocal',
    label: 'Vocal/TV distractor (gliding 200–600 Hz line, −3 dB)',
    apply: (x, c) => add(x, vocalLine(x.length, c.sampleRate, c.key, snr(x, 3), c.seed + 700)),
  },
];

export const conditionById = (id: string): Condition => {
  const c = CONDITIONS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown condition ${id}`);
  return c;
};
