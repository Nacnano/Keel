import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChord } from '@/theory';
import { reduceQuality } from './metrics';
import { readFixture, resample, sha256 } from './benchmarkAudio';
import { conditionById, whiteNoise } from './conditions';
import { roomNoiseTrials } from './noiseFixtures';
import { normalizePeak, rms } from './util';
import type { BenchmarkCase, TruthSpan } from './benchmarkTypes';

export const EVAL_DIR = dirname(fileURLToPath(import.meta.url));
interface Fixture {
  id: string;
  file: string;
  sha256: string;
  group: BenchmarkCase['group'];
  provenance: BenchmarkCase['provenance'];
  instrument: BenchmarkCase['instrument'];
  source: string;
  license: string;
  annotation: string;
  spans: Array<{ start: number; end: number; label: string | null }>;
  tail: 'unknown' | null;
}
const manifestPath = join(EVAL_DIR, 'fixtures/manifest.json');

export function corpusHash() {
  // Pin recordings, labels, generators and the scoring protocol. Detector changes do not change this.
  return sha256(
    [
      'fixtures/manifest.json',
      'benchmarkCases.ts',
      'benchmarkAudio.ts',
      'benchmark.ts',
      'benchmarkMetrics.ts',
      'metrics.ts',
      'conditions.ts',
      'noiseFixtures.ts',
      'util.ts',
    ]
      .map((p) => readFileSync(join(EVAL_DIR, p)))
      .reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0)),
  );
}

function truthFor(fixture: Fixture, duration: number): TruthSpan[] {
  const spans: TruthSpan[] = [];
  let end = 0;
  for (const s of fixture.spans) {
    if (s.start >= duration) break;
    if (
      !Number.isFinite(s.start) ||
      !Number.isFinite(s.end) ||
      s.start < end - 1e-6 ||
      s.end <= s.start
    )
      throw new Error(`Invalid annotation: ${fixture.id}`);
    if (s.start > end) spans.push({ start: end, end: s.start, chord: 'unknown' });
    const chord = s.label === null || s.label === 'unknown' ? s.label : parseChord(s.label);
    if (s.label !== null && s.label !== 'unknown' && !chord)
      throw new Error(`Invalid chord: ${s.label}`);
    end = Math.min(s.end, duration);
    spans.push({
      start: s.start,
      end,
      chord:
        chord && chord !== 'unknown'
          ? { root: chord.root, quality: reduceQuality(chord.quality, 2) }
          : chord,
    });
  }
  if (end < duration) spans.push({ start: end, end: duration, chord: fixture.tail });
  return spans;
}

function trimTruth(truth: TruthSpan[], duration: number): TruthSpan[] {
  return truth
    .filter((s) => s.start < duration)
    .map((s) => ({ ...s, end: Math.min(s.end, duration) }));
}

function mixNoise(music: Float32Array, noise: Float32Array, snr: number) {
  const out = music.slice();
  const gain = rms(music) / Math.max(1e-9, rms(noise)) / 10 ** (snr / 20);
  for (let i = 0; i < out.length; i++) out[i] += gain * noise[i % noise.length];
  return normalizePeak(out, -12);
}

/** Controlled bass/drums behind a real or sampled performance; explicitly a hybrid, not a band recording. */
function bandMix(base: BenchmarkCase) {
  const out = base.samples.slice(),
    sr = base.sampleRate,
    beat = 60 / 100;
  const drums = whiteNoise(Math.ceil(sr * 0.12), 0.045, 173);
  for (let t = 0; t < out.length / sr; t += beat) {
    const g = base.truth.find((g) => t >= g.start && t < g.end);
    for (let j = 0; j < drums.length && Math.floor(t * sr) + j < out.length; j++) {
      const dt = j / sr;
      out[Math.floor(t * sr) + j] += drums[j] * Math.exp(-dt * 35);
    }
    if (!g?.chord || g.chord === 'unknown') continue;
    const hz = 440 * 2 ** ((36 + g.chord.root - 69) / 12);
    for (let j = 0; j < sr * beat * 0.85 && Math.floor(t * sr) + j < out.length; j++) {
      const dt = j / sr;
      out[Math.floor(t * sr) + j] += 0.035 * Math.sin(2 * Math.PI * hz * dt) * Math.exp(-dt * 5);
    }
  }
  return normalizePeak(out, -12);
}

export function buildBenchmarkCases(suite: 'ci' | 'full'): BenchmarkCase[] {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    version: number;
    fixtures: Fixture[];
  };
  if (manifest.version !== 1 || !manifest.fixtures.length)
    throw new Error('Unsupported/empty corpus');
  const cases: BenchmarkCase[] = [];
  const bases = new Map<string, BenchmarkCase>();
  const add = (c: BenchmarkCase) => {
    if (cases.some((x) => x.id === c.id)) throw new Error(`Duplicate case: ${c.id}`);
    const duration = (Math.floor(c.samples.length / 2048) * 2048) / c.sampleRate;
    if (duration < 1 || c.samples.some((x) => !Number.isFinite(x)))
      throw new Error(`Invalid audio: ${c.id}`);
    cases.push({ ...c, truth: trimTruth(c.truth, duration) });
  };
  for (const f of manifest.fixtures) {
    if (!f.source || !f.license || !f.annotation || !/^[\w.-]+\.wav\.gz$/.test(f.file))
      throw new Error(`Missing provenance or invalid filename: ${f.id}`);
    const decoded = readFixture(join(EVAL_DIR, 'fixtures', f.file), f.sha256);
    for (const sr of suite === 'full' ? [48000, 44100] : [48000]) {
      const samples = resample(decoded.samples, decoded.sampleRate, sr);
      const base: BenchmarkCase = {
        id: `${f.id}/clean/${sr}/s0.5`,
        group: f.group,
        provenance: f.provenance,
        samples,
        sampleRate: sr,
        instrument: f.instrument,
        mode: f.group === 'band' ? 'room' : 'solo',
        sensitivity: 0.5,
        truth: truthFor(f, samples.length / sr),
      };
      add(base);
      if (sr === 48000) {
        bases.set(f.id, base);
        if (suite === 'full')
          for (const sensitivity of [0, 1])
            add({ ...base, sensitivity, id: `${f.id}/clean/${sr}/s${sensitivity}` });
      }
    }
  }
  for (const sampleRate of [44100, 48000]) {
    for (const seed of suite === 'full' ? [42, 173] : [42]) {
      for (const [index, trial] of roomNoiseTrials(sampleRate, 8, seed).entries()) {
        for (const sensitivity of suite === 'full' ? [0, 0.5, 1] : [0.5]) {
          for (const instrument of ['piano', 'guitar'] as const)
            add({
              id: `noise-${['silence', 'white-55db', 'pink-55db', 'white-25db', 'pink-25db', 'fan-start', 'typing-bursts', 'hum-50hz', 'hum-60hz'][index]}/${instrument}/${sampleRate}/s${sensitivity}/seed${seed}`,
              group: 'noise',
              provenance: 'synthetic',
              instrument,
              mode: 'solo',
              sensitivity,
              sampleRate,
              samples: trial.samples,
              strictNoise: true,
              truth: [{ start: 0, end: trial.samples.length / sampleRate, chord: null }],
            });
        }
      }
    }
  }
  for (const base of bases.values())
    if (base.group === 'recorded-noise')
      add({ ...base, id: `${base.id}/guitar-profile`, instrument: 'guitar' });
  const get = (id: string) => {
    const b = bases.get(id);
    if (!b) throw new Error(`Required fixture missing: ${id}`);
    return b;
  };
  const vary = (base: BenchmarkCase, condition: string) =>
    add({
      ...base,
      id: `${base.id}/${condition}`,
      provenance: 'hybrid',
      samples: conditionById(condition).apply(base.samples, {
        sampleRate: base.sampleRate,
        key: { tonic: 0, mode: 'major' },
        seed: 173,
      }),
    });
  const music = [...bases.values()].filter((b) => b.group === 'piano' || b.group === 'guitar');
  if (suite === 'full') {
    for (const base of music)
      for (const condition of [
        'pink10',
        'white20',
        'low40',
        'laptop',
        'speaker',
        'reverb',
        'hum50',
        'hum60',
      ])
        vary(base, condition);
  } else {
    vary(get('pop-C-block-90'), 'low40');
    vary(get('pop-G-broken-72'), 'laptop');
    vary(get('pop-D-pedal-120'), 'reverb');
    vary(get('guitarset-00_Rock3-148-C'), 'pink10');
    vary(get('guitarset-01_SS3-98-C'), 'speaker');
  }
  for (const id of ['pop-C-block-90', 'guitarset-01_SS3-98-C']) {
    const base = get(id);
    for (const nuisance of ['room-speech', 'room-typing'])
      add({
        ...base,
        id: `${base.id}/${nuisance}-snr10`,
        provenance: 'hybrid',
        samples: mixNoise(base.samples, get(nuisance).samples, 10),
      });
    const band = bandMix(base);
    for (const mode of ['solo', 'room'] as const)
      add({
        ...base,
        group: 'band',
        provenance: 'hybrid',
        mode,
        id: `${base.id}/bass-drums-${mode}`,
        samples: band,
        truth: base.truth.map((g) => ({
          ...g,
          chord:
            g.chord && g.chord !== 'unknown'
              ? { ...g.chord, quality: reduceQuality(g.chord.quality, mode === 'room' ? 1 : 2) }
              : g.chord,
        })),
      });
    // Music stops while room noise continues: test release rather than startup alone.
    const end = base.truth.filter((s) => s.chord && s.chord !== 'unknown').at(-1)!.end;
    const n = Math.floor(end * base.sampleRate),
      samples = new Float32Array(n + base.sampleRate * 5);
    samples.set(base.samples.subarray(0, n));
    samples.set(whiteNoise(base.sampleRate * 5, 0.005, 173), n);
    add({
      ...base,
      id: `${base.id}/stop-into-noise`,
      provenance: 'hybrid',
      samples,
      truth: [
        ...trimTruth(base.truth, n / base.sampleRate),
        { start: n / base.sampleRate, end: samples.length / base.sampleRate, chord: null },
      ],
    });
  }
  const piano = get('pop-C-block-90');
  const quietStart = piano.truth.find((g) => g.chord && g.chord !== 'unknown')!.start;
  const cut = Math.floor(quietStart * piano.sampleRate),
    cutSec = cut / piano.sampleRate;
  add({
    ...piano,
    id: `${piano.id}/immediate-quiet`,
    provenance: 'hybrid',
    samples: normalizePeak(piano.samples.slice(cut), -40),
    truth: piano.truth
      .filter((g) => g.end > cutSec)
      .map((g) => ({ ...g, start: Math.max(0, g.start - cutSec), end: g.end - cutSec })),
  });
  const dropout = piano.samples.slice();
  for (let t = 2; t < dropout.length / piano.sampleRate; t += 3)
    dropout.fill(0, Math.floor(t * piano.sampleRate), Math.floor((t + 0.12) * piano.sampleRate));
  add({ ...piano, id: `${piano.id}/brief-dropouts`, provenance: 'hybrid', samples: dropout });
  vary(piano, 'vocal');
  // A mildly sharp guitar: speed-based detuning also scales the reference timestamps.
  const guitar = get('guitarset-00_Rock3-148-C'),
    ratio = 2 ** (25 / 1200);
  const detuned = new Float32Array(Math.floor(guitar.samples.length / ratio));
  for (let i = 0; i < detuned.length; i++) {
    const p = i * ratio,
      j = Math.floor(p);
    detuned[i] =
      guitar.samples[j] * (1 - (p - j)) +
      guitar.samples[Math.min(j + 1, guitar.samples.length - 1)] * (p - j);
  }
  add({
    ...guitar,
    id: `${guitar.id}/sharp25cents`,
    provenance: 'hybrid',
    samples: detuned,
    truth: guitar.truth.map((g) => ({ ...g, start: g.start / ratio, end: g.end / ratio })),
  });
  return cases;
}
