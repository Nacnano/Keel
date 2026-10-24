/**
 * Run a real recording (16-bit PCM wav) through the live detection path and print what the jam
 * screen would show: the displayed chord (symbol and numeral in the current key) over time, the
 * key path, and a summary (changes per minute, screen time per label, first chord and key).
 *
 *   pnpm exec tsx --tsconfig eval/tsconfig.json eval/clip.ts <wav> [solo|room] [level] [--quiet]
 *   [--seconds=60] [--skip=0] [--reset-at=30]   (reset-at calls engine.resetKey(), the "New song"
 *   mark; skip starts that far into the file)
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { buildTemplates, createAnalysisEngine, scoreChroma } from '@/analysis';
import { createChromaPipeline } from '@/audio/pipeline';
import { DEFAULT_ANALYSIS_CONFIG, MIN_DISPLAY_CONFIDENCE } from '@/core/constants';
import type { Chord, JamMode, Key, VocabLevel } from '@/core/types';
import { chordSymbol, keyName, prettyAccidentals, romanNumeral } from '@/theory';

const argv = process.argv.slice(2);
const flags = new Map(
  argv
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? 'true'] as const;
    }),
);
const [path, mode = 'solo', level = '2'] = argv.filter((a) => !a.startsWith('--'));
if (!path) throw new Error('usage: clip.ts <wav> [solo|room] [level]');
const seconds = Number(flags.get('seconds') ?? 60);
const resetAt = flags.has('reset-at') ? Number(flags.get('reset-at')) : null;

/** Mono float samples of a 16-bit PCM wav (channels are averaged). */
function readWav(file: string): { samples: Float32Array; sampleRate: number } {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a RIFF wav');
  let off = 12;
  let channels = 1;
  let sampleRate = 48000;
  let bits = 16;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      if (bits !== 16) throw new Error('only 16-bit PCM is supported');
      const n = Math.floor(Math.min(size, buf.length - body) / (2 * channels));
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += buf.readInt16LE(body + (i * channels + c) * 2);
        samples[i] = s / channels / 32768;
      }
      return { samples, sampleRate };
    }
    off = body + size + (size & 1);
  }
  throw new Error('no data chunk');
}

const { samples, sampleRate } = readWav(path);
const jamMode = mode as JamMode;
const pipeline = createChromaPipeline({ sampleRate, instrument: 'piano', mode: jamMode });
const engine = createAnalysisEngine({
  ...DEFAULT_ANALYSIS_CONFIG,
  mode: jamMode,
  vocabLevel: Number(level) as VocabLevel,
});

interface Shown {
  wall: number;
  chord: Chord | null;
}
const shown: Shown[] = [];
const keys: Array<{ wall: number; t: number; key: Key; id?: number; supersedes?: number }> = [];
let wall = 0;
let currentKey: Key | null = null;
engine.subscribe((e) => {
  if (e.type === 'chord') {
    const c = e.chord && e.confidence >= MIN_DISPLAY_CONFIDENCE ? e.chord : null;
    shown.push({ wall, chord: c });
  } else if (e.type === 'key') {
    currentKey = e.key;
    keys.push({
      wall,
      t: e.t,
      key: { tonic: e.key.tonic, mode: e.key.mode },
      id: e.id,
      supersedes: e.supersedes,
    });
  }
});

const frameWindow = flags.has('frames')
  ? (flags.get('frames') as string).split('-').map(Number)
  : null;
const bank = buildTemplates(Number(level) as VocabLevel);
const sims = new Float32Array(bank.size + 1);
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** Debug: chroma and the top templates of one frame (key-aware as the engine scores it). */
function dumpFrame(f: { t: number; chroma: Float32Array; energy: number; bass: number | null }) {
  const k = currentKey as Key | null;
  scoreChroma(f.chroma, f.energy, bank, sims, null, {
    majorTonic: k?.mode === 'major' ? k.tonic : null,
  });
  const top = Array.from({ length: bank.size }, (_, i) => i)
    .sort((a, b) => sims[b] - sims[a])
    .slice(0, 5)
    .map((i) => `${NAMES[bank.roots[i]]}${bank.qualities[i]} ${sims[i].toFixed(3)}`);
  const chroma = Array.from(f.chroma)
    .map((v, i) => `${NAMES[i]}${Math.round(v * 100)}`)
    .join(' ');
  console.log(`  frame ${f.t.toFixed(2)} [${chroma}] bass ${f.bass ?? '-'} | ${top.join(', ')}`);
}

const hop = pipeline.config.hopSize;
// --skip=<s>: start that far into the file (the live fake mic starts mid-file)
const skip = Math.round(Number(flags.get('skip') ?? 0) * sampleRate);
const end = Math.min(samples.length - skip, Math.round(seconds * sampleRate));
let didReset = false;
const lines: string[] = [];
for (let i = 0; i + hop <= end; i += hop) {
  const t = i / sampleRate;
  if (resetAt !== null && !didReset && t >= resetAt) {
    engine.resetKey();
    didReset = true;
    lines.push(`${t.toFixed(1).padStart(6)}s  -- New song (resetKey) --`);
  }
  const f = pipeline.process(samples.subarray(skip + i, skip + i + hop), t);
  if (!f) continue;
  wall = f.t + hop / sampleRate;
  const before = shown.length + keys.length;
  if (frameWindow && f.t >= frameWindow[0] && f.t <= frameWindow[1]) dumpFrame(f);
  engine.push(f);
  if (shown.length + keys.length !== before) {
    const s = shown[shown.length - 1];
    const k = currentKey as Key | null;
    const label = s?.chord ? prettyAccidentals(chordSymbol(s.chord, k)) : '—';
    const num = s?.chord && k ? prettyAccidentals(romanNumeral(s.chord, k)) : '';
    const keyText = k ? prettyAccidentals(keyName(k)) : 'no key';
    lines.push(`${wall.toFixed(1).padStart(6)}s  ${`${label} (${num})`.padEnd(18)} | ${keyText}`);
  }
}
const total = end / sampleRate;

// Summary: label screen time (spelled in the key shown at the time), changes per minute.
const keyAt = (t: number): Key | null => {
  let k: Key | null = null;
  for (const e of keys) if (e.wall <= t) k = e.key;
  return k;
};
const time = new Map<string, number>();
let changes = 0;
let firstChord: number | null = null;
let prevSig = '';
for (let i = 0; i < shown.length; i++) {
  const s = shown[i];
  const next = i + 1 < shown.length ? shown[i + 1].wall : total;
  if (!s.chord) continue;
  firstChord ??= s.wall;
  const label = prettyAccidentals(chordSymbol(s.chord, keyAt(s.wall)));
  time.set(label, (time.get(label) ?? 0) + Math.max(0, next - s.wall));
  const sig = `${s.chord.root}:${s.chord.quality}`;
  if (sig !== prevSig) changes++;
  prevSig = sig;
}
const playing = firstChord === null ? 0 : total - firstChord;
const top = [...time.entries()].sort((a, b) => b[1] - a[1]);
// "E major @8.9 (from 0.6, withdraws #1)": shown at wall time 8.9, drawn from 0.6
const keyPath = keys
  .map(
    (k) =>
      `${prettyAccidentals(keyName(k.key))} @${k.wall.toFixed(1)} (from ${k.t.toFixed(1)}` +
      `${k.supersedes ? `, withdraws #${k.supersedes}` : ''})`,
  )
  .join(' → ');

if (!flags.has('quiet')) for (const l of lines) console.log(l);
console.log(`== ${basename(path)} · ${mode} · level ${level} · ${total.toFixed(0)} s`);
console.log(`key path: ${keyPath || 'none'}`);
console.log(
  `first chord ${firstChord?.toFixed(1) ?? 'never'} s, first key ${keys[0]?.wall.toFixed(1) ?? 'never'} s, ` +
    `${playing > 0 ? ((changes / playing) * 60).toFixed(0) : 0} changes/min, ${time.size} labels`,
);
console.log(
  `screen time: ${top
    .slice(0, 16)
    .map(([l, s]) => `${l} ${s.toFixed(1)}`)
    .join(', ')}`,
);
